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
     * Applique une contrainte géométrique : corrige la position des points d'attache
     * pour qu'ils respectent la distance maximale aux poignées.
     * Le couple émerge naturellement du fait que les corrections sont appliquées
     * aux points CTRL qui sont décalés du centre de masse.
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

        // Correction géométrique pure : si un point dépasse, on le ramène
        if (distGauche > longueurGauche) {
            this.derniereTensionGauche = distGauche - longueurGauche;
            const correction = versPoigneeGauche.normalize().multiplyScalar(this.derniereTensionGauche * 0.5);
            etat.position.add(correction);
            etat.velocite.multiplyScalar(0.95);
        }

        if (distDroite > longueurDroite) {
            this.derniereTensionDroite = distDroite - longueurDroite;
            const correction = versPoigneeDroite.normalize().multiplyScalar(this.derniereTensionDroite * 0.5);
            etat.position.add(correction);
            etat.velocite.multiplyScalar(0.95);
        }
    }
}