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
    private kiteGeometry: { wingspan: number; height: number } | null = null;
    
    constructor(config?: VerletIntegratorConfig) {
        this.config = {
            dampingFactor: config?.dampingFactor ?? 0.99,
            maxVelocity: config?.maxVelocity ?? 30,
            maxAngularVelocity: config?.maxAngularVelocity ?? 8,
        };
    }
    
    /**
     * Configure la géométrie du cerf-volant pour calcul d'inertie dynamique.
     */
    setKiteGeometry(wingspan: number, height: number): void {
        this.kiteGeometry = { wingspan, height };
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
        // 🔧 CORRECTION MAJEURE : Amortissement doit être MINIMAL
        // La résistance de l'air vient de la TRAÎNÉE (force aéro), pas d'un amortissement global
        // dampingFactor ≈ 1.0 = pas de friction artificielle
        const dampingForThisStep = Math.pow(this.config.dampingFactor, deltaTime);
        newState.velocity = state.velocity.clone()
            .add(acceleration.clone().multiplyScalar(deltaTime))
            .multiplyScalar(dampingForThisStep);
        
        // Limiter la vitesse (sécurité numérique uniquement)
        const speed = newState.velocity.length();
        if (speed > this.config.maxVelocity) {
            newState.velocity.normalize().multiplyScalar(this.config.maxVelocity);
        }
        
        // 3. Intégration position : p_new = p + v × dt
        newState.position = state.position.clone()
            .add(newState.velocity.clone().multiplyScalar(deltaTime));
        
        // 4. Rotation (similaire mais pour quaternions)
        // Accélération angulaire : α = τ / I
        // Inertie pour kite rectangulaire : I = (1/12) × m × (L² + h²)
        // ✅ OPTIMISATION: Calcul dynamique basé sur géométrie réelle
        const wingspan = this.kiteGeometry?.wingspan ?? 1.65;
        const height = this.kiteGeometry?.height ?? 0.65;
        const inertia = (1/12) * mass * (wingspan * wingspan + height * height);
        const angularAcceleration = torque.clone().divideScalar(inertia);
        
        // Intégration vitesse angulaire
        // 🔧 Même amortissement minimal que pour vitesse linéaire
        newState.angularVelocity = state.angularVelocity.clone()
            .add(angularAcceleration.clone().multiplyScalar(deltaTime))
            .multiplyScalar(dampingForThisStep);
        
        // Limiter la vitesse angulaire (sécurité numérique)
        const angularSpeed = newState.angularVelocity.length();
        if (angularSpeed > this.config.maxAngularVelocity) {
            newState.angularVelocity.normalize().multiplyScalar(this.config.maxAngularVelocity);
        }
        
        // Intégration orientation (quaternion)
        // ═══════════════════════════════════════════════════════════════════════════
        // ROTATION DU CERF-VOLANT (intégration de la vitesse angulaire)
        // ═══════════════════════════════════════════════════════════════════════════
        // La vitesse angulaire ω (rad/s) définit l'axe et la vitesse de rotation
        // Conversion en quaternion de rotation : Q = [cos(θ/2), sin(θ/2)×axis]
        // avec θ = ||ω|| × dt (angle de rotation sur ce pas de temps)
        // 
        // Composition : orientation_new = orientation_old × delta_rotation
        // ⚠️ CRITIQUE : Toujours normaliser après multiplication de quaternions !
        // ═══════════════════════════════════════════════════════════════════════════
        const angle = angularSpeed * deltaTime;
        if (angle > 0.001) {
            const axis = newState.angularVelocity.clone().normalize();
            const deltaRotation = new THREE.Quaternion().setFromAxisAngle(axis, angle);
            newState.orientation = state.orientation.clone().multiply(deltaRotation);
            // ✅ NORMALISATION OBLIGATOIRE : évite dérive numérique (quaternions non unitaires)
            newState.orientation.normalize();
        } else {
            newState.orientation = state.orientation.clone().normalize();
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
