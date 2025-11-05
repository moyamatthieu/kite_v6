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

    /** Afficher le sol */
    showGround?: boolean;

    /** Taille du sol */
    groundSize?: number;

    /** Couleur du sol */
    groundColor?: number;

    /** Activer le brouillard */
    fog?: boolean;

    /** Distance du brouillard */
    fogDistance?: number;

    /** Afficher le repère 3D */
    showAxes?: boolean;

    /** Taille du repère 3D */
    axesSize?: number;
}

/**
 * Wrapper pour THREE.Scene.
 */
export class Scene3D {
    private scene: THREE.Scene;
    private ambientLight?: THREE.AmbientLight;
    private directionalLight?: THREE.DirectionalLight;
    private grid?: THREE.GridHelper;
    private ground?: THREE.Mesh;
    private axes?: THREE.Group;
    
    constructor(config?: Scene3DConfig) {
        this.scene = new THREE.Scene();
        
        // Configuration par défaut
        const cfg = {
            showGrid: config?.showGrid ?? true,
            gridSize: config?.gridSize ?? 20,
            gridDivisions: config?.gridDivisions ?? 20,
            gridColor: config?.gridColor ?? 0x888888,
            showGround: config?.showGround ?? true,
            groundSize: config?.groundSize ?? 100,
            groundColor: config?.groundColor ?? 0x4a9c3a,
            fog: config?.fog ?? false,
            fogDistance: config?.fogDistance ?? 100,
            showAxes: config?.showAxes ?? true,
            axesSize: config?.axesSize ?? 5,
        };
        
        // Lumières
        this.setupLights();
        
        // Sol vert
        if (cfg.showGround) {
            this.setupGround(cfg.groundSize, cfg.groundColor);
        }
        
        // Grille
        if (cfg.showGrid) {
            this.grid = new THREE.GridHelper(cfg.gridSize, cfg.gridDivisions, cfg.gridColor);
            this.grid.position.y = 0.01; // Légèrement au-dessus du sol pour éviter le z-fighting
            this.scene.add(this.grid);
        }
        
        // Brouillard
        if (cfg.fog) {
            this.scene.fog = new THREE.Fog(0x87ceeb, 1, cfg.fogDistance);
        }

        // Repère 3D
        if (cfg.showAxes) {
            this.setupAxes(cfg.axesSize);
        }
    }
    
    /**
     * Configure le sol vert.
     */
    private setupGround(size: number, color: number): void {
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshLambertMaterial({ 
            color: color,
            side: THREE.DoubleSide 
        });
        
        this.ground = new THREE.Mesh(geometry, material);
        this.ground.rotation.x = -Math.PI / 2; // Horizontal
        this.ground.position.y = 0;
        this.ground.receiveShadow = true;
        
        this.scene.add(this.ground);
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
     * Configure le repère 3D (axes X, Y, Z).
     */
    private setupAxes(size: number): void {
        this.axes = new THREE.Group();

        // Épaisseur des axes (plus épais pour meilleure visibilité)
        const axisRadius = 0.03;
        const axisHeight = size;

        // Axe X (rouge)
        const xAxisGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisHeight, 8);
        const xAxisMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
        const xAxis = new THREE.Mesh(xAxisGeometry, xAxisMaterial);
        xAxis.rotation.z = -Math.PI / 2; // Rotation pour aligner sur l'axe X
        xAxis.position.x = axisHeight / 2;
        this.axes.add(xAxis);

        // Axe Y (vert)
        const yAxisGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisHeight, 8);
        const yAxisMaterial = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
        const yAxis = new THREE.Mesh(yAxisGeometry, yAxisMaterial);
        yAxis.position.y = axisHeight / 2;
        this.axes.add(yAxis);

        // Axe Z (bleu)
        const zAxisGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axisHeight, 8);
        const zAxisMaterial = new THREE.MeshLambertMaterial({ color: 0x0000ff });
        const zAxis = new THREE.Mesh(zAxisGeometry, zAxisMaterial);
        zAxis.rotation.x = Math.PI / 2; // Rotation pour aligner sur l'axe Z
        zAxis.position.z = axisHeight / 2;
        this.axes.add(zAxis);

        this.scene.add(this.axes);
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
     * Affiche/Masque le sol.
     */
    setGroundVisible(visible: boolean): void {
        if (this.ground) {
            this.ground.visible = visible;
        }
    }

    /**
     * Affiche/Masque le repère 3D.
     */
    setAxesVisible(visible: boolean): void {
        if (this.axes) {
            this.axes.visible = visible;
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

        if (this.ground) {
            this.ground.geometry.dispose();
            (this.ground.material as THREE.Material).dispose();
        }

        if (this.axes) {
            this.axes.children.forEach((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    (child.material as THREE.Material).dispose();
                }
            });
        }
    }
}
