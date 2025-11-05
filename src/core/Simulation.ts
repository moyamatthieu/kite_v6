/**
 * Nouvelle Simulation propre avec architecture découplée.
 *
 * @module core/NewSimulation
 */

import * as THREE from 'three';
import { SimulationConfig, DEFAULT_CONFIG } from './SimulationConfig';
import { EventBus, SimulationEventType } from './types/Events';
import { createInitialState, SimulationState } from './types/PhysicsState';

// Domain
import { Kite, KiteFactory } from '../domain/kite/Kite';
import { PhysicsEngine } from '../domain/physics/PhysicsEngine';
import { VerletIntegrator } from '../domain/physics/integrators/VerletIntegrator';
import { ForceManager } from '../domain/physics/forces/ForceCalculator';
import { AerodynamicForceCalculator } from '../domain/physics/forces/AerodynamicForce';
import { GravityForceCalculator } from '../domain/physics/forces/GravityForce';
import { LineForceCalculator } from '../domain/physics/forces/LineForce';

// Infrastructure
import { Renderer } from '../infrastructure/rendering/Renderer';
import { Scene3D } from '../infrastructure/rendering/Scene3D';
import { Camera, CameraMode } from '../infrastructure/rendering/Camera';
import { UserInterface } from '../infrastructure/ui/UserInterface';
import { KiteVisualizer } from '../infrastructure/rendering/visualizers/KiteVisualizer';
import { 
    LinesVisualizer, 
    TrajectoryVisualizer, 
    DebugVisualizer,
    ControlStationVisualizer,
    GeometryLabelsVisualizer,
    PanelNumbersVisualizer
} from '../infrastructure/rendering/visualizers/VisualizersBundle';

// Application
import { Logger } from '../application/logging/Logger';
import { 
    IAutoPilotMode, 
    ManualMode, 
    ZenithMode,
    StabilizationMode,
    AltitudeHoldMode,
    PositionHoldMode,
    CircularTrajectoryMode
} from '../application/control/autopilot/modes/AutoPilotModes';

/**
 * Nouvelle classe Simulation avec architecture propre.
 */
export class NewSimulation {
    // Configuration
    private config: SimulationConfig;
    
    // Core
    private eventBus: EventBus;
    private logger: Logger;
    private clock: THREE.Clock;
    
    // Domain
    private kite: Kite;
    private physicsEngine: PhysicsEngine;
    
    // Infrastructure - Rendering
    private renderer: Renderer;
    private scene: Scene3D;
    private camera: Camera;
    
    // Visualiseurs
    private kiteVisualizer: KiteVisualizer;
    private linesVisualizer: LinesVisualizer;
    private trajectoryVisualizer: TrajectoryVisualizer;
    private debugVisualizer: DebugVisualizer;
    private controlStationVisualizer: ControlStationVisualizer;
    private geometryLabelsVisualizer: GeometryLabelsVisualizer;
    private panelNumbersVisualizer: PanelNumbersVisualizer;
    
    // Contrôle
    private currentDelta = 0;
    private autoPilotMode: IAutoPilotMode = new ManualMode();
    private autoPilotActive = false;
    
    // État
    private isPaused = false;
    private lastLogTime = 0;
    private lastCameraMode: CameraMode = CameraMode.ORBIT;
    private uiReference?: UserInterface; // Référence à l'UI pour mise à jour
    
    // Mode debug géométrie
    private geometryDebugMode = false;
    private geometryDebugPosition = new THREE.Vector3(0, 2, 2);
    
