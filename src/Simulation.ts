import * as THREE from 'three';
import { Scene } from './Scene';
import { CerfVolant } from './cerfvolant/CerfVolant';
import { GeometrieCerfVolant } from './cerfvolant/GeometrieCerfVolant';
import { MoteurPhysique } from './physique/MoteurPhysique';
import { StationControle } from './controles/StationControle';
import { ControleurUtilisateur } from './controles/ControleurUtilisateur';
import { InterfaceUtilisateur } from './ui/InterfaceUtilisateur';

/**
 * Classe principale de la simulation.
 * Orchestre tous les modules : Scène 3D, Physique, Contrôles et UI.
 */
export class Simulation {
    private scene: Scene;
    private cerfVolant: CerfVolant;
    private stationControle: StationControle;
    private moteurPhysique: MoteurPhysique;
    private controleurUtilisateur: ControleurUtilisateur;
    private interfaceUtilisateur: InterfaceUtilisateur;
    private horloge: THREE.Clock;
    private lignesControle: [THREE.Line, THREE.Line] | null = null;
    private bridesVisuelles: THREE.Line[] = [];
    private estEnPause = false;

    // Ajouts pour la trajectoire
    private trajectoire!: THREE.Line;
    private trajectoirePoints: THREE.Vector3[] = [];
    private readonly MAX_TRAJECTOIRE_POINTS = 2000;
    private dernierPointTrajectoire: THREE.Vector3 = new THREE.Vector3();

    // Ajout pour le logging
    private logTimer = 0;
    private readonly logInterval = 1.0; // en secondes

    constructor(conteneur: HTMLElement) {
        this.horloge = new THREE.Clock();

        // 1. Initialisation des modules principaux
        this.scene = new Scene(conteneur);
        this.controleurUtilisateur = new ControleurUtilisateur();
        
        // 2. Création des objets de la simulation
        const geometrie = new GeometrieCerfVolant();
        this.cerfVolant = new CerfVolant(geometrie);
        this.stationControle = new StationControle();

        // 3. Initialisation du moteur physique avec une position de départ.
        // La position sera correctement définie par reinitialiser() juste après.
        const positionInitialeTemporaire = new THREE.Vector3(10, 5, 0);
        this.moteurPhysique = new MoteurPhysique(positionInitialeTemporaire);

        // 4. Ajout des objets visuels à la scène
        // FIX: Le cerf-volant est maintenant un conteneur, son objet 3D est dans la propriété `objet3D`.
        this.scene.ajouter(this.cerfVolant.objet3D);
        this.scene.ajouter(this.stationControle.objet3D);
        this.creerLignesVisuelles();
        this.creerBridesVisuelles();
        this.creerTrajectoireVisuelle();


        // 5. Initialisation de l'interface utilisateur et connexion des callbacks
        this.interfaceUtilisateur = new InterfaceUtilisateur(
            () => this.reinitialiser(),
            this.basculerPause.bind(this)
        );
        this.connecterUI();
        
        // 6. Activation du mode debug par défaut
        this.cerfVolant.basculerDebug(true);

        // 7. Placer le cerf-volant dans un état initial stable
        this.reinitialiser(true);

        // 8. Démarrage de la boucle d'animation
        this.boucleAnimation();
    }

    private connecterUI(): void {
        this.interfaceUtilisateur.surChangementVent((params) => {
            this.moteurPhysique.vent.parametres = { ...this.moteurPhysique.vent.parametres, ...params };
        });
        this.interfaceUtilisateur.surChangementLignes((longueur) => {
            this.moteurPhysique.systemeLignes.longueurLignes = longueur;
        });
        this.interfaceUtilisateur.surChangementBrides((type, longueur) => {
            const nouvellesLongueurs = { ...this.cerfVolant.geometrie.parametresBrides, [type]: longueur };
            this.cerfVolant.mettreAJourGeometrie({ parametresBrides: nouvellesLongueurs });
        });
        this.interfaceUtilisateur.surChangementDebug((actif) => {
             this.cerfVolant.basculerDebug(actif);
        });
    }
    
