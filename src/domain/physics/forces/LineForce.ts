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
 */
export class LineForceCalculator implements ILineForceCalculator {
    public readonly name = 'LineForce';
    
    private config: LineForceConfig;
    private kite: Kite;
    private winchPositions: WinchPositions;
    
    // Tensions lissées pour éviter oscillations
    // ✅ CORRECTION: Initialisation avec minTension pour éviter choc initial
    private smoothedLeftTension: number;
    private smoothedRightTension: number;
    
    constructor(
        kite: Kite,
        winchPositions: WinchPositions,
        config?: Partial<LineForceConfig>
    ) {
        this.kite = kite;
        this.winchPositions = winchPositions;
        this.config = {
            stiffness: config?.stiffness ?? 20,  // Augmenté de 10 → 20 pour zone linéaire
            damping: config?.damping ?? 10,
            smoothingCoefficient: config?.smoothingCoefficient ?? 0.2,
            minTension: config?.minTension ?? 1.5,
            // 🔧 NOUVEAUX paramètres pour protection exponentielle
            exponentialThreshold: config?.exponentialThreshold ?? 1.0,  // Activation à 1m d'extension
            exponentialStiffness: config?.exponentialStiffness ?? 50,   // Force exponentielle
            exponentialRate: config?.exponentialRate ?? 1.5,            // Croissance rapide
        };
        
        // ✅ CORRECTION: Initialiser les tensions lissées avec minTension
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
     */
    private calculateSingleLineForce(
        winchPos: Vector3D,
        attachPos: Vector3D,
        targetLength: number,
        state: KitePhysicsState,
        isLeft: boolean
    ): { force: Vector3D; tension: number; distance: number } {
        // Vecteur ligne et distance
        const lineVector = new THREE.Vector3().subVectors(attachPos, winchPos);
        const currentDistance = lineVector.length();
        
        if (currentDistance < 0.01) {
            return {
                force: new THREE.Vector3(0, 0, 0),
                tension: 0,
                distance: currentDistance,
            };
        }
        
        const lineDirection = lineVector.clone().normalize();
        const restLength = targetLength; // Longueur de repos = longueur cible (basée sur la géométrie réelle)
        const attachmentOffset = new THREE.Vector3().subVectors(attachPos, state.position);
        const rotationalVelocity = new THREE.Vector3()
            .copy(state.angularVelocity)
            .cross(attachmentOffset);
        const attachVelocity = state.velocity.clone().add(rotationalVelocity);
        
        let tension = 0;
        
        if (currentDistance < restLength) {
            // Régime 1 : Tension minimale (ligne détendue)
            tension = this.config.minTension;
        } else {
            // Régime 2 : Ligne tendue - Modèle HYBRIDE Linéaire-Exponentiel
            const extension = currentDistance - restLength;
            
            // Vitesse radiale (projection de la vitesse sur la direction de la ligne)
            const radialVelocity = attachVelocity.dot(lineDirection);
            
            // Calcul de la force de rappel selon l'extension
            let springForce: number;
            
            if (extension < this.config.exponentialThreshold) {
                // 🔵 ZONE LINÉAIRE (proche du repos) : F = k × Δl
                springForce = this.config.stiffness * extension;
            } else {
                // 🔴 ZONE EXPONENTIELLE (loin du repos) : F = k_exp × (e^(α×(Δl-seuil)) - 1) + F_seuil
                const thresholdForce = this.config.stiffness * this.config.exponentialThreshold;
                const excessExtension = extension - this.config.exponentialThreshold;
                const expTerm = Math.exp(this.config.exponentialRate * excessExtension) - 1;
                springForce = this.config.exponentialStiffness * expTerm + thresholdForce;
            }
            
            // Amortissement (inchangé)
            const dampingForce = this.config.damping * radialVelocity;
            
            tension = springForce + dampingForce;
            tension = Math.max(0, tension); // Pas de compression
        }
        
        // Lissage temporel pour éviter oscillations
        // ✅ CORRECTION: Lissage exponentiel sans test de première valeur
        const alpha = this.config.smoothingCoefficient;
        if (isLeft) {
            this.smoothedLeftTension = alpha * tension + (1 - alpha) * this.smoothedLeftTension;
            tension = this.smoothedLeftTension;
        } else {
            this.smoothedRightTension = alpha * tension + (1 - alpha) * this.smoothedRightTension;
            tension = this.smoothedRightTension;
        }
        
        // Force = tension × direction (vers le treuil)
        const force = lineDirection.clone().multiplyScalar(-tension);
        
        return { force, tension, distance: currentDistance };
    }
    
    /**
     * Réinitialise les tensions lissées (appelé lors d'un reset).
     */
    reset(): void {
        // ✅ CORRECTION: Réinitialiser avec minTension au lieu de 0
        this.smoothedLeftTension = this.config.minTension;
        this.smoothedRightTension = this.config.minTension;
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