    constructor(container: HTMLElement, config?: Partial<SimulationConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        // 1. Initialiser core
        this.eventBus = new EventBus();
        this.logger = new Logger(this.config.logging.bufferSize);
        this.clock = new THREE.Clock();
        
        // 2. Initialiser rendering
        this.renderer = new Renderer(container, {
            antialias: true,
            clearColor: this.config.rendering.clearColor,
        });
        
        this.scene = new Scene3D({
            showGrid: this.config.rendering.showGrid,
        });
        
        const { width, height } = this.renderer.getSize();
        this.camera = new Camera(width / height, {
            position: { x: -8, y: 5, z: 3 }, // Position en arrière et sur le côté pour voir station et kite
            lookAt: { x: 0, y: 3, z: 8 },     // Regarde entre la station et le kite
        });
        
        // 3. Initialiser domaine
        const initialState = createInitialState();
        initialState.position.set(0, 2, 10); // Z=+10 : kite "sous le vent" dans l'hémisphère Z+
        
        // 🔧 CORRECTION: Le kite regarde vers Z+ (face au vent) avec inclinaison pour angle d'attaque
        // Pas de rotation 180° sur Y - le kite fait naturellement face au vent venant de Z+
        // Inclinaison -15° sur X pour angle d'attaque optimal (nez légèrement plus bas)
        const rotationX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -15 * Math.PI / 180);
        initialState.orientation.copy(rotationX);
        
        this.kite = KiteFactory.createStandard(initialState);
        
        // 4. Créer moteur physique avec DI
        const integrator = new VerletIntegrator({
            dampingFactor: this.config.physics.dampingFactor,
            maxVelocity: this.config.physics.maxVelocity,
            maxAngularVelocity: this.config.physics.maxAngularVelocity,
        });
        
        // ✅ OPTIMISATION: Configurer géométrie pour calcul d'inertie dynamique
        integrator.setKiteGeometry(
            this.kite.geometry.parameters.wingspan,
            this.kite.geometry.parameters.height
        );
        
        const forceManager = new ForceManager();
        
        // Ajouter calculateurs de forces
        forceManager.addCalculator(new AerodynamicForceCalculator(this.kite, {
            airDensity: this.config.physics.airDensity,
            referenceLiftCoefficient: this.config.kite.liftCoefficient,
            referenceDragCoefficient: this.config.kite.dragCoefficient,
        }));
        
        forceManager.addCalculator(new GravityForceCalculator(
            this.kite.properties.mass,
            this.config.physics.gravity
        ));
        
        // Créer le PhysicsEngine d'abord (sans lineCalculator pour l'instant)
        // 🔧 CORRECTION: Le vent va de Z+ vers Z- (souffle vers le pilote, frappe l'intrados du kite)
        this.physicsEngine = new PhysicsEngine(
            this.kite,
            integrator,
            forceManager,
            {
                velocity: new THREE.Vector3(0, 0, -this.config.wind.speed), // Vent vers Z-
                direction: new THREE.Vector3(0, 0, -1), // Direction vers Z-
                speed: this.config.wind.speed,
                turbulence: this.config.wind.turbulence,
            },
            {
                gravity: this.config.physics.gravity,
                fixedDeltaTime: this.config.physics.fixedTimeStep,
            }
        );
        
        // 5. Créer visualiseurs
        this.kiteVisualizer = new KiteVisualizer(this.kite);
        this.linesVisualizer = new LinesVisualizer();
        this.trajectoryVisualizer = new TrajectoryVisualizer();
        this.debugVisualizer = new DebugVisualizer();
        this.controlStationVisualizer = new ControlStationVisualizer();
        this.geometryLabelsVisualizer = new GeometryLabelsVisualizer();
        this.panelNumbersVisualizer = new PanelNumbersVisualizer();
        
        // Récupérer positions treuils pour initialiser le calculateur de lignes
        const winchPositions = this.controlStationVisualizer.getWinchPositions();
        
        // 🔧 CALCUL AUTOMATIQUE DE LA LONGUEUR DES LIGNES
        // Calculer la distance réelle entre treuils et points de contrôle à l'initialisation
        const leftControlPoint = this.kite.getGlobalPointPosition('CONTROLE_GAUCHE') || 
                                 this.kite.getGlobalPointPosition('LEFT_CONTROL');
        const rightControlPoint = this.kite.getGlobalPointPosition('CONTROLE_DROIT') || 
                                  this.kite.getGlobalPointPosition('RIGHT_CONTROL');
        
        if (!leftControlPoint || !rightControlPoint) {
            throw new Error('Points de contrôle du kite introuvables');
        }
        
