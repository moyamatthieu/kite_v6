/**
 * Interfaces pour les calculateurs de forces physiques.
 * 
 * @module domain/physics/forces/ForceCalculator
 */

import * as THREE from 'three';
import { Vector3D, KitePhysicsState, WindState } from '../../../core/types/PhysicsState';

/**
 * Interface commune pour tous les calculateurs de forces.
 * 
 * Pattern Strategy : permet d'ajouter de nouvelles forces sans modifier le code existant.
 */
export interface IForceCalculator {
    /**
     * Calcule la force à appliquer sur le cerf-volant.
     * 
     * @param state - État physique actuel du cerf-volant
     * @param wind - État du vent
     * @param deltaTime - Pas de temps (s)
     * @returns Force résultante (N)
     */
    calculate(state: KitePhysicsState, wind: WindState, deltaTime: number): Vector3D;
    
    /**
     * Nom du calculateur (pour debug/logging).
     */
    readonly name: string;
}

/**
 * Résultat détaillé d'un calcul aérodynamique (pour debug).
 */
export interface AerodynamicForceResult {
    /** Force de portance (N) */
    lift: Vector3D;
    
    /** Force de traînée (N) */
    drag: Vector3D;
    
    /** Force totale (N) */
    total: Vector3D;
    
    /** Angle d'attaque (rad) */
    angleOfAttack: number;
    
    /** Vent apparent (m/s) */
    apparentWind: Vector3D;
    
    /** Coefficient de portance effectif */
    liftCoefficient: number;
    
    /** Coefficient de traînée effectif */
    dragCoefficient: number;
}

/**
 * Interface étendue pour calculateur aérodynamique.
 */
export interface IAerodynamicForceCalculator extends IForceCalculator {
    /**
     * Calcule les forces aérodynamiques avec détails.
     * 
     * @param state - État physique actuel
     * @param wind - État du vent
     * @param deltaTime - Pas de temps (s)
     * @returns Résultat détaillé
     */
    calculateDetailed(state: KitePhysicsState, wind: WindState, deltaTime: number): AerodynamicForceResult;
}

/**
 * Résultat du calcul des forces de lignes.
 */
export interface LineForceResult {
    /** Force totale des lignes (N) */
    force: Vector3D;
    
    /** Couple généré par l'asymétrie (N·m) */
    torque: Vector3D;
    
    /** Tension ligne gauche (N) */
    leftTension: number;
    
    /** Tension ligne droite (N) */
    rightTension: number;
    
    /** Distance ligne gauche (m) */
    leftDistance: number;
    
    /** Distance ligne droite (m) */
    rightDistance: number;
}

/**
 * Interface pour calculateur de forces des lignes.
 */
export interface ILineForceCalculator extends IForceCalculator {
    /**
     * Calcule les forces des lignes avec détails.
     * 
     * @param state - État physique actuel
     * @param delta - Delta de longueur des lignes (m)
     * @param baseLength - Longueur de base (m)
     * @returns Résultat détaillé
     */
    calculateWithDelta(state: KitePhysicsState, delta: number, baseLength: number): LineForceResult;
    
    /**
     * Réinitialise les tensions lissées (appelé lors d'un reset).
     */
    reset(): void;
}

/**
 * Interface pour calculateur de gravité.
 */
export interface IGravityForceCalculator extends IForceCalculator {
    /**
     * Accélération gravitationnelle (m/s²).
     */
    readonly gravity: number;
}

/**
 * Gestionnaire de forces combinées.
 * 
 * Utilise plusieurs IForceCalculator pour calculer la force totale.
 */
export class ForceManager {
    private calculators: IForceCalculator[] = [];
    
    /**
     * Ajoute un calculateur de force.
     */
    addCalculator(calculator: IForceCalculator): void {
        this.calculators.push(calculator);
    }
    
    /**
     * Retire un calculateur de force.
     */
    removeCalculator(calculator: IForceCalculator): void {
        const index = this.calculators.indexOf(calculator);
        if (index > -1) {
            this.calculators.splice(index, 1);
        }
    }
    
    /**
     * Calcule la force totale en combinant tous les calculateurs.
     */
    calculateTotalForce(state: KitePhysicsState, wind: WindState, deltaTime: number): Vector3D {
        const totalForce = new THREE.Vector3(0, 0, 0);
        
        for (const calculator of this.calculators) {
            const force = calculator.calculate(state, wind, deltaTime);
            totalForce.add(force);
        }
        
        return totalForce;
    }
    
    /**
     * Retourne tous les calculateurs enregistrés.
     */
    getCalculators(): readonly IForceCalculator[] {
        return this.calculators;
    }
    
    /**
     * Nettoie tous les calculateurs.
     */
    clear(): void {
        this.calculators = [];
    }
}
