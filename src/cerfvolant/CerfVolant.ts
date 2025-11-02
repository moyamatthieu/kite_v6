import * as THREE from 'three';
import { GeometrieCerfVolant, ParametresGeometrie } from './GeometrieCerfVolant';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ForceDetaillee } from '../physique/CalculateurAerodynamique';

/**
 * Représente l'objet 3D du cerf-volant.
 */
// FIX: Changement de l'héritage à la composition pour résoudre les erreurs de type.
// La classe CerfVolant gère maintenant un objet THREE.Group au lieu d'en être un.
export class CerfVolant {
    public objet3D: THREE.Group;
    public geometrie: GeometrieCerfVolant;

    private materiauStructure: THREE.MeshStandardMaterial;
    private materiauToile: THREE.MeshStandardMaterial;
    
    private groupeDebug = new THREE.Group();
    private groupeLabels = new THREE.Group();

    // Vecteurs de forces pour le debug
    private a_forceAero?: THREE.ArrowHelper;
    private a_forceGravite?: THREE.ArrowHelper;
    private a_forceLigneGauche?: THREE.ArrowHelper;
    private a_forceLigneDroite?: THREE.ArrowHelper;
    private a_forceAeroEtGravite?: THREE.ArrowHelper; // Jaune: aéro + gravité
    private a_forceTotale?: THREE.ArrowHelper;

    private a_forcesSurfacesDrag: THREE.ArrowHelper[] = [];
    private a_forcesSurfacesLift: THREE.ArrowHelper[] = [];
    private a_forcesSurfacesNormale: THREE.ArrowHelper[] = [];
    private a_forcesSurfacesVentApparent: THREE.ArrowHelper[] = [];
    private a_forcesSurfacesAeroTotale: THREE.ArrowHelper[] = [];
    
    private forceScale = 0.5; // Échelle visuelle pour les vecteurs de force : 1N = 0.5m

    constructor(geometrie: GeometrieCerfVolant) {
        this.objet3D = new THREE.Group();
        // FIX: La propriété `name` est assignée à l'objet 3D contenu.
        this.objet3D.name = "CerfVolant";
        this.geometrie = geometrie;

        this.materiauStructure = new THREE.MeshStandardMaterial({ color: '#2a2a2a', metalness: 0.8, roughness: 0.4 });
        this.materiauToile = new THREE.MeshStandardMaterial({
            color: '#ff3333',
            opacity: 0.9,
            transparent: true,
            side: THREE.DoubleSide
        });

        this.construireVisuel();
    }

    /**
     * Construit la représentation visuelle (structure et toile) du cerf-volant.
     */
    private construireVisuel(): void {
        // Nettoyer l'ancien visuel
        // FIX: Les méthodes `clear` et `add` sont appelées sur l'objet 3D.
        this.objet3D.clear();
        this.objet3D.add(this.groupeDebug); // Ré-ajouter le groupe de debug
        this.groupeLabels.clear();
        this.objet3D.add(this.groupeLabels);

        // Construire la structure (barres)
        this.geometrie.connexions.forEach(connexion => {
            const point1 = this.geometrie.points.get(connexion[0]);
            const point2 = this.geometrie.points.get(connexion[1]);
            if (point1 && point2) {
                this.ajouterBarre(point1, point2, this.geometrie.diametreStructure);
            }
        });

        // Construire la toile (panneaux) et les labels
        this.geometrie.panneaux.forEach((panneau, index) => {
            const points = panneau.map(nom => this.geometrie.points.get(nom)).filter(p => p) as THREE.Vector3[];
            if (points.length >= 3) {
                this.ajouterPanneau(points);
                this.ajouterLabelPanneau(points, index + 1);
            }
        });
    }

    /**
     * Ajoute un cylindre représentant une barre de la structure.
     */
    private ajouterBarre(p1: THREE.Vector3, p2: THREE.Vector3, diametre: number): void {
        const distance = p1.distanceTo(p2);
        const geometrie = new THREE.CylinderGeometry(diametre / 2, diametre / 2, distance, 8);
        const barre = new THREE.Mesh(geometrie, this.materiauStructure);
        
        const milieu = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        barre.position.copy(milieu);

        const direction = new THREE.Vector3().subVectors(p2, p1).normalize();
        barre.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        
        // FIX: La barre est ajoutée à l'objet 3D.
        this.objet3D.add(barre);
    }
    
