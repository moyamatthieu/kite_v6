/**
 * Wrapper pour la caméra.
 * 
 * @module infrastructure/rendering/Camera
 */

import * as THREE from 'three';

/**
 * Configuration de la caméra.
 */
export interface CameraConfig {
    /** Position initiale */
    position?: { x: number; y: number; z: number };
    
    /** Point regardé */
    lookAt?: { x: number; y: number; z: number };
    
    /** Field of view (degrés) */
    fov?: number;
    
    /** Near plane */
    near?: number;
    
    /** Far plane */
    far?: number;
}

/**
 * Wrapper pour THREE.PerspectiveCamera.
 */
export class Camera {
    private camera: THREE.PerspectiveCamera;
    
    constructor(aspect: number, config?: CameraConfig) {
        const cfg = {
            position: config?.position ?? { x: -8, y: 10, z: 8 },
            lookAt: config?.lookAt ?? { x: 0, y: 5, z: 0 },
            fov: config?.fov ?? 60,
            near: config?.near ?? 0.1,
            far: config?.far ?? 1000,
        };
        
        this.camera = new THREE.PerspectiveCamera(
            cfg.fov,
            aspect,
            cfg.near,
            cfg.far
        );
        
        this.camera.position.set(cfg.position.x, cfg.position.y, cfg.position.z);
        this.camera.lookAt(cfg.lookAt.x, cfg.lookAt.y, cfg.lookAt.z);
    }
    
    /**
     * Met à jour l'aspect ratio.
     */
    setAspect(aspect: number): void {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }
    
    /**
     * Définit la position de la caméra.
     */
    setPosition(x: number, y: number, z: number): void {
        this.camera.position.set(x, y, z);
    }
    
    /**
     * Définit le point regardé.
     */
    lookAt(x: number, y: number, z: number): void {
        this.camera.lookAt(x, y, z);
    }
    
    /**
     * Retourne la caméra Three.js.
     */
    getThreeCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }
}
