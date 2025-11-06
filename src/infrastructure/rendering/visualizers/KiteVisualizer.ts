/**
 * Visualiseur pour le cerf-volant.
 * 
 * @module infrastructure/rendering/visualizers/KiteVisualizer
 */

import * as THREE from 'three';
import { Kite } from '../../../domain/kite/Kite';
import { MaterialFactory } from '../materials/MaterialFactory';

/**
 * Visualiseur 3D du cerf-volant.
 */
export class KiteVisualizer {
    private group: THREE.Group;
    private kite: Kite;
    
    constructor(kite: Kite) {
        this.kite = kite;
        this.group = new THREE.Group();
        this.buildVisual();
    }
    
    /**
     * Construit la représentation 3D.
     */
    private buildVisual(): void {
        const structureMaterial = MaterialFactory.createKiteStructureMaterial();
        const fabricMaterial = MaterialFactory.createKiteFabricMaterial();
        const pointMaterial = MaterialFactory.createPointMaterial();
        const bridleMaterial = new THREE.LineBasicMaterial({ 
            color: 0xff00ff,  // Magenta pour les brides
            linewidth: 2,
            opacity: 0.8,
            transparent: true
        });

        // Barres de structure
        const connections = this.kite.geometry.getConnections();
        connections.forEach(([p1Name, p2Name]) => {
            const p1 = this.kite.geometry.getPoint(p1Name);
            const p2 = this.kite.geometry.getPoint(p2Name);
            if (p1 && p2) {
                this.addBar(p1, p2, 0.01, structureMaterial);
            }
        });

        // Panneaux de toile
        const seamMaterial = new THREE.LineBasicMaterial({
            color: 0x444444,  // Gris foncé pour les coutures
            linewidth: 2,
            opacity: 0.9,
            transparent: true
        });
        
        for (let i = 0; i < this.kite.geometry.getPanelCount(); i++) {
            const points = this.kite.geometry.getPanelPoints(i);
            if (points.length >= 3) {
                this.addPanel(points, fabricMaterial);
                this.addPanelSeam(points, seamMaterial);
            }
        }

        // Brides (lignes des points structurels vers les points de contrôle)
        this.addBridles(bridleMaterial);

        // Sphères aux points de construction
        this.addPointSpheres(pointMaterial);
    }
    
    /**
     * Ajoute une barre.
     */
    private addBar(p1: THREE.Vector3, p2: THREE.Vector3, diameter: number, material: THREE.Material): void {
        const distance = p1.distanceTo(p2);
        const geometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, distance, 8);
        const bar = new THREE.Mesh(geometry, material);
        
        const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        bar.position.copy(midpoint);
        
        const direction = new THREE.Vector3().subVectors(p2, p1).normalize();
        const axis = new THREE.Vector3(0, 1, 0);
        bar.quaternion.setFromUnitVectors(axis, direction);
        
        this.group.add(bar);
    }
    
    /**
     * Ajoute un panneau de toile.
     */
    private addPanel(points: THREE.Vector3[], material: THREE.Material): void {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        if (points.length === 3) {
            geometry.setIndex([0, 1, 2]);
        } else if (points.length === 4) {
            geometry.setIndex([0, 2, 3, 0, 1, 2]);
        }

        geometry.computeVertexNormals();
        const panel = new THREE.Mesh(geometry, material);
        this.group.add(panel);
    }

    /**
     * Ajoute un liseré/couture sur le pourtour d'un panneau.
     */
    private addPanelSeam(points: THREE.Vector3[], material: THREE.LineBasicMaterial): void {
        // Créer une boucle fermée pour le contour
        const seamPoints = [...points, points[0]];
        const geometry = new THREE.BufferGeometry().setFromPoints(seamPoints);
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        this.group.add(line);
    }

    /**
     * Ajoute des sphères aux points de construction.
     */
    private addPointSpheres(material: THREE.Material): void {
        const namedPoints = this.kite.geometry.getAllPoints();
        const sphereRadius = 0.015; // Rayon des sphères (1.5cm)

        namedPoints.forEach(namedPoint => {
            const geometry = new THREE.SphereGeometry(sphereRadius, 8, 6);
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.copy(namedPoint.position);
            this.group.add(sphere);
        });
    }
    
    /**
     * Ajoute les brides (lignes vers les points de contrôle).
     */
    private addBridles(material: THREE.LineBasicMaterial): void {
        const nez = this.kite.geometry.getPoint('NEZ');
        const traverseGauche = this.kite.geometry.getPoint('TRAVERSE_GAUCHE');
        const traverseDroite = this.kite.geometry.getPoint('TRAVERSE_DROITE');
        const centre = this.kite.geometry.getPoint('CENTRE');
        const controleGauche = this.kite.geometry.getPoint('CONTROLE_GAUCHE');
        const controleDroit = this.kite.geometry.getPoint('CONTROLE_DROIT');
        
        if (!nez || !traverseGauche || !traverseDroite || !centre || !controleGauche || !controleDroit) {
            console.warn('Points manquants pour construire les brides');
            return;
        }
        
        // Brides gauches
        this.addBridleLine(nez, controleGauche, material);
        this.addBridleLine(traverseGauche, controleGauche, material);
        this.addBridleLine(centre, controleGauche, material);
        
        // Brides droites
        this.addBridleLine(nez, controleDroit, material);
        this.addBridleLine(traverseDroite, controleDroit, material);
        this.addBridleLine(centre, controleDroit, material);
    }
    
    /**
     * Ajoute une ligne de bride.
     */
    private addBridleLine(p1: THREE.Vector3, p2: THREE.Vector3, material: THREE.LineBasicMaterial): void {
        const points = [p1, p2];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false; // Important pour éviter le culling
        this.group.add(line);
    }
    
    /**
     * Met à jour la position et l'orientation.
     * ⚠️ Pas de transformation supplémentaire - l'orientation vient directement du PhysicsEngine
     */
    update(): void {
        const state = this.kite.getState();
        this.group.position.copy(state.position);
        this.group.quaternion.copy(state.orientation);  // Copie directe, pas de rotation ajoutée
    }
    
    /**
     * Retourne le groupe 3D.
     */
    getObject3D(): THREE.Group {
        return this.group;
    }
    
    /**
     * Nettoie les ressources.
     */
    dispose(): void {
        this.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
            }
        });
    }
}
