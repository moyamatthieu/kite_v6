import * as THREE from 'three';
import { EtatPhysique } from '../physique/EtatPhysique';
import { Vent } from '../physique/Vent';

/**
 * Modes de pilotage automatique disponibles
 */
export enum ModeAutoPilote {
    MANUEL = 'manuel',
    STABILISATION = 'stabilisation',
    MAINTIEN_ALTITUDE = 'maintien_altitude',
    MAINTIEN_POSITION = 'maintien_position',
    TRAJECTOIRE_CIRCULAIRE = 'trajectoire_circulaire',
    ACROBATIQUE = 'acrobatique'
}

/**
 * Configuration du point cible pour les modes de positionnement
 */
export interface PointCible {
    position: THREE.Vector3;
    tolerance: number; // Tolérance de distance en mètres
}

/**
 * Paramètres PID pour le contrôle automatique
 */
interface ParametresPID {
    kp: number; // Proportionnel
    ki: number; // Intégral
    kd: number; // Dérivé
}

/**
 * Système d'autopilotage avancé pour le cerf-volant.
 * Implémente plusieurs modes de pilotage automatique avec contrôleurs PID.
 */
export class AutoPilote {
    private mode: ModeAutoPilote = ModeAutoPilote.MANUEL;
    private actif: boolean = false;
    
    // État de référence pour les modes de maintien
    private altitudeCible: number = 8.0;
    private positionCible: THREE.Vector3 = new THREE.Vector3(0, 8, 0);
    
    // Paramètres PID pour différents axes de contrôle
    private pidAltitude: ParametresPID = { kp: 0.8, ki: 0.05, kd: 0.3 };
    private pidLateral: ParametresPID = { kp: 1.2, ki: 0.08, kd: 0.4 };
    private pidStabilisation: ParametresPID = { kp: 2.0, ki: 0.1, kd: 0.5 };
    
    // Accumulateurs pour les termes intégraux
    private erreurIntegraleAltitude = 0;
    private erreurIntegraleLateral = 0;
    private erreurIntegraleRoll = 0;
    
    // Erreurs précédentes pour les termes dérivés
    private erreurPrecedenteAltitude = 0;
    private erreurPrecedenteLateral = 0;
    private erreurPrecedenteRoll = 0;
    
    // Paramètres pour le mode trajectoire circulaire
    private rayonCirculaire = 3.0; // Rayon du cercle en mètres
    private vitesseAngulaire = 0.5; // Rad/s
    private angleCirculaire = 0;
    private centreCircle = new THREE.Vector3(0, 8, 0);
    
    // Paramètres pour le mode acrobatique
    private sequenceAcrobatique: 'loop' | 'eight' | 'wave' | null = null;
    private progressionSequence = 0;
    
    // Limites de sécurité
    private readonly ALTITUDE_MIN = 3.0;
    private readonly ALTITUDE_MAX = 15.0;
    private readonly DISTANCE_MAX = 20.0;
    private readonly DELTA_MAX = 0.6; // Correspond au deltaMax du ControleurUtilisateur
    
    // Vent pour calculs de compensation
    private vent: Vent;
    
    constructor(vent: Vent) {
        this.vent = vent;
    }
    
    /**
     * Active ou désactive l'autopilote
     */
    public setActif(actif: boolean): void {
        this.actif = actif;
        if (actif) {
            this.reinitialiserAccumulateurs();
        }
    }
    
    /**
     * Retourne si l'autopilote est actif
     */
    public estActif(): boolean {
        return this.actif;
    }
    
    /**
     * Change le mode de pilotage automatique
     */
    public setMode(mode: ModeAutoPilote, etatPhysique: EtatPhysique): void {
        this.mode = mode;
        this.reinitialiserAccumulateurs();
        
        // Capturer l'état actuel comme référence pour certains modes
        switch (mode) {
            case ModeAutoPilote.MAINTIEN_ALTITUDE:
                this.altitudeCible = etatPhysique.position.y;
                break;
            case ModeAutoPilote.MAINTIEN_POSITION:
                this.positionCible.copy(etatPhysique.position);
                break;
            case ModeAutoPilote.TRAJECTOIRE_CIRCULAIRE:
                this.centreCircle.copy(etatPhysique.position);
                this.angleCirculaire = 0;
                break;
            case ModeAutoPilote.ACROBATIQUE:
                this.progressionSequence = 0;
                this.sequenceAcrobatique = 'loop';
                break;
        }
    }
    
