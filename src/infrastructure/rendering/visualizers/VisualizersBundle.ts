/**
 * Visualiseurs pour lignes, brides et trajectoire.
 * 
 * @module infrastructure/rendering/visualizers
 */

import * as THREE from 'three';
import { Kite } from '../../../domain/kite/Kite';
import { MaterialFactory } from '../materials/MaterialFactory';

// Constantes pour la station de contrôle
const STATION_CONFIG = {
    SIZE: 0.5,
    COLOR: 0x333333,
    WINCH: {
        SIZE: 0.1,
        WIDTH: 0.3,
        OFFSET_X: 0.0,  // Treuils à l'origine Z=0 (station de pilotage)
        HEIGHT: 0.25,
        COLOR: 0x00ffff,
    },
} as const;

/**
 * Visualiseur pour la station de contrôle au sol.
 */
export class ControlStationVisualizer {
    private mesh: THREE.Mesh;
    private edgesHelper: THREE.LineSegments;
    private group: THREE.Group;
    private readonly stationSize = STATION_CONFIG.SIZE;
    
    // Treuils
    private leftWinch: THREE.Mesh;
    private rightWinch: THREE.Mesh;
    
    constructor() {
        this.group = new THREE.Group();
        
        // Créer le cube de la station
        const geometry = new THREE.BoxGeometry(
            this.stationSize,
            this.stationSize,
            this.stationSize
        );
        
        const material = new THREE.MeshLambertMaterial({
            color: STATION_CONFIG.COLOR,
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        // Position du cube : centre à y = TAILLE/2 pour que la base soit à y = 0
        this.mesh.position.set(0, this.stationSize / 2, 0);
        
        // Ajouter des arêtes pour meilleure visibilité
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0xffffff,
            linewidth: 2
        });
        this.edgesHelper = new THREE.LineSegments(edges, lineMaterial);
        this.edgesHelper.position.copy(this.mesh.position);
        
        this.group.add(this.mesh);
        this.group.add(this.edgesHelper);
        
        // Créer les treuils
        this.createWinches();
    }
    
    /**
     * Crée les deux treuils (cubes cyan) sur la station.
     */
    private createWinches(): void {
        const winchGeometry = new THREE.BoxGeometry(
            STATION_CONFIG.WINCH.SIZE,
            STATION_CONFIG.WINCH.SIZE,
            STATION_CONFIG.WINCH.SIZE
        );
        
        const winchMaterial = new THREE.MeshStandardMaterial({
            color: STATION_CONFIG.WINCH.COLOR,
            metalness: 0.9,
            roughness: 0.2,
        });
        
        // Treuil GAUCHE (X+) - Station de pilotage à l'origine
        this.leftWinch = new THREE.Mesh(winchGeometry, winchMaterial);
        this.leftWinch.position.set(
            STATION_CONFIG.WINCH.WIDTH / 2,
            this.stationSize, // Face supérieure
            STATION_CONFIG.WINCH.OFFSET_X
        );
        this.leftWinch.castShadow = true;
        this.leftWinch.name = 'TreuilGauche';
        this.group.add(this.leftWinch);

        // Treuil DROIT (X-) - Station de pilotage à l'origine
        this.rightWinch = new THREE.Mesh(winchGeometry, winchMaterial.clone());
        this.rightWinch.position.set(
            -STATION_CONFIG.WINCH.WIDTH / 2,
            this.stationSize, // Face supérieure
            STATION_CONFIG.WINCH.OFFSET_X
        );
        this.rightWinch.castShadow = true;
        this.rightWinch.name = 'TreuilDroit';
        this.group.add(this.rightWinch);
    }
    
    /**
     * Retourne l'objet 3D de la station.
     */
    getObject3D(): THREE.Group {
        return this.group;
    }
    
    /**
     * Affiche/Masque la station.
     */
    setVisible(visible: boolean): void {
        this.group.visible = visible;
    }
    
    /**
     * Retourne la position de la station (origine pour les lignes).
     */
    getPosition(): THREE.Vector3 {
        return new THREE.Vector3(0, 0, 0);
    }
    
