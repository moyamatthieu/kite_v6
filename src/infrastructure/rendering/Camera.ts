/**
 * Contrôleur de caméra avancé pour la simulation 3D.
 * Architecture Clean - Couche Infrastructure.
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
    
    /** Distance minimale de zoom */
    minDistance?: number;
    
    /** Distance maximale de zoom */
    maxDistance?: number;
    
    /** Vitesse de rotation */
    rotateSpeed?: number;
    
    /** Vitesse de zoom */
    zoomSpeed?: number;
    
    /** Vitesse de pan */
    panSpeed?: number;
}

/**
 * Modes de contrôle de caméra.
 */
export enum CameraMode {
    ORBIT = 'orbit',
    FREE = 'free',
    FOLLOW = 'follow',
    CINEMATIC = 'cinematic'
}

/**
 * États de la caméra.
 */
export interface CameraState {
    position: THREE.Vector3;
    target: THREE.Vector3;
    distance: number;
    azimuth: number;
    elevation: number;
}

/**
 * Wrapper pour THREE.PerspectiveCamera avec contrôles avancés.
 */
export class Camera {
    private camera: THREE.PerspectiveCamera;
    private config: Required<CameraConfig>;
    private mode: CameraMode = CameraMode.ORBIT;
    
    // État de la caméra
    private state: CameraState;
    private target: THREE.Vector3;
    
    // Contrôles souris
    private isMouseDown = false;
    private lastMousePosition = { x: 0, y: 0 };
    private mouseButtons = { left: false, middle: false, right: false };
    private canvas?: HTMLCanvasElement; // Référence au canvas pour gérer le curseur
    
    // Contrôles clavier (déplacement WASD)
    private keyStates: { [key: string]: boolean } = {};
    private moveSpeed = 0.1; // Vitesse de déplacement en m/frame
    private fastMoveMultiplier = 3.0; // Multiplicateur quand Shift est pressé
    
    // Animation
    private animationTarget?: CameraState;
    private animationDuration = 0;
    private animationElapsed = 0;
    private isAnimating = false;
    
    // Damping pour mouvement fluide
    private velocity = new THREE.Vector3(0, 0, 0);
    private dampingFactor = 0.85;
    
    constructor(aspect: number, config?: CameraConfig) {
        this.config = {
            position: config?.position ?? { x: -8, y: 10, z: 8 },
            lookAt: config?.lookAt ?? { x: 0, y: 5, z: 0 },
            fov: config?.fov ?? 60,
            near: config?.near ?? 0.1,
            far: config?.far ?? 1000,
            minDistance: config?.minDistance ?? 2,
            maxDistance: config?.maxDistance ?? 50,
            rotateSpeed: config?.rotateSpeed ?? 1.0,
            zoomSpeed: config?.zoomSpeed ?? 1.0,
            panSpeed: config?.panSpeed ?? 0.7,
            ...config
        };
        
        this.camera = new THREE.PerspectiveCamera(
            this.config.fov,
            aspect,
            this.config.near,
            this.config.far
        );
        
        // Initialiser l'état
        this.target = new THREE.Vector3(
            this.config.lookAt.x,
            this.config.lookAt.y,
            this.config.lookAt.z
        );
        
        const initialPosition = new THREE.Vector3(
            this.config.position.x,
            this.config.position.y,
            this.config.position.z
        );
        
        // Calculer la distance et les angles
        const distance = initialPosition.distanceTo(this.target);
        const direction = new THREE.Vector3().subVectors(initialPosition, this.target).normalize();
        const azimuth = Math.atan2(direction.x, direction.z);
        const elevation = Math.asin(Math.max(-1, Math.min(1, direction.y)));
        
        this.state = {
            position: initialPosition.clone(),
            target: this.target.clone(),
            distance: Math.max(this.config.minDistance, Math.min(this.config.maxDistance, distance)),
            azimuth,
            elevation
        };
        
        this.updateCameraPosition();
    }
    
