/**
 * Calculateur de forces des lignes de contrôle.
 * 
 * @module domain/physics/forces/LineForce
 */

import * as THREE from 'three';
import { Vector3D, KitePhysicsState, WindState } from '../../../core/types/PhysicsState';
import { ILineForceCalculator, LineForceResult } from './ForceCalculator';
import { Kite } from '../../kite/Kite';

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
 * ✅ OPTIMISÉ: Vecteurs temporaires réutilisables pour réduire allocations
 */
export class LineForceCalculator implements ILineForceCalculator {
    public readonly name = 'LineForce';
    
    private config: LineForceConfig;
    private kite: Kite;
    private winchPositions: WinchPositions;
    
    // Tensions lissées pour éviter oscillations
    private smoothedLeftTension: number;
    private smoothedRightTension: number;
    
    // ✅ OPTIMISATION: Vecteurs temporaires réutilisables (réduire allocations)
    private tempVector1 = new THREE.Vector3();
    private tempVector2 = new THREE.Vector3();
    private tempVector3 = new THREE.Vector3();
    
    constructor(
        kite: Kite,
        winchPositions: WinchPositions,
        config?: Partial<LineForceConfig>
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
     */
    calculateWithDelta(state: KitePhysicsState, delta: number, baseLength: number): LineForceResult {
        // Longueurs des lignes avec delta
        const leftLength = baseLength - delta;
        const rightLength = baseLength + delta;
        
        // Points d'attache sur le cerf-volant (points de contrôle des brides)
    const leftAttach = this.resolveAttachPoint(['CONTROLE_GAUCHE', 'LEFT_CONTROL'], state.position);
    const rightAttach = this.resolveAttachPoint(['CONTROLE_DROIT', 'RIGHT_CONTROL'], state.position);
        
        // Calculer forces individuelles
        const leftForceData = this.calculateSingleLineForce(
            this.winchPositions.left,
            leftAttach,
            leftLength,
            state,
            true
        );
        
        const rightForceData = this.calculateSingleLineForce(
            this.winchPositions.right,
            rightAttach,
            rightLength,
            state,
            false
        );
        
        // Force totale
        const totalForce = leftForceData.force.clone().add(rightForceData.force);
        
        // Couple (torque) dû à l'asymétrie
        const centerOfMass = state.position;
        const leftLeverArm = new THREE.Vector3().subVectors(leftAttach, centerOfMass);
        const rightLeverArm = new THREE.Vector3().subVectors(rightAttach, centerOfMass);
        
        const leftTorque = new THREE.Vector3().crossVectors(leftLeverArm, leftForceData.force);
        const rightTorque = new THREE.Vector3().crossVectors(rightLeverArm, rightForceData.force);
        const totalTorque = leftTorque.add(rightTorque);
        
        return {
            force: totalForce,
            torque: totalTorque,
            leftForce: leftForceData.force,
            rightForce: rightForceData.force,
            leftTension: leftForceData.tension,
            rightTension: rightForceData.tension,
            leftDistance: leftForceData.distance,
            rightDistance: rightForceData.distance,
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
        
        // ✅ CORRECTION PHYSIQUE CRITIQUE: Le fil ne peut que TIRER, jamais POUSSER
        // Un fil mou (slack) a une tension = 0 Newton (pas de minTension artificielle)
        // Ceci permet la chute libre quand le vent cesse
        if (currentDistance <= restLength) {
            // Régime SLACK : Ligne détendue ou à longueur de repos → Tension nulle
            // Le cerf-volant peut tomber librement sous l'effet de la gravité
            tension = 0;
        } else {
            // Régime TENDU : Ligne étirée - Modèle HYBRIDE Linéaire-Exponentiel
            const extension = currentDistance - restLength;
            
            // Vitesse radiale
            const radialVelocity = attachVelocity.dot(this.tempVector2);
            
            // Calcul de la force de rappel selon l'extension
            let springForce: number;
            
            if (extension < this.config.exponentialThreshold) {
                // Zone linéaire
                springForce = this.config.stiffness * extension;
            } else {
                // Zone exponentielle
                const thresholdForce = this.config.stiffness * this.config.exponentialThreshold;
                const excessExtension = extension - this.config.exponentialThreshold;
                const expTerm = Math.exp(this.config.exponentialRate * excessExtension) - 1;
                springForce = this.config.exponentialStiffness * expTerm + thresholdForce;
            }
            
            const dampingForce = this.config.damping * radialVelocity;
            
            tension = springForce + dampingForce;
            tension = Math.max(0, tension);
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
