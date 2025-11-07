/**
 * Géométrie pure du cerf-volant (calculs mathématiques sans Three.js).
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * REPÈRE LOCAL DU CERF-VOLANT ET ORIENTATION DES FACES
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * REPÈRE LOCAL (avant rotation d'orientation en simulation) :
 * - X+ = droite (aile droite)
 * - Y+ = haut (vers le nez)
 * - Z+ = AVANT du cerf-volant (où il regarde AVANT rotation)
 * 
 * INTRADOS vs EXTRADOS (définition physique claire) :
 * 
 * - **INTRADOS** = Face AVANT du cerf-volant, celle qui REÇOIT LE VENT
 *   └─> Orientée vers Z+ en repère local (face avant)
 *   └─> C'est la face "concave" qui génère la portance
 *   └─> Les brides et points de contrôle sont attachés sur cette face
 * 
 * - **EXTRADOS** = Face ARRIÈRE du cerf-volant, côté opposé au vent
 *   └─> Orientée vers Z- en repère local (face arrière)
 *   └─> C'est la face "convexe", le dos du cerf-volant
 *   └─> Face visible quand on regarde le cerf-volant de dos
 * 
 * RÈGLE DE CONSTRUCTION DES PANNEAUX :
 * Pour que les normales pointent vers l'INTRADOS (face qui reçoit le vent, Z+) :
 * - Les points doivent être définis dans l'ordre HORAIRE vu de l'intrados (Z+)
 * - Calcul : normale = (p1-p0) × (p2-p0), qui pointera vers Z+ si ordre horaire
 * - ⚠️ ATTENTION : Three.js utilise la règle de la main droite
 * 
 * ⚠️ ORIENTATION EN SIMULATION :
 * Le kite subit une rotation de 180° sur Y pour regarder vers Z- (station de pilotage)
 * Après cette rotation : intrados (Z+ local) devient face à Z- monde (vers station/vent)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
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
     * Définit les points structurels principaux du cerf-volant.
     * Architecture : Delta avec bords d'attaque, barre horizontale et whiskers arrière.
     */
    private defineStructuralPoints(): void {
        const { wingspan, height } = this.parameters;
        
        // === POINTS PRINCIPAUX ===
        
        // Sommet (nez) du cerf-volant
        const nose = new THREE.Vector3(0, height, 0);
        
        // Base de la colonne vertébrale (centre du bas)
        const spineBottom = new THREE.Vector3(0, 0, 0);
        
        // Extrémités des ailes (bout des bords d'attaque)
        const leftWingTip = new THREE.Vector3(-wingspan / 2, 0, 0);
        const rightWingTip = new THREE.Vector3(wingspan / 2, 0, 0);
        
        // === BARRE HORIZONTALE (traverse à Y=0.2) ===
        
        const horizontalBarHeight = 0.2; // Hauteur de la barre horizontale
        
        // Points intermédiaires : intersection barre horizontale / bords d'attaque
        // Calculés par interpolation linéaire sur les lignes NOSE → WING_TIP
        const leftT = (horizontalBarHeight - nose.y) / (leftWingTip.y - nose.y);
        const leftIntermediate = new THREE.Vector3(
            nose.x + (leftWingTip.x - nose.x) * leftT,
            horizontalBarHeight,
            nose.z + (leftWingTip.z - nose.z) * leftT
        );
        
        const rightT = (horizontalBarHeight - nose.y) / (rightWingTip.y - nose.y);
        const rightIntermediate = new THREE.Vector3(
            nose.x + (rightWingTip.x - nose.x) * rightT,
            horizontalBarHeight,
            nose.z + (rightWingTip.z - nose.z) * rightT
        );
        
        // Point central sur la barre horizontale (intersection avec la colonne vertébrale)
        const center = new THREE.Vector3(0, horizontalBarHeight, 0);
        
        // === WHISKERS (stabilisateurs arrière) ===
        
        // Points de base : milieu de chaque demi-barre horizontale
        const leftWhiskerBase = new THREE.Vector3(
            (center.x + leftIntermediate.x) / 2,
            horizontalBarHeight,
            (center.z + leftIntermediate.z) / 2
        );
        
        const rightWhiskerBase = new THREE.Vector3(
            (center.x + rightIntermediate.x) / 2,
            horizontalBarHeight,
            (center.z + rightIntermediate.z) / 2
        );
        
        // Whiskers : partent vers l'arrière (Z négatif) pour créer du volume
        const whiskerDepth = wingspan * 0.15;
        const leftWhisker = new THREE.Vector3(
            leftWhiskerBase.x,
            leftWhiskerBase.y,
            leftWhiskerBase.z - whiskerDepth
        );
        
        const rightWhisker = new THREE.Vector3(
            rightWhiskerBase.x,
            rightWhiskerBase.y,
            rightWhiskerBase.z - whiskerDepth
        );
        
        // === ENREGISTREMENT DES POINTS ===
        
        // Points structurels principaux
        this.points.set('NEZ', nose);                           // Sommet du cerf-volant
        this.points.set('BAS_COLONNE', spineBottom);           // Base de la colonne vertébrale
        this.points.set('EXTREMITE_AILE_GAUCHE', leftWingTip); // Bout de l'aile gauche
        this.points.set('EXTREMITE_AILE_DROITE', rightWingTip);// Bout de l'aile droite
        
        // Barre horizontale (traverse)
        this.points.set('TRAVERSE_GAUCHE', leftIntermediate);   // Intersection traverse/bord d'attaque gauche
        this.points.set('TRAVERSE_DROITE', rightIntermediate);  // Intersection traverse/bord d'attaque droit
        this.points.set('CENTRE', center);                      // Centre de la traverse
        
        // Stabilisateurs arrière (whiskers)
        this.points.set('BASE_STAB_GAUCHE', leftWhiskerBase);  // Base du stabilisateur gauche
        this.points.set('BASE_STAB_DROIT', rightWhiskerBase);  // Base du stabilisateur droit
        this.points.set('STAB_GAUCHE', leftWhisker);           // Extrémité du stabilisateur gauche
        this.points.set('STAB_DROIT', rightWhisker);           // Extrémité du stabilisateur droit
    }
    
    /**
     * Calcule les points de contrôle des brides par trilatération 3D.
     */
    private defineControlPoints(): void {
        const nez = this.points.get('NEZ')!;
        const traverseGauche = this.points.get('TRAVERSE_GAUCHE')!;
        const traverseDroite = this.points.get('TRAVERSE_DROITE')!;
        const centre = this.points.get('CENTRE')!;
        
        const { bridles } = this.parameters;
        
        // Calcul point de contrôle gauche (z positif = vers l'avant)
        const pointControleGauche = this.trilaterationSolve(
            nez, traverseGauche, centre,
            bridles.nose, bridles.intermediate, bridles.center,
            true  // Forcer z positif
        );
        
        // Calcul point de contrôle droit (z positif = vers l'avant)
        const pointControleDroit = this.trilaterationSolve(
            nez, traverseDroite, centre,
            bridles.nose, bridles.intermediate, bridles.center,
            true  // Forcer z positif
        );
        
        this.points.set('CONTROLE_GAUCHE', pointControleGauche);
        this.points.set('CONTROLE_DROIT', pointControleDroit);
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
     * @param forcePositiveZ - Force le point devant le cerf-volant (Z+)
     * @returns Point d'intersection
     */
    private trilaterationSolve(
        p1: Vector3D, p2: Vector3D, p3: Vector3D,
        r1: number, r2: number, r3: number,
        forcePositiveZ: boolean = true
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
        let z = zSq > 0 ? Math.sqrt(zSq) : 0;
        
        // Si forcePositiveZ est activé et que ez pointe vers l'arrière, inverser z
        if (forcePositiveZ && ez.z < 0) {
            z = -z;
        }
        
        // Conversion vers repère global
        const result = p1.clone()
            .add(ex.clone().multiplyScalar(x))
            .add(ey.clone().multiplyScalar(y))
            .add(ez.clone().multiplyScalar(z));
        
        return result;
    }
    
    /**
     * Définit les connexions (barres de structure).
     */
    private defineConnections(): void {
        this.connections = [
            // Colonne vertébrale centrale
            ['NEZ', 'BAS_COLONNE'],
            
            // Bords d'attaque (du nez aux extrémités des ailes)
            ['NEZ', 'EXTREMITE_AILE_GAUCHE'],
            ['NEZ', 'EXTREMITE_AILE_DROITE'],
            
            // Barre horizontale (traverse complète)
            ['TRAVERSE_GAUCHE', 'TRAVERSE_DROITE'],
            
            // Stabilisateurs arrière (barres pour le volume)
            ['BASE_STAB_GAUCHE', 'STAB_GAUCHE'],
            ['BASE_STAB_DROIT', 'STAB_DROIT'],
        ];
    }
    
    /**
     * Définit les panneaux (toile du cerf-volant).
     * 4 panneaux quadrilatéraux formant une surface continue déformée en 3D.
     * 🔧 Ordre HORAIRE vu de face pour normales vers -Z (intrados face au vent).
     * Les normales doivent pointer vers la station de contrôle (Z-) pour recevoir le vent correctement.
     */
    private definePanels(): void {
        // ═══════════════════════════════════════════════════════════════════════════════
        // CONSTRUCTION DES PANNEAUX
        // ═══════════════════════════════════════════════════════════════════════════════
        // Ordre des points : HORAIRE vu de l'INTRADOS (face Z+)
        // → Les normales pointeront vers Z+ (intrados, face qui reçoit le vent)
        // 
        // Règle de la main droite : normale = (p1-p0) × (p2-p0)
        // Pour que la normale pointe vers l'observateur, les points doivent être en ordre HORAIRE
        // 
        // Visualisation depuis l'intrados (face avant du kite, Z+) :
        //
        //            NEZ (haut, Y+)
        //           /   \
        //          /  0  \  1
        //         /       \
        //    STAB_G  BAS_COLONNE  STAB_D
        //        |       |       |
        //        |   2   |   3   |
        //        |       |       |
        //   EXT_AILE_G       EXT_AILE_D
        //
        // ═══════════════════════════════════════════════════════════════════════════════
        
        this.panels = [
            // Panneau 0 : Supérieur gauche (triangle NEZ - BAS_COLONNE - STAB_GAUCHE)
            // Ordre HORAIRE vu de l'intrados (Z+) pour normale vers Z+ : NEZ → BAS_COLONNE → STAB_GAUCHE
            ['NEZ', 'BAS_COLONNE', 'STAB_GAUCHE'],
            
            // Panneau 1 : Supérieur droit (triangle NEZ - STAB_DROIT - BAS_COLONNE)
            // Ordre HORAIRE vu de l'intrados (Z+) pour normale vers Z+ : NEZ → STAB_DROIT → BAS_COLONNE
            ['NEZ', 'STAB_DROIT', 'BAS_COLONNE'],
            
            // Panneau 2 : Inférieur gauche (triangle NEZ - STAB_GAUCHE - EXTREMITE_AILE_GAUCHE)
            // Ordre HORAIRE vu de l'intrados (Z+) pour normale vers Z+ : NEZ → STAB_GAUCHE → EXTREMITE_AILE_GAUCHE
            ['NEZ', 'STAB_GAUCHE', 'EXTREMITE_AILE_GAUCHE'],
            
            // Panneau 3 : Inférieur droit (triangle NEZ - EXTREMITE_AILE_DROITE - STAB_DROIT)
            // Ordre HORAIRE vu de l'intrados (Z+) pour normale vers Z+ : NEZ → EXTREMITE_AILE_DROITE → STAB_DROIT
            ['NEZ', 'EXTREMITE_AILE_DROITE', 'STAB_DROIT'],
        ];
    }
    
    /**
     * Retourne un point par son nom.
     */
    getPoint(name: string): Vector3D | undefined {
        return this.points.get(name);
    }
    
    /**
     * 🎯 NOUVEAUTÉ : Met à jour la position d'un point existant.
     * 
     * Utilisé pour corriger dynamiquement les positions des points de contrôle
     * afin de respecter les contraintes géométriques des lignes et brides.
     * 
     * @param name - Nom du point à mettre à jour
     * @param newPosition - Nouvelle position locale
     * @returns true si mise à jour réussie, false si point inexistant
     */
    updatePoint(name: string, newPosition: Vector3D): boolean {
        if (!this.points.has(name)) {
            return false;
        }
        
        // Mettre à jour la position (clone pour éviter référence externe)
        this.points.set(name, newPosition.clone());
        return true;
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
     * 
     * ✅ CONVENTION ÉTABLIE : Les normales pointent vers l'INTRADOS (Z+ en local)
     * - INTRADOS = Face qui REÇOIT le vent (face avant, Z+)
     * - EXTRADOS = Face arrière, dos du cerf-volant (Z-)
     * 
     * Calcul : normale = (p1-p0) × (p2-p0)
     * Les panneaux sont définis en ordre ANTI-HORAIRE vu de l'intrados
     * → normale pointe vers l'intrados (Z+)
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
