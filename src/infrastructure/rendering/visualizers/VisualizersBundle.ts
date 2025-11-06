/**
 * Visualiseurs pour lignes, brides et trajectoire.
 * 
 * @module infrastructure/rendering/visualizers
 */

import * as THREE from 'three';
import { Kite } from '../../../domain/kite/Kite';
import { MaterialFactory } from '../materials/MaterialFactory';
import { KitePhysicsState, WindState } from '../../../core/types/PhysicsState';
import { AerodynamicForceCalculator } from '../../../domain/physics/forces/AerodynamicForce';

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
 * ✅ OPTIMISÉ: Réutilise la géométrie au lieu de la recréer à chaque frame
 */
export class TrajectoryVisualizer {
    private line: THREE.Line;
    private points: THREE.Vector3[] = [];
    private maxPoints = 2000;
    private positionAttribute: THREE.BufferAttribute;
    
    constructor() {
        // ✅ Créer un buffer préalloué pour toutes les positions
        const positions = new Float32Array(this.maxPoints * 3);
        this.positionAttribute = new THREE.BufferAttribute(positions, 3);
        this.positionAttribute.setUsage(THREE.DynamicDrawUsage); // Indiquer que le buffer sera mis à jour fréquemment
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', this.positionAttribute);
        geometry.setDrawRange(0, 0); // Initialement, aucun point à dessiner
        
        const material = MaterialFactory.createTrajectoryMaterial();
        this.line = new THREE.Line(geometry, material);
        this.line.frustumCulled = false;
    }
    
    addPoint(point: THREE.Vector3): void {
        this.points.push(point.clone());
        if (this.points.length > this.maxPoints) {
            this.points.shift();
        }
        
        // ✅ Mettre à jour le buffer existant au lieu de recréer la géométrie
        const positions = this.positionAttribute.array as Float32Array;
        for (let i = 0; i < this.points.length; i++) {
            positions[i * 3] = this.points[i].x;
            positions[i * 3 + 1] = this.points[i].y;
            positions[i * 3 + 2] = this.points[i].z;
        }
        
        // Indiquer que le buffer a été modifié
        this.positionAttribute.needsUpdate = true;
        
        // Mettre à jour la plage de dessin pour n'afficher que les points valides
        this.line.geometry.setDrawRange(0, this.points.length);
    }
    
    clear(): void {
        this.points = [];
        // ✅ Mettre à jour la plage de dessin au lieu de recréer
        this.line.geometry.setDrawRange(0, 0);
    }
    
    getObject(): THREE.Line {
        return this.line;
    }
    
    dispose(): void {
        this.line.geometry.dispose();
        (this.line.material as THREE.Material).dispose();
    }
}

/**
 * Visualiseur unifié pour les vecteurs de forces (mode debug standard + mode portance).
 * 
 * Mode détaillé (showAggregatedForces=false) : Forces aérodynamiques par panneau (portance/traînée)
 * Mode agrégé (showAggregatedForces=true) : Forces totales (aéro, gravité, lignes, total, couple)
 */
export class PanelForceVisualizer {
    private group: THREE.Group;
    
    // Forces détaillées par panneau (mode portance)
    private liftArrows: THREE.ArrowHelper[] = [];
    private dragArrows: THREE.ArrowHelper[] = [];
    
    // Forces agrégées (mode standard)
    private aeroArrow?: THREE.ArrowHelper;        // Aéro total (vert)
    private linesArrow?: THREE.ArrowHelper;       // Lignes total (cyan)
    private linesLeftArrow?: THREE.ArrowHelper;   // Ligne gauche (rouge)
    private linesRightArrow?: THREE.ArrowHelper;  // Ligne droite (bleu clair)
    private totalArrow?: THREE.ArrowHelper;       // Total (jaune)
    private torqueArrow?: THREE.ArrowHelper;      // Couple (magenta)
    
    // Commun aux deux modes
    private gravityArrow?: THREE.ArrowHelper;
    private centerOfMassMarker?: THREE.Mesh;
    private initialized = false;
    
    constructor() {
        this.group = new THREE.Group();
        this.group.visible = false; // Invisible par défaut
    }
    
