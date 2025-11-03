/**
 * Calculateur de force aérodynamique.
 * 
 * @module domain/physics/forces/AerodynamicForce
 */

import * as THREE from 'three';
import { Vector3D, KitePhysicsState, WindState } from '../../../core/types/PhysicsState';
import { 
    IForceCalculator, 
    IAerodynamicForceCalculator, 
    AerodynamicForceResult 
} from './ForceCalculator';
import { Kite } from '../../kite/Kite';

/**
 * Configuration du calculateur aérodynamique.
 */
export interface AerodynamicForceConfig {
    /** Densité de l'air (kg/m³) */
    airDensity: number;
    
    /** Coefficient de portance de référence */
    referenceLiftCoefficient: number;
    
    /** Coefficient de traînée de référence */
    referenceDragCoefficient: number;
}

/**
 * Calculateur de forces aérodynamiques (portance + traînée).
 */
export class AerodynamicForceCalculator implements IAerodynamicForceCalculator {
    public readonly name = 'AerodynamicForce';
    
    private config: AerodynamicForceConfig;
    private kite: Kite;
    
    constructor(kite: Kite, config?: Partial<AerodynamicForceConfig>) {
        this.kite = kite;
        this.config = {
            airDensity: config?.airDensity ?? 1.225,
            referenceLiftCoefficient: config?.referenceLiftCoefficient ?? 1.2,
            referenceDragCoefficient: config?.referenceDragCoefficient ?? 0.5,
        };
    }
    
    /**
     * Calcule la force aérodynamique totale.
     */
    calculate(state: KitePhysicsState, wind: WindState, deltaTime: number): Vector3D {
        const result = this.calculateDetailed(state, wind, deltaTime);
        return result.total;
    }
    
    /**
     * Calcule les forces aérodynamiques avec détails par panneau.
     */
    calculateDetailed(state: KitePhysicsState, wind: WindState, deltaTime: number): AerodynamicForceResult {
        const totalLift = new THREE.Vector3(0, 0, 0);
        const totalDrag = new THREE.Vector3(0, 0, 0);
        
        // Calculer le vent apparent
        const apparentWind = wind.velocity.clone().sub(state.velocity);
        const windSpeed = apparentWind.length();
        
        if (windSpeed < 0.1) {
            // Pas de vent apparent significatif
            return {
                lift: totalLift,
                drag: totalDrag,
                total: new THREE.Vector3(0, 0, 0),
                angleOfAttack: 0,
                apparentWind,
                liftCoefficient: 0,
                dragCoefficient: 0,
            };
        }
        
        const windDirection = apparentWind.clone().normalize();
        
        // Sommer les forces sur tous les panneaux
        const panelCount = this.kite.getPanelCount();
        
        for (let i = 0; i < panelCount; i++) {
            const panelForce = this.calculatePanelForce(
                i,
                state,
                apparentWind,
                windDirection,
                windSpeed
            );
            
            totalLift.add(panelForce.lift);
            totalDrag.add(panelForce.drag);
        }
        
        const total = totalLift.clone().add(totalDrag);
        
        // Angle d'attaque moyen (simplifié: panneau central)
        const centralPanelIndex = Math.floor(panelCount / 2);
        const centralNormal = this.kite.getGlobalPanelNormal(centralPanelIndex);
        const angleOfAttack = Math.asin(Math.abs(centralNormal.dot(windDirection)));
        
        return {
            lift: totalLift,
            drag: totalDrag,
            total,
            angleOfAttack,
            apparentWind,
            liftCoefficient: this.getLiftCoefficient(angleOfAttack),
            dragCoefficient: this.getDragCoefficient(angleOfAttack),
        };
    }
    
    /**
     * Calcule la force sur un panneau spécifique.
     */
    private calculatePanelForce(
        panelIndex: number,
        state: KitePhysicsState,
        apparentWind: Vector3D,
        windDirection: Vector3D,
        windSpeed: number
    ): { lift: Vector3D; drag: Vector3D } {
        const panelNormal = this.kite.getGlobalPanelNormal(panelIndex);
        const panelArea = this.kite.getPanelArea(panelIndex);
        
        // Angle d'attaque du panneau
        const alpha = Math.asin(Math.abs(panelNormal.dot(windDirection)));
        
        // Coefficients
        const Cl = this.getLiftCoefficient(alpha);
        const Cd = this.getDragCoefficient(alpha);
        
        // Pression dynamique : q = 0.5 * ρ * v²
        const dynamicPressure = 0.5 * this.config.airDensity * windSpeed * windSpeed;
        
        // Forces
        const liftMagnitude = dynamicPressure * panelArea * Cl;
        const dragMagnitude = dynamicPressure * panelArea * Cd;
        
        // Direction portance: perpendiculaire au vent dans le plan (normale, vent)
        const liftDirection = new THREE.Vector3()
            .crossVectors(panelNormal, windDirection)
            .cross(windDirection)
            .normalize();
        
        const lift = liftDirection.multiplyScalar(liftMagnitude);
        const drag = windDirection.clone().multiplyScalar(-dragMagnitude); // Opposé au vent
        
        return { lift, drag };
    }
    
    /**
     * Coefficient de portance en fonction de l'angle d'attaque.
     * 
     * Modèle simplifié linéaire jusqu'au décrochage.
     */
    private getLiftCoefficient(alpha: number): number {
        const alphaDeg = (alpha * 180) / Math.PI;
        
        if (alphaDeg < 0) return 0;
        if (alphaDeg > 25) return 0.5; // Décrochage
        
        // Linéaire: Cl = Cl_ref * (alpha / 15°)
        return this.config.referenceLiftCoefficient * (alphaDeg / 15);
    }
    
    /**
     * Coefficient de traînée en fonction de l'angle d'attaque.
     */
    private getDragCoefficient(alpha: number): number {
        const alphaDeg = (alpha * 180) / Math.PI;
        
        // Cd = Cd_ref + k * alpha²
        const k = 0.02;
        return this.config.referenceDragCoefficient + k * alphaDeg * alphaDeg;
    }
}