    /**
     * Retourne les positions globales des treuils.
     */
    getWinchPositions(): { left: THREE.Vector3; right: THREE.Vector3 } {
        const leftPos = new THREE.Vector3();
        const rightPos = new THREE.Vector3();
        
        this.leftWinch.getWorldPosition(leftPos);
        this.rightWinch.getWorldPosition(rightPos);
        
        return {
            left: leftPos,
            right: rightPos,
        };
    }
    
    /**
     * Nettoie les ressources.
     */
    dispose(): void {
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
        this.edgesHelper.geometry.dispose();
        (this.edgesHelper.material as THREE.Material).dispose();
        
        // Nettoyer les treuils
        this.leftWinch.geometry.dispose();
        (this.leftWinch.material as THREE.Material).dispose();
        this.rightWinch.geometry.dispose();
        (this.rightWinch.material as THREE.Material).dispose();
    }
}

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
        const leftAttach = kite.getGlobalPointPosition('CONTROLE_GAUCHE') ?? kite.getState().position;
        const rightAttach = kite.getGlobalPointPosition('CONTROLE_DROIT') ?? kite.getState().position;
        
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
        
        // Dispose de l'ancienne géométrie et en créer une nouvelle
        // pour éviter l'erreur "Buffer size too small"
        this.line.geometry.dispose();
        const newGeometry = new THREE.BufferGeometry();
        newGeometry.setFromPoints(this.points);
        this.line.geometry = newGeometry;
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
 * ✅ OPTIMISÉ: Réutilise les flèches existantes au lieu de les recréer à chaque frame
 */
export class DebugVisualizer {
    private arrows: THREE.ArrowHelper[] = [];
    private group: THREE.Group;
    private initialized = false;
    
    constructor() {
        this.group = new THREE.Group();
        this.group.visible = true; // Visible par défaut
    }
    
    /**
     * Initialise les flèches UNE SEULE FOIS (appelé au premier updateForceVectors).
     * ✅ CORRECTION FUITE MÉMOIRE: Créer les objets une seule fois
     */
    private initializeArrows(position: THREE.Vector3): void {
        if (this.initialized) return;
        
        const defaultDir = new THREE.Vector3(1, 0, 0);
        
        // 7 flèches (une pour chaque type de force)
        this.arrows = [
            new THREE.ArrowHelper(defaultDir.clone(), position, 1, 0x00ff00, 0.3, 0.15), // 0: Aéro (VERT)
            new THREE.ArrowHelper(defaultDir.clone(), position, 1, 0x0000ff, 0.3, 0.15), // 1: Gravité (BLEU)
            new THREE.ArrowHelper(defaultDir.clone(), position, 1, 0x00ffff, 0.3, 0.15), // 2: Lignes total (CYAN)
            new THREE.ArrowHelper(defaultDir.clone(), position, 1, 0xff0000, 0.25, 0.12), // 3: Ligne G (ROUGE)
            new THREE.ArrowHelper(defaultDir.clone(), position, 1, 0x4444ff, 0.25, 0.12), // 4: Ligne D (BLEU CLAIR)
            new THREE.ArrowHelper(defaultDir.clone(), position, 1, 0xffff00, 0.4, 0.2),   // 5: Total (JAUNE)
            new THREE.ArrowHelper(defaultDir.clone(), position, 1, 0xff00ff, 0.35, 0.18), // 6: Torque (MAGENTA)
        ];
        
        this.arrows.forEach(arrow => this.group.add(arrow));
        this.initialized = true;
    }
    
