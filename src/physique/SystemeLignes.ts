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
     * Applique une contrainte géométrique simple : les points d'attache doivent rester
     * à une distance fixe des poignées. Pas de forces, juste une correction de position.
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

        // Calcul du milieu entre les deux points d'attache
        const milieu = new THREE.Vector3().addVectors(pointGauche, pointDroit).multiplyScalar(0.5);

        // Correction de position : ramener le cerf-volant vers les poignées
        let correctionTotale = new THREE.Vector3();
        let nbCorrections = 0;

        if (distGauche > longueurGauche) {
            const correction = versPoigneeGauche.normalize().multiplyScalar(distGauche - longueurGauche);
            correctionTotale.add(correction);
            nbCorrections++;
            this.derniereTensionGauche = distGauche - longueurGauche;
        } else {
            this.derniereTensionGauche = 0;
        }

        if (distDroite > longueurDroite) {
            const correction = versPoigneeDroite.normalize().multiplyScalar(distDroite - longueurDroite);
            correctionTotale.add(correction);
            nbCorrections++;
            this.derniereTensionDroite = distDroite - longueurDroite;
        } else {
            this.derniereTensionDroite = 0;
        }

        // Appliquer la correction moyenne pour déplacer le centre de masse
        if (nbCorrections > 0) {
            correctionTotale.multiplyScalar(0.5); // Adoucir la correction
            etat.position.add(correctionTotale);
            
            // Ajuster aussi la vitesse pour éviter les oscillations
            etat.velocite.multiplyScalar(0.95);
        }

        // Calcul du couple dû à la différence de tension
        // Si les tensions sont différentes, cela crée une rotation
        const diffTension = this.derniereTensionDroite - this.derniereTensionGauche;
        if (Math.abs(diffTension) > 0.01) {
            // Vecteur entre les deux points d'attache (dans le référentiel monde)
            const entrePoints = new THREE.Vector3().subVectors(pointDroit, pointGauche);
            const axeRotation = entrePoints.normalize();
            
            // Couple proportionnel à la différence de tension
            const coupleScalaire = diffTension * 0.1; // Facteur d'ajustement
            const coupleAngulaire = axeRotation.multiplyScalar(coupleScalaire);
            
            // Appliquer directement à la vitesse angulaire
            etat.velociteAngulaire.add(coupleAngulaire.multiplyScalar(0.01 / etat.inertie.x));
        }
    }
}