    private reinitialiser(estInitialisation = false): void {
        const longueurLignes = this.moteurPhysique.systemeLignes.longueurLignes;
        
        // POSITION INITIALE: Le cerf-volant doit être dans le vent (X+) et en hauteur
        // Vent : vient de X+ et souffle vers X-
        // Station : en (0, 0.25, 0), treuils en (0.25, 0.25, ±0.15)
        // Cerf-volant : derrière la station (X+ positif) pour être dans le vent
        const positionInitiale = new THREE.Vector3(
            longueurLignes * 0.6,  // X+ : dans le vent, à 60% de la longueur des lignes
            longueurLignes * 0.6,  // Y : en hauteur à 60% de la longueur
            0                       // Z : centré sur l'axe
        );

        // S'assure que le cerf-volant n'est pas sous le sol.
        if (positionInitiale.y < 3) {
            positionInitiale.y = 3;
        }

        // Réinitialise l'état physique
        this.moteurPhysique.reinitialiser(positionInitiale);
        
        // ORIENTATION INITIALE: Le cerf-volant doit être orienté avec l'intrados face au vent
        // Géométrie locale par défaut :
        // - NEZ en (0, hauteur, 0) : pointe vers Y+ (le haut)
        // - Normale des panneaux : pointe vers Z+ (vers l'extrados)
        // - Intrados : face opposée, donc Z- 
        
        // Objectif après rotation :
        // - NEZ doit toujours pointer vers Y+ (le haut)
        // - Intrados (Z- local) doit faire face au vent venant de X+
        // - Donc Z- local doit devenir X+ global
        // - Ce qui signifie Z+ local doit devenir X- global
        
        // Rotation de -90° sur Y : Z+ → X-, X+ → Z+, Y → Y
        const orientationInitiale = new THREE.Quaternion();
        orientationInitiale.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
        this.moteurPhysique.etatCerfVolant.orientation.copy(orientationInitiale);
        
        // Réinitialiser les vitesses après avoir défini l'orientation
        this.moteurPhysique.etatCerfVolant.velocite.set(0, 0, 0);
        this.moteurPhysique.etatCerfVolant.velociteAngulaire.set(0, 0, 0);
        
        this.stationControle.reinitialiser();
        this.cerfVolant.reinitialiser(this.moteurPhysique.etatCerfVolant.position);
        this.reinitialiserTrajectoire();
        
        const message = estInitialisation 
            ? "Bienvenue ! Simulation initialisée." 
            : "🔄 Simulation réinitialisée à une position stable.";
        this.interfaceUtilisateur.ajouterEntreeLog(message);
    }

    private basculerPause(): void {
        this.estEnPause = !this.estEnPause;
        this.interfaceUtilisateur.mettreAJourBoutonPause(this.estEnPause);
    }
    
