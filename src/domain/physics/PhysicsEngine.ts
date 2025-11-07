/**
 * Moteur physique principal (orchestration des forces et intégration).
 * 
 * @module domain/physics/PhysicsEngine
 */

import { Kite } from '../kite/Kite';
import { KitePhysicsState, WindState, Forces, SimulationState } from '../../core/types/PhysicsState';
import { IIntegrator } from './integrators/Integrator';
import { ForceManager, IAerodynamicForceCalculator, IGravityForceCalculator } from './forces/ForceCalculator';
import { ILineForceCalculator, LineForceResult, AerodynamicForceResult } from './forces/ForceCalculator';
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
    
    // ✅ Cache du dernier résultat aérodynamique détaillé (pour visualisation forces par panneau)
    private lastAeroResult?: AerodynamicForceResult;
    
    // Cache du dernier résultat complet des lignes pour éviter les recalculs inutiles
    private lastLineResult?: LineForceResult;
    
    // ✅ OPTIMISATION: Debug vibrations DÉSACTIVÉ - économie mémoire (90 Vector3)
    // private lastPositions: THREE.Vector3[] = [];
    // private lastVelocities: THREE.Vector3[] = [];
    // private lastAccelerations: THREE.Vector3[] = [];
    // private vibrationCheckInterval = 0;
    // private readonly maxHistorySize = 30; // 30 frames d'historique
    
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
     * 🎯 NOUVEAU : Implémentation Position-Based Dynamics (PBD)
     * 
     * Cette méthode résout le problème du couplage fort entre :
     * - Forces aérodynamiques (dépendent de la position/orientation)
     * - Position/orientation (dépendent des forces)
     * - Contraintes géométriques (lignes + brides)
     * 
     * Algorithme en 5 phases :
     * 1. PRÉDICTION : Calcul forces + intégration libre (sans contraintes)
     * 2. PROJECTION : Résolution contraintes géométriques
     * 3. FORCES LIGNES : Calcul rappel élastique sur position contrainte
     * 4. CORRECTION VÉLOCITÉ : Déduction vélocité de la correction de position
     * 5. CONTRAINTE SOL : Application collision sol
     * 
     * Voir PHYSIQUE_CONTRAINTES.md pour détails théoriques.
     *
     * @param deltaTime - Pas de temps (s)
     * @param controlDelta - Delta de contrôle des lignes (m)
     * @returns Nouvel état de simulation
     */
    update(deltaTime: number, controlDelta: number): SimulationState {
        const dt = this.config.fixedDeltaTime ?? deltaTime;
        this.currentDelta = controlDelta;

        const currentState = this.kite.getState();

        // ════════════════════════════════════════════════════════════════════════════
        // PHASE 1 : PRÉDICTION LIBRE (sans contraintes géométriques)
        // ════════════════════════════════════════════════════════════════════════════
        // Calculer les forces aérodynamiques et gravitationnelles sur la position
        // actuelle (qui respecte les contraintes de la frame précédente).
        // ════════════════════════════════════════════════════════════════════════════

        const totalForce = new THREE.Vector3(0, 0, 0);
        this.lastForces.aerodynamic.set(0, 0, 0);
        this.lastForces.gravity.set(0, 0, 0);

        // 1a. Force aérodynamique (calcul détaillé pour visualisation + couple)
        let aeroTorque = new THREE.Vector3(0, 0, 0);
        for (const calculator of this.forceManager.getCalculators()) {
            if (calculator.name === 'AerodynamicForce') {
                const aeroCalculator = calculator as IAerodynamicForceCalculator;
                this.lastAeroResult = aeroCalculator.calculateDetailed(currentState, this.windState, dt);
                
                const aeroForce = this.lastAeroResult.total;
                totalForce.add(aeroForce);
                this.lastForces.aerodynamic.copy(aeroForce);
                
                if (aeroCalculator.calculateTorque) {
                    aeroTorque = aeroCalculator.calculateTorque(currentState, this.windState);
                }
                
                break;
            }
        }

        // 1b. Force de gravité (avec couple dû à la répartition de masse)
        let gravityTorque = new THREE.Vector3(0, 0, 0);
        for (const calculator of this.forceManager.getCalculators()) {
            if (calculator.name === 'GravityForce') {
                const gravityForce = calculator.calculate(currentState, this.windState, dt);
                totalForce.add(gravityForce);
                this.lastForces.gravity.copy(gravityForce);
                
                const gravityCalculator = calculator as IGravityForceCalculator;
                if (gravityCalculator.calculateTorque) {
                    gravityTorque = gravityCalculator.calculateTorque(currentState);
                }
                
                break;
            }
        }

        // 1c. Couple total des forces externes (aéro + gravité)
        const externalTorque = new THREE.Vector3()
            .add(aeroTorque)
            .add(gravityTorque);

        // 1d. Intégration libre (Verlet) - SANS contraintes
        const predictedState = this.integrator.integrate(
            currentState,
            totalForce,
            externalTorque,
            dt,
            this.kite.properties.mass
        );

        // ✅ SÉCURITÉ : Vérifier NaN/Inf après intégration
        if (!this.isStateValid(predictedState)) {
            console.error('❌ État invalide détecté après prédiction libre');
            console.error('Forces:', {
                aero: this.lastForces.aerodynamic.toArray(),
                gravity: this.lastForces.gravity.toArray(),
                total: totalForce.toArray()
            });
            
            return this.buildSimulationState(currentState, dt);
        }

        // ════════════════════════════════════════════════════════════════════════════
        // PHASE 2 : PROJECTION SUR CONTRAINTES GÉOMÉTRIQUES
        // ════════════════════════════════════════════════════════════════════════════
        // Résoudre les contraintes de distance (lignes + brides) pour trouver
        // les positions réelles des points de contrôle et corriger la position
        // du centre de masse si nécessaire.
        // ════════════════════════════════════════════════════════════════════════════

        // 2a. Résoudre position des points de contrôle (contraints par lignes + brides)
        const controlPoints = this.resolveControlPointConstraints(
            predictedState,
            this.currentDelta
        );

        // 2b. Projeter sur contraintes de brides (correction légère du centre de masse)
        const constrainedState = this.projectOnBridleConstraints(
            predictedState,
            controlPoints
        );

        // ════════════════════════════════════════════════════════════════════════════
        // PHASE 3 : FORCES DE RAPPEL DES LIGNES (sur position contrainte)
        // ════════════════════════════════════════════════════════════════════════════
        // Calculer les forces élastiques des lignes basées sur la position contrainte.
        // Ces forces ne violent pas les contraintes (déjà satisfaites) mais ajoutent
        // un rappel dû à la vélocité radiale et au léger étirement élastique.
        // ════════════════════════════════════════════════════════════════════════════

        let linesTorque = new THREE.Vector3(0, 0, 0);

        if (this.lineForceCalculator) {
            const lineResult = this.lineForceCalculator.calculateWithDelta(
                constrainedState,  // ✅ Position CONTRAINTE
                this.currentDelta,
                this.baseLineLength
            );

            // Stocker le résultat complet
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

            linesTorque = lineResult.torque;

            // Stocker pour debug
            this.lastForces.lines.copy(lineResult.force);
            if (this.lastForces.linesLeft) {
                this.lastForces.linesLeft.copy(lineResult.leftForce);
            }
            if (this.lastForces.linesRight) {
                this.lastForces.linesRight.copy(lineResult.rightForce);
            }
            this.lastForces.torque.copy(linesTorque);
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

        // ════════════════════════════════════════════════════════════════════════════
        // PHASE 4 : CORRECTION DE VÉLOCITÉ (Position-Based Dynamics)
        // ════════════════════════════════════════════════════════════════════════════
        // Corriger la vélocité basée sur le déplacement réel (currentState → constrainedState).
        // Cela inclut implicitement les impulsions des contraintes géométriques.
        // Puis ajouter les impulsions des forces de lignes (rappel élastique).
        // ════════════════════════════════════════════════════════════════════════════

        if (this.lastLineResult) {
            this.correctVelocity(
                constrainedState,
                currentState,
                this.lastLineResult,
                dt
            );
        }

        // ════════════════════════════════════════════════════════════════════════════
        // PHASE 5 : CONTRAINTE DE COLLISION SOL
        // ════════════════════════════════════════════════════════════════════════════
        // Application simple de la contrainte de sol (pas de couplage avec lignes).
        // ════════════════════════════════════════════════════════════════════════════

        const groundLevel = 0;
        const lowestPointNew = this.kite.getLowestPoint(constrainedState);
        
        if (lowestPointNew.altitude < groundLevel) {
            const penetrationDepth = groundLevel - lowestPointNew.altitude;
            constrainedState.position.y += penetrationDepth;
            
            const restitution = 0.15;
            
            if (constrainedState.velocity.y < 0) {
                constrainedState.velocity.y = -constrainedState.velocity.y * restitution;
            } else {
                constrainedState.velocity.y = 0;
            }
            
            const groundFriction = 0.85;
            constrainedState.velocity.x *= groundFriction;
            constrainedState.velocity.z *= groundFriction;
            
            const rotationDamping = 0.70;
            constrainedState.angularVelocity.multiplyScalar(rotationDamping);
            
            const velocityThreshold = 0.1;
            const angularThreshold = 0.05;
            
            if (Math.abs(constrainedState.velocity.x) < velocityThreshold) constrainedState.velocity.x = 0;
            if (Math.abs(constrainedState.velocity.y) < velocityThreshold) constrainedState.velocity.y = 0;
            if (Math.abs(constrainedState.velocity.z) < velocityThreshold) constrainedState.velocity.z = 0;
            
            if (Math.abs(constrainedState.angularVelocity.x) < angularThreshold) constrainedState.angularVelocity.x = 0;
            if (Math.abs(constrainedState.angularVelocity.y) < angularThreshold) constrainedState.angularVelocity.y = 0;
            if (Math.abs(constrainedState.angularVelocity.z) < angularThreshold) constrainedState.angularVelocity.z = 0;
        }

        // ════════════════════════════════════════════════════════════════════════════
        // FIN : Mise à jour état et construction résultat
        // ════════════════════════════════════════════════════════════════════════════

        this.kite.setState(constrainedState);

        // Stocker forces totales pour debug
        this.lastForces.total = totalForce;  // Forces externes seulement (aéro + gravité)

        return this.buildSimulationState(constrainedState, dt);
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
                leftDistance,   // 🆕 Distance réelle gauche
                rightDistance,  // 🆕 Distance réelle droite
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
     * ✅ NOUVEAU : Vérifie si un état physique est valide (pas de NaN/Inf).
     */
    private isStateValid(state: KitePhysicsState): boolean {
        // Vérifier position
        if (!isFinite(state.position.x) || !isFinite(state.position.y) || !isFinite(state.position.z)) {
            return false;
        }
        
        // Vérifier vitesse
        if (!isFinite(state.velocity.x) || !isFinite(state.velocity.y) || !isFinite(state.velocity.z)) {
            return false;
        }
        
        // Vérifier accélération
        if (!isFinite(state.acceleration.x) || !isFinite(state.acceleration.y) || !isFinite(state.acceleration.z)) {
            return false;
        }
        
        // Vérifier quaternion d'orientation
        if (!isFinite(state.orientation.x) || !isFinite(state.orientation.y) || 
            !isFinite(state.orientation.z) || !isFinite(state.orientation.w)) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Retourne le dernier résultat aérodynamique détaillé (pour visualisation).
     * ✅ Inclut les forces par panneau calculées par le moteur physique.
     */
    getLastAeroResult(): Readonly<AerodynamicForceResult> | undefined {
        return this.lastAeroResult;
    }
    
    /**
     * Retourne le cerf-volant.
     */
    getKite(): Kite {
        return this.kite;
    }
    
    /**
     * 🎯 NOUVEAU (PBD) : Résout les contraintes géométriques des points de contrôle.
     * 
     * Cette méthode trouve la position des points de contrôle qui respecte :
     * - Distance au treuil = longueur ligne (contrainte ligne)
     * - Distance aux 3 points d'attache = longueurs brides (contraintes brides)
     * 
     * @param state - État physique prédit (avant contraintes)
     * @param controlDelta - Delta de longueur des lignes (m)
     * @returns Positions résolues des points de contrôle gauche et droit
     */
    private resolveControlPointConstraints(
        state: KitePhysicsState,
        controlDelta: number
    ): { left: THREE.Vector3; right: THREE.Vector3 } {
        if (!this.lineForceCalculator) {
            // Pas de contraintes si pas de lignes configurées
            return {
                left: new THREE.Vector3(0, 0, 0),
                right: new THREE.Vector3(0, 0, 0)
            };
        }
        
        // Le LineForceCalculator résout déjà les contraintes en interne
        // On peut récupérer les positions résolues via getResolvedControlPoints()
        const resolved = this.lineForceCalculator.getResolvedControlPoints?.();
        
        if (resolved && resolved.left && resolved.right) {
            return {
                left: resolved.left.clone(),
                right: resolved.right.clone()
            };
        }
        
        // Fallback : positions locales des points de contrôle transformées en monde
        const leftLocal = this.kite.getGlobalPointPosition('CONTROLE_GAUCHE');
        const rightLocal = this.kite.getGlobalPointPosition('CONTROLE_DROIT');
        
        return {
            left: leftLocal || new THREE.Vector3(-0.5, 0, 0),
            right: rightLocal || new THREE.Vector3(0.5, 0, 0)
        };
    }
    
    /**
     * 🎯 NOUVEAU (PBD) : Projette l'état prédit sur les contraintes de brides.
     * 
     * Cette méthode corrige la position du centre de masse pour qu'elle soit
     * cohérente avec les positions résolues des points de contrôle et la
     * géométrie des brides.
     * 
     * Pour l'instant, implémentation simplifiée : on garde la position prédite.
     * La contrainte forte est déjà satisfaite par resolveControlPointConstraints().
     * 
     * @param predictedState - État prédit (intégration libre)
     * @param controlPoints - Positions résolues des points de contrôle
     * @returns État projeté sur contraintes
     */
    private projectOnBridleConstraints(
        predictedState: KitePhysicsState,
        controlPoints: { left: THREE.Vector3; right: THREE.Vector3 }
    ): KitePhysicsState {
        // Pour l'instant, on garde l'état prédit sans modification
        // La vraie correction viendrait d'un solveur qui ajuste légèrement
        // la position/orientation pour minimiser l'écart avec les brides
        // 
        // Cette implémentation sera affinée si nécessaire, mais le gain
        // est marginal car les lignes dominent les contraintes
        
        // ⚠️ CRITIQUE : Copie PROFONDE pour éviter partage de références
        return {
            ...predictedState,
            position: predictedState.position.clone(),
            velocity: predictedState.velocity.clone(),
            acceleration: predictedState.acceleration.clone(),
            orientation: predictedState.orientation.clone().normalize(), // ✅ Normaliser ici aussi
            angularVelocity: predictedState.angularVelocity.clone(),
            angularAcceleration: predictedState.angularAcceleration.clone()
        };
    }
    
    /**
     * 🎯 NOUVEAU (PBD) : Corrige la vélocité basée sur le déplacement réel.
     * 
     * Cette méthode implémente le cœur de Position-Based Dynamics :
     * - La vélocité est déduite de (position_finale - position_initiale) / dt
     * - Cela inclut implicitement les impulsions des contraintes
     * - On ajoute ensuite les forces de lignes (rappel élastique)
     * 
     * @param constrainedState - État après projection contraintes (modifié in-place)
     * @param initialState - État initial avant update
     * @param lineResult - Résultat du calcul des forces de lignes
     * @param dt - Pas de temps (s)
     */
    private correctVelocity(
        constrainedState: KitePhysicsState,
        initialState: KitePhysicsState,
        lineResult: LineForceResult,
        dt: number
    ): void {
        // Vélocité linéaire = déplacement réel / dt
        // (inclut l'effet des contraintes géométriques)
        const displacement = new THREE.Vector3()
            .subVectors(constrainedState.position, initialState.position);
        constrainedState.velocity.copy(displacement).divideScalar(dt);
        
        // Ajouter impulsion des forces de lignes (rappel élastique)
        const lineImpulse = lineResult.force.clone()
            .divideScalar(this.kite.properties.mass)
            .multiplyScalar(dt);
        constrainedState.velocity.add(lineImpulse);
        
        // Vélocité angulaire : Calculer la rotation effective
        const deltaRotation = constrainedState.orientation.clone()
            .multiply(initialState.orientation.clone().invert());
        
        // Extraire axe et angle de la rotation delta
        const angle = 2 * Math.acos(Math.min(1, Math.abs(deltaRotation.w)));
        
        if (angle > 0.001) {
            const sinHalfAngle = Math.sqrt(1 - deltaRotation.w * deltaRotation.w);
            const axis = new THREE.Vector3(
                deltaRotation.x / sinHalfAngle,
                deltaRotation.y / sinHalfAngle,
                deltaRotation.z / sinHalfAngle
            );
            
            constrainedState.angularVelocity.copy(axis).multiplyScalar(angle / dt);
        } else {
            constrainedState.angularVelocity.set(0, 0, 0);
        }
        
        // Ajouter impulsion du couple des lignes
        const wingspan = this.kite.geometry.parameters.wingspan;
        const height = this.kite.geometry.parameters.height;
        const inertia = (1/12) * this.kite.properties.mass * (wingspan * wingspan + height * height);
        
        const torqueImpulse = lineResult.torque.clone()
            .divideScalar(inertia)
            .multiplyScalar(dt);
        constrainedState.angularVelocity.add(torqueImpulse);
        
        // ✅ CRITIQUE : Normaliser quaternion pour éviter dérive numérique
        // Le quaternion peut devenir non unitaire après modifications successives
        constrainedState.orientation.normalize();
    }
    
    /**
     * Analyse les vibrations du kite pour détecter les oscillations anormales.
     * ✅ OPTIMISATION: Fonction complètement DÉSACTIVÉE - économie CPU et mémoire
     */
    /*
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
        // Ancienne logique de logging commentée...
    }
    */
}
