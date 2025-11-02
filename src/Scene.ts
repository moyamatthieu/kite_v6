import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * Gère l'ensemble de la scène 3D, y compris le rendu, la caméra et l'environnement.
 */
export class Scene {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private labelRenderer: CSS2DRenderer;
    private controles: OrbitControls;

    constructor(conteneur: HTMLElement) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        
        this.configurerScene();
        this.configurerCamera();
        this.configurerRenderer(conteneur);
        this.configurerLabelRenderer(conteneur);
        this.configurerControles();
        this.creerEnvironnement();

        window.addEventListener('resize', this.onRedimensionner.bind(this));
    }

    private configurerScene(): void {
        this.scene.fog = new THREE.Fog(0x87ceeb, 100, 1000);
    }

    private configurerCamera(): void {
        this.camera.position.set(-5, 4, 5);
        this.camera.lookAt(15, 12, 0);
    }

    private configurerRenderer(conteneur: HTMLElement): void {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        conteneur.appendChild(this.renderer.domElement);
    }
    
    private configurerLabelRenderer(conteneur: HTMLElement): void {
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        conteneur.appendChild(this.labelRenderer.domElement);
    }

    private configurerControles(): void {
        this.controles = new OrbitControls(this.camera, this.renderer.domElement);
        this.controles.enableDamping = true;
        this.controles.dampingFactor = 0.05;
        this.controles.maxDistance = 50;
        this.controles.minDistance = 2;
    }

    private creerEnvironnement(): void {
        // Repère orthonormé (axes X, Y, Z) pour l'orientation
        const axesHelper = new THREE.AxesHelper(1.1);
        this.scene.add(axesHelper);

        // Ciel
        const geometrieCiel = new THREE.SphereGeometry(500, 32, 32);
        const materiauCiel = new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide });
        const ciel = new THREE.Mesh(geometrieCiel, materiauCiel);
        this.scene.add(ciel);

        // Lumières
        const lumiereAmbiante = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(lumiereAmbiante);

        const lumiereSoleil = new THREE.DirectionalLight(0xffffff, 0.8);
        lumiereSoleil.position.set(50, 50, 50);
        lumiereSoleil.castShadow = true;
        this.scene.add(lumiereSoleil);

        // Sol
        const geometrieSol = new THREE.PlaneGeometry(200, 200);
        const materiauSol = new THREE.MeshLambertMaterial({ color: 0x7cfc00 });
        const sol = new THREE.Mesh(geometrieSol, materiauSol);
        sol.rotation.x = -Math.PI / 2;
        sol.receiveShadow = true;
        this.scene.add(sol);

        // Ajout de la grille
        const grille = new THREE.GridHelper(200, 200, 0x888888, 0x888888); // 200x200 avec pas de 1m
        grille.position.y = 0.01; // Légèrement surélevée pour éviter les superpositions
        this.scene.add(grille);
    }

    public ajouter(objet: THREE.Object3D): void {
        this.scene.add(objet);
    }

    public retirer(objet: THREE.Object3D): void {
        this.scene.remove(objet);
    }

    public rendre(): void {
        this.controles.update();
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }

    private onRedimensionner(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// CONSIGNES: Pas de comportements scriptés. Les comportements doivent émerger de la physique de la simulation.