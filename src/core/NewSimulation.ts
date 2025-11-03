/**
 * Nouvelle Simulation propre avec architecture découplée.
 * 
 * @module core/NewSimulation
 */

import * as THREE from 'three';
import { SimulationConfig, DEFAULT_CONFIG } from './SimulationConfig';
import { EventBus, SimulationEventType } from './types/Events';
import { createInitialState } from './types/PhysicsState';

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
import { Camera } from '../infrastructure/rendering/Camera';
import { KiteVisualizer } from '../infrastructure/rendering/visualizers/KiteVisualizer';
import { 
    LinesVisualizer, 
    TrajectoryVisualizer, 
    DebugVisualizer 
} from '../infrastructure/rendering/visualizers/VisualizersBundle';

// Application
import { Logger } from '../application/logging/Logger';
import { IAutoPilotMode, ManualMode, ZenithMode } from '../application/control/autopilot/modes/AutoPilotModes';

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
    
    // Contrôle
    private currentDelta = 0;
    private autoPilotMode: IAutoPilotMode = new ManualMode();
    private autoPilotActive = false;
    
    // État
    private isPaused = false;
    private lastLogTime = 0;
    
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
        this.camera = new Camera(width / height);
        
        // 3. Initialiser domaine
        const initialState = createInitialState();
        initialState.position.set(6.8, 6.8, 0);
        initialState.orientation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
        
        this.kite = KiteFactory.createStandard(initialState);
        
        // 4. Créer moteur physique avec DI
        const integrator = new VerletIntegrator({
            dampingFactor: this.config.physics.dampingFactor,
            maxVelocity: this.config.physics.maxVelocity,
            maxAngularVelocity: this.config.physics.maxAngularVelocity,
        });
        
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
        
        const lineCalculator = new LineForceCalculator(
            this.kite,
            {
                left: new THREE.Vector3(0.25, 0.25, -0.15),
                right: new THREE.Vector3(0.25, 0.25, 0.15),
            },
            {
                stiffness: this.config.lines.stiffness,
                damping: this.config.lines.damping,
                restLengthRatio: this.config.lines.restLengthRatio,
                smoothingCoefficient: this.config.lines.smoothingCoefficient,
                minTension: this.config.lines.minTension,
            }
        );
        
        this.physicsEngine = new PhysicsEngine(
            this.kite,
            integrator,
            forceManager,
            {
                velocity: new THREE.Vector3(this.config.wind.speed, 0, 0),
                direction: new THREE.Vector3(1, 0, 0),
                speed: this.config.wind.speed,
                turbulence: this.config.wind.turbulence,
            },
            {
                gravity: this.config.physics.gravity,
            }
        );
        
        this.physicsEngine.setLineForceCalculator(lineCalculator);
        this.physicsEngine.setBaseLineLength(this.config.lines.baseLength);
        
        // 5. Créer visualiseurs
        this.kiteVisualizer = new KiteVisualizer(this.kite);
        this.linesVisualizer = new LinesVisualizer();
        this.trajectoryVisualizer = new TrajectoryVisualizer();
        this.debugVisualizer = new DebugVisualizer();
        
        // Ajouter à la scène
        this.scene.add(this.kiteVisualizer.getObject3D());
        this.linesVisualizer.getObjects().forEach(line => this.scene.add(line));
        this.scene.add(this.trajectoryVisualizer.getObject());
        this.scene.add(this.debugVisualizer.getObject());
        
        // 6. Configurer événements
        this.setupEventListeners();
        
        // 7. Configurer contrôles clavier
        this.setupKeyboardControls();
        
        // 8. Démarrer boucle
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
            
            switch (key) {
                case ' ':
                    this.togglePause();
                    break;
                case 'r':
                    this.reset();
                    break;
                case 'a':
                    this.toggleAutoPilot();
                    break;
                case '5':
                    if (this.autoPilotActive) {
                        this.autoPilotMode = new ZenithMode();
                        this.logger.info('Mode ZENITH activé');
                    }
                    break;
                case 'arrowleft':
                case 'q':
                    this.currentDelta += 0.01;
                    break;
                case 'arrowright':
                case 'd':
                    this.currentDelta -= 0.01;
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
                const deltaTime = this.clock.getDelta();
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
        // Appliquer autopilote si actif
        if (this.autoPilotActive) {
            this.currentDelta = this.autoPilotMode.calculate(
                this.kite.getState(),
                deltaTime,
                this.config.lines.baseLength
            );
        }
        
        // Mise à jour physique
        const simState = this.physicsEngine.update(deltaTime, this.currentDelta);
        
        // Mise à jour visualiseurs
        this.kiteVisualizer.update();
        this.linesVisualizer.update(
            new THREE.Vector3(0.25, 0.25, -0.15),
            new THREE.Vector3(0.25, 0.25, 0.15),
            this.kite
        );
        
        // Trajectoire
        if (simState.elapsedTime % 0.1 < deltaTime) {
            this.trajectoryVisualizer.addPoint(simState.kite.position);
        }
        
        // Debug forces
        if (this.config.rendering.showDebug) {
            this.debugVisualizer.updateForceVectors(simState.kite.position, {
                aerodynamic: simState.forces.aerodynamic,
                gravity: simState.forces.gravity,
                total: simState.forces.total,
            });
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
            this.camera.getThreeCamera()
        );
    }
    
    /**
     * Log l'état actuel.
     */
    private logState(simState: any): void {
        const { position, velocity } = simState.kite;
        const { leftTension, rightTension } = simState.lines;
        
        const log = `T+${simState.elapsedTime.toFixed(1)}s | ` +
                   `Pos: (${position.x.toFixed(1)}, ${position.y.toFixed(1)}) | ` +
                   `V: ${velocity.length().toFixed(1)} m/s | ` +
                   `T: ${leftTension.toFixed(1)}/${rightTension.toFixed(1)}N`;
        
        this.logger.info(log);
    }
    
    /**
     * Réinitialise la simulation.
     */
    private reset(): void {
        const initialState = createInitialState();
        initialState.position.set(6.8, 6.8, 0);
        initialState.orientation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
        
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
        this.logger.info(this.autoPilotActive ? '🤖 Autopilote ON' : '👤 Manuel');
    }
    
    /**
     * Nettoie les ressources.
     */
    dispose(): void {
        this.kiteVisualizer.dispose();
        this.linesVisualizer.dispose();
        this.trajectoryVisualizer.dispose();
        this.debugVisualizer.dispose();
        this.scene.dispose();
        this.renderer.dispose();
        this.eventBus.clearAll();
    }
}
