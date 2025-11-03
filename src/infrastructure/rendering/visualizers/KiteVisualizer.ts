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
        for (let i = 0; i < this.kite.geometry.getPanelCount(); i++) {
            const points = this.kite.geometry.getPanelPoints(i);
            if (points.length >= 3) {
                this.addPanel(points, fabricMaterial);
            }
        }
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
     * Met à jour la position et l'orientation.
     */
    update(): void {
        const state = this.kite.getState();
        this.group.position.copy(state.position);
        this.group.quaternion.copy(state.orientation);
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
