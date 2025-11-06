/**
 * Calculateur de forces des lignes de contrôle.
 * 
 * Modèle PENDULE 3D : Treuil → Ligne → Point de contrôle → Brides → Structure
 * 
 * @module domain/physics/forces/LineForce
 */

import * as THREE from 'three';
import { Vector3D, KitePhysicsState, WindState } from '../../../core/types/PhysicsState';
import { ILineForceCalculator, LineForceResult } from './ForceCalculator';
import { Kite } from '../../kite/Kite';
import { BridleSystem } from '../BridleSystem';

/**
 * Configuration du système de lignes.
 */
export interface LineForceConfig {
    /** Raideur du ressort linéaire (N/m) - Zone proche */
    stiffness: number;

    /** Amortissement (Ns/m) */
    damping: number;

    /** Coefficient de lissage temporel (0-1) */
    smoothingCoefficient: number;

    /** Tension minimale en régime 1 (N) */
    minTension: number;

    /** 🔧 NOUVEAU : Seuil d'activation de la zone exponentielle (m) */
    exponentialThreshold: number;

    /** 🔧 NOUVEAU : Coefficient d'intensité exponentielle (N) */
    exponentialStiffness: number;

    /** 🔧 NOUVEAU : Taux de croissance exponentiel (1/m) */
    exponentialRate: number;
}

/**
 * Position des treuils (station de contrôle).
 */
export interface WinchPositions {
    left: Vector3D;
    right: Vector3D;
}

/**
 * Calculateur de forces des lignes (modèle bi-régime ressort-amortisseur).
 * ✅ REFACTORISÉ : Intègre BridleSystem pour chaîne de transmission complète
 * ✅ OPTIMISÉ: Vecteurs temporaires réutilisables pour réduire allocations
 */
export class LineForceCalculator implements ILineForceCalculator {
    public readonly name = 'LineForce';
    
    private config: LineForceConfig;
    private kite: Kite;
    private winchPositions: WinchPositions;
    
    // 🎯 NOUVEAUTÉ : Systèmes de brides gauche/droit
    private leftBridleSystem: BridleSystem;
    private rightBridleSystem: BridleSystem;
    
    // Tensions lissées pour éviter oscillations
    private smoothedLeftTension: number;
    private smoothedRightTension: number;
    
    // 🎯 NOUVEAUTÉ : Cache des positions précédentes des points de contrôle (warm start optimisation)
    private leftControlPointCache?: THREE.Vector3;
    private rightControlPointCache?: THREE.Vector3;
    
    // ✅ OPTIMISATION: Vecteurs temporaires réutilisables (réduire allocations)
    private tempVector1 = new THREE.Vector3();
    private tempVector2 = new THREE.Vector3();
    private tempVector3 = new THREE.Vector3();
    
    constructor(
        kite: Kite,
        winchPositions: WinchPositions,
        config?: Partial<LineForceConfig>,
        bridleConfig?: Partial<import('../BridleSystem').BridleSystemConfig>
    ) {
        this.kite = kite;
        this.winchPositions = winchPositions;
        this.config = {
            stiffness: config?.stiffness ?? 20,
            damping: config?.damping ?? 10,
            smoothingCoefficient: config?.smoothingCoefficient ?? 0.2,
            minTension: config?.minTension ?? 1.5,
            exponentialThreshold: config?.exponentialThreshold ?? 1.0,
            exponentialStiffness: config?.exponentialStiffness ?? 50,
            exponentialRate: config?.exponentialRate ?? 1.5,
        };
        
        this.smoothedLeftTension = this.config.minTension;
        this.smoothedRightTension = this.config.minTension;
        
        // 🎯 NOUVEAUTÉ : Initialiser les systèmes de brides avec config dédiée
        const defaultBridleConfig = {
            maxIterations: bridleConfig?.maxIterations ?? 20,
            convergenceTolerance: bridleConfig?.convergenceTolerance ?? 0.001,  // 1mm
            relaxationFactor: bridleConfig?.relaxationFactor ?? 0.8,
            controlPointMass: bridleConfig?.controlPointMass ?? 0.01,  // 10g
            lineConstraintWeight: bridleConfig?.lineConstraintWeight ?? 1.0,
        };
        
        this.leftBridleSystem = new BridleSystem(kite, 'left', defaultBridleConfig);
        this.rightBridleSystem = new BridleSystem(kite, 'right', defaultBridleConfig);
    }
    
