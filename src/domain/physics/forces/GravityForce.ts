/**
 * Calculateur de force de gravité.
 * 
 * @module domain/physics/forces/GravityForce
 */

import * as THREE from 'three';
import { Vector3D, KitePhysicsState, WindState } from '../../../core/types/PhysicsState';
import { IForceCalculator, IGravityForceCalculator } from './ForceCalculator';

/**
 * Calculateur de force gravitationnelle.
 */
export class GravityForceCalculator implements IGravityForceCalculator {
    public readonly name = 'GravityForce';
    public readonly gravity: number;
    
    private mass: number;
    
    constructor(mass: number, gravity = 9.81) {
        this.mass = mass;
        this.gravity = gravity;
    }
    
    /**
     * Calcule la force de gravité.
     */
    calculate(state: KitePhysicsState, wind: WindState, deltaTime: number): Vector3D {
        // Force = masse × accélération gravitationnelle (vers le bas)
        return new THREE.Vector3(0, -this.mass * this.gravity, 0);
    }
    
    /**
     * Met à jour la masse (si le cerf-volant change).
     */
    setMass(mass: number): void {
        this.mass = mass;
    }
}
