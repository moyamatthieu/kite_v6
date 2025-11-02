import * as THREE from 'three';
import { GeometrieCerfVolant } from '../cerfvolant/GeometrieCerfVolant';

export interface ForceDetaillee {
    force: THREE.Vector3;
    forceLift: THREE.Vector3;
    forceDrag: THREE.Vector3;
    forceNormale: THREE.Vector3;
    normaleSurface: THREE.Vector3; // Normale unitaire de la surface
    ventApparent: THREE.Vector3; // Vent apparent à ce panneau
    pointApplicationLocal: THREE.Vector3;
    nomPanneau: string;
}

/**
 * Calcule les forces aérodynamiques (portance, traînée) s'exerçant sur le cerf-volant.
 */
export class CalculateurAerodynamique {
    private densiteAir = 1.225; // kg/m³

    /**
     * Calcule les forces et le couple aérodynamiques totaux.
     */
    public calculerForcesAeroDetaillees(
        geometrie: GeometrieCerfVolant,
        orientation: THREE.Quaternion,
        ventApparent: THREE.Vector3
    ): ForceDetaillee[] {
        
        const vitesseVent2 = ventApparent.lengthSq();
        if (vitesseVent2 < 0.01) {
            return [];
        }

        const pressionDynamique = 0.5 * this.densiteAir * vitesseVent2;
        const directionVent = ventApparent.clone().normalize();
        
        const forcesDetaillees: ForceDetaillee[] = [];

        // Itérer sur chaque panneau de la toile
        geometrie.panneaux.forEach((panneau, index) => {
            const points = panneau.map(nom => geometrie.points.get(nom)!);
            const centrePanneau = new THREE.Vector3().add(points[0]).add(points[1]).add(points[2]).multiplyScalar(1/3);
            
            const v1 = new THREE.Vector3().subVectors(points[1], points[0]);
            const v2 = new THREE.Vector3().subVectors(points[2], points[0]);
            
            const normaleLocale = new THREE.Vector3().crossVectors(v1, v2).normalize();
            const normaleMonde = normaleLocale.clone().applyQuaternion(orientation);
            const surface = v1.cross(v2).length() / 2;

            const cosTheta = normaleMonde.dot(directionVent);

            // Si le vent est presque parallèle à la surface, la force est négligeable.
            if (Math.abs(cosTheta) < 0.01) {
                forcesDetaillees.push({
                    force: new THREE.Vector3(),
                    forceLift: new THREE.Vector3(),
                    forceDrag: new THREE.Vector3(),
                    forceNormale: new THREE.Vector3(),
                    normaleSurface: normaleMonde.clone(),
                    ventApparent: ventApparent.clone(),
                    pointApplicationLocal: centrePanneau.clone(),
                    nomPanneau: `Panneau ${index + 1}`
                });
                return; // Equivalent de 'continue' dans un forEach
            }

            let Cl, Cd;
            const sinAlpha = Math.abs(cosTheta);
            const alpha = Math.asin(sinAlpha);

            // Modèle aérodynamique : la portance dépend de l'angle d'incidence
            // peu importe le côté de la surface que le vent frappe.
            const alpha_stall = 25 * Math.PI / 180; // Angle de décrochage à 25°
            
            if (alpha < alpha_stall) {
                // Pré-décrochage : portance dominante, traînée faible
                Cl = 5.0 * Math.sin(alpha) * Math.cos(alpha); // Cl max ≈ 2.5 à α ≈ 45°
                Cd = 0.05 + 0.3 * sinAlpha * sinAlpha;
            } else {
                // Post-décrochage : portance effondrée, traînée élevée
                Cl = 0.5 * Math.cos(alpha);
                Cd = 1.2 * sinAlpha;
            }
            
            // Note : Cl est toujours positif. La direction du lift est gérée automatiquement
            // par le produit vectoriel qui suit, en fonction de l'orientation de la normale.

            // La force de traînée est toujours dans la direction du vent apparent.
            const forceDrag = directionVent.clone().multiplyScalar(Cd * pressionDynamique * surface);

            // La force de portance est perpendiculaire au vent ET dans le plan (normale, vent)
            // Calcul par double produit vectoriel :
            // 1. liftAxis = normale × vent : axe perpendiculaire au plan
            // 2. liftDirection = vent × liftAxis : direction perpendiculaire au vent, dans le plan
            const liftAxis = new THREE.Vector3().crossVectors(normaleMonde, directionVent);
            const liftDirection = new THREE.Vector3().crossVectors(directionVent, liftAxis);

            if (liftDirection.lengthSq() > 0.0001) {
                liftDirection.normalize();
            } else {
                liftDirection.set(0, 0, 0); // Pas de portance si vent et normale sont colinéaires
            }

            const forceLift = liftDirection.clone().multiplyScalar(Cl * pressionDynamique * surface);
            
            const forceTotalePanneau = new THREE.Vector3().add(forceLift).add(forceDrag);

            // Calcul de la composante normale de la force aéro totale
            const forceNormale = normaleMonde.clone().multiplyScalar(forceTotalePanneau.dot(normaleMonde));

            forcesDetaillees.push({
                force: forceTotalePanneau,
                forceLift,
                forceDrag,
                forceNormale,
                normaleSurface: normaleMonde.clone(),
                ventApparent: ventApparent.clone(),
                pointApplicationLocal: centrePanneau.clone(),
                nomPanneau: `Panneau ${index + 1}`
            });
        });

        return forcesDetaillees;
    }
}
