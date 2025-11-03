/**
 * Visualiseurs pour lignes, brides et trajectoire.
 * 
 * @module infrastructure/rendering/visualizers
 */

import * as THREE from 'three';
import { Kite } from '../../../domain/kite/Kite';
import { MaterialFactory } from '../materials/MaterialFactory';

/**
 * Visualiseur pour les lignes de contrôle.
 */
export class LinesVisualizer {
    private lines: [THREE.Line, THREE.Line];
    
    constructor() {
        const material = MaterialFactory.createLineMaterial();
        const geometry = new THREE.BufferGeometry();
        
        this.lines = [
            new THREE.Line(geometry.clone(), material),
            new THREE.Line(geometry.clone(), material)
        ];
        
        this.lines[0].frustumCulled = false;
        this.lines[1].frustumCulled = false;
    }
    
    update(leftWinch: THREE.Vector3, rightWinch: THREE.Vector3, kite: Kite): void {
        const leftAttach = kite.getGlobalPointPosition('LEFT_CONTROL') ?? kite.getState().position;
        const rightAttach = kite.getGlobalPointPosition('RIGHT_CONTROL') ?? kite.getState().position;
        
        this.lines[0].geometry.setFromPoints([leftWinch, leftAttach]);
        this.lines[1].geometry.setFromPoints([rightWinch, rightAttach]);
    }
    
    getObjects(): THREE.Line[] {
        return [...this.lines];
    }
    
    dispose(): void {
        this.lines.forEach(line => line.geometry.dispose());
    }
}

/**
 * Visualiseur pour la trajectoire.
 */
export class TrajectoryVisualizer {
    private line: THREE.Line;
    private points: THREE.Vector3[] = [];
    private maxPoints = 2000;
    
    constructor() {
        const geometry = new THREE.BufferGeometry();
        const material = MaterialFactory.createTrajectoryMaterial();
        this.line = new THREE.Line(geometry, material);
        this.line.frustumCulled = false;
    }
    
    addPoint(point: THREE.Vector3): void {
        this.points.push(point.clone());
        if (this.points.length > this.maxPoints) {
            this.points.shift();
        }
        this.line.geometry.setFromPoints(this.points);
    }
    
    clear(): void {
        this.points = [];
        this.line.geometry.setFromPoints([]);
    }
    
    getObject(): THREE.Line {
        return this.line;
    }
    
    dispose(): void {
        this.line.geometry.dispose();
    }
}

/**
 * Visualiseur pour les vecteurs de forces (debug).
 */
export class DebugVisualizer {
    private arrows: THREE.ArrowHelper[] = [];
    private group: THREE.Group;
    
    constructor() {
        this.group = new THREE.Group();
    }
    
    updateForceVectors(
        position: THREE.Vector3,
        forces: {
            aerodynamic?: THREE.Vector3;
            gravity?: THREE.Vector3;
            lines?: THREE.Vector3;
            total?: THREE.Vector3;
        }
    ): void {
        // Nettoyer anciennes flèches
        this.arrows.forEach(arrow => this.group.remove(arrow));
        this.arrows = [];
        
        const scale = 0.5; // 1N = 0.5m
        
        if (forces.aerodynamic) {
            const arrow = new THREE.ArrowHelper(
                forces.aerodynamic.clone().normalize(),
                position,
                forces.aerodynamic.length() * scale,
                0x00ff00, // Vert
                0.2, 0.1
            );
            this.arrows.push(arrow);
            this.group.add(arrow);
        }
        
        if (forces.gravity) {
            const arrow = new THREE.ArrowHelper(
                forces.gravity.clone().normalize(),
                position,
                forces.gravity.length() * scale,
                0x0000ff, // Bleu
                0.2, 0.1
            );
            this.arrows.push(arrow);
            this.group.add(arrow);
        }
        
        if (forces.total) {
            const arrow = new THREE.ArrowHelper(
                forces.total.clone().normalize(),
                position,
                forces.total.length() * scale,
                0xffff00, // Jaune
                0.3, 0.15
            );
            this.arrows.push(arrow);
            this.group.add(arrow);
        }
    }
    
    getObject(): THREE.Group {
        return this.group;
    }
    
    setVisible(visible: boolean): void {
        this.group.visible = visible;
    }
    
    dispose(): void {
        this.arrows.forEach(arrow => {
            arrow.line.geometry.dispose();
            (arrow.line.material as THREE.Material).dispose();
            arrow.cone.geometry.dispose();
            (arrow.cone.material as THREE.Material).dispose();
        });
    }
}
