/**
 * Géométrie pure du cerf-volant (calculs mathématiques sans Three.js).
 * 
 * @module domain/kite/KiteGeometry
 */

import * as THREE from 'three';
import { Vector3D } from '../../core/types/PhysicsState';

/**
 * Paramètres des brides du cerf-volant.
 */
export interface BridleParameters {
    /** Longueur bride du nez au point de contrôle (m) */
    nose: number;
    
    /** Longueur bride intermédiaire au point de contrôle (m) */
    intermediate: number;
    
    /** Longueur bride du centre au point de contrôle (m) */
    center: number;
}

/**
 * Paramètres géométriques du cerf-volant.
 */
export interface KiteGeometryParameters {
    /** Envergure totale (m) */
    wingspan: number;
    
    /** Hauteur totale (m) */
    height: number;
    
    /** Profondeur (déport Z des points de contrôle) (m) */
    depth: number;
    
    /** Diamètre des barres de structure (m) */
    structureDiameter: number;
    
    /** Paramètres des brides */
    bridles: BridleParameters;
}

/**
 * Point nommé dans la géométrie du cerf-volant.
 */
export interface NamedPoint {
    name: string;
    position: Vector3D;
}

/**
 * Définition d'un panneau (liste de noms de points).
 */
export type PanelDefinition = string[];

/**
 * Connexion entre deux points (barre de structure).
 */
export type ConnectionDefinition = [string, string];

/**
 * Géométrie complète du cerf-volant (pure math, pas de rendu).
 */
export class KiteGeometry {
    private points = new Map<string, Vector3D>();
    private connections: ConnectionDefinition[] = [];
    private panels: PanelDefinition[] = [];
    
    public readonly parameters: KiteGeometryParameters;
    
    constructor(parameters: KiteGeometryParameters) {
        this.parameters = parameters;
        this.calculateGeometry();
    }
    
    /**
     * Calcule tous les points de la géométrie.
     */
    private calculateGeometry(): void {
        this.defineStructuralPoints();
        this.defineControlPoints();
        this.defineConnections();
        this.definePanels();
    }
    
    /**
     * Définit les points structurels principaux.
     */
    private defineStructuralPoints(): void {
        const { wingspan, height } = this.parameters;
        
        // Points principaux
        const nose = new THREE.Vector3(0, height, 0);
        const spineBottom = new THREE.Vector3(0, 0, 0);
        const leftWingTip = new THREE.Vector3(-wingspan / 2, 0, 0);
        const rightWingTip = new THREE.Vector3(wingspan / 2, 0, 0);
        
        // Points intermédiaires (75% de la hauteur)
        const intermediateRatio = 0.75;
        const intermediateHeight = height * intermediateRatio;
        const intermediateWidth = wingspan * 0.3;
        
        const leftIntermediate = new THREE.Vector3(
            -intermediateWidth,
            intermediateHeight,
            0
        );
        const rightIntermediate = new THREE.Vector3(
            intermediateWidth,
            intermediateHeight,
            0
        );
        
        // Point central (bas de la spine)
        const center = spineBottom.clone();
        
        // Points whisker (stabilisateurs arrière)
        const whiskerLength = wingspan * 0.15;
        const leftWhisker = new THREE.Vector3(-wingspan / 2 - whiskerLength, 0, 0);
        const rightWhisker = new THREE.Vector3(wingspan / 2 + whiskerLength, 0, 0);
        
        // Enregistrer les points
        this.points.set('NOSE', nose);
        this.points.set('SPINE_BOTTOM', spineBottom);
        this.points.set('LEFT_WING_TIP', leftWingTip);
        this.points.set('RIGHT_WING_TIP', rightWingTip);
        this.points.set('LEFT_INTERMEDIATE', leftIntermediate);
        this.points.set('RIGHT_INTERMEDIATE', rightIntermediate);
        this.points.set('CENTER', center);
        this.points.set('LEFT_WHISKER', leftWhisker);
        this.points.set('RIGHT_WHISKER', rightWhisker);
    }
    
