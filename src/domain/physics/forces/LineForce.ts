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
    /** Raideur du ressort (N/m) */
    stiffness: number;
    
    /** Amortissement (Ns/m) */
    damping: number;
    
    /** Ratio longueur de repos (fraction de la longueur totale) */
    restLengthRatio: number;
    
    /** Coefficient de lissage temporel (0-1) */
    smoothingCoefficient: number;
    
    /** Tension minimale en régime 1 (N) */
    minTension: number;
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
    private smoothedLeftTension = 0;
    private smoothedRightTension = 0;
    
    constructor(
        kite: Kite,
        winchPositions: WinchPositions,
        config?: Partial<LineForceConfig>
    ) {
        this.kite = kite;
        this.winchPositions = winchPositions;
        this.config = {
            stiffness: config?.stiffness ?? 10,
            damping: config?.damping ?? 10,
            restLengthRatio: config?.restLengthRatio ?? 0.99,
            smoothingCoefficient: config?.smoothingCoefficient ?? 0.45,
            minTension: config?.minTension ?? 0.008,
        };
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
        const leftAttach = this.kite.getGlobalPointPosition('LEFT_CONTROL') ?? state.position.clone();
        const rightAttach = this.kite.getGlobalPointPosition('RIGHT_CONTROL') ?? state.position.clone();
        
        // Calculer forces individuelles
        const leftForceData = this.calculateSingleLineForce(
            this.winchPositions.left,
            leftAttach,
            leftLength,
            state.velocity,
            true
        );
        
        const rightForceData = this.calculateSingleLineForce(
            this.winchPositions.right,
            rightAttach,
            rightLength,
            state.velocity,
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
        kiteVelocity: Vector3D,
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
        const restLength = targetLength * this.config.restLengthRatio;
        
        let tension = 0;
        
        if (currentDistance < restLength) {
            // Régime 1 : Tension minimale
            tension = this.config.minTension;
        } else {
            // Régime 2 : Modèle ressort-amortisseur
            const extension = currentDistance - restLength;
            
            // Vitesse radiale (projection de la vitesse sur la direction de la ligne)
            const radialVelocity = kiteVelocity.dot(lineDirection);
            
            // Force = k × Δl + c × v
            const springForce = this.config.stiffness * extension;
            const dampingForce = this.config.damping * radialVelocity;
            
            tension = springForce + dampingForce;
            tension = Math.max(0, tension); // Pas de compression
        }
        
        // Lissage temporel pour éviter oscillations
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
        this.smoothedLeftTension = 0;
        this.smoothedRightTension = 0;
    }
    
    /**
     * Met à jour les positions des treuils.
     */
    setWinchPositions(positions: WinchPositions): void {
        this.winchPositions = positions;
    }
}
