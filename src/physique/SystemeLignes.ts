import * as THREE from 'three';
import { EtatPhysique } from './EtatPhysique';
import { GeometrieCerfVolant } from '../cerfvolant/GeometrieCerfVolant';

/**
 * Gère les propriétés et les forces des lignes de contrôle.
 */
export class SystemeLignes {
    private _longueurBaseLignes: number;
    private deltaLongueur = 0; // Différence de longueur entre les lignes
    
    // Paramètres physiques pour des lignes avec comportement réaliste
    public raideur = 5000; // N/m - rigide mais pas trop pour éviter les chocs
    public amortissement = 100; // Ns/m - amortissement très élevé pour stabilité

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

    public calculerForces(
        etat: EtatPhysique,
        positionsPoignees: { gauche: THREE.Vector3; droite: THREE.Vector3 },
        geometrie: GeometrieCerfVolant
    ): { force: THREE.Vector3; couple: THREE.Vector3 } {
        const forceTotale = new THREE.Vector3();
        const coupleTotal = new THREE.Vector3();
        
        this.derniereTensionGauche = 0;
        this.derniereTensionDroite = 0;
        this.derniereForceGauche.set(0, 0, 0);
        this.derniereForceDroite.set(0, 0, 0);

        const pointCtrlGaucheLocal = geometrie.points.get('CTRL_GAUCHE');
        const pointCtrlDroitLocal = geometrie.points.get('CTRL_DROIT');

        // Calcule les longueurs individuelles des lignes
        // delta > 0 = virage à gauche -> ligne gauche plus courte
        const longueurGauche = this._longueurBaseLignes - this.deltaLongueur / 2;
        const longueurDroite = this._longueurBaseLignes + this.deltaLongueur / 2;

        if (pointCtrlGaucheLocal && pointCtrlDroitLocal) {
            const resultG = this.calculerForcePourUneLigne(etat, pointCtrlGaucheLocal, positionsPoignees.gauche, longueurGauche);
            if (resultG) {
                forceTotale.add(resultG.force);
                coupleTotal.add(resultG.couple);
                this.derniereTensionGauche = resultG.tension;
                this.derniereForceGauche.copy(resultG.force);
            }

            const resultD = this.calculerForcePourUneLigne(etat, pointCtrlDroitLocal, positionsPoignees.droite, longueurDroite);
            if (resultD) {
                forceTotale.add(resultD.force);
                coupleTotal.add(resultD.couple);
                this.derniereTensionDroite = resultD.tension;
                this.derniereForceDroite.copy(resultD.force);
            }
        }

        return { force: forceTotale, couple: coupleTotal };
    }

    private calculerForcePourUneLigne(
        etat: EtatPhysique, 
        pointLocal: THREE.Vector3, 
        poignee: THREE.Vector3,
        longueurLigne: number
    ): { force: THREE.Vector3; couple: THREE.Vector3; tension: number } {
        const pointMonde = pointLocal.clone().applyQuaternion(etat.orientation).add(etat.position);
        
        // Calcul de la vitesse du point d'attache (vitesse du CdM + vitesse tangentielle)
        const r_world = pointLocal.clone().applyQuaternion(etat.orientation);
        const tangential_velocity = etat.velociteAngulaire.clone().cross(r_world);
        const velocitePoint = etat.velocite.clone().add(tangential_velocity);

        const diff = new THREE.Vector3().subVectors(pointMonde, poignee);
        const distance = diff.length();
        
        // Ligne détendue : pas de force
        if (distance <= longueurLigne) {
            return { force: new THREE.Vector3(), couple: new THREE.Vector3(), tension: 0 };
        }

        const direction = diff.normalize();
        
        // Calcul de la force élastique (rappel)
        const elongation = distance - longueurLigne;
        const forceRappel = this.raideur * elongation;
        
        // Calcul de la force d'amortissement (projection de la vitesse sur la direction)
        const velociteRelative = velocitePoint.dot(direction);
        const forceAmortissement = this.amortissement * velociteRelative;

        // Force totale = rappel + amortissement
        const magnitudeForce = forceRappel + forceAmortissement;

        // Limite de tension maximale pour éviter des forces explosives
        const tensionMax = 200; // N - réduit pour plus de douceur
        const magnitudeForceClampee = Math.max(0, Math.min(magnitudeForce, tensionMax));
        
        if (magnitudeForceClampee <= 0) {
             return { force: new THREE.Vector3(), couple: new THREE.Vector3(), tension: 0 };
        }
        
        // La force tire le cerf-volant vers la poignée (direction opposée à diff)
        const force = direction.clone().multiplyScalar(-magnitudeForceClampee);
        const brasDeLevier = pointLocal.clone().applyQuaternion(etat.orientation);
        const couple = brasDeLevier.clone().cross(force);

        return { force, couple, tension: magnitudeForceClampee };
    }
}