/**
 * Intégrateur de Verlet pour la physique.
 * 
 * @module domain/physics/integrators/VerletIntegrator
 */

import * as THREE from 'three';
import { KitePhysicsState, Vector3D } from '../../../core/types/PhysicsState';
import { IIntegrator, VerletIntegratorConfig } from './Integrator';

/**
 * Intégrateur de Verlet avec amortissement et limites de sécurité.
 */
export class VerletIntegrator implements IIntegrator {
    public readonly name = 'VerletIntegrator';
    
    private config: Required<VerletIntegratorConfig>;
    
    constructor(config?: VerletIntegratorConfig) {
        this.config = {
            dampingFactor: config?.dampingFactor ?? 0.99,
            maxVelocity: config?.maxVelocity ?? 30,
            maxAngularVelocity: config?.maxAngularVelocity ?? 8,
        };
    }
    
    /**
     * Intègre l'état physique pour calculer la position/vitesse à t+dt.
     */
    integrate(
        state: KitePhysicsState,
        force: Vector3D,
        torque: Vector3D,
        deltaTime: number,
        mass: number
    ): KitePhysicsState {
        const newState = { ...state };
        
        // 1. Calculer accélération linéaire : a = F / m
        const acceleration = force.clone().divideScalar(mass);
        
        // 2. Intégration vitesse : v_new = v + a × dt
        newState.velocity = state.velocity.clone()
            .add(acceleration.clone().multiplyScalar(deltaTime))
            .multiplyScalar(this.config.dampingFactor); // Amortissement numérique
        
        // Limiter la vitesse
        const speed = newState.velocity.length();
        if (speed > this.config.maxVelocity) {
            newState.velocity.normalize().multiplyScalar(this.config.maxVelocity);
        }
        
        // 3. Intégration position : p_new = p + v × dt
        newState.position = state.position.clone()
            .add(newState.velocity.clone().multiplyScalar(deltaTime));
        
        // 4. Rotation (similaire mais pour quaternions)
        // Accélération angulaire (simplifié, inertie constante)
        const inertia = 0.1; // kg·m² (simplifié)
        const angularAcceleration = torque.clone().divideScalar(inertia);
        
        // Intégration vitesse angulaire
        newState.angularVelocity = state.angularVelocity.clone()
            .add(angularAcceleration.clone().multiplyScalar(deltaTime))
            .multiplyScalar(this.config.dampingFactor);
        
        // Limiter la vitesse angulaire
        const angularSpeed = newState.angularVelocity.length();
        if (angularSpeed > this.config.maxAngularVelocity) {
            newState.angularVelocity.normalize().multiplyScalar(this.config.maxAngularVelocity);
        }
        
        // Intégration orientation (quaternion)
        // ω = vitesse angulaire, θ = ω × dt
        const angle = angularSpeed * deltaTime;
        if (angle > 0.001) {
            const axis = newState.angularVelocity.clone().normalize();
            const deltaRotation = new THREE.Quaternion().setFromAxisAngle(axis, angle);
            newState.orientation = state.orientation.clone().multiply(deltaRotation).normalize();
        } else {
            newState.orientation = state.orientation.clone();
        }
        
        // 5. Stocker accélérations pour debug
        newState.acceleration = acceleration;
        newState.angularAcceleration = angularAcceleration;
        
        // 6. Mettre à jour timestamp
        newState.timestamp = state.timestamp + deltaTime;
        
        return newState;
    }
    
    /**
     * Met à jour la configuration.
     */
    setConfig(config: Partial<VerletIntegratorConfig>): void {
        this.config = { ...this.config, ...config };
    }
}
