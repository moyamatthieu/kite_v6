import * as THREE from 'three';
import { EtatPhysique } from './EtatPhysique';
import { GeometrieCerfVolant } from '../cerfvolant/GeometrieCerfVolant';

/**
 * Gère les propriétés et les forces des lignes de contrôle.
 */
export class SystemeLignes {
    private _longueurBaseLignes: number;
    private deltaLongueur = 0; // Différence de longueur entre les lignes
    
    // Paramètres physiques optimisés pour stabilité ET réalisme
    // ÉQUILIBRE CRITIQUE : raideur et amortissement doivent être cohérents
    // Amortissement critique = 2√(k×m) ≈ 2√(150×0.5) ≈ 17 Ns/m
    // On utilise 2× critique (34 Ns/m) pour un sur-amortissement stable
    public raideur = 10; // N/m - compromis entre réalisme et stabilité
    public amortissement = 10; // Ns/m - sur-amortissement (2× critique)
    public tensionMin = 0.008; // N - tension minimale réaliste (poids des lignes)
    
    // Longueur au repos : 97% de la longueur nominale
    // Cela crée une pré-tension qui évite les discontinuités tension = 0
    private readonly RATIO_LONGUEUR_REPOS = 0.99;
    
    // LISSAGE TEMPOREL : Filtre passe-bas pour éviter les variations brutales de tension
    // qui créent des accélérations explosives perturbant les calculs aérodynamiques
    // coefficientLissage = α : plus α est petit, plus le lissage est fort
    // α=0.5 signifie : tension_lissée = 50% nouvelle + 50% ancienne
    public coefficientLissage = 0.45; // Lissage significatif pour stabilité
    private tensionLisseeGauche = 0.8; // Initialisé à tension_min
    private tensionLisseeDroite = 0.8; // Initialisé à tension_min

    // Pour le logging et le debug
    public derniereTensionGauche = 0;
    public derniereTensionDroite = 0;
    public derniereForceGauche = new THREE.Vector3();
    public derniereForceDroite = new THREE.Vector3();

    constructor(longueurInitiale = 15) {
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
     * Réinitialise les tensions lissées à leur valeur minimale.
     * À appeler lors de la réinitialisation de la simulation.
     */
    public reinitialiserTensionsLissees(): void {
        this.tensionLisseeGauche = this.tensionMin;
        this.tensionLisseeDroite = this.tensionMin;
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
                // LISSAGE TEMPOREL : filtre passe-bas sur la tension
                // tension_lissée = α × tension_nouvelle + (1-α) × tension_précédente
                const tensionBrute = resultG.tension;
                this.tensionLisseeGauche = this.coefficientLissage * tensionBrute + (1 - this.coefficientLissage) * this.tensionLisseeGauche;
                
                // Recalculer la force avec la tension lissée
                const forceLissee = resultG.direction.clone().multiplyScalar(-this.tensionLisseeGauche);
                const coupleLisse = resultG.brasDeLevier.clone().cross(forceLissee);
                
                forceTotale.add(forceLissee);
                coupleTotal.add(coupleLisse);
                this.derniereTensionGauche = this.tensionLisseeGauche;
                this.derniereForceGauche.copy(forceLissee);
            }

            const resultD = this.calculerForcePourUneLigne(etat, pointCtrlDroitLocal, positionsPoignees.droite, longueurDroite);
            if (resultD) {
                // LISSAGE TEMPOREL sur la ligne droite aussi
                const tensionBrute = resultD.tension;
                this.tensionLisseeDroite = this.coefficientLissage * tensionBrute + (1 - this.coefficientLissage) * this.tensionLisseeDroite;
                
                // Recalculer la force avec la tension lissée
                const forceLissee = resultD.direction.clone().multiplyScalar(-this.tensionLisseeDroite);
                const coupleLisse = resultD.brasDeLevier.clone().cross(forceLissee);
                
                forceTotale.add(forceLissee);
                coupleTotal.add(coupleLisse);
                this.derniereTensionDroite = this.tensionLisseeDroite;
                this.derniereForceDroite.copy(forceLissee);
            }
        }

        return { force: forceTotale, couple: coupleTotal };
    }

    private calculerForcePourUneLigne(
        etat: EtatPhysique, 
        pointLocal: THREE.Vector3, 
        poignee: THREE.Vector3,
        longueurLigne: number
    ): { force: THREE.Vector3; couple: THREE.Vector3; tension: number; direction: THREE.Vector3; brasDeLevier: THREE.Vector3 } | null {
        const pointMonde = pointLocal.clone().applyQuaternion(etat.orientation).add(etat.position);
        
        // Calcul de la vitesse du point d'attache (vitesse du CdM + vitesse tangentielle)
        const r_world = pointLocal.clone().applyQuaternion(etat.orientation);
        const tangential_velocity = etat.velociteAngulaire.clone().cross(r_world);
        const velocitePoint = etat.velocite.clone().add(tangential_velocity);

        const diff = new THREE.Vector3().subVectors(pointMonde, poignee);
        const distance = diff.length();
        
        // Protection contre division par zéro
        if (distance < 0.01) {
            return null;
        }
        
        const direction = diff.clone().normalize();
        const brasDeLevier = pointLocal.clone().applyQuaternion(etat.orientation);
        
        // MODÈLE BI-RÉGIME pour éviter discontinuité et oscillations
        // 
        // Longueur au repos = 97% de longueur nominale
        // Cela crée une pré-tension même quand le cerf-volant se rapproche
        const longueurRepos = longueurLigne * this.RATIO_LONGUEUR_REPOS;
        
        let tension: number;
        
        if (distance < longueurRepos) {
            // RÉGIME 1 : Distance courte → tension minimale constante
            // Simule le poids des lignes et maintient le contrôle
            tension = this.tensionMin;
        } else {
            // RÉGIME 2 : Distance normale → modèle ressort-amortisseur
            const elongation = distance - longueurRepos;
            
            // Force de rappel élastique
            const forceRappel = this.raideur * elongation;
            
            // Force d'amortissement (projection de vitesse sur direction de la ligne)
            const velociteRelative = velocitePoint.dot(direction);
            const forceAmortissement = this.amortissement * velociteRelative;
            
            // Tension totale = rappel + amortissement
            tension = forceRappel + forceAmortissement;
            
            // Limitation douce : tension entre min et max
            const tensionMax = 200; // N - limite pour éviter forces explosives
            tension = Math.max(this.tensionMin, Math.min(tension, tensionMax));
        }
        
        // Sécurité : tension ne peut pas être négative
        if (tension <= 0) {
            tension = this.tensionMin;
        }
        
        // La force tire le cerf-volant vers la poignée (direction opposée à diff)
        const force = direction.clone().multiplyScalar(-tension);
        const couple = brasDeLevier.clone().cross(force);

        return { force, couple, tension, direction, brasDeLevier };
    }
}