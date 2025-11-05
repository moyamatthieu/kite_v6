/**
 * Wrapper pour Three.js renderer.
 * 
 * @module infrastructure/rendering/Renderer
 */

import * as THREE from 'three';

/**
 * Configuration du renderer.
 */
export interface RendererConfig {
    /** Activer antialiasing */
    antialias?: boolean;
    
    /** Couleur de fond */
    clearColor?: number;
    
    /** Alpha du fond */
    clearAlpha?: number;
    
    /** Taille des ombres */
    shadowMapSize?: number;
}

/**
 * Wrapper pour THREE.WebGLRenderer.
 * 
 * Isole Three.js de la logique métier.
 */
export class Renderer {
    private renderer: THREE.WebGLRenderer;
    private container: HTMLElement;
    private resizeHandler: () => void;
    
    constructor(container: HTMLElement, config?: RendererConfig) {
        this.container = container;
        
        // Créer renderer Three.js
        this.renderer = new THREE.WebGLRenderer({
            antialias: config?.antialias ?? true,
        });
        
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setClearColor(
            config?.clearColor ?? 0x87ceeb,
            config?.clearAlpha ?? 1
        );
        
        // Configuration ombres
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Styles du canvas pour interactions
        const canvas = this.renderer.domElement;
        canvas.style.display = 'block';
        canvas.style.cursor = 'grab';
        canvas.style.outline = 'none';
        canvas.tabIndex = 1; // Permettre le focus clavier
        
        // Ajouter au DOM
        container.appendChild(canvas);
        
        // ✅ OPTIMISATION: Stocker référence au handler pour pouvoir le retirer
        this.resizeHandler = () => this.handleResize();
        window.addEventListener('resize', this.resizeHandler);
    }
    
    /**
     * Rend la scène avec la caméra.
     */
    render(scene: THREE.Scene, camera: THREE.Camera): void {
        this.renderer.render(scene, camera);
    }
    
    /**
     * Gère le redimensionnement de la fenêtre.
     */
    private handleResize(): void {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.renderer.setSize(width, height);
    }
    
    /**
     * Retourne les dimensions actuelles.
     */
    getSize(): { width: number; height: number } {
        return {
            width: this.container.clientWidth,
            height: this.container.clientHeight,
        };
    }
    
    /**
     * Nettoie les ressources.
     * ✅ OPTIMISATION: Retire le listener resize pour éviter fuite mémoire
     */
    dispose(): void {
        window.removeEventListener('resize', this.resizeHandler);
        this.renderer.dispose();
        this.container.removeChild(this.renderer.domElement);
    }
    
    /**
     * Retourne le canvas du renderer.
     */
    getCanvas(): HTMLCanvasElement {
        return this.renderer.domElement;
    }
    
    /**
     * Retourne le renderer Three.js (pour extensions avancées).
     */
    getThreeRenderer(): THREE.WebGLRenderer {
        return this.renderer;
    }
}