    updateForceVectors(
        position: THREE.Vector3,
        forces: {
            aerodynamic?: THREE.Vector3;
            gravity?: THREE.Vector3;
            lines?: THREE.Vector3;
            linesLeft?: THREE.Vector3;
            linesRight?: THREE.Vector3;
            total?: THREE.Vector3;
            torque?: THREE.Vector3;
        }
    ): void {
        // Initialiser les flèches si première fois
        if (!this.initialized) {
            this.initializeArrows(position);
        }
        
        const scale = 1.0; // 1N = 1m
        const torqueScale = 3.0; // 1Nm = 3m pour couple
        const minForce = 0.01; // Force minimale pour afficher
        
        // ✅ OPTIMISATION: Mettre à jour les flèches existantes au lieu de les recréer
        
        // 0: Force aérodynamique (VERT)
        if (forces.aerodynamic && forces.aerodynamic.length() > minForce) {
            this.arrows[0].setDirection(forces.aerodynamic.clone().normalize());
            this.arrows[0].setLength(forces.aerodynamic.length() * scale);
            this.arrows[0].position.copy(position);
            this.arrows[0].visible = true;
        } else {
            this.arrows[0].visible = false;
        }
        
        // 1: Force de gravité (BLEU)
        if (forces.gravity && forces.gravity.length() > minForce) {
            this.arrows[1].setDirection(forces.gravity.clone().normalize());
            this.arrows[1].setLength(forces.gravity.length() * scale);
            this.arrows[1].position.copy(position);
            this.arrows[1].visible = true;
        } else {
            this.arrows[1].visible = false;
        }
        
        // 2: Force des lignes totale (CYAN)
        if (forces.lines && forces.lines.length() > minForce) {
            this.arrows[2].setDirection(forces.lines.clone().normalize());
            this.arrows[2].setLength(forces.lines.length() * scale);
            this.arrows[2].position.copy(position);
            this.arrows[2].visible = true;
        } else {
            this.arrows[2].visible = false;
        }
        
        // 3: Force ligne GAUCHE (ROUGE)
        if (forces.linesLeft && forces.linesLeft.length() > minForce) {
            this.arrows[3].setDirection(forces.linesLeft.clone().normalize());
            this.arrows[3].setLength(forces.linesLeft.length() * scale);
            this.arrows[3].position.copy(position);
            this.arrows[3].visible = true;
        } else {
            this.arrows[3].visible = false;
        }
        
        // 4: Force ligne DROITE (BLEU CLAIR)
        if (forces.linesRight && forces.linesRight.length() > minForce) {
            this.arrows[4].setDirection(forces.linesRight.clone().normalize());
            this.arrows[4].setLength(forces.linesRight.length() * scale);
            this.arrows[4].position.copy(position);
            this.arrows[4].visible = true;
        } else {
            this.arrows[4].visible = false;
        }
        
        // 5: Force totale (JAUNE - plus grosse)
        if (forces.total && forces.total.length() > minForce) {
            this.arrows[5].setDirection(forces.total.clone().normalize());
            this.arrows[5].setLength(forces.total.length() * scale);
            this.arrows[5].position.copy(position);
            this.arrows[5].visible = true;
        } else {
            this.arrows[5].visible = false;
        }
        
        // 6: Couple/Torque (MAGENTA - visualisé comme axe de rotation)
        if (forces.torque && forces.torque.length() > minForce) {
            this.arrows[6].setDirection(forces.torque.clone().normalize());
            this.arrows[6].setLength(forces.torque.length() * torqueScale);
            this.arrows[6].position.copy(position);
            this.arrows[6].visible = true;
        } else {
            this.arrows[6].visible = false;
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

/**
 * Visualiseur de numéros de panneaux sur l'extrados du cerf-volant.
 * Les numéros sont affichés comme des autocollants fixes parallèles aux faces.
 */
export class PanelNumbersVisualizer {
    private group: THREE.Group;
    private decals: THREE.Mesh[] = [];
    
    constructor() {
        this.group = new THREE.Group();
    }
    
    /**
     * Crée une texture de numéro de panneau.
     */
    private createNumberTexture(number: number, color: string = '#ffff00'): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        
        // Taille du canvas
        canvas.width = 128;
        canvas.height = 128;
        
        // Fond semi-transparent rond
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.beginPath();
        context.arc(64, 64, 60, 0, Math.PI * 2);
        context.fill();
        
        // Bordure
        context.strokeStyle = color;
        context.lineWidth = 4;
        context.beginPath();
        context.arc(64, 64, 58, 0, Math.PI * 2);
        context.stroke();
        
        // Numéro
        context.font = 'Bold 64px Arial';
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(number.toString(), 64, 64);
        
        // Créer texture
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }
    
    /**
     * Crée un décal (autocollant) plat avec un numéro de panneau.
     */
    private createNumberDecal(number: number, color: string = '#ffff00'): THREE.Mesh {
        // Créer un plan rectangulaire
        const geometry = new THREE.PlaneGeometry(0.3, 0.3); // 30cm x 30cm
        
        // Matériau avec texture du numéro
        const texture = this.createNumberTexture(number, color);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide, // Visible des deux côtés
            depthTest: true,
            depthWrite: false, // Pour éviter les conflits avec la surface du cerf-volant
        });
        
        const decal = new THREE.Mesh(geometry, material);
        return decal;
    }
    