    /**
     * Initialise les flèches pour tous les panneaux ET les forces agrégées.
     */
    private initializeArrows(panelCount: number): void {
        if (this.initialized) return;
        
        const defaultDir = new THREE.Vector3(0, 1, 0);
        const defaultPos = new THREE.Vector3(0, 0, 0);
        
        // ═══════════════════════════════════════════════════════════════════════
        // FORCES DÉTAILLÉES PAR PANNEAU (mode portance)
        // ═══════════════════════════════════════════════════════════════════════
        
        // Créer les flèches de portance (bleues) pour chaque panneau
        for (let i = 0; i < panelCount; i++) {
            const liftArrow = new THREE.ArrowHelper(
                defaultDir.clone(), 
                defaultPos.clone(), 
                1, 
                0x0066ff, // Bleu vif pour portance
                0.4, 
                0.2
            );
            this.liftArrows.push(liftArrow);
            this.group.add(liftArrow);
        }
        
        // Créer les flèches de traînée (rouges) pour chaque panneau  
        for (let i = 0; i < panelCount; i++) {
            const dragArrow = new THREE.ArrowHelper(
                defaultDir.clone(), 
                defaultPos.clone(), 
                1, 
                0xff3333, // Rouge vif pour traînée
                0.3, 
                0.15
            );
            this.dragArrows.push(dragArrow);
            this.group.add(dragArrow);
        }
        
        // ═══════════════════════════════════════════════════════════════════════
        // FORCES AGRÉGÉES (mode standard)
        // ═══════════════════════════════════════════════════════════════════════
        
        this.aeroArrow = new THREE.ArrowHelper(
            defaultDir.clone(), defaultPos.clone(), 1, 0x00ff00, 0.3, 0.15 // Vert
        );
        this.group.add(this.aeroArrow);
        
        this.linesArrow = new THREE.ArrowHelper(
            defaultDir.clone(), defaultPos.clone(), 1, 0x00ffff, 0.3, 0.15 // Cyan
        );
        this.group.add(this.linesArrow);
        
        this.linesLeftArrow = new THREE.ArrowHelper(
            defaultDir.clone(), defaultPos.clone(), 1, 0xff0000, 0.25, 0.12 // Rouge
        );
        this.group.add(this.linesLeftArrow);
        
        this.linesRightArrow = new THREE.ArrowHelper(
            defaultDir.clone(), defaultPos.clone(), 1, 0x4444ff, 0.25, 0.12 // Bleu clair
        );
        this.group.add(this.linesRightArrow);
        
        this.totalArrow = new THREE.ArrowHelper(
            defaultDir.clone(), defaultPos.clone(), 1, 0xffff00, 0.4, 0.2 // Jaune (grosse)
        );
        this.group.add(this.totalArrow);
        
        this.torqueArrow = new THREE.ArrowHelper(
            defaultDir.clone(), defaultPos.clone(), 1, 0xff00ff, 0.35, 0.18 // Magenta
        );
        this.group.add(this.torqueArrow);
        
        // ═══════════════════════════════════════════════════════════════════════
        // COMMUN AUX DEUX MODES
        // ═══════════════════════════════════════════════════════════════════════
        
        // Créer la flèche de gravité (jaune en mode portance, bleu en mode standard)
        this.gravityArrow = new THREE.ArrowHelper(
            defaultDir.clone(), 
            defaultPos.clone(), 
            1, 
            0xffff00, // Couleur par défaut (sera mise à jour selon le mode)
            0.4, 
            0.2
        );
        this.group.add(this.gravityArrow);
        
        // Créer le marqueur du centre de masse (sphère orange)
        const sphereGeometry = new THREE.SphereGeometry(0.05, 16, 16); // 5cm de rayon
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0xffa500, // Orange
            opacity: 0.8,
            transparent: true
        });
        this.centerOfMassMarker = new THREE.Mesh(sphereGeometry, sphereMaterial);
        this.group.add(this.centerOfMassMarker);
        
        this.initialized = true;
    }
    
    /**
     * Met à jour les vecteurs de forces.
     * 
     * MODE DÉTAILLÉ (showAggregatedForces=false) : Forces par panneau (portance/traînée)
     * MODE AGRÉGÉ (showAggregatedForces=true) : Forces totales (aéro, gravité, lignes, total, couple)
     * 
     * @param kite - Le cerf-volant
     * @param state - État physique du cerf-volant
     * @param panelForces - Forces par panneau (optionnel, pour mode détaillé)
     * @param forces - Forces agrégées (optionnel, pour mode agrégé)
     * @param centerOfMass - Position du centre de masse
     * @param showAggregatedForces - true = mode agrégé, false = mode détaillé par panneau
     */
    updateForces(
        kite: Kite,
        state: KitePhysicsState,
        options: {
            panelForces?: Array<{ lift: THREE.Vector3; drag: THREE.Vector3 }>;
            forces?: {
                aerodynamic?: THREE.Vector3;
                gravity?: THREE.Vector3;
                lines?: THREE.Vector3;
                linesLeft?: THREE.Vector3;
                linesRight?: THREE.Vector3;
                total?: THREE.Vector3;
                torque?: THREE.Vector3;
            };
            centerOfMass?: THREE.Vector3;
            showAggregatedForces?: boolean;
        }
    ): void {
        const panelCount = kite.getPanelCount();
        const showAggregated = options.showAggregatedForces ?? false;
        
        // Initialiser si nécessaire
        if (!this.initialized) {
            this.initializeArrows(panelCount);
            console.log(`🪁 [PanelForceVisualizer] Initialisé avec ${panelCount} panneaux`);
        }
        
        const scale = showAggregated ? 1.0 : 0.5; // Mode agrégé : 1N=1m, mode détaillé : 1N=0.5m
        const torqueScale = 3.0; // 1Nm = 3m pour couple
        const minForce = showAggregated ? 0.01 : 0.001; // Seuil plus bas en mode détaillé
        
        // ═══════════════════════════════════════════════════════════════════════
        // MODE DÉTAILLÉ : Forces par panneau (portance/traînée)
        // ═══════════════════════════════════════════════════════════════════════
        
        if (!showAggregated && options.panelForces) {
            let totalLiftMag = 0;
            let totalDragMag = 0;
            
            // Afficher forces par panneau
            for (let i = 0; i < panelCount && i < this.liftArrows.length && i < options.panelForces.length; i++) {
                const panelCentroid = kite.getGlobalPanelCentroid(i);
                const { lift, drag } = options.panelForces[i];
                
                // Flèche de portance (bleue)
                const liftMagnitude = lift.length();
                totalLiftMag += liftMagnitude;
                
                if (liftMagnitude > minForce) {
                    this.liftArrows[i].setDirection(lift.clone().normalize());
                    this.liftArrows[i].setLength(liftMagnitude * scale);
                    this.liftArrows[i].position.copy(panelCentroid);
                    this.liftArrows[i].visible = true;
                } else {
                    this.liftArrows[i].visible = false;
                }
                
                // Flèche de traînée (rouge)
                const dragMagnitude = drag.length();
                totalDragMag += dragMagnitude;
                
                if (dragMagnitude > minForce) {
                    this.dragArrows[i].setDirection(drag.clone().normalize());
                    this.dragArrows[i].setLength(dragMagnitude * scale);
                    this.dragArrows[i].position.copy(panelCentroid);
                    this.dragArrows[i].visible = true;
                } else {
                    this.dragArrows[i].visible = false;
                }
            }
            
            // Masquer les flèches agrégées
            if (this.aeroArrow) this.aeroArrow.visible = false;
            if (this.linesArrow) this.linesArrow.visible = false;
            if (this.linesLeftArrow) this.linesLeftArrow.visible = false;
            if (this.linesRightArrow) this.linesRightArrow.visible = false;
            if (this.totalArrow) this.totalArrow.visible = false;
            if (this.torqueArrow) this.torqueArrow.visible = false;
            
            // Gravité jaune au centre de masse
            if (this.gravityArrow && options.forces?.gravity) {
                this.gravityArrow.setColor(0xffff00); // Jaune en mode portance
                const gravityMagnitude = options.forces.gravity.length();
                if (gravityMagnitude > minForce) {
                    this.gravityArrow.setDirection(options.forces.gravity.clone().normalize());
                    this.gravityArrow.setLength(gravityMagnitude * scale);
                    this.gravityArrow.position.copy(options.centerOfMass ?? state.position);
                    this.gravityArrow.visible = true;
                } else {
                    this.gravityArrow.visible = false;
                }
            }
        }
        
        // ═══════════════════════════════════════════════════════════════════════
        // MODE AGRÉGÉ : Forces totales (aéro, gravité, lignes, total, couple)
        // ═══════════════════════════════════════════════════════════════════════
        
        if (showAggregated && options.forces) {
            // Masquer les flèches par panneau
            this.liftArrows.forEach(arrow => arrow.visible = false);
            this.dragArrows.forEach(arrow => arrow.visible = false);
            
            const position = state.position;
            
            // Force aérodynamique totale (VERT)
            if (this.aeroArrow && options.forces.aerodynamic && options.forces.aerodynamic.length() > minForce) {
                this.aeroArrow.setDirection(options.forces.aerodynamic.clone().normalize());
                this.aeroArrow.setLength(options.forces.aerodynamic.length() * scale);
                this.aeroArrow.position.copy(position);
                this.aeroArrow.visible = true;
            } else if (this.aeroArrow) {
                this.aeroArrow.visible = false;
            }
            
            // Force de gravité (BLEU)
            if (this.gravityArrow && options.forces.gravity && options.forces.gravity.length() > minForce) {
                this.gravityArrow.setColor(0x0000ff); // Bleu en mode standard
                this.gravityArrow.setDirection(options.forces.gravity.clone().normalize());
                this.gravityArrow.setLength(options.forces.gravity.length() * scale);
                this.gravityArrow.position.copy(position);
                this.gravityArrow.visible = true;
            } else if (this.gravityArrow) {
                this.gravityArrow.visible = false;
            }
            
            // Force des lignes totale (CYAN)
            if (this.linesArrow && options.forces.lines && options.forces.lines.length() > minForce) {
                this.linesArrow.setDirection(options.forces.lines.clone().normalize());
                this.linesArrow.setLength(options.forces.lines.length() * scale);
                this.linesArrow.position.copy(position);
                this.linesArrow.visible = true;
            } else if (this.linesArrow) {
                this.linesArrow.visible = false;
            }
            
            // Force ligne GAUCHE (ROUGE)
            if (this.linesLeftArrow && options.forces.linesLeft && options.forces.linesLeft.length() > minForce) {
                this.linesLeftArrow.setDirection(options.forces.linesLeft.clone().normalize());
                this.linesLeftArrow.setLength(options.forces.linesLeft.length() * scale);
                this.linesLeftArrow.position.copy(position);
                this.linesLeftArrow.visible = true;
            } else if (this.linesLeftArrow) {
                this.linesLeftArrow.visible = false;
            }
            
            // Force ligne DROITE (BLEU CLAIR)
            if (this.linesRightArrow && options.forces.linesRight && options.forces.linesRight.length() > minForce) {
                this.linesRightArrow.setDirection(options.forces.linesRight.clone().normalize());
                this.linesRightArrow.setLength(options.forces.linesRight.length() * scale);
                this.linesRightArrow.position.copy(position);
                this.linesRightArrow.visible = true;
            } else if (this.linesRightArrow) {
                this.linesRightArrow.visible = false;
            }
            
            // Force totale (JAUNE - grosse)
            if (this.totalArrow && options.forces.total && options.forces.total.length() > minForce) {
                this.totalArrow.setDirection(options.forces.total.clone().normalize());
                this.totalArrow.setLength(options.forces.total.length() * scale);
                this.totalArrow.position.copy(position);
                this.totalArrow.visible = true;
            } else if (this.totalArrow) {
                this.totalArrow.visible = false;
            }
            
            // Couple/Torque (MAGENTA - visualisé comme axe de rotation)
            if (this.torqueArrow && options.forces.torque && options.forces.torque.length() > minForce) {
                this.torqueArrow.setDirection(options.forces.torque.clone().normalize());
                this.torqueArrow.setLength(options.forces.torque.length() * torqueScale);
                this.torqueArrow.position.copy(position);
                this.torqueArrow.visible = true;
            } else if (this.torqueArrow) {
                this.torqueArrow.visible = false;
            }
        }
        
        // ═══════════════════════════════════════════════════════════════════════
        // COMMUN : Centre de masse
        // ═══════════════════════════════════════════════════════════════════════
        
        if (this.centerOfMassMarker && options.centerOfMass) {
            this.centerOfMassMarker.position.copy(options.centerOfMass);
            this.centerOfMassMarker.visible = true;
        } else if (this.centerOfMassMarker) {
            this.centerOfMassMarker.visible = false;
        }
    }
    
    /**
     * @deprecated Utiliser updateForces() avec showAggregatedForces=false
     */
    updatePanelForces(
        kite: Kite,
        state: KitePhysicsState,
        panelForces: Array<{ lift: THREE.Vector3; drag: THREE.Vector3 }>,
        gravityForce: THREE.Vector3
    ): void {
        const centerOfMass = kite.getCenterOfMass();
        this.updateForces(kite, state, {
            panelForces,
            forces: { gravity: gravityForce },
            centerOfMass,
            showAggregatedForces: false
        });
    }
    
    getObject(): THREE.Group {
        return this.group;
    }
    
    setVisible(visible: boolean): void {
        this.group.visible = visible;
    }
    
    dispose(): void {
        this.liftArrows.forEach(arrow => {
            arrow.line.geometry.dispose();
            (arrow.line.material as THREE.Material).dispose();
            arrow.cone.geometry.dispose();
            (arrow.cone.material as THREE.Material).dispose();
        });
        
        this.dragArrows.forEach(arrow => {
            arrow.line.geometry.dispose();
            (arrow.line.material as THREE.Material).dispose();
            arrow.cone.geometry.dispose();
            (arrow.cone.material as THREE.Material).dispose();
        });
        
        // Nettoyer les flèches agrégées
        const aggregatedArrows = [
            this.aeroArrow, this.gravityArrow, this.linesArrow,
            this.linesLeftArrow, this.linesRightArrow, this.totalArrow, this.torqueArrow
        ];
        
        aggregatedArrows.forEach(arrow => {
            if (arrow) {
                arrow.line.geometry.dispose();
                (arrow.line.material as THREE.Material).dispose();
                arrow.cone.geometry.dispose();
                (arrow.cone.material as THREE.Material).dispose();
            }
        });
        
        // Nettoyer le marqueur du centre de masse
        if (this.centerOfMassMarker) {
            this.centerOfMassMarker.geometry.dispose();
            (this.centerOfMassMarker.material as THREE.Material).dispose();
        }
    }
}

