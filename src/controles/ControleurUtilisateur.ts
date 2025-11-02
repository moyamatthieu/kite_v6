import { AutoPilote, ModeAutoPilote } from './AutoPilote';
import { EtatPhysique } from '../physique/EtatPhysique';

/**
 * Gère les entrées clavier de l'utilisateur pour contrôler les treuils de la station.
 * Intègre également le système d'autopilotage.
 */
export class ControleurUtilisateur {
    private deltaLongueur = 0;
    private touchesAppuyees = new Set<string>();
    
    private vitesseDelta = 0.8; // Vitesse de changement de longueur en m/s
    private vitesseRetour = 1.0; // Vitesse de retour à 0
    private deltaMax = 0.6; // 60cm de différence de longueur totale max
    
    // Système d'autopilotage
    public autoPilote?: AutoPilote;
    private modeEnAttente?: ModeAutoPilote; // Mode à appliquer lors de la prochaine mise à jour

    constructor() {
        this.configurerControlesClavier();
    }

    /**
     * Retourne true si l'utilisateur est en train d'appuyer sur des touches de pilotage.
     */
    public estActif(): boolean {
        return this.touchesAppuyees.has('arrowleft') || this.touchesAppuyees.has('q') ||
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
        
        // Chiffres 1-6 pour changer de mode
        const modes: { [key: string]: ModeAutoPilote } = {
            '1': ModeAutoPilote.MANUEL,
            '2': ModeAutoPilote.STABILISATION,
            '3': ModeAutoPilote.MAINTIEN_ALTITUDE,
            '4': ModeAutoPilote.MAINTIEN_POSITION,
            '5': ModeAutoPilote.TRAJECTOIRE_CIRCULAIRE,
            '6': ModeAutoPilote.ACROBATIQUE
        };
        
        if (modes[key]) {
            this.modeEnAttente = modes[key];
            console.log(`Mode autopilote demandé: ${modes[key]}`);
        }
    }

    /**
     * Met à jour le delta de longueur en fonction des touches appuyées.
     * Si l'autopilote est actif, utilise sa commande au lieu de l'entrée manuelle.
     * À appeler à chaque frame.
     */
    public mettreAJour(deltaTime: number, etatPhysique?: EtatPhysique): void {
        // Appliquer le mode en attente si nécessaire
        if (this.modeEnAttente && etatPhysique && this.autoPilote) {
            this.autoPilote.setMode(this.modeEnAttente, etatPhysique);
            this.modeEnAttente = undefined;
        }
        
        // Si l'autopilote est actif et un état physique est fourni, utiliser sa commande
        if (this.autoPilote?.estActif() && etatPhysique) {
            this.deltaLongueur = this.autoPilote.calculerCommande(etatPhysique, deltaTime);
            return;
        }
        
        // Sinon, contrôle manuel
        const gauche = this.touchesAppuyees.has('arrowleft') || this.touchesAppuyees.has('q');
        const droite = this.touchesAppuyees.has('arrowright') || this.touchesAppuyees.has('d');
        
        // Gauche = delta positif (raccourcit ligne gauche), Droite = delta négatif (raccourcit ligne droite)
        const direction = (gauche ? 1 : 0) - (droite ? 1 : 0);

        if (direction !== 0) {
            // Appliquer le changement de longueur
            this.deltaLongueur += direction * this.vitesseDelta * deltaTime;
        } else {
            // Retourner progressivement à zéro
            if (Math.abs(this.deltaLongueur) > 0.01) {
                const signe = Math.sign(this.deltaLongueur);
                this.deltaLongueur -= signe * this.vitesseRetour * deltaTime;
                // Éviter l'oscillation autour de zéro
                if (Math.sign(this.deltaLongueur) !== signe) {
                    this.deltaLongueur = 0;
                }
            } else {
                this.deltaLongueur = 0;
            }
        }
        
        // Limiter le delta
        this.deltaLongueur = Math.max(-this.deltaMax, Math.min(this.deltaMax, this.deltaLongueur));
    }
    
    /**
     * Retourne la différence de longueur des lignes désirée par l'utilisateur.
     */
    public getDeltaLongueur(): number {
        return this.deltaLongueur;
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
    public changerModeAutoPilote(mode: ModeAutoPilote, etatPhysique: EtatPhysique): void {
        this.autoPilote?.setMode(mode, etatPhysique);
    }
}