    /**
     * Met à jour les numéros de panneaux sur l'extrados.
     * Les numéros sont positionnés et orientés pour être parallèles aux faces.
     */
    update(kite: Kite): void {
        const state = kite.getState();
        const panelCount = kite.getPanelCount();
        
        // Si le nombre de panneaux a changé, recréer tous les décals
        if (this.decals.length !== panelCount) {
            // Nettoyer les décals existants
            this.decals.forEach(decal => {
                this.group.remove(decal);
                decal.geometry.dispose();
                (decal.material as THREE.MeshBasicMaterial).map?.dispose();
                (decal.material as THREE.Material).dispose();
            });
            this.decals = [];
            
            // Créer les nouveaux décals
            for (let i = 0; i < panelCount; i++) {
                const decal = this.createNumberDecal(i + 1, '#ffff00');
                this.decals.push(decal);
                this.group.add(decal);
            }
        }
        
        // Mettre à jour la position et l'orientation du groupe pour suivre le cerf-volant
        this.group.position.copy(state.position);
        this.group.quaternion.copy(state.orientation);
        
        // Mettre à jour la position et l'orientation de chaque décal (en coordonnées locales)
        for (let i = 0; i < panelCount; i++) {
            const decal = this.decals[i];
            
            // Calculer le centroïde du panneau en coordonnées locales
            const localCentroid = kite.geometry.getPanelCentroid(i);
            
            // Calculer la normale du panneau en coordonnées locales
            const localNormal = kite.geometry.getPanelNormal(i);
            
            // Positionner le décal au centroïde du panneau (coordonnées locales du kite)
            // Légèrement décalé vers l'extrados (côté normal)
            const offset = 0.01; // 1cm au-dessus de la surface pour éviter le z-fighting
            const decalPosition = localCentroid.clone().add(
                localNormal.clone().multiplyScalar(offset)
            );
            decal.position.copy(decalPosition);
            
            // Orienter le décal comme un autocollant parallèle à la surface du panneau
            // On calcule les vecteurs tangents à la surface pour définir l'orientation
            const points = kite.geometry.getPanelPoints(i);
            
            if (points.length >= 3) {
                // Calculer deux vecteurs tangents à la surface
                const edge1 = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
                const edge2 = new THREE.Vector3().subVectors(points[2], points[0]).normalize();
                
                // Calculer la normale du panneau (produit vectoriel)
                const panelNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
                
                // Créer une base orthonormée sur la surface du panneau
                // On utilise edge1 comme direction "droite" (X local)
                const right = edge1.clone();
                // Calculer la direction "haut" (Y local) perpendiculaire à right et normal
                const up = new THREE.Vector3().crossVectors(panelNormal, right).normalize();
                
                // Construire la matrice de rotation à partir de la base orthonormée
                // Le décal (plan XY) sera aligné avec la surface du panneau
                const matrix = new THREE.Matrix4();
                matrix.makeBasis(right, up, panelNormal);
                
                // Extraire le quaternion de la matrice
                const quaternion = new THREE.Quaternion();
                quaternion.setFromRotationMatrix(matrix);
                
                decal.quaternion.copy(quaternion);
            }
        }
    }
    