/**
 * Visualiseur de numéros de panneaux sur l'extrados du cerf-volant.
 * Les numéros sont affichés comme des autocollants fixes parallèles aux faces.
 * ✅ OPTIMISÉ: Cache les textures pour éviter de les recréer à chaque frame
 */
export class PanelNumbersVisualizer {
    private group: THREE.Group;
    private decals: THREE.Mesh[] = [];
    private textureCache: Map<number, THREE.CanvasTexture> = new Map();
    
    constructor() {
        this.group = new THREE.Group();
    }
    
    /**
     * Crée une texture de numéro de panneau.
     * ✅ OPTIMISÉ: Cache les textures pour réutilisation
     */
    private createNumberTexture(number: number, color: string = '#ffff00'): THREE.CanvasTexture {
        // ✅ Vérifier si la texture existe déjà dans le cache
        if (this.textureCache.has(number)) {
            return this.textureCache.get(number)!;
        }
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        
        // Taille du canvas
        canvas.width = 128;
        canvas.height = 128;
        
        // Numéro uniquement (sans fond ni bordure)
        context.font = 'Bold 64px Arial';
        context.fillStyle = color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(number.toString(), 64, 64);
        
        // Créer texture
        const texture = new THREE.CanvasTexture(canvas);
        
        // ✅ Stocker dans le cache
        this.textureCache.set(number, texture);
        
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
            // ✅ Les normales pointent vers l'INTRADOS (Z+, face qui reçoit le vent)
            // Pour afficher sur l'EXTRADOS (Z-, face arrière), on soustrait la normale
            const offset = 0.01; // 1cm au-dessus de la surface pour éviter le z-fighting
            const decalPosition = localCentroid.clone().sub(
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
            // ✅ Ne pas disposer les textures du cache ici, elles seront disposées à la fin
            // if ((decal.material as THREE.MeshBasicMaterial).map) {
            //     (decal.material as THREE.MeshBasicMaterial).map!.dispose();
            // }
            (decal.material as THREE.Material).dispose();
        });
        this.decals = [];
        
