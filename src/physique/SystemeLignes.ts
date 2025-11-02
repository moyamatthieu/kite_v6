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
     * Applique une contrainte géométrique stricte : les points CTRL doivent rester
     * exactement à la distance des poignées (comme un pendule rigide).
     * Le cerf-volant pivote naturellement autour de ce point d'attache.
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

        // Vecteurs depuis les poignées vers les points d'attache
        const versPointGauche = new THREE.Vector3().subVectors(pointGauche, positionsPoignees.gauche);
        const versPointDroit = new THREE.Vector3().subVectors(pointDroit, positionsPoignees.droite);

        const distGauche = versPointGauche.length();
        const distDroite = versPointDroit.length();

        // Réinitialiser les tensions pour le logging
        this.derniereTensionGauche = 0;
        this.derniereTensionDroite = 0;

        // Point milieu entre les deux points de contrôle (centre de suspension)
        const milieu = new THREE.Vector3().addVectors(pointGauche, pointDroit).multiplyScalar(0.5);
        const milieuPoignees = new THREE.Vector3().addVectors(positionsPoignees.gauche, positionsPoignees.droite).multiplyScalar(0.5);

        // Contrainte de pendule : le centre de suspension doit être à la bonne distance
        const versMilieu = new THREE.Vector3().subVectors(milieu, milieuPoignees);
        const distMilieu = versMilieu.length();
        const longueurMoyenne = (longueurGauche + longueurDroite) / 2;

        // Si le cerf-volant s'éloigne trop, on le ramène comme un pendule
        if (distMilieu > longueurMoyenne) {
            this.derniereTensionGauche = distMilieu - longueurMoyenne;
            this.derniereTensionDroite = distMilieu - longueurMoyenne;
            
            // Correction de position vers le point d'attache
            const correction = versMilieu.normalize().multiplyScalar(-(distMilieu - longueurMoyenne) * 0.8);
            etat.position.add(correction);
            
            // La composante de vitesse qui éloigne du point d'attache est annulée (pendule inextensible)
            const directionRadiale = versMilieu.normalize();
            const vitesseRadiale = etat.velocite.dot(directionRadiale);
            if (vitesseRadiale > 0) {
                etat.velocite.addScaledVector(directionRadiale, -vitesseRadiale * 0.8);
            }
        }
    }
}