    /**
     * Calcule la force totale (wrapper pour interface IForceCalculator).
     */
    calculate(state: KitePhysicsState, wind: WindState, deltaTime: number): Vector3D {
        // Utiliser delta = 0 par défaut (lignes équilibrées)
        const result = this.calculateWithDelta(state, 0, 10);
        return result.force;
    }
    
    /**
     * Calcule les forces des lignes avec détails.
     * 🎯 REFACTORISÉ : Utilise maintenant la chaîne Ligne → Point de contrôle → Brides → Structure
     */
    calculateWithDelta(state: KitePhysicsState, delta: number, baseLength: number): LineForceResult {
        // Longueurs des lignes avec delta
        const leftLength = baseLength - delta;
        const rightLength = baseLength + delta;
        
        // 1. Calculer les forces des lignes aux points de contrôle
        const leftAttach = this.resolveAttachPoint(['CONTROLE_GAUCHE', 'LEFT_CONTROL'], state.position);
        const rightAttach = this.resolveAttachPoint(['CONTROLE_DROIT', 'RIGHT_CONTROL'], state.position);
        
        const leftLineForceData = this.calculateSingleLineForce(
            this.winchPositions.left,
            leftAttach,
            leftLength,
            state,
            true
        );
        
        const rightLineForceData = this.calculateSingleLineForce(
            this.winchPositions.right,
            rightAttach,
            rightLength,
            state,
            false
        );
        
        // 2. 🎯 NOUVEAUTÉ : Transmettre les forces via les brides à la structure
        // Passer treuil + longueur ligne + position précédente pour résolution contraintes
        const leftBridleResult = this.leftBridleSystem.calculateBridleForces(
            leftLineForceData.force,
            this.winchPositions.left,
            leftLength,
            state,
            this.leftControlPointCache  // Warm start
        );
        
        const rightBridleResult = this.rightBridleSystem.calculateBridleForces(
            rightLineForceData.force,
            this.winchPositions.right,
            rightLength,
            state,
            this.rightControlPointCache  // Warm start
        );
        
        // 3. ✅ Mettre à jour cache des positions pour prochaine frame
        this.leftControlPointCache = leftBridleResult.controlPointPosition;
        this.rightControlPointCache = rightBridleResult.controlPointPosition;
        
        // 3. Force totale = somme des forces transmises par les brides
        const totalForce = new THREE.Vector3()
            .add(leftBridleResult.totalForce)
            .add(rightBridleResult.totalForce);
        
        // 4. Couple total = somme des couples des deux systèmes de brides
        const totalTorque = new THREE.Vector3()
            .add(leftBridleResult.torque)
            .add(rightBridleResult.torque);
        
        return {
            force: totalForce,
            torque: totalTorque,
            leftForce: leftBridleResult.totalForce,
            rightForce: rightBridleResult.totalForce,
            leftTension: leftLineForceData.tension,
            rightTension: rightLineForceData.tension,
            leftDistance: leftLineForceData.distance,
            rightDistance: rightLineForceData.distance,
        };
    }
    
