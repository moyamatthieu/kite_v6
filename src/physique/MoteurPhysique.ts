import * as THREE from 'three';
import { EtatPhysique } from './EtatPhysique';
import { CalculateurAerodynamique, ForceDetaillee } from './CalculateurAerodynamique';
import { SolveurContraintes } from './SolveurContraintes';
import { SystemeLignes } from './SystemeLignes';
import { Vent } from './Vent';
import { GeometrieCerfVolant } from '../cerfvolant/GeometrieCerfVolant';

/**
 * Moteur physique principal qui orchestre tous les calculs.
 */
export class MoteurPhysique {
    public etatCerfVolant: EtatPhysique;
    public vent: Vent;
    public systemeLignes: SystemeLignes;
    
    private calculateurAero: CalculateurAerodynamique;
    private solveurContraintes: SolveurContraintes;
    private gravite = new THREE.Vector3(0, -9.81, 0);
    
    // Pas d'amortissement artificiel - la physique pure doit gouverner
    // L'amortissement réel vient de la traînée aérodynamique uniquement

    // Propriétés publiques pour le logging
    public derniereForceAero: THREE.Vector3 = new THREE.Vector3();
    public derniereForceGravite: THREE.Vector3 = new THREE.Vector3();
    public derniereForceLignes: THREE.Vector3 = new THREE.Vector3();
    public derniereForceTotale: THREE.Vector3 = new THREE.Vector3();
    public derniereForceAeroEtGravite: THREE.Vector3 = new THREE.Vector3(); // Aéro + Gravité seulement
    public dernieresForcesAeroDetaillees: ForceDetaillee[] = [];

    constructor(positionInitiale: THREE.Vector3) {
        this.etatCerfVolant = new EtatPhysique(positionInitiale);
        this.vent = new Vent();
        this.systemeLignes = new SystemeLignes();
        this.calculateurAero = new CalculateurAerodynamique();
        this.solveurContraintes = new SolveurContraintes();
    }

    public reinitialiser(position: THREE.Vector3): void {
        this.etatCerfVolant.reinitialiser(position);
    }

