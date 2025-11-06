/**
 * Nouvelle Simulation propre avec architecture découplée.
 *
 * @module core/NewSimulation
 */

import * as THREE from 'three';
import { SimulationConfig, DEFAULT_CONFIG } from './SimulationConfig';
import { EventBus, SimulationEventType } from './types/Events';
import { createInitialState, SimulationState, KitePhysicsState } from './types/PhysicsState';

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
    PanelForceVisualizer, // ✅ Visualiseur unifié (remplace DebugVisualizer)
    ControlStationVisualizer,
    GeometryLabelsVisualizer,
    PanelNumbersVisualizer,
    PanelNormalsVisualizer
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
    private forceVisualizer: PanelForceVisualizer; // ✅ Visualiseur unifié pour tous les modes
    private controlStationVisualizer: ControlStationVisualizer;
    private geometryLabelsVisualizer: GeometryLabelsVisualizer;
    private panelNumbersVisualizer: PanelNumbersVisualizer;
    private panelNormalsVisualizer: PanelNormalsVisualizer;
    
    // Contrôle
    private currentDelta = 0;
    private autoPilotMode: IAutoPilotMode = new ManualMode();
    private autoPilotActive = false;
    
    // État
    private isPaused = false;
    private lastLogTime = 0;
    private lastCameraMode: CameraMode = CameraMode.ORBIT;
    private savedCameraState?: { position: THREE.Vector3; target: THREE.Vector3; distance: number; azimuth: number; elevation: number };
    private uiReference?: UserInterface; // Référence à l'UI pour mise à jour
    
    // ✅ AMÉLIORATION: Accumulation du temps pour fixed timestep stable
    private accumulator = 0; // Temps accumulé non simulé
    
    // Mode debug géométrie
    private geometryDebugMode = false;
    private geometryDebugPosition = new THREE.Vector3();
    
    // Mode debug portance
    private liftDebugMode = false;
    private liftDebugPosition = new THREE.Vector3();
    private liftDebugOrientation = new THREE.Quaternion();
    
    // Auto-reset au sol
    private groundStabilityTime = 0; // s - Temps passé au sol stable

    
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
        initialState.position.set(0, 8, 10); // Z=+10 : kite "sous le vent" dans l'hémisphère Z+
        
        // ═══════════════════════════════════════════════════════════════════════════
        // ORIENTATION INITIALE DU CERF-VOLANT (CRITIQUE)
        // ═══════════════════════════════════════════════════════════════════════════
        // Le cerf-volant doit REGARDER vers Z- (vers la station de contrôle à l'origine)
        // pour que l'INTRADOS (face avant avec points de contrôle) reçoive le vent
        // 
        // ═══════════════════════════════════════════════════════════════════════════
        initialState.orientation.copy(this.getInitialKiteOrientation());
        
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
            this.kite,
            this.config.physics.gravity
        ));
        
        // Créer le PhysicsEngine d'abord (sans lineCalculator pour l'instant)
        // ✅ CORRECTION: Le vent souffle de Z- vers Z+ (pousse le kite vers l'horizon)
        this.physicsEngine = new PhysicsEngine(
            this.kite,
            integrator,
            forceManager,
            {
                velocity: new THREE.Vector3(0, 0, this.config.wind.speed), // Vent vers Z+
                direction: new THREE.Vector3(0, 0, 1), // Direction vers Z+
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
        this.forceVisualizer = new PanelForceVisualizer(); // ✅ Visualiseur unifié
        this.controlStationVisualizer = new ControlStationVisualizer();
        this.geometryLabelsVisualizer = new GeometryLabelsVisualizer();
        this.panelNumbersVisualizer = new PanelNumbersVisualizer();
        this.panelNormalsVisualizer = new PanelNormalsVisualizer();
        
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
                exponentialThreshold: this.config.lines.exponentialThreshold,
                exponentialStiffness: this.config.lines.exponentialStiffness,
                exponentialRate: this.config.lines.exponentialRate,
            },
            // 🎯 NOUVEAUTÉ : Configuration du système de brides
            this.config.lines.bridles
        );
        
        this.physicsEngine.setLineForceCalculator(lineCalculator);
        // 🔧 UTILISER LA LONGUEUR CALCULÉE au lieu de la config
        this.physicsEngine.setBaseLineLength(baseLineLength);
        
        // Ajouter à la scène
        this.scene.add(this.kiteVisualizer.getObject3D());
        this.linesVisualizer.getObjects().forEach(line => this.scene.add(line));
        this.scene.add(this.trajectoryVisualizer.getObject());
        this.scene.add(this.forceVisualizer.getObject()); // ✅ Visualiseur unifié
        this.scene.add(this.controlStationVisualizer.getObject3D());
        this.scene.add(this.geometryLabelsVisualizer.getObject());
        this.scene.add(this.panelNumbersVisualizer.getObject());
        this.scene.add(this.panelNormalsVisualizer.getObject3D());
        
        // Configurer visibilité debug
        this.forceVisualizer.setVisible(this.config.rendering.showDebug);
        console.log(`🔍 Vecteurs de forces: ${this.config.rendering.showDebug ? 'ACTIVÉS ✅' : 'DÉSACTIVÉS ❌'}`);
        this.panelNumbersVisualizer.setVisible(true);
        this.panelNormalsVisualizer.getObject3D().visible = true;
        
        // 6. Configurer événements
        this.setupEventListeners();
        
        // 7. Configurer contrôles clavier
        this.setupKeyboardControls();
        
        // 8. Configurer contrôles caméra (souris + clavier)
        this.setupCameraControls();
        
        // 9. Démarrer boucle
        this.logger.info('🪁 Nouvelle simulation initialisée !');
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('🪁 SIMULATION KITE v6 - Configuration');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`📊 Vecteurs forces: ${this.config.rendering.showDebug ? '✅ ACTIFS (mode détaillé par panneau)' : '❌ DÉSACTIVÉS'}`);
        console.log(`🔄 Auto-reset: ${this.config.behavior.autoReset.enabled ? '✅' : '❌'} Actif (${this.config.behavior.autoReset.stabilityDuration}s au sol < ${this.config.behavior.autoReset.groundThreshold}m)`);
        console.log(`⚙️  Timestep physique: ${this.config.physics.fixedTimeStep ? (this.config.physics.fixedTimeStep * 1000).toFixed(2) + 'ms' : 'variable'}`);
        console.log(`💨 Vent: ${this.config.wind.speed} m/s (vecteur: 0, 0, ${this.config.wind.speed})`);
        console.log(`⚖️  Masse kite: ${this.config.kite.mass} kg`);
        console.log(`📍 Position initiale: ${this.kite.getState().position.toArray().map(v => v.toFixed(1)).join(', ')}`);
        console.log(`🧭 Orientation: ${this.kite.getState().orientation.toArray().map(v => v.toFixed(3)).join(', ')}`);
        console.log('═══════════════════════════════════════════════════════\n');
        this.startLoop();
    }
    
    /**
     * Calcule l'orientation pour le mode debug portance (45° vers l'avant).
     * 
     * ═══════════════════════════════════════════════════════════════════════════
     * ORIENTATION MODE DEBUG PORTANCE
     * ═══════════════════════════════════════════════════════════════════════════
     * 
     * Le cerf-volant doit TOUJOURS regarder vers la station de pilotage (Z-)
     * avec une inclinaison de 45° vers l'avant pour tester l'orientation des forces.
     * 
     * Composition de rotations (ordre important) :
     * 1. rotationY (180° sur axe Y) : PIVOTE le kite pour regarder vers Z-
     * 2. rotationX (+45° sur axe X) : INCLINE le nez vers l'avant de 45°
     * 
     * Résultat : quaternion = rotationY × rotationX
     * 
     * @returns Quaternion représentant l'orientation debug portance (45° vers l'avant)
     */
    private getLiftDebugOrientation(): THREE.Quaternion {
        // 1. Rotation 180° sur Y : fait pivoter le kite pour regarder Z-
        const rotationY = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0), 
            Math.PI
        );
        
        // 2. Inclinaison +45° sur X : angle vers l'avant (nez vers le bas)
        const rotationX = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0), 
            +45 * Math.PI / 180
        );
        
        // 3. Composition : d'abord Y (pivot), puis X (inclinaison)
        return rotationY.multiply(rotationX);
    }
    
    /**
     * Calcule l'orientation initiale du cerf-volant (face au vent).
     * 
     * ═══════════════════════════════════════════════════════════════════════════
     * ORIENTATION STANDARD DU CERF-VOLANT (SOURCE UNIQUE DE VÉRITÉ)
     * ═══════════════════════════════════════════════════════════════════════════
     * 
     * Le cerf-volant doit TOUJOURS regarder vers la station de pilotage (Z-)
     * pour recevoir le vent de face (vent souffle de Z- vers Z+).
     * 
     * Composition de rotations (ordre important) :
     * 1. rotationY (180° sur axe Y) : PIVOTE le kite pour regarder vers Z-
     * 2. rotationX (-15° sur axe X) : INCLINE le nez vers le bas (angle d'attaque optimal)
     * 
     * Résultat : quaternion = rotationY × rotationX
     * 
     * Utilisé dans :
     * - Initialisation (constructeur)
     * - Reset de la simulation
     * - Mode debug géométrie (figé)
     * - Toggle debug géométrie (activation)
     * 
     * @returns Quaternion représentant l'orientation standard du cerf-volant
     */
    private getInitialKiteOrientation(): THREE.Quaternion {
        // 1. Rotation 180° sur Y : fait pivoter le kite pour regarder Z-
        const rotationY = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0), 
            Math.PI
        );
        
        // 2. Inclinaison -15° sur X : angle d'attaque optimal (nez légèrement bas)
        const rotationX = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0), 
            -15 * Math.PI / 180
        );
        
        // 3. Composition : d'abord Y (pivot), puis X (inclinaison)
        return rotationY.multiply(rotationX);
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
        
        // ⚠️ SIMULATION_RESET listener retiré pour éviter boucle infinie
        // Le reset est appelé directement depuis l'UI via simulation.reset()
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
     * ✅ AMÉLIORATION: Fixed timestep avec accumulation pour stabilité
     */
    private startLoop(): void {
        const animate = () => {
            requestAnimationFrame(animate);
            
            if (!this.isPaused) {
                let deltaTime = this.clock.getDelta();
                
                // ✅ Clamper deltaTime pour éviter "spiral of death"
                // Si FPS < 15, limiter pour éviter trop de sous-pas
                deltaTime = Math.min(deltaTime, 0.1); // Max 100ms = 10 FPS minimum
                
                this.update(deltaTime);
            } else {
                // ✅ En pause, continuer à appeler getDelta() pour éviter gros saut à la reprise
                this.clock.getDelta();
            }
            
            this.render();
        };
        
        animate();
    }
    
    /**
     * Met à jour la simulation avec fixed timestep et accumulation.
     * ✅ AMÉLIORATION: Utilise l'accumulation pour garantir stabilité physique
     * même avec FPS variable
     */
    private update(deltaTime: number): void {
        // Récupérer le pas de temps fixe de la physique
        const fixedDt = this.config.physics.fixedTimeStep ?? (1/60);
        
        // Ajouter le temps écoulé à l'accumulator
        this.accumulator += deltaTime;
        
        // ✅ FIXED TIMESTEP: Simuler par pas fixes tant qu'il reste du temps
        let substeps = 0;
        while (this.accumulator >= fixedDt && substeps < this.config.physics.maxSubsteps) {
            this.updatePhysics(fixedDt);
            this.accumulator -= fixedDt;
            substeps++;
        }
        
        // Si trop de sous-pas nécessaires (FPS très bas), réinitialiser accumulator
        // pour éviter "spiral of death"
        if (substeps >= this.config.physics.maxSubsteps) {
            this.accumulator = 0;
        }
        
        // Mettre à jour visuels et caméra avec le temps réel (interpolation visuelle)
        this.updateVisualsAndCamera(deltaTime);
    }
    
    /**
     * Met à jour la physique pour un pas de temps fixe.
     */
    private updatePhysics(fixedDt: number): void {
        // Mode debug géométrie : fige le cerf-volant à une position fixe
        if (this.geometryDebugMode) {
            const state = this.kite.getState();
            const debugPos = this.config.behavior.debugPositions.geometry;
            state.position.set(debugPos.x, debugPos.y, debugPos.z);
            state.velocity.set(0, 0, 0);
            state.angularVelocity.set(0, 0, 0);
            
            // ═══════════════════════════════════════════════════════════════════════════
            // ORIENTATION MODE DEBUG GÉOMÉTRIE (même que orientation initiale)
            // ═══════════════════════════════════════════════════════════════════════════
            // Cerf-volant figé pour inspection visuelle de la géométrie
            // Doit garder la même orientation que l'initialisation pour cohérence
            // ═══════════════════════════════════════════════════════════════════════════
            state.orientation.copy(this.getInitialKiteOrientation());
            
            const simState: SimulationState = {
                kite: state,
                wind: {
                    velocity: new THREE.Vector3(0, 0, this.config.wind.speed), // Vent vers Z+
                    direction: new THREE.Vector3(0, 0, 1), // Direction vers Z+
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
                deltaTime: fixedDt,
            };
            
            // Mise à jour visualiseurs en mode debug géométrie
            const winchPositions = this.controlStationVisualizer.getWinchPositions();
            this.kiteVisualizer.update();
            this.linesVisualizer.update(winchPositions.left, winchPositions.right, this.kite);
            this.geometryLabelsVisualizer.update(this.kite, this.controlStationVisualizer);
            this.panelNumbersVisualizer.update(this.kite);
            this.panelNormalsVisualizer.update(this.kite, state);
            
            // Publier événement
            this.eventBus.publish({
                type: SimulationEventType.PHYSICS_UPDATE,
                timestamp: Date.now(),
                data: simState,
            });
            return;
        }
        
        // Mode debug portance : fige le cerf-volant mais calcule les forces
        if (this.liftDebugMode) {
            const state = this.kite.getState();
            
            // Calculer les forces aérodynamiques, de gravité et de lignes normalement
            const simState = this.physicsEngine.update(fixedDt, this.currentDelta);
            
            // Mais forcer la position et l'orientation fixes
            const debugPos = this.config.behavior.debugPositions.lift;
            state.position.set(debugPos.x, debugPos.y, debugPos.z);
            state.velocity.set(0, 0, 0);
            state.angularVelocity.set(0, 0, 0);
            state.orientation.copy(this.liftDebugOrientation);
            
            // Mettre à jour l'état figé dans le kite
            this.kite.setState(state);
            
            // Créer un état de simulation avec les forces calculées mais position figée
            const fixedSimState: SimulationState = {
                ...simState,
                kite: state, // État figé
            };
            
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
            
            // Mise à jour des normales de panneaux
            this.panelNormalsVisualizer.update(this.kite, state);
            
            // ✅ Mode debug portance : visualiseur unifié en mode détaillé (forces par panneau)
            this.forceVisualizer.setVisible(true);
            
            // Récupérer les forces RÉELLES par panneau depuis le moteur physique
            const aeroResult = this.physicsEngine.getLastAeroResult();
            const centerOfMass = this.kite.getCenterOfMass();
            
            if (aeroResult && aeroResult.panelForces) {
                this.forceVisualizer.updateForces(
                    this.kite,
                    fixedSimState.kite,
                    {
                        panelForces: aeroResult.panelForces, // Forces réelles du moteur
                        forces: { gravity: fixedSimState.forces.gravity },
                        centerOfMass,
                        showAggregatedForces: false // ✅ Mode détaillé (par panneau)
                    }
                );
            }
            
            // Logging périodique
            this.lastLogTime += fixedDt;
            if (this.lastLogTime >= this.config.ui.logInterval) {
                this.logState(fixedSimState);
                this.lastLogTime = 0;
            }
            
            // Publier événement
            this.eventBus.publish({
                type: SimulationEventType.PHYSICS_UPDATE,
                timestamp: Date.now(),
                data: fixedSimState,
            });
            return;
        }

        // Mode normal : physique active
        // Appliquer autopilote si actif
        if (this.autoPilotActive) {
            this.currentDelta = this.autoPilotMode.calculate(
                this.kite.getState(),
                fixedDt,
                this.config.lines.baseLength
            );
            
            // Mettre à jour le slider UI pour refléter la commande autopilote
            if (this.uiReference) {
                this.uiReference.updateControlSlider(this.currentDelta);
            }
        }
        
        // Mise à jour physique avec pas de temps fixe
        const simState = this.physicsEngine.update(fixedDt, this.currentDelta);
        
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
        
        // Mise à jour des normales de panneaux
        this.panelNormalsVisualizer.update(this.kite, simState.kite);
        
        // Trajectoire (ajout conditionnel)
        if (simState.elapsedTime % 0.1 < fixedDt) {
            this.trajectoryVisualizer.addPoint(simState.kite.position);
        }
        
        // ✅ Debug forces : visualiseur unifié en mode DÉTAILLÉ (forces par panneau)
        if (this.config.rendering.showDebug) {
            const centerOfMass = this.kite.getCenterOfMass();
            
            // Récupérer les forces par panneau depuis le moteur physique
            const aeroResult = this.physicsEngine.getLastAeroResult();
            
            if (aeroResult && aeroResult.panelForces) {
                this.forceVisualizer.updateForces(
                    this.kite,
                    simState.kite,
                    {
                        panelForces: aeroResult.panelForces, // Forces détaillées par panneau
                        forces: { 
                            gravity: simState.forces.gravity,
                            lines: simState.forces.lines,
                            linesLeft: simState.forces.linesLeft,
                            linesRight: simState.forces.linesRight,
                            total: simState.forces.total,
                        },
                        centerOfMass,
                        showAggregatedForces: false // ✅ Mode DÉTAILLÉ (par panneau)
                    }
                );
            }
        }
        
        // Logging périodique
        this.lastLogTime += fixedDt;
        if (this.lastLogTime >= this.config.ui.logInterval) {
            this.logState(simState);
            this.lastLogTime = 0;
        }
        
        // ✅ Vérifier si le kite est au sol et stable (auto-reset)
        this.checkGroundStability(simState.kite, fixedDt);
        
        // Publier événement
        this.eventBus.publish({
            type: SimulationEventType.PHYSICS_UPDATE,
            timestamp: Date.now(),
            data: simState,
        });
    }
    
    /**
     * Met à jour les visuels et la caméra (interpolation fluide).
     */
    private updateVisualsAndCamera(deltaTime: number): void {
        // Mise à jour de la caméra avec deltaTime réel pour mouvement fluide
        const kitePosition = this.kite.getState().position;
        this.camera.update(deltaTime, kitePosition);
        
        // Détecter changement de mode caméra pour mettre à jour l'UI
        const currentCameraMode = this.camera.getMode();
        if (currentCameraMode !== this.lastCameraMode) {
            this.lastCameraMode = currentCameraMode;
        }
        
        // Mettre à jour l'affichage des informations de la caméra dans l'UI
        if (this.uiReference) {
            const cameraState = this.camera.getState();
            this.uiReference.updateCameraInfo(
                {
                    x: cameraState.position.x,
                    y: cameraState.position.y,
                    z: cameraState.position.z
                },
                cameraState.azimuth,
                cameraState.elevation,
                cameraState.distance
            );
        }
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
     * ✅ OPTIMISÉ: Réduit drastiquement la fréquence des logs
     */
    private logState(simState: SimulationState): void {
        // ✅ LOGS ULTRA-CONDENSÉS - Seulement toutes les 5 secondes
        if (Math.floor(simState.elapsedTime) % 5 !== 0 || simState.elapsedTime - Math.floor(simState.elapsedTime) > 0.5) {
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

        // ✅ Logs avancés complètement désactivés pour performance
        // this.logCriticalEvents(simState);
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
     * Vérifie si le kite est au sol et stable, déclenche un auto-reset après 2s.
     */
    private checkGroundStability(state: KitePhysicsState, deltaTime: number): void {
        if (!this.config.behavior.autoReset.enabled) return;
        
        const altitude = state.position.y;
        const velocity = state.velocity.length();
        
        // Vérifier si le kite est au sol ET stable (vitesse quasi nulle)
        const isGrounded = altitude < this.config.behavior.autoReset.groundThreshold;
        const isStable = velocity < this.config.behavior.autoReset.velocityThreshold;
        
        if (isGrounded && isStable) {
            // Accumuler le temps au sol
            this.groundStabilityTime += deltaTime;
            
            // Log toutes les 0.5s pour suivre la progression
            if (Math.floor(this.groundStabilityTime * 2) !== Math.floor((this.groundStabilityTime - deltaTime) * 2)) {
                console.log(`⏱️ Kite au sol stable: ${this.groundStabilityTime.toFixed(1)}s / ${this.config.behavior.autoReset.stabilityDuration}s`);
            }
            
            // Si au sol stable pendant plus de 2s, déclencher auto-reset
            if (this.groundStabilityTime >= this.config.behavior.autoReset.stabilityDuration) {
                console.log(`🔄 AUTO-RESET déclenché après ${this.groundStabilityTime.toFixed(1)}s au sol`);
                this.logger.warning(`⚠️ Cerf-volant au sol stable depuis ${this.groundStabilityTime.toFixed(1)}s - AUTO-RESET`);
                this.reset();
                this.groundStabilityTime = 0;
            }
        } else {
            // Réinitialiser le compteur si le kite n'est plus au sol ou bouge
            if (this.groundStabilityTime > 0.1) { // Log seulement si timer significatif
                console.log(`✅ Kite décollé ou en mouvement - Timer réinitialisé (était à ${this.groundStabilityTime.toFixed(1)}s)`);
            }
            this.groundStabilityTime = 0;
        }
    }
    
    /**
     * Réinitialise la simulation (méthode publique pour l'UI).
     */
    public reset(): void {
        try {
            console.log('🔄 [RESET] Démarrage du reset...');
            
            // Désactiver tous les modes debug AVANT de réinitialiser la physique
            const wasInLiftDebug = this.liftDebugMode;
            const wasInGeometryDebug = this.geometryDebugMode;
            
            if (this.liftDebugMode) {
                this.liftDebugMode = false;
                console.log('🔄 [RESET] Mode debug portance désactivé');
            }
            
            if (this.geometryDebugMode) {
                this.geometryDebugMode = false;
                console.log('🔄 [RESET] Mode debug géométrie désactivé');
            }
            
            // ✅ Le visualiseur unifié reste visible selon la config
            // Il sera automatiquement utilisé en mode approprié
            
            const initialState = createInitialState();
            // ✅ CORRECTION: Position initiale Z=+10, Y=8
            initialState.position.set(0, 8, 10);
            console.log('🔄 [RESET] Position initiale définie:', initialState.position);
            // ═══════════════════════════════════════════════════════════════════════════
            // ORIENTATION RESET (même que orientation initiale)
            // ═══════════════════════════════════════════════════════════════════════════
            initialState.orientation.copy(this.getInitialKiteOrientation());
            console.log('🔄 [RESET] Orientation définie');
            this.physicsEngine.reset(initialState);
            console.log('🔄 [RESET] PhysicsEngine réinitialisé');
            this.trajectoryVisualizer.clear();
            console.log('🔄 [RESET] Trajectoire effacée');
            this.currentDelta = 0;
            this.clock = new THREE.Clock();
            this.lastLogTime = 0;
            this.accumulator = 0; // Réinitialiser l'accumulator aussi
            console.log('🔄 [RESET] State interne réinitialisé');
            if (this.autoPilotMode) {
                this.autoPilotMode.reset();
                console.log('🔄 [RESET] Mode autopilote réinitialisé');
            }
            // Remettre le slider UI à zéro
            if (this.uiReference) {
                this.uiReference.updateControlSlider(0);
                console.log('🔄 [RESET] Slider UI réinitialisé');
            }
            
            // Logger les changements de modes debug
            if (wasInLiftDebug || wasInGeometryDebug) {
                this.logger.info('🔄 Modes debug désactivés lors du reset');
            }
            this.logger.info('🔄 Simulation réinitialisée');
            console.log('🔄 [RESET] Logger notifié');
            
            // ⚠️ NE PAS publier l'événement SIMULATION_RESET ici pour éviter boucle infinie
            // L'événement est écouté dans setupEventListeners() et rappelle reset()
            // Si besoin de notifier d'autres composants, utiliser un événement différent
            
            console.log('🔄 [RESET] ✅ Reset terminé avec succès');
        } catch (e) {
            console.error('❌ [RESET] Erreur critique lors du reset :', e);
            if (this.logger) {
                this.logger.error('❌ Erreur critique lors du reset : ' + (e as Error).message);
            }
            alert('Erreur critique lors du reset : ' + (e as Error).message);
        }
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
        this.forceVisualizer.dispose(); // ✅ Visualiseur unifié
        this.controlStationVisualizer.dispose();
        this.geometryLabelsVisualizer.dispose();
        this.panelNumbersVisualizer.dispose();
        this.panelNormalsVisualizer.dispose();
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
     * Active/désactive le mode debug portance.
     * En mode debug portance, le cerf-volant est figé à la position (0, 5, 10) 
     * avec une inclinaison de 45° vers l'avant pour tester l'orientation des forces.
     * Les forces aérodynamiques, de gravité et de lignes sont calculées normalement 
     * mais le cerf-volant reste immobile.
     */
    public toggleLiftDebug(): void {
        this.liftDebugMode = !this.liftDebugMode;
        
        if (this.liftDebugMode) {
            // Sauvegarder l'état actuel de la caméra avant de la repositionner
            const currentState = this.camera.getState();
            this.savedCameraState = {
                position: currentState.position.clone(),
                target: currentState.target.clone(),
                distance: currentState.distance,
                azimuth: currentState.azimuth,
                elevation: currentState.elevation
            };
            
            // Calculer l'orientation debug portance (45° vers l'avant)
            this.liftDebugOrientation.copy(this.getLiftDebugOrientation());
            
            // Positionner le kite à (0, 5, 10) pour debug portance
            this.liftDebugPosition.set(0, 5, 10);
            
            // Forcer immédiatement la position et l'orientation du kite
            const state = this.kite.getState();
            state.position.copy(this.liftDebugPosition);
            state.velocity.set(0, 0, 0);
            state.angularVelocity.set(0, 0, 0);
            state.orientation.copy(this.liftDebugOrientation);
            
            // ✅ Le visualiseur unifié est déjà visible, pas besoin de changer la visibilité
            // Il sera automatiquement utilisé en mode détaillé par la boucle animate()
            
            // Désactiver le mode debug géométrie si actif
            if (this.geometryDebugMode) {
                this.geometryDebugMode = false;
                this.logger.control('🔍 Mode debug géométrie DÉSACTIVÉ (remplacé par debug portance)');
            }
            
            // Positionner la caméra pour une vue optimale du mode portance
            // Position: X: -1.32 m, Y: 8.50 m, Z: 13.15 m
            // Orientation: Azimut: -19.4°, Élévation: 47.0°, Distance: 7.85 m
            const azimuthRad = -19.4 * Math.PI / 180;
            const elevationRad = 47.0 * Math.PI / 180;
            
            this.camera.setState({
                position: new THREE.Vector3(-1.32, 8.50, 13.15),
                target: state.position.clone(),
                distance: 7.85,
                azimuth: azimuthRad,
                elevation: elevationRad
            });
            
            this.logger.control('🪁 Mode debug PORTANCE ACTIVÉ - Kite figé à (0, 5, 10) avec inclinaison 45° - Forces par panneau');
            this.logger.control('📹 Caméra positionnée pour vue optimale des forces de portance');
        } else {
            // ✅ Le visualiseur unifié reste visible, il sera automatiquement utilisé en mode agrégé
            // par la boucle animate() si showDebug est activé
            
            // Restaurer l'état de la caméra sauvegardé
            if (this.savedCameraState) {
                this.camera.setState({
                    position: this.savedCameraState.position,
                    target: this.savedCameraState.target,
                    distance: this.savedCameraState.distance,
                    azimuth: this.savedCameraState.azimuth,
                    elevation: this.savedCameraState.elevation
                });
                this.logger.control('📹 Position de la caméra restaurée');
                this.savedCameraState = undefined;
            }
            
            this.logger.control('🪁 Mode debug PORTANCE DÉSACTIVÉ');
        }
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
            
            // ═══════════════════════════════════════════════════════════════════════════
            // ORIENTATION MODE DEBUG GÉOMÉTRIE (toggle activation)
            // ═══════════════════════════════════════════════════════════════════════════
            state.orientation.copy(this.getInitialKiteOrientation());
            
            // Désactiver le mode debug portance si actif
            if (this.liftDebugMode) {
                this.liftDebugMode = false;
                this.logger.control('🪁 Mode debug portance DÉSACTIVÉ (remplacé par debug géométrie)');
            }
            
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
        this.forceVisualizer.setVisible(this.config.rendering.showDebug); // ✅ Visualiseur unifié
        
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
        
        // ✅ CORRECTION: Le vent souffle de Z- vers Z+ (pousse le kite vers l'horizon)
        this.physicsEngine.setWindState({
            velocity: new THREE.Vector3(0, 0, speed), // Vent vers Z+
            direction: new THREE.Vector3(0, 0, 1), // Direction vers Z+
            speed: speed,
            turbulence: this.config.wind.turbulence,
        });
        
        this.logger.control(`💨 Vent ajusté: ${speed.toFixed(1)} m/s`);
    }
}
