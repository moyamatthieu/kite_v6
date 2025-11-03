import { AutoPilote, ModeAutoPilote } from './AutoPilote';
import { EtatPhysique } from '../physique/EtatPhysique';
import { CONTROLE } from '../Config';

/**
 * Gère les entrées clavier de l'utilisateur pour contrôler les treuils de la station.
 * Intègre également le système d'autopilotage.
 */
export class ControleurUtilisateur {
    private deltaLongueur = 0;
    private touchesAppuyees = new Set<string>();
    
    private vitesseDelta = CONTROLE.VITESSE_DELTA;
    private vitesseRetour = CONTROLE.VITESSE_RETOUR;
    private deltaMax = CONTROLE.DELTA_MAX;
    
    // Système d'autopilotage
    public autoPilote?: AutoPilote;
    private modeEnAttente?: ModeAutoPilote; // Mode à appliquer lors de la prochaine mise à jour
    
    // Contrôle externe via slider
    private sliderActif = false;
    private deltaSlider = 0;
    private onDeltaChange?: (delta: number) => void; // Callback pour notifier le slider

    constructor() {
        this.configurerControlesClavier();
    }

    /**
     * Retourne true si l'utilisateur est en train d'appuyer sur des touches de pilotage.
     */
    public estActif(): boolean {
        return this.sliderActif || 
               this.touchesAppuyees.has('arrowleft') || this.touchesAppuyees.has('q') ||
               this.touchesAppuyees.has('arrowright') || this.touchesAppuyees.has('d');
    }
    
    /**
     * Initialise l'autopilote avec les dépendances nécessaires
     */
    public initialiserAutoPilote(autoPilote: AutoPilote): void {
        this.autoPilote = autoPilote;
    }

    private configurerControlesClavier(): void {
        window.addEventListener('keydown', (event) => {
            const key = event.key.toLowerCase();
            this.touchesAppuyees.add(key);
            
            // Gestion des touches d'autopilotage
            if (this.autoPilote && !event.repeat) {
                this.gererTouchesAutoPilote(key);
            }
        });
        window.addEventListener('keyup', (event) => this.touchesAppuyees.delete(event.key.toLowerCase()));
    }
    
