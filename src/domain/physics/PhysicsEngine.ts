/**
 * Moteur physique principal (orchestration des forces et intégration).
 * 
 * @module domain/physics/PhysicsEngine
 */

import { Kite } from '../kite/Kite';
import { KitePhysicsState, WindState, Forces, SimulationState } from '../../core/types/PhysicsState';
import { IIntegrator } from './integrators/Integrator';
import { ForceManager } from './forces/ForceCalculator';
import { ILineForceCalculator } from './forces/ForceCalculator';
import * as THREE from 'three';

/**
 * Configuration du moteur physique.
 */
export interface PhysicsEngineConfig {
    /** Gravité (m/s²) */
    gravity: number;
    
    /** Pas de temps fixe (s) */
    fixedDeltaTime?: number;
}

/**
 * Moteur physique avec injection de dépendances.
 * 
 * Orchestre le calcul des forces, l'intégration et la mise à jour de l'état.
 */
export class PhysicsEngine {
    private kite: Kite;
    private integrator: IIntegrator;
    private forceManager: ForceManager;
    private lineForceCalculator?: ILineForceCalculator;
    
    private windState: WindState;
    private currentDelta = 0; // Delta de longueur des lignes (m)
    private baseLineLength = 10; // Longueur de base (m)
    
    private config: Required<PhysicsEngineConfig>;
    
    // Cache des dernières forces calculées (pour debug/visualisation)
    private lastForces: Forces = {
        aerodynamic: new THREE.Vector3(0, 0, 0),
        gravity: new THREE.Vector3(0, 0, 0),
        lines: new THREE.Vector3(0, 0, 0),
        total: new THREE.Vector3(0, 0, 0),
        torque: new THREE.Vector3(0, 0, 0),
    };
    
    constructor(
        kite: Kite,
        integrator: IIntegrator,
        forceManager: ForceManager,
        windState: WindState,
        config?: Partial<PhysicsEngineConfig>
    ) {
        this.kite = kite;
        this.integrator = integrator;
        this.forceManager = forceManager;
        this.windState = windState;
        
        this.config = {
            gravity: config?.gravity ?? 9.81,
            fixedDeltaTime: config?.fixedDeltaTime ?? undefined,
        };
    }
    
    /**
     * Met à jour la physique pour un pas de temps.
     * 
     * @param deltaTime - Pas de temps (s)
     * @param controlDelta - Delta de contrôle des lignes (m)
     * @returns Nouvel état de simulation
     */
    update(deltaTime: number, controlDelta: number): SimulationState {
        const dt = this.config.fixedDeltaTime ?? deltaTime;
        this.currentDelta = controlDelta;
        
        const currentState = this.kite.getState();
        
        // 1. Calculer toutes les forces
        const totalForce = this.forceManager.calculateTotalForce(
            currentState,
            this.windState,
            dt
        );
        
        // 2. Calculer force des lignes séparément (pour accès au couple)
        let linesTorque = new THREE.Vector3(0, 0, 0);
        
        if (this.lineForceCalculator) {
            const lineResult = this.lineForceCalculator.calculateWithDelta(
                currentState,
                this.currentDelta,
                this.baseLineLength
            );
            
            totalForce.add(lineResult.force);
            linesTorque = lineResult.torque;
            
            // Stocker pour debug
            this.lastForces.lines = lineResult.force;
        }
        
        // 3. Intégrer pour obtenir le nouvel état
        const newState = this.integrator.integrate(
            currentState,
            totalForce,
            linesTorque,
            dt,
            this.kite.properties.mass
        );
        
        // 4. Mettre à jour l'état du cerf-volant
        this.kite.setState(newState);
        
        // 5. Stocker forces pour debug
        this.lastForces.total = totalForce;
        this.lastForces.torque = linesTorque;
        
        // 6. Construire état de simulation complet
        return this.buildSimulationState(newState, dt);
    }
    
    /**
     * Construit l'état complet de simulation.
     */
    private buildSimulationState(
        kiteState: KitePhysicsState,
        deltaTime: number
    ): SimulationState {
        let leftTension = 0;
        let rightTension = 0;
        let leftDistance = 0;
        let rightDistance = 0;
        
        if (this.lineForceCalculator) {
            const lineResult = this.lineForceCalculator.calculateWithDelta(
                kiteState,
                this.currentDelta,
                this.baseLineLength
            );
            
            leftTension = lineResult.leftTension;
            rightTension = lineResult.rightTension;
            leftDistance = lineResult.leftDistance;
            rightDistance = lineResult.rightDistance;
        }
        
        return {
            kite: kiteState,
            forces: this.lastForces,
            lines: {
                baseLength: this.baseLineLength,
                delta: this.currentDelta,
                leftLength: this.baseLineLength - this.currentDelta,
                rightLength: this.baseLineLength + this.currentDelta,
                leftTension,
                rightTension,
                totalTension: leftTension + rightTension,
            },
            wind: this.windState,
            elapsedTime: kiteState.timestamp,
            deltaTime,
        };
    }
    
    /**
     * Réinitialise le moteur physique.
     */
    reset(initialState: KitePhysicsState): void {
        this.kite.setState(initialState);
        this.currentDelta = 0;
        
        // Réinitialiser les forces lissées
        if (this.lineForceCalculator) {
            this.lineForceCalculator.reset();
        }
        
        // Réinitialiser cache forces
        this.lastForces = {
            aerodynamic: new THREE.Vector3(0, 0, 0),
            gravity: new THREE.Vector3(0, 0, 0),
            lines: new THREE.Vector3(0, 0, 0),
            total: new THREE.Vector3(0, 0, 0),
            torque: new THREE.Vector3(0, 0, 0),
        };
    }
    
    /**
     * Enregistre le calculateur de forces de lignes.
     */
    setLineForceCalculator(calculator: ILineForceCalculator): void {
        this.lineForceCalculator = calculator;
    }
    
    /**
     * Met à jour l'état du vent.
     */
    setWindState(windState: WindState): void {
        this.windState = windState;
    }
    
    /**
     * Met à jour la longueur de base des lignes.
     */
    setBaseLineLength(length: number): void {
        this.baseLineLength = length;
    }
    
    /**
     * Retourne l'état actuel du cerf-volant.
     */
    getKiteState(): Readonly<KitePhysicsState> {
        return this.kite.getState();
    }
    
    /**
     * Retourne les dernières forces calculées.
     */
    getLastForces(): Readonly<Forces> {
        return this.lastForces;
    }
    
    /**
     * Retourne le cerf-volant.
     */
    getKite(): Kite {
        return this.kite;
    }
}
