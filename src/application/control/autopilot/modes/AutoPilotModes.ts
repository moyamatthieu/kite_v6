/**
 * Interface et implémentation des modes autopilote.
 * 
 * @module application/control/autopilot/modes
 */

import { KitePhysicsState } from '../../../../core/types/PhysicsState';
import { PIDController } from '../PIDController';
import { Logger } from '../../../logging/Logger';
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
        const clampedCommand = Math.max(-0.5, Math.min(0.5, command));

        return clampedCommand;
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

/**
 * Mode ALTITUDE HOLD - Maintient une altitude constante.
 */
export class AltitudeHoldMode implements IAutoPilotMode {
    public readonly name = 'ALTITUDE_HOLD';
    
    private pidAltitude: PIDController;
    private targetAltitude = 10; // m
    
    constructor() {
        this.pidAltitude = new PIDController({
            Kp: 0.4,
            Ki: 0.03,
            Kd: 0.6,
            integralLimit: 2.0,
            outputLimit: 0.5,
        });
    }
    
    calculate(state: KitePhysicsState, deltaTime: number, lineLength: number): number {
        const errorAltitude = this.targetAltitude - state.position.y;
        const command = this.pidAltitude.calculate(errorAltitude, state.timestamp);
        
        return Math.max(-0.5, Math.min(0.5, command));
    }
    
    getInfo(state: KitePhysicsState): string {
        const altitude = state.position.y;
        return `Mode ALTITUDE | Alt: ${altitude.toFixed(2)}m → ${this.targetAltitude}m`;
    }
    
    reset(): void {
        this.pidAltitude.reset();
    }
}

/**
 * Mode POSITION HOLD - Maintient une position XYZ fixe.
 */
export class PositionHoldMode implements IAutoPilotMode {
    public readonly name = 'POSITION_HOLD';
    
    private pidX: PIDController;
    private pidY: PIDController;
    private targetPosition = new THREE.Vector3(8, 8, 0);
    
    constructor() {
        this.pidX = new PIDController({
            Kp: 0.5,
            Ki: 0.04,
            Kd: 0.7,
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
        const errorX = this.targetPosition.x - state.position.x;
        const errorY = this.targetPosition.y - state.position.y;
        
        const commandX = this.pidX.calculate(errorX, state.timestamp);
        const commandY = this.pidY.calculate(errorY, state.timestamp);
        
        const command = commandX * 0.6 + commandY * 0.4;
        
        return Math.max(-0.5, Math.min(0.5, command));
    }
    
    getInfo(state: KitePhysicsState): string {
        const dist = state.position.distanceTo(this.targetPosition);
        return `Mode POSITION | Dist: ${dist.toFixed(2)}m`;
    }
    
    reset(): void {
        this.pidX.reset();
        this.pidY.reset();
    }
}

/**
 * Mode CIRCULAR - Vol en trajectoire circulaire.
 */
export class CircularTrajectoryMode implements IAutoPilotMode {
    public readonly name = 'CIRCULAR';
    
    private pidRadius: PIDController;
    private radius = 5; // m
    private angularVelocity = 0.3; // rad/s
    private currentAngle = 0;
    
    constructor() {
        this.pidRadius = new PIDController({
            Kp: 0.6,
            Ki: 0.05,
            Kd: 0.8,
            integralLimit: 2.0,
            outputLimit: 0.5,
        });
    }
    
    calculate(state: KitePhysicsState, deltaTime: number, lineLength: number): number {
        // Mettre à jour l'angle
        this.currentAngle += this.angularVelocity * deltaTime;
        
        // Position cible sur le cercle
        const targetX = Math.cos(this.currentAngle) * this.radius;
        const targetZ = Math.sin(this.currentAngle) * this.radius;
        
        // Calculer l'erreur radiale
        const currentRadius = Math.sqrt(state.position.x * state.position.x + state.position.z * state.position.z);
        const errorRadius = this.radius - currentRadius;
        
        const command = this.pidRadius.calculate(errorRadius, state.timestamp);
        
        return Math.max(-0.5, Math.min(0.5, command));
    }
    
    getInfo(state: KitePhysicsState): string {
        const currentRadius = Math.sqrt(state.position.x * state.position.x + state.position.z * state.position.z);
        return `Mode CIRCULAIRE | R: ${currentRadius.toFixed(2)}m → ${this.radius}m`;
    }
    
    reset(): void {
        this.pidRadius.reset();
        this.currentAngle = 0;
    }
}
