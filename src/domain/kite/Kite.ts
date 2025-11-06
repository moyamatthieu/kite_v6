/**
 * Modèle métier du cerf-volant (logique domaine, pas de rendu).
 * 
 * @module domain/kite/Kite
 */

import { KiteGeometry, KiteGeometryParameters } from './KiteGeometry';
import { KitePhysicsState, KitePhysicsProperties } from '../../core/types/PhysicsState';

/**
 * Modèle métier du cerf-volant.
 * 
 * Représente le cerf-volant du point de vue domaine (pas de Three.js ici).
 * Contient la géométrie, les propriétés physiques et l'état.
 */
export class Kite {
    /** Géométrie du cerf-volant */
    public readonly geometry: KiteGeometry;
    
    /** Propriétés physiques (constantes) */
    public readonly properties: KitePhysicsProperties;
    
    /** État physique actuel */
    private state: KitePhysicsState;
    
    constructor(
        geometryParams: KiteGeometryParameters,
        properties: KitePhysicsProperties,
        initialState: KitePhysicsState
    ) {
        this.geometry = new KiteGeometry(geometryParams);
        this.properties = properties;
        this.state = initialState;
    }
    
    /**
     * Retourne l'état physique actuel.
     */
    getState(): Readonly<KitePhysicsState> {
        return this.state;
    }
    
    /**
     * Met à jour l'état physique.
     */
    setState(newState: KitePhysicsState): void {
        this.state = newState;
    }
    
    /**
     * Retourne le nombre de panneaux.
     */
    getPanelCount(): number {
        return this.geometry.getPanelCount();
    }
    
    /**
     * Retourne la surface totale.
     */
    getTotalArea(): number {
        return this.geometry.getTotalArea();
    }
    
    /**
     * Retourne la surface d'un panneau spécifique.
     */
    getPanelArea(panelIndex: number): number {
        return this.geometry.getPanelArea(panelIndex);
    }
    
    /**
     * Calcule la position globale d'un point de la géométrie.
     * 
     * ═══════════════════════════════════════════════════════════════════════════
     * TRANSFORMATION LOCALE → GLOBALE (CRITIQUE)
     * ═══════════════════════════════════════════════════════════════════════════
     * Ordre des transformations : 1) Rotation, 2) Translation
     * - applyQuaternion() : applique la rotation d'orientation du cerf-volant
     * - add() : translate vers la position globale du cerf-volant
     * 
     * ⚠️ Ne JAMAIS modifier cet ordre ! (standard Three.js)
     * ═══════════════════════════════════════════════════════════════════════════
     * 
     * @param pointName - Nom du point
     * @returns Position dans le repère global
     */
    getGlobalPointPosition(pointName: string): THREE.Vector3 | undefined {
        const localPoint = this.geometry.getPoint(pointName);
        if (!localPoint) return undefined;
        
        // Transformer du repère local au repère global
        return localPoint.clone()
            .applyQuaternion(this.state.orientation)  // 1) Rotation
            .add(this.state.position);                 // 2) Translation
    }
    
    /**
     * Calcule la position globale du centroïde d'un panneau.
     */
    getGlobalPanelCentroid(panelIndex: number): THREE.Vector3 {
        const localCentroid = this.geometry.getPanelCentroid(panelIndex);
        
        return localCentroid.clone()
            .applyQuaternion(this.state.orientation)  // 1) Rotation
            .add(this.state.position);                 // 2) Translation
    }
    
    /**
     * Calcule la normale globale d'un panneau (dans le repère monde).
     */
    getGlobalPanelNormal(panelIndex: number): THREE.Vector3 {
        const localNormal = this.geometry.getPanelNormal(panelIndex);
        
        // Les normales sont des vecteurs directionnels : pas de translation, juste rotation
        return localNormal.clone()
            .applyQuaternion(this.state.orientation)
            .normalize();  // Normaliser pour garantir vecteur unitaire
    }
    
