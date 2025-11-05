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
 */
export class DebugVisualizer {
    private arrows: THREE.ArrowHelper[] = [];
    private group: THREE.Group;
    
    constructor() {
        this.group = new THREE.Group();
        this.group.visible = true; // Visible par défaut
        console.log('✨ DebugVisualizer créé - group.visible:', this.group.visible);
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
        // Nettoyer anciennes flèches
        this.arrows.forEach(arrow => this.group.remove(arrow));
        this.arrows = [];
        
        const scale = 1.0; // 1N = 1m (augmenté pour meilleure visibilité)
        const torqueScale = 3.0; // 1Nm = 3m pour couple
        
        // Debug: log des forces reçues et de la position
        console.log('🔍 Debug Forces:', {
            position: `(${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`,
            aero: forces.aerodynamic?.length().toFixed(2),
            gravity: forces.gravity?.length().toFixed(2),
            lines: forces.lines?.length().toFixed(2),
            linesLeft: forces.linesLeft?.length().toFixed(2),
            linesRight: forces.linesRight?.length().toFixed(2),
            total: forces.total?.length().toFixed(2),
            torque: forces.torque?.length().toFixed(2),
            groupVisible: this.group.visible,
        });
        
        // Force aérodynamique (VERT)
        if (forces.aerodynamic && forces.aerodynamic.length() > 0.01) {
            const arrow = new THREE.ArrowHelper(
                forces.aerodynamic.clone().normalize(),
                position,
                forces.aerodynamic.length() * scale,
                0x00ff00, // Vert
                0.3, 0.15
            );
            this.arrows.push(arrow);
            this.group.add(arrow);
            console.log(`✅ Flèche AERO créée: longueur=${(forces.aerodynamic.length() * scale).toFixed(2)}m, pos=(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`);
        }
        
        // Force de gravité (BLEU)
        if (forces.gravity && forces.gravity.length() > 0.01) {
            const arrow = new THREE.ArrowHelper(
                forces.gravity.clone().normalize(),
                position,
                forces.gravity.length() * scale,
                0x0000ff, // Bleu
                0.3, 0.15
            );
            this.arrows.push(arrow);
            this.group.add(arrow);
        }
        
        // Force des lignes totale (CYAN)
        if (forces.lines && forces.lines.length() > 0.01) {
            const arrow = new THREE.ArrowHelper(
                forces.lines.clone().normalize(),
                position,
                forces.lines.length() * scale,
                0x00ffff, // Cyan
                0.3, 0.15
            );
            this.arrows.push(arrow);
            this.group.add(arrow);
        }
        
        // Force ligne GAUCHE (ROUGE)
        if (forces.linesLeft && forces.linesLeft.length() > 0.01) {
            const arrow = new THREE.ArrowHelper(
                forces.linesLeft.clone().normalize(),
                position,
                forces.linesLeft.length() * scale,
                0xff0000, // Rouge
                0.25, 0.12
            );
            this.arrows.push(arrow);
            this.group.add(arrow);
        }
        
        // Force ligne DROITE (BLEU CLAIR)
        if (forces.linesRight && forces.linesRight.length() > 0.01) {
            const arrow = new THREE.ArrowHelper(
                forces.linesRight.clone().normalize(),
                position,
                forces.linesRight.length() * scale,
                0x4444ff, // Bleu clair
                0.25, 0.12
            );
            this.arrows.push(arrow);
            this.group.add(arrow);
        }
        
        // Force totale (JAUNE - plus grosse)
        if (forces.total && forces.total.length() > 0.01) {
            const arrow = new THREE.ArrowHelper(
                forces.total.clone().normalize(),
                position,
                forces.total.length() * scale,
                0xffff00, // Jaune
                0.4, 0.2
            );
            this.arrows.push(arrow);
            this.group.add(arrow);
        }
        
        // Couple/Torque (MAGENTA - visualisé comme axe de rotation)
        if (forces.torque && forces.torque.length() > 0.01) {
            const arrow = new THREE.ArrowHelper(
                forces.torque.clone().normalize(),
                position,
                forces.torque.length() * torqueScale,
                0xff00ff, // Magenta
                0.35, 0.18
            );
            this.arrows.push(arrow);
            this.group.add(arrow);
        }
        
        // Log nombre de flèches créées
        console.log(`✅ ${this.arrows.length} flèches de debug créées - group.visible=${this.group.visible}, group.children=${this.group.children.length}`);
    }
    
    getObject(): THREE.Group {
        return this.group;
    }
    
    setVisible(visible: boolean): void {
        this.group.visible = visible;
        console.log(`🔍 DebugVisualizer.setVisible(${visible}) - group.visible=${this.group.visible}, arrows=${this.arrows.length}`);
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