    /**
     * Gère les touches pour activer/désactiver et changer les modes de l'autopilote
     */
    private gererTouchesAutoPilote(key: string): void {
        if (!this.autoPilote) return;
        
        // A = Toggle autopilote
        if (key === 'a') {
            this.autoPilote.setActif(!this.autoPilote.estActif());
            console.log(`Autopilote: ${this.autoPilote.estActif() ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
            return;
        }
        
        // Les autres touches ne fonctionnent que si l'autopilote est actif
        if (!this.autoPilote.estActif()) return;
        
        // Chiffres 1-7 pour changer de mode
        const modes: { [key: string]: ModeAutoPilote } = {
            '1': ModeAutoPilote.MANUEL,
            '2': ModeAutoPilote.STABILISATION,
            '3': ModeAutoPilote.MAINTIEN_ALTITUDE,
            '4': ModeAutoPilote.MAINTIEN_POSITION,
            '5': ModeAutoPilote.ZENITH,
            '6': ModeAutoPilote.TRAJECTOIRE_CIRCULAIRE,
            '7': ModeAutoPilote.ACROBATIQUE
        };
        
        if (modes[key]) {
            this.modeEnAttente = modes[key];
            console.log(`Mode autopilote demandé: ${modes[key]}`);
        }
    }

    /**
     * Met à jour le delta de longueur via le slider (seule source de contrôle).
     * Hiérarchie: clavier/autopilote → deltaSlider → deltaLongueur
     * À appeler à chaque frame.
     */
    public mettreAJour(deltaTime: number, etatPhysique?: EtatPhysique, longueurLignes?: number): void {
        // Appliquer le mode en attente si nécessaire
        if (this.modeEnAttente && etatPhysique && this.autoPilote) {
            this.autoPilote.setMode(this.modeEnAttente, etatPhysique, longueurLignes);
            this.modeEnAttente = undefined;
        }
        
        // Déterminer la commande cible selon priorité
        let deltaTarget = 0;
        
        // Priorité 1 : Slider utilisateur (manipulation directe)
        if (this.sliderActif) {
            deltaTarget = this.deltaSlider;
        }
        // Priorité 2 : Autopilote
        else if (this.autoPilote?.estActif() && etatPhysique) {
            deltaTarget = this.autoPilote.calculerCommande(etatPhysique, deltaTime);
        }
        // Priorité 3 : Clavier
        else {
            const gauche = this.touchesAppuyees.has('arrowleft') || this.touchesAppuyees.has('q');
            const droite = this.touchesAppuyees.has('arrowright') || this.touchesAppuyees.has('d');
            
            // Gauche = delta positif (raccourcit ligne gauche), Droite = delta négatif (raccourcit ligne droite)
            const direction = (gauche ? 1 : 0) - (droite ? 1 : 0);

            if (direction !== 0) {
                // Appliquer le changement de longueur progressif
                deltaTarget = this.deltaLongueur + direction * this.vitesseDelta * deltaTime;
            } else {
                // Retourner progressivement à zéro
                if (Math.abs(this.deltaLongueur) > 0.01) {
                    const signe = Math.sign(this.deltaLongueur);
                    deltaTarget = this.deltaLongueur - signe * this.vitesseRetour * deltaTime;
                    // Éviter l'oscillation autour de zéro
                    if (Math.sign(deltaTarget) !== signe) {
                        deltaTarget = 0;
                    }
                } else {
                    deltaTarget = 0;
                }
            }
        }
        
        // Limiter le delta cible
        deltaTarget = Math.max(-this.deltaMax, Math.min(this.deltaMax, deltaTarget));
        
        // Le deltaLongueur suit TOUJOURS le slider (mise à jour via callback externe)
        this.deltaLongueur = deltaTarget;
        
        // Notifier le slider de la nouvelle valeur (clavier/autopilote → slider → cerf-volant)
        if (!this.sliderActif && this.onDeltaChange) {
            this.onDeltaChange(deltaTarget);
        }
    }
    
    /**
     * Retourne la différence de longueur des lignes désirée par l'utilisateur.
     */
    public getDeltaLongueur(): number {
        return this.deltaLongueur;
    }
    
    /**
     * Définit le callback appelé quand le delta change (pour synchroniser le slider)
     */
    public surChangementDelta(callback: (delta: number) => void): void {
        this.onDeltaChange = callback;
    }
    
    /**
     * Permet de récupérer l'état actuel de l'autopilote pour affichage
     */
    public getInfosAutoPilote(etatPhysique: EtatPhysique): string | null {
        return this.autoPilote?.getInfosEtat(etatPhysique) || null;
    }
    
    /**
     * Permet de changer le mode de l'autopilote depuis l'extérieur
     */
    public changerModeAutoPilote(mode: ModeAutoPilote, etatPhysique: EtatPhysique, longueurLignes?: number): void {
        this.autoPilote?.setMode(mode, etatPhysique, longueurLignes);
    }
    
    /**
     * Définit le delta depuis un contrôle externe (slider)
     */
    public setDeltaSlider(delta: number): void {
        this.sliderActif = delta !== 0;
        this.deltaSlider = Math.max(-this.deltaMax, Math.min(this.deltaMax, delta));
        // Quand le slider change, appliquer immédiatement au deltaLongueur
        this.deltaLongueur = this.deltaSlider;
    }
    
    /**
     * Réinitialise le contrôleur (appelé lors d'un reset de simulation)
     */
    public reinitialiser(): void {
        // Réinitialiser tous les états de contrôle
        this.deltaLongueur = 0;
        this.deltaSlider = 0;
        this.sliderActif = false;
        this.modeEnAttente = undefined;
        
        // Désactiver l'autopilote (mais garder le mode sélectionné)
        if (this.autoPilote) {
            this.autoPilote.setActif(false);
        }
        
        // Notifier le slider du reset (retour à 0)
        if (this.onDeltaChange) {
            this.onDeltaChange(0);
        }
    }
}
