/**
 * Calculateur de force de gravité.
 * 
 * ✅ MASSE RÉPARTIE : La masse est distribuée sur les 4 panneaux proportionnellement à leur surface.
 * Chaque panneau génère une force de gravité à son centroïde, créant des couples naturels.
 * 
 * @module domain/physics/forces/GravityForce
 */

import * as THREE from 'three';
import { Vector3D, KitePhysicsState, WindState } from '../../../core/types/PhysicsState';
import { IForceCalculator, IGravityForceCalculator } from './ForceCalculator';
import { Kite } from '../../kite/Kite';

/**
 * Calculateur de force gravitationnelle avec masse répartie sur les panneaux.
 */
export class GravityForceCalculator implements IGravityForceCalculator {
    public readonly name = 'GravityForce';
    public readonly gravity: number;
    
    private mass: number;
    private kite: Kite;
    private totalArea: number;
    private panelMasses: number[] = [];
    
    constructor(mass: number, kite: Kite, gravity = 9.81) {
        this.mass = mass;
        this.kite = kite;
        this.gravity = gravity;
        
        // Pré-calculer l'aire totale et les masses par panneau (optimisation)
        this.calculatePanelMasses();
    }
    
    /**
     * Calcule et met en cache les masses de chaque panneau.
     * Proportionnelles à leur surface : masse_panneau = (aire_panneau / aire_totale) × masse_totale
     */
    private calculatePanelMasses(): void {
        // Calculer l'aire totale
        this.totalArea = 0;
        const panelCount = this.kite.geometry.getPanelCount();
        
        for (let i = 0; i < panelCount; i++) {
            this.totalArea += this.kite.geometry.getPanelArea(i);
        }
        
        // Calculer la masse de chaque panneau
        this.panelMasses = [];
        for (let i = 0; i < panelCount; i++) {
            const panelArea = this.kite.geometry.getPanelArea(i);
            const panelMass = (panelArea / this.totalArea) * this.mass;
            this.panelMasses.push(panelMass);
        }
    }
    
    /**
     * Calcule la force de gravité répartie sur les panneaux.
     * Retourne la somme des forces (appliquée au centre de masse).
     */
    calculate(state: KitePhysicsState, wind: WindState, deltaTime: number): Vector3D {
        // Force totale de gravité (somme = masse_totale × g, vers le bas)
        // Note : La répartition sur les panneaux génère des couples qui sont gérés
        // par calculateTorque() dans le ForceManager
        return new THREE.Vector3(0, -this.mass * this.gravity, 0);
    }
    
    /**
     * Calcule le couple gravitationnel dû à la répartition de masse sur les panneaux.
     * 
     * Pour chaque panneau :
     * - Force = masse_panneau × g (vers le bas)
     * - Position = centroïde du panneau en coordonnées monde
     * - Couple = r × F, où r = position_centroïde - centre_masse
     * 
     * @returns Couple gravitationnel total
     */
    calculateTorque(state: KitePhysicsState): Vector3D {
        const totalTorque = new THREE.Vector3(0, 0, 0);
        const panelCount = this.kite.geometry.getPanelCount();
        
        for (let i = 0; i < panelCount; i++) {
            // Masse du panneau
            const panelMass = this.panelMasses[i];
            
            // Force de gravité sur ce panneau
            const gravityForce = new THREE.Vector3(0, -panelMass * this.gravity, 0);
            
            // Position du centroïde du panneau en coordonnées monde
            const panelCentroid = this.kite.getGlobalPanelCentroid(i);
            
            // Vecteur du centre de masse vers le centroïde du panneau
            const r = new THREE.Vector3().subVectors(panelCentroid, state.position);
            
            // Couple = r × F
            const torque = new THREE.Vector3().crossVectors(r, gravityForce);
            totalTorque.add(torque);
        }
        
        return totalTorque;
    }
    
    /**
     * Met à jour la masse (si le cerf-volant change).
     */
    setMass(mass: number): void {
        this.mass = mass;
        this.calculatePanelMasses(); // Recalculer les masses de panneaux
    }
}
