/**
 * Interfaces pour les intégrateurs numériques.
 * 
 * @module domain/physics/integrators/Integrator
 */

import { KitePhysicsState, Vector3D } from '../../../core/types/PhysicsState';

/**
 * Interface pour les intégrateurs numériques.
 * 
 * Un intégrateur calcule le nouvel état physique à partir de l'état actuel et des forces.
 */
export interface IIntegrator {
    /**
     * Intègre l'état physique pour calculer la position/vitesse à t+dt.
     * 
     * @param state - État physique actuel
     * @param force - Force totale appliquée (N)
     * @param torque - Couple total appliqué (N·m)
     * @param deltaTime - Pas de temps (s)
     * @param mass - Masse du cerf-volant (kg)
     * @returns Nouvel état intégré
     */
    integrate(
        state: KitePhysicsState,
        force: Vector3D,
        torque: Vector3D,
        deltaTime: number,
        mass: number
    ): KitePhysicsState;
    
    /**
     * Nom de l'intégrateur (pour debug).
     */
    readonly name: string;
}

/**
 * Paramètres pour l'intégrateur de Verlet.
 */
export interface VerletIntegratorConfig {
    /** Facteur d'amortissement (0-1, default 0.99) */
    dampingFactor?: number;
    
    /** Vitesse maximale (m/s, default 30) */
    maxVelocity?: number;
    
    /** Vitesse angulaire maximale (rad/s, default 8) */
    maxAngularVelocity?: number;
}

/**
 * Paramètres pour l'intégrateur Runge-Kutta 4.
 */
export interface RK4IntegratorConfig {
    /** Nombre de sous-pas (default 4) */
    substeps?: number;
}