        const leftLineLength = winchPositions.left.distanceTo(leftControlPoint);
        const rightLineLength = winchPositions.right.distanceTo(rightControlPoint);
        const baseLineLength = (leftLineLength + rightLineLength) / 2;
        
        const lineCalculator = new LineForceCalculator(
            this.kite,
            {
                left: winchPositions.left,
                right: winchPositions.right,
            },
            {
                stiffness: this.config.lines.stiffness,
                damping: this.config.lines.damping,
                smoothingCoefficient: this.config.lines.smoothingCoefficient,
                minTension: this.config.lines.minTension,
            }
        );
        
        this.physicsEngine.setLineForceCalculator(lineCalculator);
        // 🔧 UTILISER LA LONGUEUR CALCULÉE au lieu de la config
        this.physicsEngine.setBaseLineLength(baseLineLength);
        
        // Ajouter à la scène
        this.scene.add(this.kiteVisualizer.getObject3D());
        this.linesVisualizer.getObjects().forEach(line => this.scene.add(line));
        this.scene.add(this.trajectoryVisualizer.getObject());
        this.scene.add(this.debugVisualizer.getObject());
        this.scene.add(this.controlStationVisualizer.getObject3D());
        this.scene.add(this.geometryLabelsVisualizer.getObject());
        this.scene.add(this.panelNumbersVisualizer.getObject());
        
        // Configurer visibilité debug
        this.debugVisualizer.setVisible(this.config.rendering.showDebug);
        this.panelNumbersVisualizer.setVisible(true); // Visible par défaut
        
        // 6. Configurer événements
        this.setupEventListeners();
        
        // 7. Configurer contrôles clavier
        this.setupKeyboardControls();
        
        // 8. Configurer contrôles caméra (souris + clavier)
        this.setupCameraControls();
        