    /**
     * Met à jour l'aspect ratio de la caméra.
     */
    public setAspect(aspect: number): void {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }
    
    /**
     * Met à jour la position de la caméra selon l'état actuel.
     */
    private updateCameraPosition(): void {
        // Calculer la position à partir des coordonnées sphériques
        const x = this.state.target.x + this.state.distance * Math.sin(this.state.azimuth) * Math.cos(this.state.elevation);
        let y = this.state.target.y + this.state.distance * Math.sin(this.state.elevation);
        const z = this.state.target.z + this.state.distance * Math.cos(this.state.azimuth) * Math.cos(this.state.elevation);
        
        // CONTRAINTE 1 : La caméra ne doit jamais passer sous le sol (Y < 0)
        const minGroundHeight = 0.5; // Hauteur minimale au-dessus du sol (50cm)
        if (y < minGroundHeight) {
            y = minGroundHeight;
        }
        
        // CONTRAINTE 2 : La caméra ne doit jamais passer sous le kite
        // On laisse une marge de sécurité de 1m en dessous du kite
        const minKiteOffset = 1.0;
        const minKiteHeight = this.state.target.y - minKiteOffset;
        if (y < minKiteHeight) {
            y = Math.max(minKiteHeight, minGroundHeight);
        }
        
        this.state.position.set(x, y, z);
        this.camera.position.copy(this.state.position);
        this.camera.lookAt(this.state.target);
    }
    
    /**
     * Anime la caméra vers une nouvelle position.
     */
    public animateTo(targetState: Partial<CameraState>, duration: number = 1000): void {
        this.animationTarget = {
            position: targetState.position || this.state.position.clone(),
            target: targetState.target || this.state.target.clone(),
            distance: targetState.distance !== undefined ? targetState.distance : this.state.distance,
            azimuth: targetState.azimuth !== undefined ? targetState.azimuth : this.state.azimuth,
            elevation: targetState.elevation !== undefined ? targetState.elevation : this.state.elevation
        };
        
        this.animationDuration = duration;
        this.animationElapsed = 0;
        this.isAnimating = true;
    }
    
    /**
     * Met à jour l'animation de la caméra.
     */
    public updateAnimation(deltaTime: number): void {
        if (!this.isAnimating || !this.animationTarget) return;
        
        this.animationElapsed += deltaTime;
        const progress = Math.min(this.animationElapsed / this.animationDuration, 1);
        
        // Interpolation smooth
        const easeProgress = this.easeInOutCubic(progress);
        
        // Interpoler chaque propriété
        this.state.position.lerp(this.animationTarget.position, easeProgress);
        this.state.target.lerp(this.animationTarget.target, easeProgress);
        this.state.distance = THREE.MathUtils.lerp(this.state.distance, this.animationTarget.distance, easeProgress);
        this.state.azimuth = THREE.MathUtils.lerp(this.state.azimuth, this.animationTarget.azimuth, easeProgress);
        this.state.elevation = THREE.MathUtils.lerp(this.state.elevation, this.animationTarget.elevation, easeProgress);
        
        this.updateCameraPosition();
        
        if (progress >= 1) {
            this.isAnimating = false;
            this.animationTarget = undefined;
        }
    }
    
    /**
     * Met à jour la caméra (animations, mouvement WASD, mode suivi).
     * À appeler chaque frame.
     */
    public update(deltaTime: number, kitePosition?: THREE.Vector3): void {
        // Animations
        this.updateAnimation(deltaTime);
        
        // Mouvement WASD (mode libre)
        this.updateMovement();
        
        // Mode FOLLOW : suivre le cerf-volant
        if (this.mode === CameraMode.FOLLOW && kitePosition) {
            this.updateFollow(kitePosition, deltaTime);
        }
    }
    
