/**
 * Gère les entrées clavier de l'utilisateur pour contrôler les treuils de la station.
 */
export class ControleurUtilisateur {
    private deltaLongueur = 0;
    private touchesAppuyees = new Set<string>();
    
    private vitesseDelta = 0.8; // Vitesse de changement de longueur en m/s
    private vitesseRetour = 1.0; // Vitesse de retour à 0
    private deltaMax = 0.6; // 60cm de différence de longueur totale max

    constructor() {
        this.configurerControlesClavier();
    }

    private configurerControlesClavier(): void {
        window.addEventListener('keydown', (event) => this.touchesAppuyees.add(event.key.toLowerCase()));
        window.addEventListener('keyup', (event) => this.touchesAppuyees.delete(event.key.toLowerCase()));
    }

    /**
     * Met à jour le delta de longueur en fonction des touches appuyées.
     * À appeler à chaque frame.
     */
    public mettreAJour(deltaTime: number): void {
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
}