    /**
     * Ajoute un panneau de toile triangulé.
     */
    private ajouterPanneau(points: THREE.Vector3[]): void {
        const geometrie = new THREE.BufferGeometry().setFromPoints(points);
        
        if (points.length === 3) {
            geometrie.setIndex([0, 1, 2]);
        } else if (points.length === 4) {
            geometrie.setIndex([0, 2, 3, 0, 1, 2]);
        }
        geometrie.computeVertexNormals();
        
        const panneau = new THREE.Mesh(geometrie, this.materiauToile);
        // FIX: Le panneau est ajouté à l'objet 3D.
        this.objet3D.add(panneau);
    }
    
    /**
     * Ajoute un label "autocollant" sur un panneau de toile.
     */
    private ajouterLabelPanneau(points: THREE.Vector3[], numero: number): void {
        // 1. Calculer le centre et la normale du panneau (triangle)
        const centre = new THREE.Vector3();
        points.forEach(p => centre.add(p));
        centre.divideScalar(points.length);

        const v1 = new THREE.Vector3().subVectors(points[1], points[0]);
        const v2 = new THREE.Vector3().subVectors(points[2], points[0]);
        const normale = new THREE.Vector3().crossVectors(v1, v2).normalize();

        // 2. Créer la texture à partir d'un canvas
        const canvas = document.createElement('canvas');
        const size = 128; // Résolution de la texture
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) return;

        context.font = 'bold 96px Arial';
        context.fillStyle = 'yellow';
        context.strokeStyle = 'black';
        context.lineWidth = 8;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Le décalage en Y est pour un centrage visuel plus agréable
        const yOffset = 5;
        context.strokeText(numero.toString(), size / 2, size / 2 + yOffset);
        context.fillText(numero.toString(), size / 2, size / 2 + yOffset);

        const texture = new THREE.CanvasTexture(canvas);