    /**
     * Met à jour le mode FOLLOW pour suivre le cerf-volant.
     */
    private updateFollow(kitePosition: THREE.Vector3, deltaTime: number): void {
        // Interpolation douce de la cible vers la position du cerf-volant
        const followSpeed = 2.0; // Vitesse de suivi
        const lerpFactor = Math.min(followSpeed * deltaTime, 1.0);
        
        this.state.target.lerp(kitePosition, lerpFactor);
        
        // Maintenir une distance et angle constants
        this.updateCameraPosition();
    }
    
    /**
     * Fonction d'easing pour les animations.
     */
    private easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    /**
     * Gère les événements souris pour le contrôle de la caméra.
     */
    public handleMouseDown(event: MouseEvent): void {
        this.isMouseDown = true;
        this.lastMousePosition = { x: event.clientX, y: event.clientY };
        
        // Déterminer quel bouton est pressé
        this.mouseButtons.left = (event.button === 0);
        this.mouseButtons.middle = (event.button === 1);
        this.mouseButtons.right = (event.button === 2);
        
        console.log(`🖱️ MouseDown - Button: ${event.button}, Mode: ${this.mode}, Position: (${event.clientX}, ${event.clientY})`);
        
        // Changer le curseur pendant le drag
        if (this.canvas) {
            this.canvas.style.cursor = 'grabbing';
        }
    }
    
    /**
     * Gère les événements de mouvement de souris.
     */
    public handleMouseMove(event: MouseEvent): void {
        if (!this.isMouseDown) return;
        
        const deltaX = event.clientX - this.lastMousePosition.x;
        const deltaY = event.clientY - this.lastMousePosition.y;
        
        // Log seulement si mouvement significatif
        if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
            console.log(`🖱️ MouseMove - Delta: (${deltaX.toFixed(0)}, ${deltaY.toFixed(0)}), Mode: ${this.mode}, Buttons: L${this.mouseButtons.left} M${this.mouseButtons.middle} R${this.mouseButtons.right}`);
        }
        
        this.lastMousePosition = { x: event.clientX, y: event.clientY };
        