    /**
     * Retourne le mode actuel
     */
    public getMode(): ModeAutoPilote {
        return this.mode;
    }
    
    /**
     * Définit l'altitude cible pour le mode maintien d'altitude
     */
    public setAltitudeCible(altitude: number): void {
        this.altitudeCible = Math.max(this.ALTITUDE_MIN, Math.min(this.ALTITUDE_MAX, altitude));
    }
    
    /**
     * Définit la position cible pour le mode maintien de position
     */
    public setPositionCible(position: THREE.Vector3): void {
        this.positionCible.copy(position);
        // Appliquer les limites de sécurité
        this.positionCible.y = Math.max(this.ALTITUDE_MIN, Math.min(this.ALTITUDE_MAX, this.positionCible.y));
        const distanceHorizontale = Math.sqrt(this.positionCible.x ** 2 + this.positionCible.z ** 2);
        if (distanceHorizontale > this.DISTANCE_MAX) {
            this.positionCible.x = (this.positionCible.x / distanceHorizontale) * this.DISTANCE_MAX;
            this.positionCible.z = (this.positionCible.z / distanceHorizontale) * this.DISTANCE_MAX;
        }
    }
    
    /**
     * Définit le rayon pour le mode trajectoire circulaire
     */
    public setRayonCirculaire(rayon: number): void {
        this.rayonCirculaire = Math.max(1.0, Math.min(8.0, rayon));
    }
    
    /**
     * Définit la séquence acrobatique à exécuter
     */
    public setSequenceAcrobatique(sequence: 'loop' | 'eight' | 'wave'): void {
        this.sequenceAcrobatique = sequence;
        this.progressionSequence = 0;
    }
    
    /**
     * Calcule la commande de contrôle (delta de longueur) selon le mode actif
     * @param etatPhysique État physique actuel du cerf-volant
     * @param deltaTime Temps écoulé depuis la dernière mise à jour
     * @returns Delta de longueur à appliquer aux lignes (-deltaMax à +deltaMax)
     */
    public calculerCommande(etatPhysique: EtatPhysique, deltaTime: number): number {
        if (!this.actif || this.mode === ModeAutoPilote.MANUEL) {
            return 0;
        }
        
        let deltaCommande = 0;
        
        switch (this.mode) {
            case ModeAutoPilote.STABILISATION:
                deltaCommande = this.calculerStabilisation(etatPhysique, deltaTime);
                break;
            case ModeAutoPilote.MAINTIEN_ALTITUDE:
                deltaCommande = this.calculerMaintienAltitude(etatPhysique, deltaTime);
                break;
            case ModeAutoPilote.MAINTIEN_POSITION:
                deltaCommande = this.calculerMaintienPosition(etatPhysique, deltaTime);
                break;
            case ModeAutoPilote.TRAJECTOIRE_CIRCULAIRE:
                deltaCommande = this.calculerTrajectoireCirculaire(etatPhysique, deltaTime);
                break;
            case ModeAutoPilote.ACROBATIQUE:
                deltaCommande = this.calculerModeAcrobatique(etatPhysique, deltaTime);
                break;
        }
        
        // Limiter la commande
        return Math.max(-this.DELTA_MAX, Math.min(this.DELTA_MAX, deltaCommande));
    }
    
    /**
     * Mode stabilisation : maintient le cerf-volant droit (roll ~ 0)
     */
    private calculerStabilisation(etatPhysique: EtatPhysique, deltaTime: number): number {
        // Extraire l'angle de roulis (roll) de l'orientation
        const euler = new THREE.Euler().setFromQuaternion(etatPhysique.orientation, 'XYZ');
        const rollActuel = euler.z; // Angle de roulis en radians
        
        // Erreur : on veut roll = 0
        const erreur = -rollActuel;
        
        // Contrôleur PID
        this.erreurIntegraleRoll += erreur * deltaTime;
        this.erreurIntegraleRoll = Math.max(-2, Math.min(2, this.erreurIntegraleRoll)); // Anti-windup
        
        const erreurDerivee = (erreur - this.erreurPrecedenteRoll) / deltaTime;
        this.erreurPrecedenteRoll = erreur;
        
        const commande = 
            this.pidStabilisation.kp * erreur +
            this.pidStabilisation.ki * this.erreurIntegraleRoll +
            this.pidStabilisation.kd * erreurDerivee;
        
        return commande;
    }
    
