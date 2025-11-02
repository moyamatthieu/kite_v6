import * as THREE from 'three';
import { EtatPhysique } from './EtatPhysique';
import { GeometrieCerfVolant } from '../cerfvolant/GeometrieCerfVolant';

/**
 * Gère les lignes de contrôle avec une contrainte géométrique simple.
 * Au lieu de forces de ressort, on maintient une distance fixe entre les poignées et les points d'attache.
 */
export class SystemeLignes {
    private _longueurBaseLignes: number;
    private deltaLongueur = 0; // Différence de longueur entre les lignes

    // Pour le logging et le debug
    public derniereTensionGauche = 0;
    public derniereTensionDroite = 0;
    public derniereForceGauche = new THREE.Vector3();
    public derniereForceDroite = new THREE.Vector3();

    constructor(longueurInitiale = 10) {
        this._longueurBaseLignes = longueurInitiale;
    }

    public get longueurLignes(): number {
        return this._longueurBaseLignes;
    }

    public set longueurLignes(valeur: number) {
        this._longueurBaseLignes = Math.max(5, Math.min(100, valeur));
    }

    public setDelta(delta: number): void {
        this.deltaLongueur = delta;
    }

    /**
     * Applique une contrainte géométrique : les points d'attache doivent rester
     * à une distance fixe des poignées. Les lignes créent aussi un couple qui fait
     * pivoter le cerf-volant vers sa position d'équilibre face au vent.
     */
    public appliquerContraintes(
        etat: EtatPhysique,
        positionsPoignees: { gauche: THREE.Vector3; droite: THREE.Vector3 },
        geometrie: GeometrieCerfVolant
    ): void {
        const pointCtrlGaucheLocal = geometrie.points.get('CTRL_GAUCHE');
        const pointCtrlDroitLocal = geometrie.points.get('CTRL_DROIT');

        if (!pointCtrlGaucheLocal || !pointCtrlDroitLocal) return;

        // Calcule les longueurs individuelles des lignes
        const longueurGauche = this._longueurBaseLignes - this.deltaLongueur / 2;
        const longueurDroite = this._longueurBaseLignes + this.deltaLongueur / 2;

        // Points d'attache dans le référentiel monde
        const pointGauche = pointCtrlGaucheLocal.clone().applyQuaternion(etat.orientation).add(etat.position);
        const pointDroit = pointCtrlDroitLocal.clone().applyQuaternion(etat.orientation).add(etat.position);

        // Vecteurs vers les poignées
        const versPoigneeGauche = new THREE.Vector3().subVectors(positionsPoignees.gauche, pointGauche);
        const versPoigneeDroite = new THREE.Vector3().subVectors(positionsPoignees.droite, pointDroit);

        const distGauche = versPoigneeGauche.length();
        const distDroite = versPoigneeDroite.length();

        // Réinitialiser les tensions pour le logging
        this.derniereTensionGauche = 0;
        this.derniereTensionDroite = 0;

        // --- CORRECTION DE POSITION ---
        // Chaque ligne tendue tire son point d'attache vers la poignée
        let correctionGauche = new THREE.Vector3();
        let correctionDroite = new THREE.Vector3();

        if (distGauche > longueurGauche) {
            const tension = distGauche - longueurGauche;
            this.derniereTensionGauche = tension;
            correctionGauche = versPoigneeGauche.normalize().multiplyScalar(tension);
        }

        if (distDroite > longueurDroite) {
            const tension = distDroite - longueurDroite;
            this.derniereTensionDroite = tension;
            correctionDroite = versPoigneeDroite.normalize().multiplyScalar(tension);
        }

        // Correction moyenne appliquée au centre de masse
        const correctionTotale = new THREE.Vector3().addVectors(correctionGauche, correctionDroite);
        if (correctionTotale.lengthSq() > 0.001) {
            correctionTotale.multiplyScalar(0.3); // Facteur adoucissant
            etat.position.add(correctionTotale);
            
            // Amortissement de la vitesse pour stabiliser
            etat.velocite.multiplyScalar(0.98);
        }

        // --- COUPLE DE RAPPEL ---
        // Les lignes créent un couple qui fait pivoter le cerf-volant
        // Chaque ligne tire sur son point d'attache, créant une force locale
        const brasGauche = pointCtrlGaucheLocal.clone().applyQuaternion(etat.orientation);
        const brasDroit = pointCtrlDroitLocal.clone().applyQuaternion(etat.orientation);

        // Couple créé par chaque ligne tendue
        let coupleTotalLignes = new THREE.Vector3();

        if (this.derniereTensionGauche > 0.01) {
            const forceGauche = versPoigneeGauche.normalize().multiplyScalar(this.derniereTensionGauche * 10);
            const coupleGauche = brasGauche.clone().cross(forceGauche);
            coupleTotalLignes.add(coupleGauche);
        }

        if (this.derniereTensionDroite > 0.01) {
            const forceDroite = versPoigneeDroite.normalize().multiplyScalar(this.derniereTensionDroite * 10);
            const coupleDroit = brasDroit.clone().cross(forceDroite);
            coupleTotalLignes.add(coupleDroit);
        }

        // Appliquer le couple à la vitesse angulaire
        if (coupleTotalLignes.lengthSq() > 0.001) {
            const accelerationAngulaire = coupleTotalLignes.clone().divide(etat.inertie);
            etat.velociteAngulaire.add(accelerationAngulaire.multiplyScalar(0.016)); // ~1 frame à 60fps
            
            // Amortissement angulaire
            etat.velociteAngulaire.multiplyScalar(0.98);
        }
    }
}