    /**
     * Calcule les points de contrôle des brides par trilatération 3D.
     */
    private defineControlPoints(): void {
        const nose = this.points.get('NOSE')!;
        const leftIntermediate = this.points.get('LEFT_INTERMEDIATE')!;
        const rightIntermediate = this.points.get('RIGHT_INTERMEDIATE')!;
        const center = this.points.get('CENTER')!;
        
        const { bridles } = this.parameters;
        
        // Calcul point de contrôle gauche
        const leftControl = this.trilaterationSolve(
            nose, leftIntermediate, center,
            bridles.nose, bridles.intermediate, bridles.center
        );
        
        // Calcul point de contrôle droit
        const rightControl = this.trilaterationSolve(
            nose, rightIntermediate, center,
            bridles.nose, bridles.intermediate, bridles.center
        );
        
        this.points.set('LEFT_CONTROL', leftControl);
        this.points.set('RIGHT_CONTROL', rightControl);
    }
    
    /**
     * Résout la trilatération 3D pour trouver un point à l'intersection de 3 sphères.
     * 
     * @param p1 - Centre de la sphère 1
     * @param p2 - Centre de la sphère 2
     * @param p3 - Centre de la sphère 3
     * @param r1 - Rayon de la sphère 1
     * @param r2 - Rayon de la sphère 2
     * @param r3 - Rayon de la sphère 3
     * @returns Point d'intersection
     */
    private trilaterationSolve(
        p1: Vector3D, p2: Vector3D, p3: Vector3D,
        r1: number, r2: number, r3: number
    ): Vector3D {
        // Base orthonormée locale
        const ex = new THREE.Vector3().subVectors(p2, p1).normalize();
        const i = new THREE.Vector3().subVectors(p3, p1).dot(ex);
        const temp = new THREE.Vector3().subVectors(p3, p1).sub(ex.clone().multiplyScalar(i));
        const ey = temp.clone().normalize();
        const ez = new THREE.Vector3().crossVectors(ex, ey);
        
        const d = p1.distanceTo(p2);
        const j = new THREE.Vector3().subVectors(p3, p1).dot(ey);
        
        // Calcul des coordonnées dans la base locale
        const x = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
        const y = (r1 * r1 - r3 * r3 + i * i + j * j) / (2 * j) - (i / j) * x;
        
        const zSq = r1 * r1 - x * x - y * y;
        const z = zSq > 0 ? Math.sqrt(zSq) : 0;
        
        // Conversion vers repère global (choisir +z pour point devant le cerf-volant)
        const result = p1.clone()
            .add(ex.clone().multiplyScalar(x))
            .add(ey.clone().multiplyScalar(y))
            .add(ez.clone().multiplyScalar(z)); // Positif = vers l'avant
        
        return result;
    }
    
    /**
     * Définit les connexions (barres de structure).
     */
    private defineConnections(): void {
        this.connections = [
            ['NOSE', 'SPINE_BOTTOM'],
            ['NOSE', 'LEFT_WING_TIP'],
            ['NOSE', 'RIGHT_WING_TIP'],
            ['LEFT_INTERMEDIATE', 'RIGHT_INTERMEDIATE'],
            ['LEFT_WING_TIP', 'LEFT_WHISKER'],
            ['RIGHT_WING_TIP', 'RIGHT_WHISKER'],
        ];
    }
    
    /**
     * Définit les panneaux (ordre des sommets pour normale cohérente).
     */
    private definePanels(): void {
        this.panels = [
            // Ordre anti-horaire vu de face pour normale vers +Z (extrados)
            ['NOSE', 'LEFT_INTERMEDIATE', 'LEFT_WING_TIP'],
            ['NOSE', 'RIGHT_WING_TIP', 'RIGHT_INTERMEDIATE'],
            ['LEFT_INTERMEDIATE', 'CENTER', 'LEFT_WING_TIP'],
            ['RIGHT_INTERMEDIATE', 'RIGHT_WING_TIP', 'CENTER'],
        ];
    }
    