        // 3. Créer le mesh pour le label
        const labelSize = 0.12; // Taille en mètres
        const geometry = new THREE.PlaneGeometry(labelSize, labelSize);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
        });

        const labelMesh = new THREE.Mesh(geometry, material);

        // 4. Positionner et orienter le label
        // On le décale légèrement le long de la normale pour éviter le "z-fighting"
        labelMesh.position.copy(centre.add(normale.multiplyScalar(0.01)));
        
        // Orienter le label pour qu'il soit plat sur le panneau.
        // Sa face avant (+Z local, où la texture est) doit pointer dans la même direction que la normale (vers l'extérieur).
        // Or, la méthode lookAt() oriente la face arrière (-Z local) vers la cible.
        // On lui donne donc une cible dans la direction OPPOSÉE à la normale pour que la face avant pointe dans la bonne direction.
        const targetPosition = labelMesh.position.clone().sub(normale);
        labelMesh.lookAt(targetPosition);
        
        this.groupeLabels.add(labelMesh);
    }

    /**
     * Met à jour la géométrie du cerf-volant et reconstruit son visuel.
     */
    public mettreAJourGeometrie(nouveauxParametres: Partial<ParametresGeometrie>): void {
        this.geometrie.mettreAJourParametres(nouveauxParametres);
        this.construireVisuel();
        this.mettreAJourDebug();
    }

    /**
     * Réinitialise la position et l'orientation visuelle de l'objet.
     */
    public reinitialiser(position: THREE.Vector3): void {
        // FIX: La position et l'orientation sont appliquées à l'objet 3D.
        this.objet3D.position.copy(position);
        this.objet3D.quaternion.identity();
    }

    public basculerDebug(actif: boolean): void {
        this.groupeDebug.visible = actif;
        if(actif) {
            this.mettreAJourDebug();
            this.creerVecteursForcesDebug();
        }
    }

    private mettreAJourDebug(): void {
        this.groupeDebug.children.filter(c => c instanceof CSS2DObject || c.name === "point_marqueur").forEach(c => this.groupeDebug.remove(c));
        
        const materiauPoint = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        const geometriePoint = new THREE.SphereGeometry(0.02, 8, 8);

        this.geometrie.points.forEach((point, nom) => {
            const marqueur = new THREE.Mesh(geometriePoint, materiauPoint);
            marqueur.position.copy(point);
            marqueur.name = "point_marqueur";
            this.groupeDebug.add(marqueur);
        });

        if (this.groupeDebug.visible) {
            this.creerVecteursForcesSurfacesDebug();
        }
    }

    private creerVecteursForcesDebug(): void {
        const headLength = 0.2;
        const headWidth = 0.1;
        
        if (!this.a_forceLigneGauche) {
            this.a_forceLigneGauche = new THREE.ArrowHelper(new THREE.Vector3(1,0,0), new THREE.Vector3(0,0,0), 1, 0xff00ff, headLength, headWidth); // Magenta
            this.groupeDebug.add(this.a_forceLigneGauche);
        }
        if (!this.a_forceLigneDroite) {
            this.a_forceLigneDroite = new THREE.ArrowHelper(new THREE.Vector3(1,0,0), new THREE.Vector3(0,0,0), 1, 0xff00ff, headLength, headWidth); // Magenta
            this.groupeDebug.add(this.a_forceLigneDroite);
        }
    }

    private creerVecteursForcesSurfacesDebug(): void {
        // Nettoyer les anciens helpers
        this.a_forcesSurfacesDrag.forEach(arrow => this.groupeDebug.remove(arrow));
        this.a_forcesSurfacesDrag = [];
        this.a_forcesSurfacesLift.forEach(arrow => this.groupeDebug.remove(arrow));
        this.a_forcesSurfacesLift = [];
        this.a_forcesSurfacesNormale.forEach(arrow => this.groupeDebug.remove(arrow));
        this.a_forcesSurfacesNormale = [];
        this.a_forcesSurfacesVentApparent.forEach(arrow => this.groupeDebug.remove(arrow));
        this.a_forcesSurfacesVentApparent = [];
        this.a_forcesSurfacesAeroTotale.forEach(arrow => this.groupeDebug.remove(arrow));
        this.a_forcesSurfacesAeroTotale = [];

        const headLength = 0.15;
        const headWidth = 0.08;
        const dragColor = 0xff0000; // Rouge pour la traînée
        const liftColor = 0x00ffff; // Cyan pour la portance
        const normaleColor = 0xffffff; // Blanc pour la normale de surface
        const ventApparentColor = 0x00ff00; // Vert pour le vent apparent
        const aeroTotaleColor = 0xffff00; // Jaune pour la force aéro totale (lift + drag)

        // Créer un helper par panneau
        for (let i = 0; i < this.geometrie.panneaux.length; i++) {
            const dragArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, dragColor, headLength, headWidth);
            dragArrow.visible = false;
            this.a_forcesSurfacesDrag.push(dragArrow);
            this.groupeDebug.add(dragArrow);

            const liftArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, liftColor, headLength, headWidth);
            liftArrow.visible = false;
            this.a_forcesSurfacesLift.push(liftArrow);
            this.groupeDebug.add(liftArrow);

            const normaleArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, normaleColor, headLength, headWidth);
            normaleArrow.visible = false;
            this.a_forcesSurfacesNormale.push(normaleArrow);
            this.groupeDebug.add(normaleArrow);

            const ventApparentArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, ventApparentColor, headLength, headWidth);
            ventApparentArrow.visible = false;
            this.a_forcesSurfacesVentApparent.push(ventApparentArrow);
            this.groupeDebug.add(ventApparentArrow);

            const aeroTotaleArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, aeroTotaleColor, headLength, headWidth);
            aeroTotaleArrow.visible = false;
            this.a_forcesSurfacesAeroTotale.push(aeroTotaleArrow);
            this.groupeDebug.add(aeroTotaleArrow);
        }
    }
    
    public mettreAJourVecteursForces(
        forceAero: THREE.Vector3,
        forceGravite: THREE.Vector3,
        forceLigneGauche: THREE.Vector3,
        forceLigneDroite: THREE.Vector3,
        forceAeroEtGravite: THREE.Vector3,
        forceTotale: THREE.Vector3
    ): void {
        if (!this.groupeDebug.visible) return;

        // FIX: Le quaternion est lu depuis l'objet 3D.
        const inverseQuaternion = this.objet3D.quaternion.clone().invert();

        const updateArrow = (arrow: THREE.ArrowHelper | undefined, force: THREE.Vector3, origin: THREE.Vector3) => {
            if (!arrow) return;
            arrow.position.copy(origin);
            if (force.lengthSq() < 0.001) {
                arrow.visible = false;
                return;
            }
            arrow.visible = true;
            const localDirection = force.clone().applyQuaternion(inverseQuaternion).normalize();
            arrow.setDirection(localDirection);
            arrow.setLength(force.length() * this.forceScale, 0.2, 0.1);
        };

        // const centrePoint = this.geometrie.points.get('CENTRE') || new THREE.Vector3();
        // Vecteurs au centre désactivés
        // updateArrow(this.a_forceAero, forceAero, centrePoint);
        // updateArrow(this.a_forceGravite, forceGravite, centrePoint);
        // updateArrow(this.a_forceAeroEtGravite, forceAeroEtGravite, centrePoint);
        // updateArrow(this.a_forceTotale, forceTotale, centrePoint);

        const ctrlGauchePoint = this.geometrie.points.get('CTRL_GAUCHE') || new THREE.Vector3();
        const ctrlDroitPoint = this.geometrie.points.get('CTRL_DROIT') || new THREE.Vector3();
        updateArrow(this.a_forceLigneGauche, forceLigneGauche, ctrlGauchePoint);
        updateArrow(this.a_forceLigneDroite, forceLigneDroite, ctrlDroitPoint);
    }

    public mettreAJourVecteursForcesSurfaces(forces: ForceDetaillee[]): void {
        if (!this.groupeDebug.visible) return;

        // FIX: Le quaternion est lu depuis l'objet 3D.
        const inverseQuaternion = this.objet3D.quaternion.clone().invert();

        forces.forEach((forceDetaillee, index) => {
            const dragArrow = this.a_forcesSurfacesDrag[index];
            const liftArrow = this.a_forcesSurfacesLift[index];
            const normaleArrow = this.a_forcesSurfacesNormale[index];
            const ventApparentArrow = this.a_forcesSurfacesVentApparent[index];
            const aeroTotaleArrow = this.a_forcesSurfacesAeroTotale[index];
            
            if (!dragArrow || !liftArrow || !normaleArrow || !ventApparentArrow || !aeroTotaleArrow) return;
            
            // Fonction pour mettre à jour une flèche de force (taille proportionnelle à la magnitude)
            const updateForceArrow = (arrow: THREE.ArrowHelper, force: THREE.Vector3) => {
                // Seuil minimal pour afficher les petites forces (0.0001 N² ≈ 0.01 N)
                if (force.lengthSq() < 0.0001) {
                    arrow.visible = false;
                    return;
                }
                arrow.visible = true;
                arrow.position.copy(forceDetaillee.pointApplicationLocal);
                const localDirection = force.clone().applyQuaternion(inverseQuaternion).normalize();
                arrow.setDirection(localDirection);
                // Longueur minimale de 0.1m pour garantir la visibilité
                const longueur = Math.max(force.length() * this.forceScale, 0.1);
                arrow.setLength(longueur, 0.15, 0.08);
            };

            // Fonction pour mettre à jour une flèche de direction (taille fixe)
            const updateDirectionArrow = (arrow: THREE.ArrowHelper, direction: THREE.Vector3, fixedLength: number) => {
                if (direction.lengthSq() < 0.001) {
                    arrow.visible = false;
                    return;
                }
                arrow.visible = true;
                arrow.position.copy(forceDetaillee.pointApplicationLocal);
                const localDirection = direction.clone().applyQuaternion(inverseQuaternion).normalize();
                arrow.setDirection(localDirection);
                arrow.setLength(fixedLength, 0.15, 0.08);
            };

            // Calcul de la force aéro totale pour cette surface (lift + drag)
            const forceAeroTotaleSurface = new THREE.Vector3().addVectors(forceDetaillee.forceLift, forceDetaillee.forceDrag);

            // Mise à jour des flèches
            updateForceArrow(dragArrow, forceDetaillee.forceDrag);
            updateForceArrow(liftArrow, forceDetaillee.forceLift);
            updateForceArrow(aeroTotaleArrow, forceAeroTotaleSurface);
            updateDirectionArrow(normaleArrow, forceDetaillee.normaleSurface, 1.0); // Taille fixe de 1
            updateDirectionArrow(ventApparentArrow, forceDetaillee.ventApparent, 0.5); // Taille fixe de 0.5
        });

        // Masquer les flèches non utilisées si le nombre de forces est inférieur au nombre de flèches
        for (let i = forces.length; i < this.a_forcesSurfacesDrag.length; i++) {
            this.a_forcesSurfacesDrag[i].visible = false;
            this.a_forcesSurfacesLift[i].visible = false;
            this.a_forcesSurfacesNormale[i].visible = false;
            this.a_forcesSurfacesVentApparent[i].visible = false;
            this.a_forcesSurfacesAeroTotale[i].visible = false;
        }
    }
}
