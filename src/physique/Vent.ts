import * as THREE from 'three';

export interface ParametresVent {
    vitesse: number; // en km/h
    turbulence: number; // en %
}

/**
 * Simule le vent et ses variations.
 */
export class Vent {
    public parametres: ParametresVent;
    private vecteurVentGlobal: THREE.Vector3;
    private tempsEcoule = 0;

    constructor() {
        this.parametres = {
            vitesse: 31,
            turbulence: 0,
        };
        this.vecteurVentGlobal = new THREE.Vector3();
        this.mettreAJourVecteurVent();
    }
    
    /**
     * Met à jour le vecteur de vent global à partir des paramètres.
     */
    private mettreAJourVecteurVent(): void {
        const vitesseMs = this.parametres.vitesse / 3.6;
        // Vent d'ouest vers est (axe X positif)
        this.vecteurVentGlobal.set(vitesseMs, 0, 0);
    }
    
    /**
     * Calcule le vent ressenti par le cerf-volant (vent global - vitesse du cerf-volant).
     */
    public getVentApparent(velociteCerfVolant: THREE.Vector3): THREE.Vector3 {
        this.mettreAJourVecteurVent();
        const ventAvecTurbulence = this.vecteurVentGlobal.clone();
        
        // Ajout de turbulence simple pour le réalisme
        const forceTurbulence = (this.parametres.turbulence / 100) * (this.parametres.vitesse / 3.6);
        if (forceTurbulence > 0) {
            this.tempsEcoule += 0.016; // Approximation du deltaTime
            ventAvecTurbulence.x += (Math.sin(this.tempsEcoule * 2) * forceTurbulence) / 2;
            ventAvecTurbulence.y += (Math.sin(this.tempsEcoule * 1.5) * forceTurbulence) / 4;
        }

        return ventAvecTurbulence.sub(velociteCerfVolant);
    }
}