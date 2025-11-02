import * as THREE from 'three';
import { Scene } from './Scene';
import { CerfVolant } from './cerfvolant/CerfVolant';
import { GeometrieCerfVolant } from './cerfvolant/GeometrieCerfVolant';
import { MoteurPhysique } from './physique/MoteurPhysique';
import { StationControle } from './controles/StationControle';
import { ControleurUtilisateur } from './controles/ControleurUtilisateur';
import { AutoPilote, ModeAutoPilote } from './controles/AutoPilote';
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

    // Système de logging amélioré
    private logTimer = 0;
    private readonly logInterval = 0.5; // Mise à jour toutes les 0.5s pour un journal plus lisible
    private logsBuffer: string[] = []; // Buffer circulaire pour stocker les logs
    private readonly MAX_LOG_ENTRIES = 8; // Garder les 8 dernières entrées (4 secondes d'historique)

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
        
        // 3.5. Initialisation de l'autopilote
        const autoPilote = new AutoPilote(this.moteurPhysique.vent);
        this.controleurUtilisateur.initialiserAutoPilote(autoPilote);

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
        
        // Synchroniser les valeurs de l'UI avec la configuration actuelle
        this.interfaceUtilisateur.synchroniserValeurs(this.moteurPhysique, this.cerfVolant.geometrie);
        
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
        
        // Connecter les contrôles de l'autopilote
        this.interfaceUtilisateur.surToggleAutoPilote(() => {
            const autoPilote = this.controleurUtilisateur.autoPilote;
            if (autoPilote) {
                const nouvelEtat = !autoPilote.estActif();
                autoPilote.setActif(nouvelEtat);
                this.interfaceUtilisateur.mettreAJourBoutonToggleAutoPilote(nouvelEtat);
                console.log(`Autopilote: ${nouvelEtat ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
            }
        });
        
        this.interfaceUtilisateur.surChangementModeAutoPilote((mode) => {
            this.controleurUtilisateur.changerModeAutoPilote(mode, this.moteurPhysique.etatCerfVolant);
            this.interfaceUtilisateur.mettreAJourBoutonsModes(mode);
            console.log(`Mode autopilote: ${mode}`);
        });
    }
    
    private reinitialiser(estInitialisation = false): void {
        const longueurLignes = this.moteurPhysique.systemeLignes.longueurLignes;
        
        // POSITION INITIALE OPTIMISÉE pour le nouveau système de lignes bi-régime
        // Avec longueur_repos = 97% × longueur, on veut démarrer proche de longueur_repos
        // pour être dans la zone de tension active dès le départ
        // 
        // Vent : vient de X+ et souffle vers X-
        // Station : en (0, 0.25, 0), treuils en (0.25, 0.25, ±0.15)
        // Cerf-volant : derrière la station (X+ positif) pour être dans le vent
        const positionInitiale = new THREE.Vector3(
            longueurLignes * 0.68,  // X+ : dans le vent, à 68% de la longueur (≈ 96% de distance réelle)
            longueurLignes * 0.68,  // Y : en hauteur à 68%
            0                        // Z : centré sur l'axe
        );
        // Distance résultante ≈ √(0.68² + 0.68²) × longueur ≈ 0.96 × longueur ≈ 9.6m pour longueur=10m
        // Cela place le cerf-volant juste en-dessous de longueur_repos (9.7m)

        // S'assure que le cerf-volant n'est pas sous le sol.
        if (positionInitiale.y < 3) {
            positionInitiale.y = 3;
        }

        // Réinitialise l'état physique
        this.moteurPhysique.reinitialiser(positionInitiale);
        
        // Réinitialiser les tensions lissées du système de lignes
        this.moteurPhysique.systemeLignes.reinitialiserTensionsLissees();
        
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
            ? `🪁 Bienvenue dans le simulateur de cerf-volant !
            
📋 CONTRÔLES:
   • Flèches GAUCHE/DROITE (ou Q/D) : Piloter le cerf-volant
   • ESPACE : Pause/Reprendre
   • R : Réinitialiser la simulation

💨 Le vent souffle de X+ vers X- (utilisez la grille pour vous repérer)
🎯 Ajustez les paramètres dans le panneau de contrôle à droite

Simulation initialisée et prête à voler !` 
            : "🔄 Simulation réinitialisée à une position stable.";
        this.interfaceUtilisateur.ajouterEntreeLog(message);
        console.log("🔄 Simulation réinitialisée");
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
        
        // 1. Mettre à jour les contrôles utilisateur (avec autopilote si actif)
        this.controleurUtilisateur.mettreAJour(deltaTime, this.moteurPhysique.etatCerfVolant);
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
        
        // 5. Mettre à jour l'interface utilisateur (debug, log, indicateur de pilotage)
        this.interfaceUtilisateur.mettreAJourInfosDebug(this.moteurPhysique, this.cerfVolant);
        const infosAutoPilote = this.controleurUtilisateur.getInfosAutoPilote(this.moteurPhysique.etatCerfVolant);
        this.interfaceUtilisateur.mettreAJourIndicateurPilotage(
            this.controleurUtilisateur.estActif(), 
            this.controleurUtilisateur.getDeltaLongueur(),
            infosAutoPilote
        );
        this.cerfVolant.mettreAJourVecteursForces(
            this.moteurPhysique.derniereForceAero,
            this.moteurPhysique.derniereForceGravite,
            this.moteurPhysique.systemeLignes.derniereForceGauche,
            this.moteurPhysique.systemeLignes.derniereForceDroite,
            this.moteurPhysique.derniereForceAeroEtGravite,
            this.moteurPhysique.derniereForceTotale
        );
        this.cerfVolant.mettreAJourVecteursForcesSurfaces(this.moteurPhysique.dernieresForcesAeroDetaillees);

        // Logging périodique avec buffer circulaire
        this.logTimer += deltaTime;
        if (this.logTimer >= this.logInterval) {
            this.logTimer = 0;
            const log = this.genererRapportLog();
            
            // Ajouter au buffer avec timestamp formaté
            const timestamp = this.horloge.elapsedTime.toFixed(1);
            this.logsBuffer.push(`━━━━━ T+${timestamp}s ━━━━━\n${log}`);
            
            // Maintenir la taille du buffer
            if (this.logsBuffer.length > this.MAX_LOG_ENTRIES) {
                this.logsBuffer.shift();
            }
            
            // Afficher toutes les entrées du buffer (plus récent en haut)
            const recentLogs = this.logsBuffer.slice().reverse().join('\n\n');
            this.interfaceUtilisateur.remplacerLog(recentLogs);
        }

        // 6. Rendu de la scène
        this.scene.rendre();
    }
    
    private genererRapportLog(): string {
        const etat = this.moteurPhysique.etatCerfVolant;
        const lignes = this.moteurPhysique.systemeLignes;
        const ventApparent = this.moteurPhysique.vent.getVentApparent(etat.velocite);
        
        // Conversion de l'orientation en angles d'Euler
        const euler = new THREE.Euler().setFromQuaternion(etat.orientation, 'XYZ');
        const pitch = (euler.x * 180 / Math.PI).toFixed(0);
        const yaw = (euler.y * 180 / Math.PI).toFixed(0);
        const roll = (euler.z * 180 / Math.PI).toFixed(0);
        
        const formatVec = (v: THREE.Vector3) => `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`;
        
        // Calcul des forces aérodynamiques totales
        const liftTotal = this.moteurPhysique.dernieresForcesAeroDetaillees
            .reduce((sum, f) => sum + f.forceLift.length(), 0);
        const dragTotal = this.moteurPhysique.dernieresForcesAeroDetaillees
            .reduce((sum, f) => sum + f.forceDrag.length(), 0);
        
        // Détails par panneau avec formatage amélioré
        const detailsPanneaux = this.moteurPhysique.dernieresForcesAeroDetaillees.map((f, i) => {
            const dirVent = f.ventApparent.clone().normalize();
            const cosTheta = f.normaleSurface.dot(dirVent);
            const alpha = Math.asin(Math.abs(cosTheta)) * 180 / Math.PI;
            const liftStr = f.forceLift.length().toFixed(1);
            const dragStr = f.forceDrag.length().toFixed(1);
            return `  └─ Panneau ${i+1}: α=${alpha.toFixed(0)}° | Portance=${liftStr}N | Traînée=${dragStr}N`;
        }).join('\n');
        
        // Rapport structuré et lisible
        const rapport = 
`📍 POSITION & MOUVEMENT
   Position: ${formatVec(etat.position)} m
   Vitesse: ${etat.velocite.length().toFixed(2)} m/s ${formatVec(etat.velocite)}
   Altitude: ${etat.position.y.toFixed(1)} m

🎯 ORIENTATION
   Tangage: ${pitch}° | Lacet: ${yaw}° | Roulis: ${roll}°

💨 AÉRODYNAMIQUE
   Vent apparent: ${ventApparent.length().toFixed(1)} m/s
   Portance totale: ${liftTotal.toFixed(1)} N
   Traînée totale: ${dragTotal.toFixed(1)} N
${detailsPanneaux}

🔗 TENSIONS DES LIGNES
   Ligne gauche: ${lignes.derniereTensionGauche.toFixed(1)} N
   Ligne droite: ${lignes.derniereTensionDroite.toFixed(1)} N
   Delta: ${Math.abs(lignes.derniereTensionGauche - lignes.derniereTensionDroite).toFixed(1)} N`;
        
        return rapport;
    }

    /**
     * Nettoie toutes les ressources de la simulation.
     * À appeler avant de détruire l'instance pour éviter les fuites mémoire.
     */
    public dispose(): void {
        // Nettoyer les géométries des lignes
        if (this.lignesControle) {
            this.lignesControle.forEach(ligne => {
                ligne.geometry.dispose();
                (ligne.material as THREE.Material).dispose();
            });
        }

        // Nettoyer les brides
        this.bridesVisuelles.forEach(bride => {
            bride.geometry.dispose();
            (bride.material as THREE.Material).dispose();
        });

        // Nettoyer la trajectoire
        if (this.trajectoire) {
            this.trajectoire.geometry.dispose();
            (this.trajectoire.material as THREE.Material).dispose();
        }

        // Nettoyer le cerf-volant
        this.cerfVolant.dispose();

        // Nettoyer la scène
        this.scene.dispose();

        console.log('🧹 Simulation nettoyée');
    }
}
