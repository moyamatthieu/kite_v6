/**
 * Factory pour matériaux réutilisables.
 * 
 * @module infrastructure/rendering/materials/MaterialFactory
 */

import * as THREE from 'three';

/**
 * Factory centralisée pour créer des matériaux Three.js.
 */
export class MaterialFactory {
    private static cache = new Map<string, THREE.Material>();
    
    /**
     * Matériau pour la structure du cerf-volant.
     */
    static createKiteStructureMaterial(): THREE.MeshStandardMaterial {
        const key = 'kite-structure';
        if (!this.cache.has(key)) {
            this.cache.set(key, new THREE.MeshStandardMaterial({
                color: 0x333333,
                metalness: 0.8,
                roughness: 0.2,
            }));
        }
        return this.cache.get(key) as THREE.MeshStandardMaterial;
    }
    
    /**
     * Matériau pour la toile du cerf-volant.
     */
    static createKiteFabricMaterial(): THREE.MeshStandardMaterial {
        const key = 'kite-fabric';
        if (!this.cache.has(key)) {
            this.cache.set(key, new THREE.MeshStandardMaterial({
                color: 0xff4444,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.85,
                metalness: 0.1,
                roughness: 0.9,
            }));
        }
        return this.cache.get(key) as THREE.MeshStandardMaterial;
    }
    
    /**
     * Matériau pour les lignes.
     */
    static createLineMaterial(): THREE.LineBasicMaterial {
        const key = 'line';
        if (!this.cache.has(key)) {
            this.cache.set(key, new THREE.LineBasicMaterial({
                color: 0xffffff,
                linewidth: 2,
            }));
        }
        return this.cache.get(key) as THREE.LineBasicMaterial;
    }
    
    /**
     * Matériau pour la trajectoire.
     */
    static createTrajectoryMaterial(): THREE.LineBasicMaterial {
        const key = 'trajectory';
        if (!this.cache.has(key)) {
            this.cache.set(key, new THREE.LineBasicMaterial({
                color: 0x00ff00,
                linewidth: 1,
                transparent: true,
                opacity: 0.6,
            }));
        }
        return this.cache.get(key) as THREE.LineBasicMaterial;
    }
    
    /**
     * Nettoie tous les matériaux cachés.
     */
    static dispose(): void {
        this.cache.forEach(material => material.dispose());
        this.cache.clear();
    }
}