    private creerLignesVisuelles(): void {
        if (this.lignesControle) {
            this.scene.retirer(this.lignesControle[0]);
            this.scene.retirer(this.lignesControle[1]);
        }
        const materiau = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 1 });
        const geometrieGauche = new THREE.BufferGeometry();
        const geometrieDroite = new THREE.BufferGeometry();
        
        const ligneGauche = new THREE.Line(geometrieGauche, materiau);
        const ligneDroite = new THREE.Line(geometrieDroite, materiau);

        // Désactiver le frustum culling pour que les lignes restent visibles
        ligneGauche.frustumCulled = false;
        ligneDroite.frustumCulled = false;

        this.lignesControle = [ligneGauche, ligneDroite];
        this.scene.ajouter(ligneGauche);
        this.scene.ajouter(ligneDroite);
    }

    private creerBridesVisuelles(): void {
        // Nettoyer les anciennes brides
        this.bridesVisuelles.forEach(bride => this.scene.retirer(bride));
        this.bridesVisuelles = [];

        const materiau = new THREE.LineBasicMaterial({ 
            color: 0xffaa00, 
            linewidth: 1,
            opacity: 0.8,
            transparent: true
        });

        // Créer 6 lignes (3 pour chaque côté)
        for (let i = 0; i < 6; i++) {
            const geometrie = new THREE.BufferGeometry();
            const ligne = new THREE.Line(geometrie, materiau);
            // Désactiver le frustum culling pour que les brides restent visibles
            ligne.frustumCulled = false;
            this.bridesVisuelles.push(ligne);
            this.scene.ajouter(ligne);
        }
    }

    private mettreAJourLignesVisuelles(): void {
        if (!this.lignesControle) return;

        const positionsPoignees = this.stationControle.getPositionsPoignees();
        // FIX: Accès à la méthode localToWorld via la propriété objet3D du cerf-volant.
        const pointCtrlGauche = this.cerfVolant.objet3D.localToWorld(this.cerfVolant.geometrie.points.get('CTRL_GAUCHE')!.clone());
        // FIX: Accès à la méthode localToWorld via la propriété objet3D du cerf-volant.
        const pointCtrlDroit = this.cerfVolant.objet3D.localToWorld(this.cerfVolant.geometrie.points.get('CTRL_DROIT')!.clone());
        
        // Connexions directes pour correspondre à la physique
        this.lignesControle[0].geometry.setFromPoints([positionsPoignees.gauche, pointCtrlGauche]);
        this.lignesControle[1].geometry.setFromPoints([positionsPoignees.droite, pointCtrlDroit]);
    }

    private mettreAJourBridesVisuelles(): void {
        if (this.bridesVisuelles.length !== 6) return;

        // Récupérer les points en coordonnées mondiales
        const nez = this.cerfVolant.objet3D.localToWorld(this.cerfVolant.geometrie.points.get('NEZ')!.clone());
        const interGauche = this.cerfVolant.objet3D.localToWorld(this.cerfVolant.geometrie.points.get('INTER_GAUCHE')!.clone());
        const interDroit = this.cerfVolant.objet3D.localToWorld(this.cerfVolant.geometrie.points.get('INTER_DROIT')!.clone());
        const centre = this.cerfVolant.objet3D.localToWorld(this.cerfVolant.geometrie.points.get('CENTRE')!.clone());
        const ctrlGauche = this.cerfVolant.objet3D.localToWorld(this.cerfVolant.geometrie.points.get('CTRL_GAUCHE')!.clone());
        const ctrlDroit = this.cerfVolant.objet3D.localToWorld(this.cerfVolant.geometrie.points.get('CTRL_DROIT')!.clone());

        // Fonction helper pour mettre à jour une ligne
        const mettreAJourLigne = (index: number, p1: THREE.Vector3, p2: THREE.Vector3) => {
            const ligne = this.bridesVisuelles[index];
            ligne.geometry.dispose(); // Libérer l'ancienne géométrie
            ligne.geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        };

        // Brides côté gauche (indices 0, 1, 2)
        mettreAJourLigne(0, nez, ctrlGauche);
        mettreAJourLigne(1, interGauche, ctrlGauche);
        mettreAJourLigne(2, centre, ctrlGauche);

        // Brides côté droit (indices 3, 4, 5)
        mettreAJourLigne(3, nez, ctrlDroit);
        mettreAJourLigne(4, interDroit, ctrlDroit);
        mettreAJourLigne(5, centre, ctrlDroit);
    }
    
    private creerTrajectoireVisuelle(): void {
        const material = new THREE.LineBasicMaterial({ color: 0x81A0D3 });
        const geometry = new THREE.BufferGeometry();
        this.trajectoire = new THREE.Line(geometry, material);
        this.scene.ajouter(this.trajectoire);
    }

    private reinitialiserTrajectoire(): void {
        this.trajectoirePoints = [];
        const positionInitiale = this.moteurPhysique.etatCerfVolant.position;
        this.dernierPointTrajectoire.copy(positionInitiale);
        this.trajectoirePoints.push(this.dernierPointTrajectoire.clone());
        this.trajectoire.geometry.setFromPoints(this.trajectoirePoints);
    }

    private mettreAJourTrajectoire(): void {
        const positionActuelle = this.moteurPhysique.etatCerfVolant.position;
        if (positionActuelle.distanceTo(this.dernierPointTrajectoire) > 0.2) {
            this.trajectoirePoints.push(positionActuelle.clone());
            this.dernierPointTrajectoire.copy(positionActuelle);

            if (this.trajectoirePoints.length > this.MAX_TRAJECTOIRE_POINTS) {
                this.trajectoirePoints.shift();
            }

            // Recréer la géométrie pour éviter les erreurs de buffer
            this.trajectoire.geometry.dispose();
            this.trajectoire.geometry = new THREE.BufferGeometry().setFromPoints(this.trajectoirePoints);
        }
    }

    private boucleAnimation(): void {
        requestAnimationFrame(this.boucleAnimation.bind(this));
        const deltaTime = this.horloge.getDelta();

        if (this.estEnPause) return;
        
        // 1. Mettre à jour les contrôles utilisateur
        this.controleurUtilisateur.mettreAJour(deltaTime);
        this.moteurPhysique.systemeLignes.setDelta(this.controleurUtilisateur.getDeltaLongueur());

        // 2. Mettre à jour le moteur physique
        const positionsPoignees = this.stationControle.getPositionsPoignees();
        this.moteurPhysique.mettreAJour(deltaTime, positionsPoignees, this.cerfVolant.geometrie);

        // 3. Appliquer les résultats de la physique aux objets 3D
        // FIX: La position et l'orientation sont appliquées à la propriété objet3D.
        this.cerfVolant.objet3D.position.copy(this.moteurPhysique.etatCerfVolant.position);
        this.cerfVolant.objet3D.quaternion.copy(this.moteurPhysique.etatCerfVolant.orientation);
        
        // 4. Mettre à jour la barre, les lignes et la trajectoire
        // FIX: La position du cerf-volant est lue depuis sa propriété objet3D.
        this.stationControle.mettreAJour(this.cerfVolant.objet3D.position);
        this.mettreAJourLignesVisuelles();
        this.mettreAJourBridesVisuelles();
        this.mettreAJourTrajectoire();
        
        // 5. Mettre à jour l'interface utilisateur (debug, log)
        this.interfaceUtilisateur.mettreAJourInfosDebug(this.moteurPhysique, this.cerfVolant);
        this.cerfVolant.mettreAJourVecteursForces(
            this.moteurPhysique.derniereForceAero,
            this.moteurPhysique.derniereForceGravite,
            this.moteurPhysique.systemeLignes.derniereForceGauche,
            this.moteurPhysique.systemeLignes.derniereForceDroite,
            this.moteurPhysique.derniereForceAeroEtGravite,
            this.moteurPhysique.derniereForceTotale
        );
        this.cerfVolant.mettreAJourVecteursForcesSurfaces(this.moteurPhysique.dernieresForcesAeroDetaillees);

        // Logging périodique
        this.logTimer += deltaTime;
        if (this.logTimer >= this.logInterval) {
            this.logTimer = 0;
            const log = this.genererRapportLog();
            this.interfaceUtilisateur.ajouterEntreeLog(log);
        }

        // 6. Rendu de la scène
        this.scene.rendre();
    }
    
    private genererRapportLog(): string {
        const etat = this.moteurPhysique.etatCerfVolant;
        const lignes = this.moteurPhysique.systemeLignes;
        const ventApparent = this.moteurPhysique.vent.getVentApparent(etat.velocite);
        
        // Convertir l'orientation en angles d'Euler pour lisibilité
        const euler = new THREE.Euler().setFromQuaternion(etat.orientation, 'XYZ');
        const pitch = (euler.x * 180 / Math.PI).toFixed(0);
        const yaw = (euler.y * 180 / Math.PI).toFixed(0);
        const roll = (euler.z * 180 / Math.PI).toFixed(0);
        
        // Calcul de l'énergie cinétique
        const energieCinetiqueTrans = 0.5 * etat.masse * etat.velocite.lengthSq();
        const energieCinetiqueRot = 0.5 * (
            etat.inertie.x * etat.velociteAngulaire.x ** 2 +
            etat.inertie.y * etat.velociteAngulaire.y ** 2 +
            etat.inertie.z * etat.velociteAngulaire.z ** 2
        );
        const energieTotale = energieCinetiqueTrans + energieCinetiqueRot;
        
        // Calcul du ratio des forces
        const forceAero = this.moteurPhysique.derniereForceAero.length();
        const forceLignes = this.moteurPhysique.derniereForceLignes.length();
        const forceGravite = this.moteurPhysique.derniereForceGravite.length();
        const forceTotale = this.moteurPhysique.derniereForceTotale.length();
        
        // Calcul des composantes de vitesse
        const vx = etat.velocite.x.toFixed(1);
        const vy = etat.velocite.y.toFixed(1);
        const vz = etat.velocite.z.toFixed(1);
        const vTotal = etat.velocite.length().toFixed(1);
        const vAng = etat.velociteAngulaire.length();
        
        // Angle d'attaque moyen estimé
        const dirVent = ventApparent.clone().normalize();
        const normaleMoyenne = new THREE.Vector3(0, 0, 1).applyQuaternion(etat.orientation);
        const angleAttaque = Math.acos(Math.abs(dirVent.dot(normaleMoyenne))) * 180 / Math.PI;
        
        // Détails des forces par panneau (condensé)
        const forcesDetaillees = this.moteurPhysique.dernieresForcesAeroDetaillees;
        const forcesParPanneau = forcesDetaillees.map((f, i) => 
            `P${i+1}:L${f.forceLift.length().toFixed(1)} D${f.forceDrag.length().toFixed(1)}`
        ).join(' | ');
        
        // Indicateurs d'état
        const indicateurs = [];
        if (vAng > 5) indicateurs.push('⚠️SPIN');
        if (etat.position.y < 1) indicateurs.push('⚠️SOL');
        if (forceLignes > 50) indicateurs.push('⚠️TENSION');
        if (vTotal > 30) indicateurs.push('⚠️VITESSE');
        const etatStr = indicateurs.length > 0 ? ` [${indicateurs.join(' ')}]` : '';
        
        // Rapport condensé avec informations clés
        const rapport = `T=${this.horloge.elapsedTime.toFixed(1)}s${etatStr} | Pos(${etat.position.x.toFixed(1)},${etat.position.y.toFixed(1)},${etat.position.z.toFixed(1)}) | V=${vTotal}m/s(${vx},${vy},${vz}) | ω=${vAng.toFixed(2)}rad/s
Rot: P=${pitch}° Y=${yaw}° R=${roll}° | AoA≈${angleAttaque.toFixed(0)}° | Vent=${ventApparent.length().toFixed(1)}m/s(${ventApparent.x.toFixed(1)},${ventApparent.y.toFixed(1)},${ventApparent.z.toFixed(1)})
Forces: Aéro=${forceAero.toFixed(1)}N | Lignes=${forceLignes.toFixed(1)}N(G:${lignes.derniereTensionGauche.toFixed(1)} D:${lignes.derniereTensionDroite.toFixed(1)}) | Grav=${forceGravite.toFixed(1)}N | Tot=${forceTotale.toFixed(1)}N
Énergie: Ec=${energieTotale.toFixed(2)}J (Trans:${energieCinetiqueTrans.toFixed(2)} Rot:${energieCinetiqueRot.toFixed(2)}) | ΔL=${this.controleurUtilisateur.getDeltaLongueur().toFixed(2)}m
Aéro: ${forcesParPanneau}`;
        
        return rapport;
    }
}

// CONSIGNES: Pas de comportements scriptés. Les comportements doivent émerger de la physique de la simulation.