    /**
     * Met à jour l'état physique du cerf-volant pour une frame.
     */
    public mettreAJour(deltaTime: number, positionsPoignees: {gauche: THREE.Vector3, droite: THREE.Vector3}, geometrie: GeometrieCerfVolant): void {
        const etat = this.etatCerfVolant;
        
        // --- Réinitialisation des forces pour le logging ---
        this.derniereForceAero.set(0, 0, 0);
        this.derniereForceGravite.set(0, 0, 0);

        const forceTotale = new THREE.Vector3();
        const coupleTotal = new THREE.Vector3();

        // 1. FORCES AÉRODYNAMIQUES (par surface)
        const ventApparent = this.vent.getVentApparent(etat.velocite);
        this.dernieresForcesAeroDetaillees = this.calculateurAero.calculerForcesAeroDetaillees(
            geometrie,
            etat.orientation,
            ventApparent
        );

        this.dernieresForcesAeroDetaillees.forEach(f => {
            forceTotale.add(f.force);
            const brasDeLevier = f.pointApplicationLocal.clone().applyQuaternion(etat.orientation);
            const couple = new THREE.Vector3().crossVectors(brasDeLevier, f.force);
            coupleTotal.add(couple);

            // Pour le logging
            this.derniereForceAero.add(f.force);
        });
        
        // 2. FORCE DE GRAVITÉ (distribuée par surface pour la clarté)
        const nbPanneaux = geometrie.panneaux.length;
        if (nbPanneaux > 0) {
            const masseParPanneau = etat.masse / nbPanneaux;
            const forceGraviteParPanneau = this.gravite.clone().multiplyScalar(masseParPanneau);

            geometrie.panneaux.forEach(panneauDef => {
                const points = panneauDef.map(nom => geometrie.points.get(nom)!);
                const centrePanneauLocal = new THREE.Vector3().add(points[0]).add(points[1]).add(points[2]).multiplyScalar(1/3);

                const force = forceGraviteParPanneau;
                forceTotale.add(force);
                const brasDeLevier = centrePanneauLocal.clone().applyQuaternion(etat.orientation);
                const couple = new THREE.Vector3().crossVectors(brasDeLevier, force);
                coupleTotal.add(couple);

                // Pour le logging
                this.derniereForceGravite.add(force);
            });
        }

        // 3. FORCES DES LIGNES
        const { force: forceLignes, couple: coupleLignes } = this.systemeLignes.calculerForces(
            etat,
            positionsPoignees,
            geometrie
        );
        
        // Stocker la force aéro + gravité (avant d'ajouter les lignes)
        this.derniereForceAeroEtGravite.copy(forceTotale);
        
        forceTotale.add(forceLignes);
        coupleTotal.add(coupleLignes);

        // Stocker les forces totales pour le logging
        this.derniereForceLignes.copy(forceLignes);
        this.derniereForceTotale.copy(forceTotale);

        // 4. Intégration du mouvement (simple Euler)
        const acceleration = forceTotale.clone().divideScalar(etat.masse);
        etat.velocite.add(acceleration.multiplyScalar(deltaTime));
        
        // Utilisation de l'inertie pour un calcul physiquement correct de l'accélération angulaire
        const accelerationAngulaire = coupleTotal.clone().divide(etat.inertie);
        etat.velociteAngulaire.add(accelerationAngulaire.multiplyScalar(deltaTime));

        // Garde-fou contre les valeurs NaN ou infinies
        if (!isFinite(etat.velocite.x) || !isFinite(etat.velocite.y) || !isFinite(etat.velocite.z)) {
            console.warn('⚠️ Vitesse invalide détectée, réinitialisation');
            etat.velocite.set(0, 0, 0);
        }
        if (!isFinite(etat.velociteAngulaire.x) || !isFinite(etat.velociteAngulaire.y) || !isFinite(etat.velociteAngulaire.z)) {
            console.warn('⚠️ Vitesse angulaire invalide détectée, réinitialisation');
            etat.velociteAngulaire.set(0, 0, 0);
        }
        
        // Limiter les vitesses extrêmes
        const vitesseMax = 50; // m/s
        if (etat.velocite.lengthSq() > vitesseMax * vitesseMax) {
            etat.velocite.normalize().multiplyScalar(vitesseMax);
        }
        const vitesseAngMax = 10; // rad/s
        if (etat.velociteAngulaire.lengthSq() > vitesseAngMax * vitesseAngMax) {
            etat.velociteAngulaire.normalize().multiplyScalar(vitesseAngMax);
        }

        // 5. Mise à jour de la position et de l'orientation
        etat.position.add(etat.velocite.clone().multiplyScalar(deltaTime));
        
        // Vérifier que la position reste valide
        if (!isFinite(etat.position.x) || !isFinite(etat.position.y) || !isFinite(etat.position.z)) {
            console.error('❌ Position invalide détectée, réinitialisation nécessaire');
            etat.position.set(10, 5, 0);
            etat.velocite.set(0, 0, 0);
            etat.velociteAngulaire.set(0, 0, 0);
        }
        
        if (etat.velociteAngulaire.lengthSq() > 0) {
            const angle = etat.velociteAngulaire.length() * deltaTime;
            // Limiter l'angle de rotation pour éviter les instabilités
            if (angle < Math.PI && isFinite(angle)) {
                const deltaRotation = new THREE.Quaternion().setFromAxisAngle(
                    etat.velociteAngulaire.clone().normalize(),
                    angle
                );
                etat.orientation.premultiply(deltaRotation).normalize();
            }
        }
        
        // 6. Résolution des contraintes (sol)
        this.solveurContraintes.appliquerContraintes(etat, geometrie);
    }
}
