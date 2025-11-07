/**
 * Types pour représenter l'état physique de la simulation.
 * 
 * @module core/types/PhysicsState
 */

import * as THREE from 'three';

/**
 * Vecteur 3D (wrapper autour de THREE.Vector3 pour découplage partiel).
 */
export type Vector3D = THREE.Vector3;

/**
 * Quaternion pour représenter l'orientation (wrapper THREE.Quaternion).
 */
export type Quaternion = THREE.Quaternion;

/**
 * État physique complet du cerf-volant à un instant t.
 */
export interface KitePhysicsState {
    /** Position du centre de masse (m) */
    position: Vector3D;
    
    /** Vitesse linéaire (m/s) */
    velocity: Vector3D;
    
    /** Accélération linéaire (m/s²) */
    acceleration: Vector3D;
    
    /** Orientation (quaternion) */
    orientation: Quaternion;
    
    /** Vitesse angulaire (rad/s) */
    angularVelocity: Vector3D;
    
    /** Accélération angulaire (rad/s²) */
    angularAcceleration: Vector3D;
    
    /** Timestamp de l'état (s depuis début simulation) */
    timestamp: number;
}

/**
 * Forces appliquées sur le cerf-volant.
 */
export interface Forces {
    /** Force aérodynamique totale (N) */
    aerodynamic: Vector3D;
    
    /** Force de gravité (N) */
    gravity: Vector3D;
    
    /** Force des lignes (N) */
    lines: Vector3D;
    
    /** Force ligne gauche (N) */
    linesLeft?: Vector3D;
    
    /** Force ligne droite (N) */
    linesRight?: Vector3D;
    
    /** Force totale résultante (N) */
    total: Vector3D;
    
    /** Couple (moment) total (N·m) */
    torque: Vector3D;
}

/**
 * État détaillé des forces par panneau (pour debug/visualisation).
 */
export interface PanelForces {
    /** Index du panneau */
    panelIndex: number;
    
    /** Portance (N) */
    lift: Vector3D;
    
    /** Traînée (N) */
    drag: Vector3D;
    
    /** Force aérodynamique totale (N) */
    total: Vector3D;
    
    /** Angle d'attaque (rad) */
    angleOfAttack: number;
    
    /** Vent apparent au niveau du panneau (m/s) */
    apparentWind: Vector3D;
}

/**
 * État des lignes de contrôle.
 */
export interface LinesState {
    /** Longueur base des lignes (m) */
    baseLength: number;
    
    /** Delta de longueur actuel (m) */
    delta: number;
    
    /** Longueur ligne gauche (m) */
    leftLength: number;
    
    /** Longueur ligne droite (m) */
    rightLength: number;
    
    /** Tension ligne gauche (N) */
    leftTension: number;
    
    /** Tension ligne droite (N) */
    rightTension: number;
    
    /** Tension totale (N) */
    totalTension: number;
    
    /** 🆕 Distance réelle treuil gauche → point de contrôle gauche (m) */
    leftDistance: number;
    
    /** 🆕 Distance réelle treuil droit → point de contrôle droit (m) */
    rightDistance: number;
}

/**
 * État du vent.
 */
export interface WindState {
    /** Vitesse du vent (m/s) */
    velocity: Vector3D;
    
    /** Direction (vecteur unitaire) */
    direction: Vector3D;
    
    /** Magnitude (m/s) */
    speed: number;
    
    /** Turbulence (0-1) */
    turbulence: number;
}

/**
 * État complet de la simulation à un instant t.
 */
export interface SimulationState {
    /** État physique du cerf-volant */
    kite: KitePhysicsState;
    
    /** Forces appliquées */
    forces: Forces;
    
    /** Forces par panneau (optionnel, pour debug) */
    panelForces?: PanelForces[];
    
    /** État des lignes */
    lines: LinesState;
    
    /** État du vent */
    wind: WindState;
    
    /** Temps écoulé depuis début (s) */
    elapsedTime: number;
    
    /** Delta temps de la dernière frame (s) */
    deltaTime: number;
}

/**
 * Paramètres physiques du cerf-volant (constants).
 */
export interface KitePhysicsProperties {
    /** Masse totale (kg) */
    mass: number;
    
    /** Moment d'inertie (kg·m²) */
    inertia: Vector3D;
    
    /** Surface totale (m²) */
    totalArea: number;
    
    /** Surface par panneau (m²) */
    panelAreas: number[];
    
    /** Coefficient de traînée moyen */
    dragCoefficient: number;
    
    /** Coefficient de portance moyen */
    liftCoefficient: number;
}

/**
 * Crée un état physique initial par défaut.
 */
export function createInitialState(): KitePhysicsState {
    return {
        position: new THREE.Vector3(0, 5, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        acceleration: new THREE.Vector3(0, 0, 0),
        orientation: new THREE.Quaternion(),
        angularVelocity: new THREE.Vector3(0, 0, 0),
        angularAcceleration: new THREE.Vector3(0, 0, 0),
        timestamp: 0,
    };
}

/**
 * Clone un état physique (copie profonde).
 */
export function cloneState(state: KitePhysicsState): KitePhysicsState {
    return {
        position: state.position.clone(),
        velocity: state.velocity.clone(),
        acceleration: state.acceleration.clone(),
        orientation: state.orientation.clone(),
        angularVelocity: state.angularVelocity.clone(),
        angularAcceleration: state.angularAcceleration.clone(),
        timestamp: state.timestamp,
    };
}