        if (this.mode === CameraMode.ORBIT) {
            this.handleOrbit(deltaX, deltaY);
        } else if (this.mode === CameraMode.FREE) {
            this.handleFreeRotate(deltaX, deltaY);
        }
    }
    
    /**
     * Gère les événements de relâchement de souris.
     */
    public handleMouseUp(): void {
        this.isMouseDown = false;
        this.mouseButtons.left = false;
        this.mouseButtons.middle = false;
        this.mouseButtons.right = false;
        
        // Restaurer le curseur
        if (this.canvas) {
            this.canvas.style.cursor = 'grab';
        }
    }
    
    /**
     * Gère la molette de souris pour le zoom.
     */
    public handleWheel(event: WheelEvent): void {
        event.preventDefault();
        
        const zoomDelta = event.deltaY > 0 ? 1.1 : 0.9;
        this.state.distance = Math.max(
            this.config.minDistance,
            Math.min(this.config.maxDistance, this.state.distance * zoomDelta)
        );
        
        this.updateCameraPosition();
    }
    
    /**
     * Contrôle orbital (rotation autour du point cible).
     */
    private handleOrbit(deltaX: number, deltaY: number): void {
        if (this.mouseButtons.left) {
            // Rotation
            this.state.azimuth -= deltaX * 0.01 * this.config.rotateSpeed;
            this.state.elevation = Math.max(
                -Math.PI / 2 + 0.1,
                Math.min(Math.PI / 2 - 0.1, this.state.elevation - deltaY * 0.01 * this.config.rotateSpeed)
            );
        } else if (this.mouseButtons.middle || this.mouseButtons.right) {
            // Pan - Optimisé pour performance et fluidité
            const panVector = new THREE.Vector3();
            const right = new THREE.Vector3().crossVectors(
                new THREE.Vector3().subVectors(this.camera.position, this.state.target).normalize(),
                this.camera.up
            ).normalize();

            const up = this.camera.up.clone();

            // Vitesse de pan indépendante de la distance pour fluidité constante
            // Multiplicateur augmenté pour compenser la lenteur précédente
            const panMultiplier = 0.05 * this.config.panSpeed;

            panVector.addScaledVector(right, -deltaX * panMultiplier);
            panVector.addScaledVector(up, deltaY * panMultiplier);

            this.state.target.add(panVector);
        }

        this.updateCameraPosition();
    }
    
    /**
     * Contrôle libre (première personne) - Rotation avec souris.
     */
    private handleFreeRotate(deltaX: number, deltaY: number): void {
        if (this.mouseButtons.left) {
            // Rotation libre de la vue
            this.state.azimuth -= deltaX * 0.005 * this.config.rotateSpeed;
            this.state.elevation = Math.max(
                -Math.PI / 2 + 0.1,
                Math.min(Math.PI / 2 - 0.1, this.state.elevation - deltaY * 0.005 * this.config.rotateSpeed)
            );
            
            // En mode libre, on garde la distance fixe
            this.updateCameraPosition();
        } else if (this.mouseButtons.middle || this.mouseButtons.right) {
            // Pan en mode libre - Même vitesse que mode orbite pour cohérence
            const panVector = new THREE.Vector3();
            const right = new THREE.Vector3().crossVectors(
                new THREE.Vector3().subVectors(this.camera.position, this.state.target).normalize(),
                this.camera.up
            ).normalize();

            const up = this.camera.up.clone();

            // Utiliser la même formule optimisée que le mode orbite
            const panMultiplier = 0.05 * this.config.panSpeed;

            panVector.addScaledVector(right, -deltaX * panMultiplier);
            panVector.addScaledVector(up, deltaY * panMultiplier);

            this.state.target.add(panVector);
            this.updateCameraPosition();
        }
    }
    
    /**
     * Met à jour le déplacement clavier (mode libre).
     */
    public updateMovement(): void {
        if (this.mode !== CameraMode.FREE) return;

        const forward = new THREE.Vector3()
            .subVectors(this.state.target, this.camera.position)
            .normalize();

        const right = new THREE.Vector3()
            .crossVectors(forward, this.camera.up)
            .normalize();

        const moveVector = new THREE.Vector3();
        const speed = this.keyStates['Shift'] ? this.moveSpeed * this.fastMoveMultiplier : this.moveSpeed;

        // Contrôles de déplacement (ZQSD/WASD + flèches)
        // Z/W/↑ pour avancer
        if (this.keyStates['z'] || this.keyStates['Z'] || this.keyStates['w'] || this.keyStates['W'] || this.keyStates['ArrowUp']) {
            moveVector.addScaledVector(forward, speed);
        }
        // S/↓ pour reculer
        if (this.keyStates['s'] || this.keyStates['S'] || this.keyStates['ArrowDown']) {
            moveVector.addScaledVector(forward, -speed);
        }
        // Q/A/← pour gauche
        if (this.keyStates['q'] || this.keyStates['Q'] || this.keyStates['a'] || this.keyStates['A'] || this.keyStates['ArrowLeft']) {
            moveVector.addScaledVector(right, -speed);
        }
        // D/→ pour droite
        if (this.keyStates['d'] || this.keyStates['D'] || this.keyStates['ArrowRight']) {
            moveVector.addScaledVector(right, speed);
        }

        // A/E pour monter/descendre
        if (this.keyStates['a'] || this.keyStates['A']) {
            moveVector.y += speed;
        }
        if (this.keyStates['e'] || this.keyStates['E']) {
            moveVector.y -= speed;
        }

        // W/X pour avancer/reculer supplémentaire (en plus de Z/S)
        if (this.keyStates['w'] || this.keyStates['W']) {
            moveVector.addScaledVector(forward, speed * 0.5); // Moitié de la vitesse pour éviter conflit avec Z
        }
        if (this.keyStates['x'] || this.keyStates['X']) {
            moveVector.addScaledVector(forward, -speed * 0.5);
        }

        // Appliquer le mouvement avec damping
        this.velocity.lerp(moveVector, 0.3);

        if (this.velocity.length() > 0.001) {
            this.state.position.add(this.velocity);
            this.state.target.add(this.velocity);
            this.camera.position.copy(this.state.position);
            this.camera.lookAt(this.state.target);
        } else {
            // Damping quand aucune touche n'est pressée
            this.velocity.multiplyScalar(this.dampingFactor);
        }
    }
    
    /**
     * Gère les événements clavier (appui).
     */
    public handleKeyDown(event: KeyboardEvent): void {
        // Enregistrer l'état de la touche
        this.keyStates[event.key] = true;
        
        // Commandes spéciales
        switch (event.key.toLowerCase()) {
            case '1':
                // Mode Orbite
                this.setMode(CameraMode.ORBIT);
                console.log('🎥 Mode caméra: ORBITE (clic gauche = rotation, clic droit/milieu = pan, molette = zoom)');
                break;
            case '2':
                // Mode Libre
                this.setMode(CameraMode.FREE);
                console.log('🎥 Mode caméra: LIBRE (WASD/flèches = déplacement, Q/E = haut/bas, Shift = rapide)');
                break;
            case '3':
                // Mode Follow
                this.setMode(CameraMode.FOLLOW);
                console.log('🎥 Mode caméra: SUIVI (suit automatiquement le cerf-volant)');
                break;
            case 'c':
                // Changer de mode de caméra (cycle)
                this.cycleCameraMode();
                break;
            case 'f':
                // Focus sur le cerf-volant
                this.focusOnKite();
                break;
            case 'r':
                // Reset de la caméra
                this.reset();
                console.log('🎥 Caméra réinitialisée');
                break;
            case 'h':
                // Afficher l'aide des contrôles caméra
                this.showHelp();
                break;
        }
    }
    
    /**
     * Gère les événements clavier (relâchement).
     */
    public handleKeyUp(event: KeyboardEvent): void {
        this.keyStates[event.key] = false;
    }
    
    /**
     * Affiche l'aide des contrôles caméra dans la console.
     */
    private showHelp(): void {
        console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    🎥 CONTRÔLES CAMÉRA                         ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  MODES DE CAMÉRA (touches numériques):                        ║
║  ────────────────────────────────────────────────────          ║
║  [1]  Mode ORBITE   - Rotation autour du cerf-volant          ║
║  [2]  Mode LIBRE    - Déplacement libre (FPS)                 ║
║  [3]  Mode SUIVI    - Suit automatiquement le cerf-volant     ║
║  [C]  Cycle modes   - Passer au mode suivant                  ║
║                                                                ║
║  MODE ORBITE (souris):                                        ║
║  ────────────────────────────────────────────────────          ║
║  Clic gauche + glisser     → Rotation autour de la cible      ║
║  Clic droit + glisser      → Pan (déplacement horizontal)     ║
║  Clic milieu + glisser     → Pan (déplacement horizontal)     ║
║  Molette                   → Zoom avant/arrière               ║
║                                                                ║
║  MODE LIBRE (clavier):                                        ║
║  ────────────────────────────────────────────────────          ║
║  [Z][W][↑] Avancer        [S][↓]  Reculer                     ║
║  [Q][A][←] Gauche         [D][→]  Droite                      ║
║  [A]       Monter          [E]     Descendre                  ║
║  [W]       Avancer suppl.  [X]     Reculer suppl.             ║
║  [Shift]   Déplacement rapide (×3)                            ║
║                                                                ║
║  COMMANDES GÉNÉRALES:                                         ║
║  ────────────────────────────────────────────────────          ║
║  [F]  Focus sur le cerf-volant                                ║
║  [R]  Réinitialiser la position de la caméra                  ║
║  [H]  Afficher cette aide                                     ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
        `);
    }
    
    /**
     * Change le mode de caméra (cycle à travers les modes disponibles).
     */
    private cycleCameraMode(): void {
        const modes = [CameraMode.ORBIT, CameraMode.FREE, CameraMode.FOLLOW];
        const currentIndex = modes.indexOf(this.mode);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        this.setMode(nextMode);
        
        const modeNames = {
            [CameraMode.ORBIT]: 'ORBITE (clic gauche = rotation, molette = zoom)',
            [CameraMode.FREE]: 'LIBRE (WASD = déplacement, Q/E = haut/bas)',
            [CameraMode.FOLLOW]: 'SUIVI (suit le cerf-volant)',
        };
        
        console.log(`🎥 Mode caméra: ${modeNames[nextMode]}`);
    }
    
    /**
     * Focus sur le cerf-volant.
     */
    public focusOnKite(targetPosition?: THREE.Vector3): void {
        if (targetPosition) {
            this.animateTo({
                target: targetPosition.clone(),
                distance: 15,
                azimuth: 0,
                elevation: Math.PI / 6
            });
        }
    }
    
    /**
     * Reset de la caméra à la position initiale.
     */
    public reset(): void {
        const initialPosition = new THREE.Vector3(
            this.config.position.x,
            this.config.position.y,
            this.config.position.z
        );
        
        const direction = new THREE.Vector3().subVectors(initialPosition, this.target).normalize();
        const azimuth = Math.atan2(direction.x, direction.z);
        const elevation = Math.asin(Math.max(-1, Math.min(1, direction.y)));
        const distance = initialPosition.distanceTo(this.target);
        
        this.animateTo({
            target: this.target.clone(),
            distance,
            azimuth,
            elevation
        });
    }
    
    /**
     * Définit le mode de caméra.
     */
    public setMode(mode: CameraMode): void {
        this.mode = mode;
        
        // Réinitialiser la vélocité lors du changement de mode
        this.velocity.set(0, 0, 0);
    }
    
    /**
     * Obtient le mode actuel de la caméra.
     */
    public getMode(): CameraMode {
        return this.mode;
    }
    
    /**
     * Définit la cible de la caméra.
     */
    public setTarget(target: THREE.Vector3): void {
        this.state.target.copy(target);
        this.updateCameraPosition();
    }
    
    /**
     * Obtient la position actuelle de la caméra.
     */
    public getPosition(): THREE.Vector3 {
        return this.camera.position.clone();
    }
    
    /**
     * Obtient la cible actuelle de la caméra.
     */
    public getTarget(): THREE.Vector3 {
        return this.state.target.clone();
    }
    
    /**
     * Obtient l'objet THREE.Camera.
     */
    public getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }
    
    /**
     * Obtient l'état actuel de la caméra.
     */
    public getState(): CameraState {
        return { ...this.state };
    }
    
    /**
     * Définit l'état de la caméra.
     */
    public setState(state: Partial<CameraState>): void {
        if (state.position) this.state.position.copy(state.position);
        if (state.target) this.state.target.copy(state.target);
        if (state.distance !== undefined) this.state.distance = state.distance;
        if (state.azimuth !== undefined) this.state.azimuth = state.azimuth;
        if (state.elevation !== undefined) this.state.elevation = state.elevation;
        this.updateCameraPosition();
    }
    
    /**
     * Vérifie si la caméra est en cours d'animation.
     */
    public isCameraAnimating(): boolean {
        return this.isAnimating;
    }
    
    /**
     * Définit la référence au canvas pour gérer le curseur.
     */
    public setCanvas(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
    }
    
    /**
     * Nettoie les ressources.
     */
    public dispose(): void {
        // Rien à nettoyer pour le moment
    }
}