        // 9. Démarrer boucle
        this.logger.info('🪁 Nouvelle simulation initialisée !');
        this.startLoop();
    }
    
    /**
     * Configure les listeners d'événements.
     */
    private setupEventListeners(): void {
        this.eventBus.subscribe(SimulationEventType.SIMULATION_PAUSE, () => {
            this.isPaused = true;
        });
        
        this.eventBus.subscribe(SimulationEventType.SIMULATION_RESUME, () => {
            this.isPaused = false;
        });
        
        this.eventBus.subscribe(SimulationEventType.SIMULATION_RESET, () => {
            this.reset();
        });
    }
    
    /**
     * Configure les contrôles clavier.
     */
    private setupKeyboardControls(): void {
        window.addEventListener('keydown', (event) => {
            const key = event.key.toLowerCase();
            
            // Ne pas intercepter les touches réservées à la caméra (1, 2, 3, c, f, r, h, wasd, qe)
            const cameraKeys = ['1', '2', '3', 'c', 'f', 'h'];
            if (cameraKeys.includes(key)) {
                return; // Laisser la caméra gérer
            }
            
            // Contrôles caméra ZQSD/WX/AE actifs en permanence
            if (['w', 'a', 's', 'd', 'q', 'e', 'z', 'q', 's', 'd', 'x', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
                return; // Laisser la caméra gérer
            }
            
            switch (key) {
                case ' ':
                    event.preventDefault();
                    this.togglePause();
                    break;
                case 'r':
                    // 'r' est géré par la caméra pour reset
                    break;
                case 'p':
                    // Alternative pour autopilote
                    this.toggleAutoPilot();
                    break;
                case '5':
                    if (this.autoPilotActive) {
                        this.autoPilotMode = new ZenithMode();
                        this.logger.control('Mode ZENITH activé');
                    }
                    break;
                case 'arrowleft':
                    // En mode orbite uniquement
                    if (this.camera.getMode() !== 'free') {
                        this.currentDelta += 0.01;
                    }
                    break;
                case 'arrowright':
                    // En mode orbite uniquement
                    if (this.camera.getMode() !== 'free') {
                        this.currentDelta -= 0.01;
                    }
                    break;
            }
            
            this.currentDelta = Math.max(-this.config.control.deltaMax, 
                                        Math.min(this.config.control.deltaMax, this.currentDelta));
        });
    }
    
    /**
     * Boucle principale d'animation.
     */
    private startLoop(): void {
        const animate = () => {
            requestAnimationFrame(animate);
            
            if (!this.isPaused) {
                let deltaTime = this.clock.getDelta();
                
                // Clamper deltaTime pour éviter instabilités avec gros sauts temporels
                // Max 33ms = ~30 FPS minimum pour stabilité
                deltaTime = Math.min(deltaTime, 0.033);
                
                this.update(deltaTime);
            }
            
            this.render();
        };
        
        animate();
    }
    
    /**
     * Met à jour la simulation.
     */
    private update(deltaTime: number): void {
        // Mode debug géométrie : fige le cerf-volant à une position fixe
        if (this.geometryDebugMode) {
            const state = this.kite.getState();
            state.position.copy(this.geometryDebugPosition);
            state.velocity.set(0, 0, 0);
            state.angularVelocity.set(0, 0, 0);
            
            // 🔧 CORRECTION: Le kite regarde vers Z+ (face au vent) avec inclinaison pour angle d'attaque
            const rotationX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -15 * Math.PI / 180);
            state.orientation.copy(rotationX);
            
            const simState: SimulationState = {
                kite: state,
                wind: {
                    velocity: new THREE.Vector3(0, 0, -this.config.wind.speed), // Vent vers Z-
                    direction: new THREE.Vector3(0, 0, -1), // Direction vers Z-
                    speed: this.config.wind.speed,
                    turbulence: 0,
                },
                forces: {
                    aerodynamic: new THREE.Vector3(0, 0, 0),
                    gravity: new THREE.Vector3(0, 0, 0),
                    lines: new THREE.Vector3(0, 0, 0),
                    total: new THREE.Vector3(0, 0, 0),
                    torque: new THREE.Vector3(0, 0, 0),
                },
                lines: {
                    baseLength: this.config.lines.baseLength,
                    delta: 0,
                    leftLength: this.config.lines.baseLength,
                    rightLength: this.config.lines.baseLength,
                    leftTension: 0,
                    rightTension: 0,
                    totalTension: 0,
                },
                elapsedTime: this.clock.getElapsedTime(),
                deltaTime: deltaTime,
            };
            
            // Mise à jour visualiseurs en mode debug
            const winchPositions = this.controlStationVisualizer.getWinchPositions();
            this.kiteVisualizer.update();
            this.linesVisualizer.update(winchPositions.left, winchPositions.right, this.kite);
            this.geometryLabelsVisualizer.update(this.kite, this.controlStationVisualizer);
            this.panelNumbersVisualizer.update(this.kite);
            
            // Publier événement
            this.eventBus.publish({
                type: SimulationEventType.PHYSICS_UPDATE,
                timestamp: Date.now(),
                data: simState,
            });
            return;
        }
        
        // Mode normal : physique active
        // Appliquer autopilote si actif
        if (this.autoPilotActive) {
            this.currentDelta = this.autoPilotMode.calculate(
                this.kite.getState(),
                deltaTime,
                this.config.lines.baseLength
            );
            
            // Mettre à jour le slider UI pour refléter la commande autopilote
            if (this.uiReference) {
                this.uiReference.updateControlSlider(this.currentDelta);
            }
        }
        
        // Mise à jour physique
        const simState = this.physicsEngine.update(deltaTime, this.currentDelta);
        
        // Récupérer les positions des treuils depuis le visualiseur
        const winchPositions = this.controlStationVisualizer.getWinchPositions();
        
        // Mise à jour visualiseurs
        this.kiteVisualizer.update();
        this.linesVisualizer.update(
            winchPositions.left,
            winchPositions.right,
            this.kite
        );
        
        // Mise à jour des labels de géométrie
        this.geometryLabelsVisualizer.update(this.kite, this.controlStationVisualizer);
        
        // Mise à jour des numéros de panneaux
        this.panelNumbersVisualizer.update(this.kite);
        
        // Trajectoire
        if (simState.elapsedTime % 0.1 < deltaTime) {
            this.trajectoryVisualizer.addPoint(simState.kite.position);
        }
        
        // Debug forces
        if (this.config.rendering.showDebug) {
            this.debugVisualizer.updateForceVectors(simState.kite.position, {
                aerodynamic: simState.forces.aerodynamic,
                gravity: simState.forces.gravity,
                lines: simState.forces.lines,
                linesLeft: simState.forces.linesLeft,
                linesRight: simState.forces.linesRight,
                total: simState.forces.total,
                torque: simState.forces.torque,
            });
        }
        
        // Mise à jour de la caméra (WASD, mode suivi, animations)
        this.camera.update(deltaTime, simState.kite.position);
        
        // Détecter changement de mode caméra pour mettre à jour l'UI
        const currentCameraMode = this.camera.getMode();
        if (currentCameraMode !== this.lastCameraMode) {
            this.lastCameraMode = currentCameraMode;
        }
        
        // Logging périodique
        this.lastLogTime += deltaTime;
        if (this.lastLogTime >= this.config.ui.logInterval) {
            this.logState(simState);
            this.lastLogTime = 0;
        }
        
        // Publier événement
        this.eventBus.publish({
            type: SimulationEventType.PHYSICS_UPDATE,
            timestamp: Date.now(),
            data: simState,
        });
    }
    
    /**
     * Rend la scène.
     */
    private render(): void {
        this.renderer.render(
            this.scene.getThreeScene(),
            this.camera.getCamera()
        );
    }
    
    /**
     * Log l'état de vol condensé avec informations pertinentes.
     */
    private logState(simState: SimulationState): void {
        // 🔧 LOGS ULTRA-CONDENSÉS - Seulement toutes les 2 secondes
        if (Math.floor(simState.elapsedTime * 2) % 4 !== 0) {
            return;
        }
        
        const { position, velocity, acceleration } = simState.kite;
        const { leftTension, rightTension, totalTension } = simState.lines;
        const { speed: windSpeed } = simState.wind;
        const { aerodynamic, total } = simState.forces;

        // Altitude et position
        const altitude = position.y.toFixed(1);
        const groundSpeed = velocity.length().toFixed(1);
        const verticalSpeed = velocity.y.toFixed(1);

        // Forces et performance
        const liftForce = aerodynamic.y.toFixed(0);
        const totalForce = total.length().toFixed(0);

        // Contrôle et stabilité
        const tensionBalance = Math.abs(leftTension - rightTension).toFixed(0);
        const accel = acceleration.length().toFixed(0);

        // 🔧 LOG CONDENSÉ - Une seule ligne
        const flightLog = `T${simState.elapsedTime.toFixed(1)}s Alt:${altitude}m V:${groundSpeed}m/s ` +
                         `Lift:${liftForce}N Tot:${totalForce}N Acc:${accel}m/s² Tens:${totalTension.toFixed(0)}N`;

        this.logger.flightStatus(flightLog);

        // 🔧 Logs avancés DÉSACTIVÉS sauf erreurs critiques
        this.logCriticalEvents(simState);
    }

    /**
     * Log les métriques de performance détaillées.
     */
    private logPerformanceMetrics(simState: SimulationState): void {
        const { position, velocity, acceleration } = simState.kite;
        const { aerodynamic, gravity, total } = simState.forces;
        const { leftTension, rightTension, totalTension } = simState.lines;

        // Calculer l'efficacité (lift/drag ratio)
        const dragForce = Math.sqrt(aerodynamic.x * aerodynamic.x + aerodynamic.z * aerodynamic.z);
        const liftToDragRatio = dragForce > 0.1 ? (aerodynamic.y / dragForce) : 0;

        // Calculer l'angle d'attaque estimé
        const velocityMagnitude = velocity.length();
        const angleOfAttack = velocityMagnitude > 0.1 ?
            Math.asin(Math.max(-1, Math.min(1, velocity.y / velocityMagnitude))) * 180 / Math.PI : 0;

        // Métriques de performance
        const performanceData = {
            liftToDragRatio: liftToDragRatio.toFixed(2),
            angleOfAttack: angleOfAttack.toFixed(1),
            powerEfficiency: ((aerodynamic.y * velocity.y) / Math.max(0.1, totalTension)).toFixed(3),
            stabilityIndex: (1 / (1 + acceleration.length())).toFixed(3)
        };

        // Log périodique des métriques (toutes les 5 secondes)
        if (Math.floor(simState.elapsedTime) % 5 === 0 && Math.floor(simState.elapsedTime * 10) % 10 === 0) {
            this.logger.performance(`MÉTRIQUES | L/D:${performanceData.liftToDragRatio} AoA:${performanceData.angleOfAttack}° ` +
                                   `Eff:${performanceData.powerEfficiency} Stab:${performanceData.stabilityIndex}`, performanceData);
        }
    }

    /**
     * Log les avertissements de stabilité.
     */
    private logStabilityWarnings(simState: SimulationState): void {
        const { position, velocity, acceleration } = simState.kite;
        const { leftTension, rightTension, totalTension } = simState.lines;

        // Vérifier les conditions critiques
        const issues = [];

        if (velocity.length() > 15) {
            issues.push(`Vitesse élevée: ${velocity.length().toFixed(1)} m/s`);
        }

        if (acceleration.length() > 5) {
            issues.push(`Accélération forte: ${acceleration.length().toFixed(1)} m/s²`);
        }

        if (totalTension > 800) {
            issues.push(`Tension critique: ${totalTension.toFixed(0)} N`);
        }

        if (Math.abs(leftTension - rightTension) > 300) {
            issues.push(`Déséquilibre lignes: Δ${Math.abs(leftTension - rightTension).toFixed(0)} N`);
        }

        if (position.y < 1) {
            issues.push(`Altitude dangereuse: ${position.y.toFixed(1)} m`);
        }

        // Log des problèmes détectés
        if (issues.length > 0) {
            this.logger.warning(`STABILITÉ | ${issues.join(' | ')}`);
        }
    }

    /**
     * Log les événements critiques.
     */
    private logCriticalEvents(simState: SimulationState): void {
        const { position, velocity } = simState.kite;
        const { totalTension } = simState.lines;
        const accel = simState.kite.acceleration.length();

        // 🔧 LOGS CRITIQUES SEULEMENT - Seuils relevés
        if (position.y < 0.2 && !this.lastCriticalEvents.groundContact) {
            this.logger.error(`⚠️ Sol: Alt=${position.y.toFixed(2)}m`);
            this.lastCriticalEvents.groundContact = true;
        } else if (position.y > 0.5) {
            this.lastCriticalEvents.groundContact = false;
        }

        if (totalTension > 5000 && !this.lastCriticalEvents.lineBreak) {
            this.logger.error(`⚠️ Lignes: ${totalTension.toFixed(0)}N`);
            this.lastCriticalEvents.lineBreak = true;
        } else if (totalTension < 4000) {
            this.lastCriticalEvents.lineBreak = false;
        }

        if (accel > 50 && !this.lastCriticalEvents.highSpeed) {
            this.logger.warning(`⚠️ Accel: ${accel.toFixed(0)}m/s²`);
            this.lastCriticalEvents.highSpeed = true;
        } else if (accel < 40) {
            this.lastCriticalEvents.highSpeed = false;
        }
    }

    // Cache pour éviter les logs répétés d'événements critiques
    private lastCriticalEvents = {
        groundContact: false,
        lineBreak: false,
        highSpeed: false
    };
    
    /**
     * Réinitialise la simulation.
     */
    private reset(): void {
        const initialState = createInitialState();
        // 🔧 CORRECTION: Position initiale Z=+8 (kite face au vent venant de Z+)
        // Avec treuils à (±0.5, 0, 0) et position (0, 8, 8) → distance ≈ 11.4m (lignes légèrement tendues)
        initialState.position.set(0, 8, 8);
        
        // 🔧 CORRECTION: Le kite regarde vers Z+ (face au vent) avec inclinaison pour angle d'attaque
        const rotationX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -15 * Math.PI / 180);
        initialState.orientation.copy(rotationX);
        
        this.physicsEngine.reset(initialState);
        this.trajectoryVisualizer.clear();
        this.currentDelta = 0;
        this.clock = new THREE.Clock();
        this.lastLogTime = 0;
        
        if (this.autoPilotMode) {
            this.autoPilotMode.reset();
        }
        
        this.logger.info('🔄 Simulation réinitialisée');
    }
    
    /**
     * Bascule pause/reprise.
     */
    private togglePause(): void {
        this.isPaused = !this.isPaused;
        this.logger.info(this.isPaused ? '⏸️ Pause' : '▶️ Reprise');
    }
    
    /**
     * Bascule autopilote.
     */
    private toggleAutoPilot(): void {
        this.autoPilotActive = !this.autoPilotActive;
        this.logger.control(this.autoPilotActive ? '🤖 Autopilote ON' : '👤 Manuel');
    }
    
    /**
     * Pause la simulation (méthode publique pour l'UI).
     */
    public pause(): void {
        if (!this.isPaused) {
            this.isPaused = true;
            this.eventBus.publish({
                type: SimulationEventType.SIMULATION_PAUSE,
                timestamp: Date.now(),
                data: {},
            });
        }
    }
    
    /**
     * Reprend la simulation (méthode publique pour l'UI).
     */
    public resume(): void {
        if (this.isPaused) {
            this.isPaused = false;
            this.eventBus.publish({
                type: SimulationEventType.SIMULATION_RESUME,
                timestamp: Date.now(),
                data: {},
            });
        }
    }
    
    /**
     * Nettoie les ressources.
     */
    dispose(): void {
        this.kiteVisualizer.dispose();
        this.linesVisualizer.dispose();
        this.trajectoryVisualizer.dispose();
        this.debugVisualizer.dispose();
        this.controlStationVisualizer.dispose();
        this.geometryLabelsVisualizer.dispose();
        this.panelNumbersVisualizer.dispose();
        this.scene.dispose();
        this.renderer.dispose();
        this.camera.dispose();
        this.eventBus.clearAll();
    }

    /**
     * Configure les contrôles de la caméra.
     */
    private setupCameraControls(): void {
        const canvas = this.renderer.getCanvas();
        
        // Donner la référence du canvas à la caméra pour gérer le curseur
        this.camera.setCanvas(canvas);

        // Gestionnaires de souris pour la caméra
        // mousedown sur le canvas
        canvas.addEventListener('mousedown', (event) => {
            this.camera.handleMouseDown(event);
        });

        // mousemove et mouseup sur window pour capturer les mouvements hors canvas
        window.addEventListener('mousemove', (event) => {
            this.camera.handleMouseMove(event);
        });

        window.addEventListener('mouseup', () => {
            this.camera.handleMouseUp();
        });

        // wheel sur le canvas
        canvas.addEventListener('wheel', (event) => {
            this.camera.handleWheel(event);
        });

        // Gestionnaires clavier pour la caméra
        window.addEventListener('keydown', (event) => {
            this.camera.handleKeyDown(event);
        });
        
        window.addEventListener('keyup', (event) => {
            this.camera.handleKeyUp(event);
        });

        // Empêcher le menu contextuel sur clic droit
        canvas.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
    }

    /**
     * Accesseur pour l'EventBus (pour l'UI externe).
     */
    public getEventBus(): EventBus {
        return this.eventBus;
    }

    /**
     * Accesseur pour le Logger (pour l'UI externe).
     */
    public getLogger(): Logger {
        return this.logger;
    }
    
    /**
     * Définit la référence à l'UI pour les mises à jour automatiques.
     */
    public setUIReference(ui: UserInterface): void {
        this.uiReference = ui;
    }
    
    /**
     * Définit le delta de contrôle manuellement (depuis le slider UI).
     */
    public setControlDelta(delta: number): void {
        if (!this.autoPilotActive) {
            this.currentDelta = Math.max(-this.config.control.deltaMax, 
                                        Math.min(this.config.control.deltaMax, delta));
        }
    }
    
    /**
     * Active/désactive l'autopilote.
     */
    public setAutoPilotActive(enabled: boolean): void {
        this.autoPilotActive = enabled;
        if (enabled) {
            this.logger.control('🤖 Autopilote activé');
        } else {
            this.logger.control('✋ Contrôle manuel activé');
            this.currentDelta = 0;
            if (this.uiReference) {
                this.uiReference.updateControlSlider(0);
            }
        }
    }

    /**
     * Change le mode d'autopilote.
     */
    public setAutoPilotMode(mode: string): void {
        switch (mode) {
            case 'manual':
                this.autoPilotMode = new ManualMode();
                break;
            case 'stabilization':
                this.autoPilotMode = new StabilizationMode();
                break;
            case 'altitude':
                this.autoPilotMode = new AltitudeHoldMode();
                break;
            case 'position':
                this.autoPilotMode = new PositionHoldMode();
                break;
            case 'zenith':
                this.autoPilotMode = new ZenithMode();
                break;
            case 'circular':
                this.autoPilotMode = new CircularTrajectoryMode();
                break;
        }

        this.logger.control(`🎯 Mode: ${mode}`);
    }
    
    /**
     * Active/désactive le mode debug géométrie.
     * En mode debug, le cerf-volant est figé à la position (0, 2, 2).
     * Les mouvements de caméra restent possibles - le mode de caméra de l'utilisateur est préservé.
     */
    public toggleGeometryDebug(): void {
        this.geometryDebugMode = !this.geometryDebugMode;
        
        if (this.geometryDebugMode) {
            // Sauvegarder le mode de caméra actuel avant d'activer le mode géométrie
            this.lastCameraMode = this.camera.getMode();
            
            // Positionner le kite à (0, 3, 5) pour debug géométrie (position visible avec bonne perspective)
            this.geometryDebugPosition.set(0, 3, 5);
            
            // Forcer immédiatement la position du kite
            const state = this.kite.getState();
            state.position.set(0, 3, 5);
            state.velocity.set(0, 0, 0);
            state.angularVelocity.set(0, 0, 0);
            
            // 🔧 CORRECTION: Le kite regarde vers Z+ (face au vent) avec inclinaison pour angle d'attaque
            const rotationX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -15 * Math.PI / 180);
            state.orientation.copy(rotationX);
            
            this.logger.control('🔍 Mode debug géométrie ACTIVÉ - Kite à (0, 3, 5) - Mouvements de caméra préservés');
        } else {
            // Restaurer le mode de caméra précédent au lieu de forcer ORBIT
            this.camera.setMode(this.lastCameraMode);
            
            this.logger.control('🔍 Mode debug géométrie DÉSACTIVÉ - Mode caméra restauré');
        }
    }
    
    /**
     * Active/désactive l'affichage des vecteurs de forces (debug).
     */
    public toggleForceVectors(): void {
        this.config.rendering.showDebug = !this.config.rendering.showDebug;
        this.debugVisualizer.setVisible(this.config.rendering.showDebug);
        
        this.logger.control(
            `🔍 Vecteurs de forces: ${this.config.rendering.showDebug ? 'ACTIVÉS ✅' : 'DÉSACTIVÉS ❌'}`
        );
    }
    
    /**
     * Active/désactive l'affichage des numéros de panneaux.
     */
    public togglePanelNumbers(): void {
        const currentVisibility = this.panelNumbersVisualizer.getObject().visible;
        this.panelNumbersVisualizer.setVisible(!currentVisibility);
        
        this.logger.control(
            `🔢 Numéros de panneaux: ${!currentVisibility ? 'ACTIVÉS ✅' : 'DÉSACTIVÉS ❌'}`
        );
    }
    
    /**
     * Change la vitesse du vent dynamiquement.
     */
    public setWindSpeed(speed: number): void {
        this.config.wind.speed = speed;
        
        // 🔧 CORRECTION: Le vent va de Z+ vers Z- (souffle vers le pilote)
        this.physicsEngine.setWindState({
            velocity: new THREE.Vector3(0, 0, -speed), // Vent vers Z-
            direction: new THREE.Vector3(0, 0, -1), // Direction vers Z-
            speed: speed,
            turbulence: this.config.wind.turbulence,
        });
        
        this.logger.control(`💨 Vent ajusté: ${speed.toFixed(1)} m/s`);
    }
}