    /**
     * Mode maintien d'altitude : maintient le cerf-volant à l'altitude cible
     */
    private calculerMaintienAltitude(etatPhysique: EtatPhysique, deltaTime: number): number {
        const altitudeActuelle = etatPhysique.position.y;
        const erreur = this.altitudeCible - altitudeActuelle;
        
        // Contrôleur PID pour l'altitude
        this.erreurIntegraleAltitude += erreur * deltaTime;
        this.erreurIntegraleAltitude = Math.max(-3, Math.min(3, this.erreurIntegraleAltitude));
        
        const erreurDerivee = (erreur - this.erreurPrecedenteAltitude) / deltaTime;
        this.erreurPrecedenteAltitude = erreur;
        
        const commandeAltitude = 
            this.pidAltitude.kp * erreur +
            this.pidAltitude.ki * this.erreurIntegraleAltitude +
            this.pidAltitude.kd * erreurDerivee;
        
        // Combiner avec la stabilisation pour éviter les oscillations
        const commandeStabilisation = this.calculerStabilisation(etatPhysique, deltaTime);
        
        return commandeAltitude * 0.7 + commandeStabilisation * 0.3;
    }
    
    /**
     * Mode maintien de position : maintient le cerf-volant à la position cible (3D)
     */
    private calculerMaintienPosition(etatPhysique: EtatPhysique, deltaTime: number): number {
        const positionActuelle = etatPhysique.position;
        
        // Erreur d'altitude
        const erreurAltitude = this.positionCible.y - positionActuelle.y;
        
        // Erreur latérale (X et Z)
        const erreurLaterale = new THREE.Vector3(
            this.positionCible.x - positionActuelle.x,
            0,
            this.positionCible.z - positionActuelle.z
        );
        const magnitudeErreurLaterale = erreurLaterale.length();
        
        // Contrôleur PID pour l'altitude
        this.erreurIntegraleAltitude += erreurAltitude * deltaTime;
        this.erreurIntegraleAltitude = Math.max(-3, Math.min(3, this.erreurIntegraleAltitude));
        
        const erreurDeriveeAltitude = (erreurAltitude - this.erreurPrecedenteAltitude) / deltaTime;
        this.erreurPrecedenteAltitude = erreurAltitude;
        
        const commandeAltitude = 
            this.pidAltitude.kp * erreurAltitude +
            this.pidAltitude.ki * this.erreurIntegraleAltitude +
            this.pidAltitude.kd * erreurDeriveeAltitude;
        
        // Contrôleur PID pour le déplacement latéral
        // La direction latérale détermine si on doit tirer à gauche ou à droite
        this.erreurIntegraleLateral += magnitudeErreurLaterale * deltaTime;
        this.erreurIntegraleLateral = Math.max(-3, Math.min(3, this.erreurIntegraleLateral));
        
        const erreurDeriveeLateral = (magnitudeErreurLaterale - this.erreurPrecedenteLateral) / deltaTime;
        this.erreurPrecedenteLateral = magnitudeErreurLaterale;
        
        // Déterminer la direction de correction latérale
        // Si le kite est trop à gauche (X négatif), on doit tirer à droite (delta négatif)
        const directionLaterale = Math.sign(this.positionCible.x - positionActuelle.x);
        
        const commandeLaterale = directionLaterale * (
            this.pidLateral.kp * magnitudeErreurLaterale +
            this.pidLateral.ki * this.erreurIntegraleLateral +
            this.pidLateral.kd * erreurDeriveeLateral
        );
        
        // Combiner les commandes avec priorité à l'altitude
        const commandeStabilisation = this.calculerStabilisation(etatPhysique, deltaTime);
        
        return commandeAltitude * 0.4 + commandeLaterale * 0.4 + commandeStabilisation * 0.2;
    }
    