        // ✅ Disposer toutes les textures du cache
        this.textureCache.forEach(texture => texture.dispose());
        this.textureCache.clear();
    }
}

/**
 * Visualiseur des normales des panneaux.
 * Affiche une flèche perpendiculaire à chaque surface pour visualiser son orientation.
 */
export class PanelNormalsVisualizer {
    private group: THREE.Group;
    private arrows: THREE.ArrowHelper[] = [];
    
    constructor() {
        this.group = new THREE.Group();
    }
    
    /**
     * Met à jour les normales des panneaux.
     */
    update(kite: Kite, state: KitePhysicsState): void {
        const panelCount = kite.geometry.getPanelCount();
        
        // Synchroniser la position et l'orientation du groupe avec le kite
        this.group.position.copy(state.position);
        this.group.quaternion.copy(state.orientation);
        
        // Créer ou mettre à jour les flèches de normales
        for (let i = 0; i < panelCount; i++) {
            // Calculer le centroïde et la normale en coordonnées locales
            const localCentroid = kite.geometry.getPanelCentroid(i);
            const localNormal = kite.geometry.getPanelNormal(i);
            
            // Créer ou réutiliser la flèche
            if (i >= this.arrows.length) {
                // Créer une nouvelle flèche
                // Couleur cyan pour les normales
                const arrow = new THREE.ArrowHelper(
                    localNormal,
                    localCentroid,
                    0.5, // Longueur de 50cm
                    0x00ffff, // Cyan
                    0.1, // Longueur de la tête
                    0.08  // Largeur de la tête
                );
                this.arrows.push(arrow);
                this.group.add(arrow);
            } else {
                // Mettre à jour la flèche existante
                const arrow = this.arrows[i];
                arrow.position.copy(localCentroid);
                arrow.setDirection(localNormal);
                arrow.setLength(0.5, 0.1, 0.08);
            }
        }
        
        // Supprimer les flèches en trop
        while (this.arrows.length > panelCount) {
            const arrow = this.arrows.pop()!;
            this.group.remove(arrow);
            arrow.dispose();
        }
    }
    