    /**
     * Calcule le point le plus bas du cerf-volant dans le repère global.
     * Parcourt TOUS les points de la géométrie (structure + brides) pour trouver
     * le Y minimum, ce qui permet une détection de collision réaliste avec le sol.
     * 
     * @param state - État optionnel à utiliser (si non fourni, utilise l'état actuel)
     * @returns Objet avec le point le plus bas et son altitude Y
     */
    getLowestPoint(state?: KitePhysicsState): { point: THREE.Vector3; altitude: number } {
        const stateToUse = state || this.state;
        const allPoints = this.geometry.getAllPoints();
        let lowestAltitude = Infinity;
        let lowestPoint = new THREE.Vector3();
        
        for (const namedPoint of allPoints) {
            // Transformer chaque point local en global
            const globalPoint = new THREE.Vector3(
                namedPoint.position.x,
                namedPoint.position.y,
                namedPoint.position.z
            )
                .applyQuaternion(stateToUse.orientation)
                .add(stateToUse.position);
            
            // Garder le point avec Y le plus petit
            if (globalPoint.y < lowestAltitude) {
                lowestAltitude = globalPoint.y;
                lowestPoint.copy(globalPoint);
            }
        }
        
        return {
            point: lowestPoint,
            altitude: lowestAltitude
        };
    }
    
    /**
     * Calcule le centre de masse théorique du cerf-volant.
     * 
     * Avec la masse répartie proportionnellement sur chaque panneau :
     * CM = Σ(m_i × r_i) / M_total
     * où m_i = masse du panneau i, r_i = position du centroïde du panneau i
     * 
     * @returns Position du centre de masse en coordonnées globales
     */
    getCenterOfMass(): THREE.Vector3 {
        const totalMass = this.properties.mass;
        const totalArea = this.getTotalArea();
        const centerOfMass = new THREE.Vector3(0, 0, 0);
        
        const panelCount = this.getPanelCount();
        
        for (let i = 0; i < panelCount; i++) {
            // Masse du panneau (proportionnelle à sa surface)
            const panelArea = this.getPanelArea(i);
            const panelMass = (panelArea / totalArea) * totalMass;
            
            // Position du centroïde du panneau en coordonnées globales
            const panelCentroid = this.getGlobalPanelCentroid(i);
            
            // Contribution au centre de masse : m_i × r_i
            centerOfMass.addScaledVector(panelCentroid, panelMass);
        }
        
        // Diviser par la masse totale
        centerOfMass.divideScalar(totalMass);
        
        return centerOfMass;
    }
}

/**
 * Factory pour créer des cerf-volants prédéfinis.
 */
export class KiteFactory {
    /**
     * Crée un cerf-volant standard avec paramètres par défaut.
     */
    static createStandard(initialState: KitePhysicsState): Kite {
        const geometryParams: KiteGeometryParameters = {
            wingspan: 1.65,
            height: 0.65,
            depth: 0.15,
            structureDiameter: 0.01,
            bridles: {
                nose: 0.65,
                intermediate: 0.65,
                center: 0.65,
            }
        };
        
        const geometry = new KiteGeometry(geometryParams);
        const totalArea = geometry.getTotalArea();
        const panelAreas = Array.from(
            { length: geometry.getPanelCount() },
            (_, i) => geometry.getPanelArea(i)
        );
        
        const properties: KitePhysicsProperties = {
            mass: 0.3, // kg
            inertia: new THREE.Vector3(0.05, 0.05, 0.1), // kg·m²
            totalArea,
            panelAreas,
            dragCoefficient: 0.5,
            liftCoefficient: 1.2,
        };
        
        return new Kite(geometryParams, properties, initialState);
    }
    
    /**
     * Crée un cerf-volant personnalisé.
     */
    static createCustom(
        geometryParams: KiteGeometryParameters,
        mass: number,
        initialState: KitePhysicsState
    ): Kite {
        const geometry = new KiteGeometry(geometryParams);
        const totalArea = geometry.getTotalArea();
        const panelAreas = Array.from(
            { length: geometry.getPanelCount() },
            (_, i) => geometry.getPanelArea(i)
        );
        
        const properties: KitePhysicsProperties = {
            mass,
            inertia: new THREE.Vector3(0.05, 0.05, 0.1),
            totalArea,
            panelAreas,
            dragCoefficient: 0.5,
            liftCoefficient: 1.2,
        };
        
        return new Kite(geometryParams, properties, initialState);
    }
}

import * as THREE from 'three';
