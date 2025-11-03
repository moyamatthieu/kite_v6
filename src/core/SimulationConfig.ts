/**
 * Configuration centralisée étendue de la simulation.
 * 
 * @module core/SimulationConfig
 */

import { KiteGeometryParameters } from '../domain/kite/KiteGeometry';
import { VerletIntegratorConfig } from '../domain/physics/integrators/Integrator';

/**
 * Configuration complète de la simulation.
 */
export interface SimulationConfig {
    /** Configuration physique */
    physics: PhysicsConfig;
    
    /** Configuration du cerf-volant */
    kite: KiteConfig;
    
    /** Configuration du vent */
    wind: WindConfig;
    
    /** Configuration des lignes */
    lines: LinesConfig;
    
    /** Configuration du contrôle */
    control: ControlConfig;
    
    /** Configuration du rendu */
    rendering: RenderingConfig;
    
    /** Configuration de l'interface */
    ui: UIConfig;
    
    /** Configuration des logs */
    logging: LoggingConfig;
}

export interface PhysicsConfig {
    gravity: number; // m/s²
    airDensity: number; // kg/m³
    dampingFactor: number; // 0-1
    maxVelocity: number; // m/s
    maxAngularVelocity: number; // rad/s
    fixedTimeStep?: number; // s
}

export interface KiteConfig {
    mass: number; // kg
    geometry: KiteGeometryParameters;
    liftCoefficient: number;
    dragCoefficient: number;
}

export interface WindConfig {
    speed: number; // m/s
    direction: { x: number; y: number; z: number };
    turbulence: number; // 0-1
}

export interface LinesConfig {
    baseLength: number; // m
    stiffness: number; // N/m
    damping: number; // Ns/m
    restLengthRatio: number; // 0-1
    smoothingCoefficient: number; // 0-1
    minTension: number; // N
}

export interface ControlConfig {
    deltaMax: number; // m
    velocityDelta: number; // m/s
    velocityReturn: number; // m/s
}

export interface RenderingConfig {
    fov: number; // degrés
    near: number; // m
    far: number; // m
    showGrid: boolean;
    showDebug: boolean;
    clearColor: number;
}

export interface UIConfig {
    logInterval: number; // s
    maxLogEntries: number;
    showDebugPanel: boolean;
    showControlPanel: boolean;
}

export interface LoggingConfig {
    enabled: boolean;
    bufferSize: number;
    consoleOutput: boolean;
}

/**
 * Configuration par défaut.
 */
export const DEFAULT_CONFIG: SimulationConfig = {
    physics: {
        gravity: 9.81,
        airDensity: 1.225,
        dampingFactor: 0.99,
        maxVelocity: 30,
        maxAngularVelocity: 8,
    },
    kite: {
        mass: 0.3,
        geometry: {
            wingspan: 1.65,
            height: 0.65,
            depth: 0.15,
            structureDiameter: 0.01,
            bridles: {
                nose: 0.65,
                intermediate: 0.65,
                center: 0.65,
            }
        },
        liftCoefficient: 1.2,
        dragCoefficient: 0.5,
    },
    wind: {
        speed: 5.56, // 20 km/h
        direction: { x: 1, y: 0, z: 0 },
        turbulence: 0,
    },
    lines: {
        baseLength: 10,
        stiffness: 10,
        damping: 10,
        restLengthRatio: 0.99,
        smoothingCoefficient: 0.45,
        minTension: 0.008,
    },
    control: {
        deltaMax: 0.5,
        velocityDelta: 0.25,
        velocityReturn: 0.4,
    },
    rendering: {
        fov: 60,
        near: 0.1,
        far: 1000,
        showGrid: true,
        showDebug: true,
        clearColor: 0x87ceeb,
    },
    ui: {
        logInterval: 0.25,
        maxLogEntries: 32,
        showDebugPanel: true,
        showControlPanel: true,
    },
    logging: {
        enabled: true,
        bufferSize: 32,
        consoleOutput: true,
    }
};