    getObject3D(): THREE.Group {
        return this.group;
    }
    
    dispose(): void {
        this.arrows.forEach(arrow => {
            arrow.dispose();
        });
        this.arrows = [];
    }
}

/**
 * Visualiseur de labels pour les points structurels du cerf-volant.
 * ✅ OPTIMISÉ: Réutilise les sprites existants au lieu de les recréer à chaque frame
 */
export class GeometryLabelsVisualizer {
    private group: THREE.Group;
    private sprites: Map<string, THREE.Sprite> = new Map();
    private textureCache: Map<string, THREE.CanvasTexture> = new Map();
    
    constructor() {
        this.group = new THREE.Group();
    }
    
    /**
     * Crée un sprite de texte pour un label.
     * ✅ OPTIMISÉ: Cache les textures pour réutilisation
     */
    private createTextSprite(text: string, color: string = '#ffffff'): THREE.Sprite {
        // ✅ Réutiliser la texture si elle existe
        let texture = this.textureCache.get(text);
        
        if (!texture) {
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
            
            // Créer texture et la mettre en cache
            texture = new THREE.CanvasTexture(canvas);
            this.textureCache.set(text, texture);
        }
        
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(0.3, 0.075, 1); // Échelle du sprite
        
        return sprite;
    }
    
    /**
     * Met à jour les labels avec les points de la géométrie et les treuils.
     * ✅ OPTIMISÉ: Réutilise les sprites existants
     */
    update(kite: Kite, controlStation?: ControlStationVisualizer): void {
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

            // ✅ Réutiliser le sprite existant ou en créer un nouveau
            let sprite = this.sprites.get(pointName);
            if (!sprite) {
                sprite = this.createTextSprite(pointName, '#00ffff');
                this.sprites.set(pointName, sprite);
                this.group.add(sprite);
            }
            
            // Mettre à jour la position
            sprite.position.copy(worldPoint);
        });

        // Ajouter les labels des treuils si la station est fournie
        if (controlStation) {
            const winchPositions = controlStation.getWinchPositions();

            // Label treuil gauche
            let leftWinchSprite = this.sprites.get('TREUIL_GAUCHE');
            if (!leftWinchSprite) {
                leftWinchSprite = this.createTextSprite('TREUIL_GAUCHE', '#ff00ff');
                this.sprites.set('TREUIL_GAUCHE', leftWinchSprite);
                this.group.add(leftWinchSprite);
            }
            leftWinchSprite.position.copy(winchPositions.left).add(new THREE.Vector3(0, 0.2, 0));

            // Label treuil droit
            let rightWinchSprite = this.sprites.get('TREUIL_DROIT');
            if (!rightWinchSprite) {
                rightWinchSprite = this.createTextSprite('TREUIL_DROIT', '#ff00ff');
                this.sprites.set('TREUIL_DROIT', rightWinchSprite);
                this.group.add(rightWinchSprite);
            }
            rightWinchSprite.position.copy(winchPositions.right).add(new THREE.Vector3(0, 0.2, 0));
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
            this.group.remove(sprite);
            // ✅ Ne pas disposer les textures du cache ici
            // if (sprite.material.map) {
            //     sprite.material.map.dispose();
            // }
            sprite.material.dispose();
        });
        this.sprites.clear();
        
        // ✅ Disposer toutes les textures du cache
        this.textureCache.forEach(texture => texture.dispose());
        this.textureCache.clear();
    }
}
