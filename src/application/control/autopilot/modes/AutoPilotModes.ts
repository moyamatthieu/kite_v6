/**
 * Interface et implémentation des modes autopilote.
 * 
 * @module application/control/autopilot/modes
 */

import { KitePhysicsState } from '../../../../core/types/PhysicsState';
import { PIDController } from '../PIDController';
import * as THREE from 'three';

/**
 * Interface pour un mode d'autopilotage (Strategy pattern).
 */
export interface IAutoPilotMode {
    /**
     * Calcule la commande de contrôle.
     * 
     * @param state - État physique actuel
     * @param deltaTime - Pas de temps
     * @param lineLength - Longueur des lignes
     * @returns Delta de longueur des lignes (-0.5 à +0.5)
     */
    calculate(state: KitePhysicsState, deltaTime: number, lineLength: number): number;
    
    /**
     * Retourne les informations d'état pour affichage.
     */
    getInfo(state: KitePhysicsState): string;
    
    /**
     * Réinitialise le mode.
     */
    reset(): void;
    
    /**
     * Nom du mode.
     */
    readonly name: string;
}

/**
 * Mode ZENITH - Maintient le cerf-volant au point le plus haut (zénith).
 */
export class ZenithMode implements IAutoPilotMode {
    public readonly name = 'ZENITH';
    
    private pidX: PIDController;
    private pidY: PIDController;
    private stationY = 0.25; // Hauteur station
    
    constructor() {
        this.pidX = new PIDController({
            Kp: 0.5,
            Ki: 0.05,
            Kd: 0.8,
            integralLimit: 2.0,
            outputLimit: 0.5,
        });
        
        this.pidY = new PIDController({
            Kp: 0.3,
            Ki: 0.02,
            Kd: 0.5,
            integralLimit: 2.0,
            outputLimit: 0.5,
        });
    }
    
    calculate(state: KitePhysicsState, deltaTime: number, lineLength: number): number {
        // Position cible : au-dessus de la station à la longueur max des lignes
        const targetPosition = new THREE.Vector3(
            0.25, // Léger offset X pour stabilité
            this.stationY + lineLength,
            0
        );
        
        // Erreurs de position
        const errorX = targetPosition.x - state.position.x;
        const errorY = targetPosition.y - state.position.y;
        
        // Commandes PID
        const commandX = this.pidX.calculate(errorX, state.timestamp);
        const commandY = this.pidY.calculate(errorY, state.timestamp);
        
        // Combiner commandes (priorité à l'altitude)
        const command = commandX * 0.7 + commandY * 0.3;
        
        return Math.max(-0.5, Math.min(0.5, command));
    }
    
    getInfo(state: KitePhysicsState): string {
        const altitude = state.position.y;
        return `Mode ZENITH | Alt: ${altitude.toFixed(2)}m`;
    }
    
    reset(): void {
        this.pidX.reset();
        this.pidY.reset();
    }
}

/**
 * Mode STABILISATION - Maintient l'attitude du cerf-volant.
 */
export class StabilizationMode implements IAutoPilotMode {
    public readonly name = 'STABILIZATION';
    
    private pidRoll: PIDController;
    
    constructor() {
        this.pidRoll = new PIDController({
            Kp: 1.0,
            Ki: 0.1,
            Kd: 0.5,
            integralLimit: 1.0,
            outputLimit: 0.5,
        });
    }
    
    calculate(state: KitePhysicsState, deltaTime: number, lineLength: number): number {
        // Extraire angle de roulis (roll) du quaternion
        const euler = new THREE.Euler().setFromQuaternion(state.orientation);
        const rollError = -euler.z; // Viser roll = 0
        
        const command = this.pidRoll.calculate(rollError, state.timestamp);
        
        return Math.max(-0.5, Math.min(0.5, command));
    }
    
    getInfo(state: KitePhysicsState): string {
        const euler = new THREE.Euler().setFromQuaternion(state.orientation);
        const rollDeg = (euler.z * 180 / Math.PI).toFixed(1);
        return `Mode STABILISATION | Roll: ${rollDeg}°`;
    }
    
    reset(): void {
        this.pidRoll.reset();
    }
}

/**
 * Mode MANUEL - Pas d'autopilotage.
 */
export class ManualMode implements IAutoPilotMode {
    public readonly name = 'MANUAL';
    
    calculate(): number {
        return 0;
    }
    
    getInfo(): string {
        return 'Mode MANUEL';
    }
    
    reset(): void {
        // Rien à réinitialiser
    }
}
