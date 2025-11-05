/**
 * Moteur physique principal (orchestration des forces et intégration).
 * 
 * @module domain/physics/PhysicsEngine
 */

import { Kite } from '../kite/Kite';
import { KitePhysicsState, WindState, Forces, SimulationState } from '../../core/types/PhysicsState';
import { IIntegrator } from './integrators/Integrator';
import { ForceManager } from './forces/ForceCalculator';
import { ILineForceCalculator, LineForceResult } from './forces/ForceCalculator';
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
        linesLeft: new THREE.Vector3(0, 0, 0),
        linesRight: new THREE.Vector3(0, 0, 0),
        total: new THREE.Vector3(0, 0, 0),
        torque: new THREE.Vector3(0, 0, 0),
    };
    
    // Cache du dernier résultat complet des lignes pour éviter les recalculs inutiles
    private lastLineResult?: LineForceResult;
    
    // Debug vibrations - stocke les dernières valeurs pour détecter oscillations
    private lastPositions: THREE.Vector3[] = [];
    private lastVelocities: THREE.Vector3[] = [];
    private lastAccelerations: THREE.Vector3[] = [];
    private vibrationCheckInterval = 0;
    private readonly maxHistorySize = 30; // 30 frames d'historique
    
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

        // 1. Calculer les forces dans l'ordre strict : Aéro → Gravité → Lignes
        const totalForce = new THREE.Vector3(0, 0, 0);
        this.lastForces.aerodynamic.set(0, 0, 0);
        this.lastForces.gravity.set(0, 0, 0);

        // 1a. Force aérodynamique
        for (const calculator of this.forceManager.getCalculators()) {
            if (calculator.name === 'AerodynamicForce') {
                const aeroForce = calculator.calculate(currentState, this.windState, dt);
                totalForce.add(aeroForce);
                this.lastForces.aerodynamic.copy(aeroForce);
                break; // On prend le premier (et normalement unique) calculateur aéro
            }
        }

        // 1b. Force de gravité
        for (const calculator of this.forceManager.getCalculators()) {
            if (calculator.name === 'GravityForce') {
                const gravityForce = calculator.calculate(currentState, this.windState, dt);
                totalForce.add(gravityForce);
                this.lastForces.gravity.copy(gravityForce);
                break; // On prend le premier (et normalement unique) calculateur gravité
            }
        }

        // 1c. Forces des lignes (calculées séparément avec couple)
        let linesTorque = new THREE.Vector3(0, 0, 0);

        if (this.lineForceCalculator) {
            const lineResult = this.lineForceCalculator.calculateWithDelta(
                currentState,
                this.currentDelta,
                this.baseLineLength
            );

            totalForce.add(lineResult.force);
            linesTorque = lineResult.torque;

            // Stocker le résultat complet pour éviter recalcul dans buildSimulationState
            this.lastLineResult = {
                force: lineResult.force.clone(),
                torque: lineResult.torque.clone(),
                leftForce: lineResult.leftForce.clone(),
                rightForce: lineResult.rightForce.clone(),
                leftTension: lineResult.leftTension,
                rightTension: lineResult.rightTension,
                leftDistance: lineResult.leftDistance,
                rightDistance: lineResult.rightDistance,
            };

            // Stocker pour debug
            this.lastForces.lines.copy(lineResult.force);
            if (this.lastForces.linesLeft) {
                this.lastForces.linesLeft.copy(lineResult.leftForce);
            }
            if (this.lastForces.linesRight) {
                this.lastForces.linesRight.copy(lineResult.rightForce);
            }
            this.lastForces.torque.copy(linesTorque);

            // 🔧 Logs tensions désactivés - utiliser le panneau d'interface
            this.lastLineResult = lineResult;
        } else {
            this.lastLineResult = undefined;
            this.lastForces.lines.set(0, 0, 0);
            if (this.lastForces.linesLeft) {
                this.lastForces.linesLeft.set(0, 0, 0);
            }
            if (this.lastForces.linesRight) {
                this.lastForces.linesRight.set(0, 0, 0);
            }
            this.lastForces.torque.set(0, 0, 0);
        }

        // 3. Intégrer pour obtenir le nouvel état
        const newState = this.integrator.integrate(
            currentState,
            totalForce,
            linesTorque,
            dt,
            this.kite.properties.mass
        );

        // 4. CONTRAINTE DE COLLISION AVEC LE SOL
        // Le cerf-volant ne peut pas traverser le sol (Y < 0)
        const groundLevel = 0;
        const groundEpsilon = 0.1; // Marge de sécurité pour éviter vibrations numériques
        
        if (newState.position.y <= groundLevel + groundEpsilon) {
            // Forcer la position légèrement au-dessus du sol pour éviter les vibrations
            newState.position.y = groundLevel + groundEpsilon;
            
            // DAMPING MODÉRÉ pour permettre glissement au sol
            
            // 1. Annuler complètement la vélocité verticale
            newState.velocity.y = 0;
            
            // 2. Friction légère au sol (le cerf-volant peut glisser)
            const groundFriction = 0.85; // 🔧 RÉDUIT: garde 85% de la vitesse horizontale (friction légère)
            newState.velocity.x *= groundFriction;
            newState.velocity.z *= groundFriction;
            
            // 3. Damper modérément les rotations (stabilisation douce au sol)
            const rotationDamping = 0.5; // 🔧 AUGMENTÉ: garde 50% de la rotation (0.1 → 0.5)
            newState.angularVelocity.multiplyScalar(rotationDamping);
            
            // 4. Si les vélocités sont quasi-nulles, les mettre à zéro pour arrêt complet
            const velocityThreshold = 0.01; // m/s
            if (Math.abs(newState.velocity.x) < velocityThreshold) newState.velocity.x = 0;
            if (Math.abs(newState.velocity.z) < velocityThreshold) newState.velocity.z = 0;
            
            const angularThreshold = 0.001; // rad/s
            if (Math.abs(newState.angularVelocity.x) < angularThreshold) newState.angularVelocity.x = 0;
            if (Math.abs(newState.angularVelocity.y) < angularThreshold) newState.angularVelocity.y = 0;
            if (Math.abs(newState.angularVelocity.z) < angularThreshold) newState.angularVelocity.z = 0;
        }

        // 5. DEBUG VIBRATIONS - Stocker l'historique pour analyse
        this.lastPositions.push(newState.position.clone());
        this.lastVelocities.push(newState.velocity.clone());
        this.lastAccelerations.push(newState.acceleration.clone());
        
        // Limiter la taille de l'historique
        if (this.lastPositions.length > this.maxHistorySize) {
            this.lastPositions.shift();
            this.lastVelocities.shift();
            this.lastAccelerations.shift();
        }
        
        // Analyser les vibrations toutes les 0.5 secondes
        this.vibrationCheckInterval += dt;
        if (this.vibrationCheckInterval >= 0.5) {
            this.checkForVibrations(newState, totalForce, linesTorque);
            this.vibrationCheckInterval = 0;
        }

        // 6. Mettre à jour l'état du cerf-volant
        this.kite.setState(newState);

        // 7. Stocker forces pour debug
        this.lastForces.total = totalForce;
        this.lastForces.torque = linesTorque;

        // 8. Construire état de simulation complet
        return this.buildSimulationState(newState, dt);
    }
    
    /**
     * Construit l'état complet de simulation.
     */
    private buildSimulationState(
        kiteState: KitePhysicsState,
        deltaTime: number
    ): SimulationState {
        // Utiliser le résultat du cache au lieu de recalculer
        let leftTension = 0;
        let rightTension = 0;
        let leftDistance = 0;
        let rightDistance = 0;
        
        if (this.lastLineResult) {
            leftTension = this.lastLineResult.leftTension;
            rightTension = this.lastLineResult.rightTension;
            leftDistance = this.lastLineResult.leftDistance;
            rightDistance = this.lastLineResult.rightDistance;
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
        this.lastLineResult = undefined;
        
        // Réinitialiser les forces lissées
        if (this.lineForceCalculator) {
            this.lineForceCalculator.reset();
        }
        
        // Réinitialiser cache forces
        this.lastForces = {
            aerodynamic: new THREE.Vector3(0, 0, 0),
            gravity: new THREE.Vector3(0, 0, 0),
            lines: new THREE.Vector3(0, 0, 0),
            linesLeft: new THREE.Vector3(0, 0, 0),
            linesRight: new THREE.Vector3(0, 0, 0),
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
    
    /**
     * Analyse les vibrations du kite pour détecter les oscillations anormales.
     */
    private checkForVibrations(
        state: KitePhysicsState,
        totalForce: THREE.Vector3,
        torque: THREE.Vector3
    ): void {
        if (this.lastPositions.length < 10) return; // Pas assez de données
        
        // Calculer les variations de position sur les dernières frames
        const positionVariations: number[] = [];
        for (let i = 1; i < this.lastPositions.length; i++) {
            const variation = this.lastPositions[i].distanceTo(this.lastPositions[i - 1]);
            positionVariations.push(variation);
        }
        
        // Calculer l'écart-type des variations
        const mean = positionVariations.reduce((a, b) => a + b, 0) / positionVariations.length;
        const variance = positionVariations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / positionVariations.length;
        const stdDev = Math.sqrt(variance);
        
        // Calculer la vitesse moyenne et son écart-type
        const velocityMagnitudes = this.lastVelocities.map(v => v.length());
        const velocityMean = velocityMagnitudes.reduce((a, b) => a + b, 0) / velocityMagnitudes.length;
        const velocityVariance = velocityMagnitudes.reduce((a, b) => a + Math.pow(b - velocityMean, 2), 0) / velocityMagnitudes.length;
        const velocityStdDev = Math.sqrt(velocityVariance);
        
        // Calculer l'accélération moyenne
        const accelMagnitudes = this.lastAccelerations.map(a => a.length());
        const accelMean = accelMagnitudes.reduce((a, b) => a + b, 0) / accelMagnitudes.length;
        const accelMax = Math.max(...accelMagnitudes);
        
        // Détecter des oscillations anormales
        const hasPositionOscillation = stdDev > 0.05; // Variation de position > 5cm
        const hasVelocityOscillation = velocityStdDev / Math.max(0.1, velocityMean) > 0.3; // Variation > 30%
        const hasHighAcceleration = accelMean > 100 || accelMax > 200; // 🔧 Seuils relevés
        
        // 🔧 LOGS DÉSACTIVÉS - Trop verbeux
        /*
        // Logger si vibrations détectées
        if (hasPositionOscillation || hasVelocityOscillation || hasHighAcceleration) {
            console.warn('⚠️ VIBRATIONS DÉTECTÉES:');
            console.warn(`   Position: σ=${stdDev.toFixed(3)}m ${hasPositionOscillation ? '❌ OSCILLATION' : '✓'}`);
            console.warn(`   Vélocité: μ=${velocityMean.toFixed(2)}m/s σ=${velocityStdDev.toFixed(2)} ${hasVelocityOscillation ? '❌ OSCILLATION' : '✓'}`);
            console.warn(`   Accélération: μ=${accelMean.toFixed(1)}m/s² max=${accelMax.toFixed(1)} ${hasHighAcceleration ? '❌ ÉLEVÉE' : '✓'}`);

            // Logger l'état actuel
            console.warn(`   État actuel:`);
            console.warn(`     Pos: (${state.position.x.toFixed(2)}, ${state.position.y.toFixed(2)}, ${state.position.z.toFixed(2)})`);
            console.warn(`     Vel: (${state.velocity.x.toFixed(2)}, ${state.velocity.y.toFixed(2)}, ${state.velocity.z.toFixed(2)}) |V|=${state.velocity.length().toFixed(2)}`);
            console.warn(`     Acc: (${state.acceleration.x.toFixed(2)}, ${state.acceleration.y.toFixed(2)}, ${state.acceleration.z.toFixed(2)}) |A|=${state.acceleration.length().toFixed(2)}`);

            // Logger les forces
            console.warn(`   Forces:`);
            console.warn(`     Aéro: (${this.lastForces.aerodynamic.x.toFixed(1)}, ${this.lastForces.aerodynamic.y.toFixed(1)}, ${this.lastForces.aerodynamic.z.toFixed(1)}) |F|=${this.lastForces.aerodynamic.length().toFixed(1)}N`);
            console.warn(`     Gravité: (${this.lastForces.gravity.x.toFixed(1)}, ${this.lastForces.gravity.y.toFixed(1)}, ${this.lastForces.gravity.z.toFixed(1)}) |F|=${this.lastForces.gravity.length().toFixed(1)}N`);
            console.warn(`     Lignes: (${this.lastForces.lines.x.toFixed(1)}, ${this.lastForces.lines.y.toFixed(1)}, ${this.lastForces.lines.z.toFixed(1)}) |F|=${this.lastForces.lines.length().toFixed(1)}N`);
            console.warn(`     Total: (${totalForce.x.toFixed(1)}, ${totalForce.y.toFixed(1)}, ${totalForce.z.toFixed(1)}) |F|=${totalForce.length().toFixed(1)}N`);
            console.warn(`     Couple: (${torque.x.toFixed(2)}, ${torque.y.toFixed(2)}, ${torque.z.toFixed(2)}) |τ|=${torque.length().toFixed(2)}N·m`);

            // Logger les tensions des lignes
            if (this.lastLineResult) {
                console.warn(`   Lignes:`);
                console.warn(`     Gauche: ${this.lastLineResult.leftTension.toFixed(0)}N (${this.lastLineResult.leftDistance.toFixed(2)}m)`);
                console.warn(`     Droite: ${this.lastLineResult.rightTension.toFixed(0)}N (${this.lastLineResult.rightDistance.toFixed(2)}m)`);
                console.warn(`     Δ Tension: ${Math.abs(this.lastLineResult.leftTension - this.lastLineResult.rightTension).toFixed(0)}N`);
            }
        }
        */
    }
}
