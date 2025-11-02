import * as THREE from 'three';
import { EtatPhysique } from './EtatPhysique';
import { GeometrieCerfVolant } from '../cerfvolant/GeometrieCerfVolant';

/**
 * Résout les contraintes physiques après l'intégration du mouvement.
 * (ex: les lignes ne peuvent pas être plus longues que leur longueur max).
 */
export class SolveurContraintes {
    private hauteurSol = 0.05; // Garde le point le plus bas légèrement au-dessus du sol (y=0)
    private etaitAuSol = false; // Pour détecter les nouveaux impacts uniquement

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

        // 1. Itérer sur tous les points de la structure
        geometrie.points.forEach(pointLocal => {
            const pointMonde = pointLocal.clone().applyQuaternion(etat.orientation).add(etat.position);
            const penetration = this.hauteurSol - pointMonde.y;

            if (penetration > penetrationMaximale) {
                penetrationMaximale = penetration;
            }
        });

        const auSolMaintenant = penetrationMaximale > 0;

        // 2. Si un point a pénétré le sol, appliquer la correction.
        if (auSolMaintenant) {
            // Corriger la position en déplaçant le cerf-volant vers le haut.
            etat.position.y += penetrationMaximale;

            // Friction appliquée UNIQUEMENT lors d'un nouvel impact (pas en continu)
            const nouveauImpact = !this.etaitAuSol;
            
            if (nouveauImpact) {
                // Réponse physique à l'impact : coefficient de restitution faible pour absorption d'énergie verticale
                if (etat.velocite.y < 0) {
                    etat.velocite.y *= -0.3; // Absorption de l'impact vertical
                }
                
                // Friction dynamique lors de l'impact uniquement
                const frictionImpact = 0.85;
                etat.velocite.x *= frictionImpact;
                etat.velocite.z *= frictionImpact;
                
                // Amortissement de rotation lors de l'impact
                etat.velociteAngulaire.multiplyScalar(0.75);
            } else {
                // Au sol en continu : friction cinétique très faible pour permettre le glissement libre
                // Un kite en toile légère glisse très facilement sur le sol
                const frictionCinetique = 0.998; // Quasi-nulle, glissement très fluide
                etat.velocite.x *= frictionCinetique;
                etat.velocite.z *= frictionCinetique;
                
                // Pas d'amortissement de rotation au sol pour permettre le mouvement naturel
            }
        }
        
        this.etaitAuSol = auSolMaintenant;
    }
}