    /**
     * Mode trajectoire circulaire : fait voler le cerf-volant en cercle
     */
    private calculerTrajectoireCirculaire(etatPhysique: EtatPhysique, deltaTime: number): number {
        // Incrémenter l'angle
        this.angleCirculaire += this.vitesseAngulaire * deltaTime;
        if (this.angleCirculaire > Math.PI * 2) {
            this.angleCirculaire -= Math.PI * 2;
        }
        
        // Calculer la position cible sur le cercle
        const positionCibleCircle = new THREE.Vector3(
            this.centreCircle.x + this.rayonCirculaire * Math.cos(this.angleCirculaire),
            this.centreCircle.y,
            this.centreCircle.z + this.rayonCirculaire * Math.sin(this.angleCirculaire)
        );
        
        // Utiliser le contrôleur de maintien de position pour suivre le cercle
        const positionCibleOriginale = this.positionCible.clone();
        this.positionCible.copy(positionCibleCircle);
        const commande = this.calculerMaintienPosition(etatPhysique, deltaTime);
        this.positionCible.copy(positionCibleOriginale);
        
        return commande;
    }
    
    /**
     * Mode acrobatique : exécute des figures acrobatiques préprogrammées
     */
    private calculerModeAcrobatique(etatPhysique: EtatPhysique, deltaTime: number): number {
        this.progressionSequence += deltaTime;
        
        let commande = 0;
        
        switch (this.sequenceAcrobatique) {
            case 'loop':
                // Looping : oscillation sinusoïdale forte
                commande = Math.sin(this.progressionSequence * 2) * this.DELTA_MAX;
                break;
            case 'eight':
                // Figure en 8 : alternance entre gauche et droite
                const periode = 3.0;
                const phase = (this.progressionSequence % periode) / periode;
                if (phase < 0.25) {
                    commande = this.DELTA_MAX;
                } else if (phase < 0.5) {
                    commande = -this.DELTA_MAX;
                } else if (phase < 0.75) {
                    commande = -this.DELTA_MAX;
                } else {
                    commande = this.DELTA_MAX;
                }
                break;
            case 'wave':
                // Vague : oscillation douce
                commande = Math.sin(this.progressionSequence * 1.5) * this.DELTA_MAX * 0.7;
                break;
        }
        
        // Réinitialiser la séquence après un certain temps
        if (this.progressionSequence > 10.0) {
            this.progressionSequence = 0;
        }
        
        return commande;
    }
    
    /**
     * Réinitialise tous les accumulateurs PID
     */
    private reinitialiserAccumulateurs(): void {
        this.erreurIntegraleAltitude = 0;
        this.erreurIntegraleLateral = 0;
        this.erreurIntegraleRoll = 0;
        this.erreurPrecedenteAltitude = 0;
        this.erreurPrecedenteLateral = 0;
        this.erreurPrecedenteRoll = 0;
    }
    
    /**
     * Retourne des informations sur l'état actuel de l'autopilote
     */
    public getInfosEtat(etatPhysique: EtatPhysique): string {
        if (!this.actif) {
            return 'Autopilote: INACTIF';
        }
        
        let info = `Autopilote: ${this.mode.toUpperCase()}\n`;
        
        switch (this.mode) {
            case ModeAutoPilote.STABILISATION:
                const euler = new THREE.Euler().setFromQuaternion(etatPhysique.orientation, 'XYZ');
                info += `Roll: ${(euler.z * 180 / Math.PI).toFixed(1)}°`;
                break;
            case ModeAutoPilote.MAINTIEN_ALTITUDE:
                info += `Altitude cible: ${this.altitudeCible.toFixed(1)}m\n`;
                info += `Altitude actuelle: ${etatPhysique.position.y.toFixed(1)}m`;
                break;
            case ModeAutoPilote.MAINTIEN_POSITION:
                const distance = etatPhysique.position.distanceTo(this.positionCible);
                info += `Position cible: (${this.positionCible.x.toFixed(1)}, ${this.positionCible.y.toFixed(1)}, ${this.positionCible.z.toFixed(1)})\n`;
                info += `Distance: ${distance.toFixed(2)}m`;
                break;
            case ModeAutoPilote.TRAJECTOIRE_CIRCULAIRE:
                info += `Rayon: ${this.rayonCirculaire.toFixed(1)}m\n`;
                info += `Angle: ${(this.angleCirculaire * 180 / Math.PI).toFixed(0)}°`;
                break;
            case ModeAutoPilote.ACROBATIQUE:
                info += `Séquence: ${this.sequenceAcrobatique}\n`;
                info += `Progression: ${this.progressionSequence.toFixed(1)}s`;
                break;
        }
        
        return info;
    }
}
