/**
 * Wrapper pour la scène 3D.
 * 
 * @module infrastructure/rendering/Scene3D
 */

import * as THREE from 'three';

/**
 * Configuration de la scène.
 */
export interface Scene3DConfig {
    /** Afficher la grille */
    showGrid?: boolean;
    
    /** Taille de la grille */
    gridSize?: number;
    
    /** Divisions de la grille */
    gridDivisions?: number;
    
    /** Couleur de la grille */
    gridColor?: number;
    
    /** Activer le brouillard */
    fog?: boolean;
    
    /** Distance du brouillard */
    fogDistance?: number;
}

/**
 * Wrapper pour THREE.Scene.
 */
export class Scene3D {
    private scene: THREE.Scene;
    private ambientLight?: THREE.AmbientLight;
    private directionalLight?: THREE.DirectionalLight;
    private grid?: THREE.GridHelper;
    
    constructor(config?: Scene3DConfig) {
        this.scene = new THREE.Scene();
        
        // Configuration par défaut
        const cfg = {
            showGrid: config?.showGrid ?? true,
            gridSize: config?.gridSize ?? 20,
            gridDivisions: config?.gridDivisions ?? 20,
            gridColor: config?.gridColor ?? 0x888888,
            fog: config?.fog ?? false,
            fogDistance: config?.fogDistance ?? 100,
        };
        
        // Lumières
        this.setupLights();
        
        // Grille
        if (cfg.showGrid) {
            this.grid = new THREE.GridHelper(cfg.gridSize, cfg.gridDivisions, cfg.gridColor);
            this.scene.add(this.grid);
        }
        
        // Brouillard
        if (cfg.fog) {
            this.scene.fog = new THREE.Fog(0x87ceeb, 1, cfg.fogDistance);
        }
    }
    
    /**
     * Configure les lumières de la scène.
     */
    private setupLights(): void {
        // Lumière ambiante
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);
        
        // Lumière directionnelle (soleil)
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(10, 20, 10);
        this.directionalLight.castShadow = true;
        
        // Configuration ombres
        this.directionalLight.shadow.mapSize.width = 2048;
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.camera.near = 0.5;
        this.directionalLight.shadow.camera.far = 100;
        
        this.scene.add(this.directionalLight);
    }
    
    /**
     * Ajoute un objet à la scène.
     */
    add(object: THREE.Object3D): void {
        this.scene.add(object);
    }
    
    /**
     * Retire un objet de la scène.
     */
    remove(object: THREE.Object3D): void {
        this.scene.remove(object);
    }
    
    /**
     * Affiche/Masque la grille.
     */
    setGridVisible(visible: boolean): void {
        if (this.grid) {
            this.grid.visible = visible;
        }
    }
    
    /**
     * Retourne la scène Three.js.
     */
    getThreeScene(): THREE.Scene {
        return this.scene;
    }
    
    /**
     * Nettoie les ressources.
     */
    dispose(): void {
        if (this.grid) {
            this.grid.geometry.dispose();
            (this.grid.material as THREE.Material).dispose();
        }
    }
}