    /**
     * Calcule la force d'une seule ligne (modèle bi-régime).
     * ✅ OPTIMISÉ: Réutilise vecteurs temporaires au lieu de créer/cloner
     */
    private calculateSingleLineForce(
        winchPos: Vector3D,
        attachPos: Vector3D,
        targetLength: number,
        state: KitePhysicsState,
        isLeft: boolean
    ): { force: Vector3D; tension: number; distance: number } {
        // Vecteur ligne et distance (réutilise tempVector1)
        this.tempVector1.subVectors(attachPos, winchPos);
        const currentDistance = this.tempVector1.length();
        
        if (currentDistance < 0.01) {
            return {
                force: new THREE.Vector3(0, 0, 0),
                tension: 0,
                distance: currentDistance,
            };
        }
        
        // Direction de la ligne (réutilise tempVector2)
        this.tempVector2.copy(this.tempVector1).normalize();
        
        const restLength = targetLength;
        
        // Vitesse au point d'attache (réutilise tempVector3)
        this.tempVector3.subVectors(attachPos, state.position);
        const rotationalVelocity = new THREE.Vector3()
            .copy(state.angularVelocity)
            .cross(this.tempVector3);
        const attachVelocity = state.velocity.clone().add(rotationalVelocity);
        
        let tension = 0;
        
        // 🔧 CORRECTION PHYSIQUE CRITIQUE : Modèle réaliste des lignes
        // 
        // PRINCIPE : Un fil peut TIRER mais pas POUSSER
        // - Si ligne détendue (L < L_repos) : tension = 0 (chute libre autorisée)
        // - Si ligne tendue (L ≥ L_repos) : tension selon modèle ressort-amortisseur
        // 
        // CORRECTION IMPORTANTE : Tension minimale de 0.5N même en slack léger
        // pour maintenir une contrainte géométrique faible (évite dérive totale)
        // Cette tension résiduelle simule :
        // - La masse propre des lignes (qui pendent entre treuil et kite)
        // - La friction de l'air sur les lignes
        // - Les micro-tensions dues aux vibrations
        //
        // Cela permet au cerf-volant de :
        // ✅ Tomber sous l'effet de la gravité (force dominante)
        // ✅ Ressentir le vent apparent pendant la chute (forces aéro actives)
        // ✅ Rester dans l'hémisphère de vol (pas de dérive infinie)
        
        const slackTolerance = 0.05; // 5cm de tolérance avant tension résiduelle
        
        if (currentDistance < restLength - slackTolerance) {
            // Régime SLACK COMPLET : Ligne vraiment détendue → Tension nulle
            // Le cerf-volant tombe librement
            tension = 0;
        } else if (currentDistance < restLength + 0.01) {
            // Régime TRANSITION : Proche de la longueur de repos
            // Tension résiduelle faible (masse des lignes, friction air)
            const proximityFactor = (currentDistance - (restLength - slackTolerance)) / (slackTolerance + 0.01);
            tension = this.config.minTension * Math.max(0, Math.min(1, proximityFactor));
        } else {
            // Régime TENDU : Ligne étirée - Modèle HYBRIDE Linéaire-Exponentiel
            const extension = currentDistance - restLength;
            
            // Vitesse radiale
            const radialVelocity = attachVelocity.dot(this.tempVector2);
            
            // Calcul de la force de rappel selon l'extension
            let springForce: number;
            
            if (extension < this.config.exponentialThreshold) {
                // Zone linéaire : F = k × x
                springForce = this.config.stiffness * extension;
            } else {
                // Zone exponentielle : Protection contre sur-étirement
                const thresholdForce = this.config.stiffness * this.config.exponentialThreshold;
                const excessExtension = extension - this.config.exponentialThreshold;
                const expTerm = Math.exp(this.config.exponentialRate * excessExtension) - 1;
                springForce = this.config.exponentialStiffness * expTerm + thresholdForce;
            }
            
            // Amortissement : F_damp = c × v
            const dampingForce = this.config.damping * radialVelocity;
            
            tension = springForce + dampingForce;
            // Ajouter tension minimale (masse lignes + friction)
            tension = Math.max(this.config.minTension, tension);
        }
        
        // Lissage temporel
        const alpha = this.config.smoothingCoefficient;
        if (isLeft) {
            this.smoothedLeftTension = alpha * tension + (1 - alpha) * this.smoothedLeftTension;
            tension = this.smoothedLeftTension;
        } else {
            this.smoothedRightTension = alpha * tension + (1 - alpha) * this.smoothedRightTension;
            tension = this.smoothedRightTension;
        }
        
        // Force = tension × direction (vers le treuil) - réutilise tempVector2 qui contient lineDirection
        const force = this.tempVector2.clone().multiplyScalar(-tension);
        
        return { force, tension, distance: currentDistance };
    }
    
    /**
     * Réinitialise les tensions lissées (appelé lors d'un reset).
     */
    reset(): void {
        // ✅ CORRECTION: Réinitialiser à 0 (pas de tension artificielle au démarrage)
        this.smoothedLeftTension = 0;
        this.smoothedRightTension = 0;
    }
    
    /**
     * Met à jour les positions des treuils.
     */
    setWinchPositions(positions: WinchPositions): void {
        this.winchPositions = positions;
    }

    /**
     * Résout la position d'attache d'une ligne en testant plusieurs alias.
     */
    private resolveAttachPoint(names: string[], fallback: Vector3D): Vector3D {
        for (const name of names) {
            const point = this.kite.getGlobalPointPosition(name);
            if (point) {
                return point;
            }
        }

        return fallback.clone();
    }
}
