import * as THREE from 'three';
import { EtatPhysique } from './EtatPhysique';
import { GeometrieCerfVolant } from '../cerfvolant/GeometrieCerfVolant';

/**
 * Résout les contraintes physiques après l'intégration du mouvement.
 * (ex: les lignes ne peuvent pas être plus longues que leur longueur max).
 */
export class SolveurContraintes {
    private hauteurSol = 0.05; // Garde le point le plus bas légèrement au-dessus du sol (y=0)

    /**
     * Applique toutes les contraintes à l'état physique.
     */
    public appliquerContraintes(etat: EtatPhysique, geometrie: GeometrieCerfVolant): void {
        this.gererCollisionSol(etat, geometrie);
    }

    /**
     * Empêche les points du cerf-volant de passer à travers le sol.
     * Cette méthode vérifie toute la géométrie pour un contact précis.
     */
    private gererCollisionSol(etat: EtatPhysique, geometrie: GeometrieCerfVolant): void {
        let penetrationMaximale = 0;

        // 1. Itérer sur tous les points de la structure pour trouver la pénétration la plus profonde.
        geometrie.points.forEach(pointLocal => {
            const pointMonde = pointLocal.clone().applyQuaternion(etat.orientation).add(etat.position);
            const penetration = this.hauteurSol - pointMonde.y;

            if (penetration > penetrationMaximale) {
                penetrationMaximale = penetration;
            }
        });

        // 2. Si un point a pénétré le sol, appliquer la correction.
        if (penetrationMaximale > 0) {
            // Corriger la position en déplaçant le cerf-volant vers le haut.
            etat.position.y += penetrationMaximale;

            // Réponse physique à l'impact : coefficient de restitution réaliste
            if (etat.velocite.y < 0) {
                etat.velocite.y *= -0.5; // Rebond modéré pour un objet léger en toile
            }
            
            // Friction au sol pour les mouvements horizontaux - RÉDUITE pour permettre le décollage
            const frictionCoeff = 0.95; // Réduit de 0.85 à 0.95 pour moins bloquer le cerf-volant
            etat.velocite.x *= frictionCoeff;
            etat.velocite.z *= frictionCoeff;
            
            // Amortissement de rotation au contact du sol - RÉDUIT aussi
            etat.velociteAngulaire.multiplyScalar(0.9); // Réduit de 0.7 à 0.9
        }
    }
}