    /**
     * Retourne un point par son nom.
     */
    getPoint(name: string): Vector3D | undefined {
        return this.points.get(name);
    }
    
    /**
     * Retourne tous les points nommés.
     */
    getAllPoints(): NamedPoint[] {
        return Array.from(this.points.entries()).map(([name, position]) => ({
            name,
            position: position.clone()
        }));
    }
    
    /**
     * Retourne les connexions (barres).
     */
    getConnections(): ConnectionDefinition[] {
        return [...this.connections];
    }
    
    /**
     * Retourne les définitions des panneaux.
     */
    getPanels(): PanelDefinition[] {
        return this.panels.map(panel => [...panel]);
    }
    
    /**
     * Calcule les points d'un panneau dans le repère global.
     */
    getPanelPoints(panelIndex: number): Vector3D[] {
        if (panelIndex < 0 || panelIndex >= this.panels.length) {
            return [];
        }
        
        const panel = this.panels[panelIndex];
        return panel
            .map(name => this.points.get(name))
            .filter(p => p !== undefined) as Vector3D[];
    }
    
    /**
     * Calcule la normale d'un panneau (règle main droite).
     */
    getPanelNormal(panelIndex: number): Vector3D {
        const points = this.getPanelPoints(panelIndex);
        if (points.length < 3) {
            return new THREE.Vector3(0, 0, 1);
        }
        
        const v1 = new THREE.Vector3().subVectors(points[1], points[0]);
        const v2 = new THREE.Vector3().subVectors(points[2], points[0]);
        const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
        
        return normal;
    }
    
    /**
     * Calcule le centroïde (centre géométrique) d'un panneau.
     */
    getPanelCentroid(panelIndex: number): Vector3D {
        const points = this.getPanelPoints(panelIndex);
        if (points.length === 0) {
            return new THREE.Vector3(0, 0, 0);
        }
        
        const centroid = new THREE.Vector3(0, 0, 0);
        points.forEach(p => centroid.add(p));
        centroid.divideScalar(points.length);
        
        return centroid;
    }
    
    /**
     * Calcule la surface d'un panneau triangulaire ou quadrilatéral.
     */
    getPanelArea(panelIndex: number): number {
        const points = this.getPanelPoints(panelIndex);
        
        if (points.length === 3) {
            // Triangle
            const v1 = new THREE.Vector3().subVectors(points[1], points[0]);
            const v2 = new THREE.Vector3().subVectors(points[2], points[0]);
            return v1.cross(v2).length() / 2;
        } else if (points.length === 4) {
            // Quadrilatère (divisé en 2 triangles)
            const v1 = new THREE.Vector3().subVectors(points[1], points[0]);
            const v2 = new THREE.Vector3().subVectors(points[2], points[0]);
            const area1 = v1.cross(v2).length() / 2;
            
            const v3 = new THREE.Vector3().subVectors(points[2], points[0]);
            const v4 = new THREE.Vector3().subVectors(points[3], points[0]);
            const area2 = v3.cross(v4).length() / 2;
            
            return area1 + area2;
        }
        
        return 0;
    }
    
    /**
     * Calcule la surface totale du cerf-volant.
     */
    getTotalArea(): number {
        let totalArea = 0;
        for (let i = 0; i < this.panels.length; i++) {
            totalArea += this.getPanelArea(i);
        }
        return totalArea;
    }
    
    /**
     * Nombre de panneaux.
     */
    getPanelCount(): number {
        return this.panels.length;
    }
}

/**
 * Paramètres par défaut pour un cerf-volant standard.
 */
export const DEFAULT_KITE_PARAMETERS: KiteGeometryParameters = {
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