    getObject(): THREE.Group {
        return this.group;
    }
    
    setVisible(visible: boolean): void {
        this.group.visible = visible;
    }
    
    dispose(): void {
        this.decals.forEach(decal => {
            decal.geometry.dispose();
            if ((decal.material as THREE.MeshBasicMaterial).map) {
                (decal.material as THREE.MeshBasicMaterial).map!.dispose();
            }
            (decal.material as THREE.Material).dispose();
        });
        this.decals = [];
    }
}

/**
 * Visualiseur de labels pour les points structurels du cerf-volant.
 */
export class GeometryLabelsVisualizer {
    private group: THREE.Group;
    private sprites: Map<string, THREE.Sprite> = new Map();
    
    constructor() {
        this.group = new THREE.Group();
    }
    
    /**
     * Crée un sprite de texte pour un label.
     */
    private createTextSprite(text: string, color: string = '#ffffff'): THREE.Sprite {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        
        // Taille du canvas
        canvas.width = 256;
        canvas.height = 64;
        
        // Style du texte
        context.font = 'Bold 32px Arial';
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Fond semi-transparent
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Texte
        context.fillStyle = color;
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        // Créer texture et sprite
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(0.3, 0.075, 1); // Échelle du sprite
        
        return sprite;
    }
    
    /**
     * Met à jour les labels avec les points de la géométrie et les treuils.
     */
    update(kite: Kite, controlStation?: ControlStationVisualizer): void {
        // Nettoyer les sprites existants
        this.sprites.forEach(sprite => this.group.remove(sprite));
        this.sprites.clear();

        const geometry = kite.geometry;
        const state = kite.getState();

        // Points à labelliser
        const pointsToLabel = [
            'NEZ',
            'BAS_COLONNE',
            'EXTREMITE_AILE_GAUCHE',
            'EXTREMITE_AILE_DROITE',
            'TRAVERSE_GAUCHE',
            'TRAVERSE_DROITE',
            'CENTRE',
            'BASE_STAB_GAUCHE',
            'BASE_STAB_DROIT',
            'STAB_GAUCHE',
            'STAB_DROIT',
            'CONTROLE_GAUCHE',
            'CONTROLE_DROIT',
        ];

        pointsToLabel.forEach(pointName => {
            const localPoint = geometry.getPoint(pointName);
            if (!localPoint) return;

            // Transformer en coordonnées monde
            const worldPoint = localPoint.clone()
                .applyQuaternion(state.orientation)
                .add(state.position);

            // Créer sprite
            const sprite = this.createTextSprite(pointName, '#00ffff');
            sprite.position.copy(worldPoint);

            this.sprites.set(pointName, sprite);
            this.group.add(sprite);
        });

        // Ajouter les labels des treuils si la station est fournie
        if (controlStation) {
            const winchPositions = controlStation.getWinchPositions();

            // Label treuil gauche
            const leftWinchSprite = this.createTextSprite('TREUIL_GAUCHE', '#ff00ff');
            leftWinchSprite.position.copy(winchPositions.left).add(new THREE.Vector3(0, 0.2, 0)); // Légèrement au-dessus
            this.sprites.set('TREUIL_GAUCHE', leftWinchSprite);
            this.group.add(leftWinchSprite);

            // Label treuil droit
            const rightWinchSprite = this.createTextSprite('TREUIL_DROIT', '#ff00ff');
            rightWinchSprite.position.copy(winchPositions.right).add(new THREE.Vector3(0, 0.2, 0)); // Légèrement au-dessus
            this.sprites.set('TREUIL_DROIT', rightWinchSprite);
            this.group.add(rightWinchSprite);
        }
    }
    
    getObject(): THREE.Group {
        return this.group;
    }
    
    setVisible(visible: boolean): void {
        this.group.visible = visible;
    }
    
    dispose(): void {
        this.sprites.forEach(sprite => {
            if (sprite.material.map) {
                sprite.material.map.dispose();
            }
            sprite.material.dispose();
        });
        this.sprites.clear();
    }
}
