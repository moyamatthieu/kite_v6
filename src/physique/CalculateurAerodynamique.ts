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

            // Le signe de cosTheta nous indique de quel côté le vent frappe.
            // Si cosTheta < 0, le vent frappe la face avant (celle d'où sort la normale). C'est la situation normale de vol.
            // Si cosTheta > 0, le vent frappe la face arrière. La force doit "pousser" la toile pour la retourner.

            // L'angle d'incidence (alpha) est l'angle entre le plan de la surface et le vent.
            // sin(alpha) = |normale · directionVent| = |cosTheta|
            const sinAlpha = Math.abs(cosTheta);

            // Si le vent est presque parallèle à la surface, la force est négligeable.
            if (sinAlpha < 0.01) {
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
                return; // Pas de force aéro
            }
            
            const alpha = Math.asin(sinAlpha);

            let Cl, Cd;
            
            // Modèle aérodynamique amélioré
            const alpha_stall = 20 * Math.PI / 180; // Angle de décrochage plus réaliste (20°)
            
            if (alpha < alpha_stall) {
                // Pré-décrochage : approximation linéaire Cl ≈ 2 * PI * alpha
                Cl = 2 * Math.PI * alpha;
                // Formule de traînée = traînée parasite + traînée induite
                const AR = 5; // Aspect Ratio (envergure^2 / surface), estimation pour un cerf-volant
                const e = 0.75; // Oswald efficiency factor
                Cd = 0.04 + (Cl * Cl) / (Math.PI * AR * e);
            } else {
                // Post-décrochage : portance effondrée, traînée de forme dominante
                Cl = 0.6 * Math.cos(alpha); // Chute de portance
                Cd = 1.5 * sinAlpha; // Forte traînée
            }

            // La force de traînée (Drag) est toujours dans la direction du vent apparent.
            const forceDrag = directionVent.clone().multiplyScalar(Cd * pressionDynamique * surface);

            // La force de portance (Lift) est perpendiculaire au vent et "pousse" la surface.
            // Sa direction est cruciale pour l'auto-stabilisation.
            
            // On calcule un vecteur "haut" relatif à la surface et au vent.
            // Ce vecteur est perpendiculaire au vent et se trouve dans le plan (vent, normale).
            // Le signe de cosTheta oriente correctement la force pour qu'elle pousse toujours la toile.
            const liftDirection = new THREE.Vector3().subVectors(normaleMonde, directionVent.clone().multiplyScalar(cosTheta)).normalize();
            
            // Si le vent est parfaitement aligné avec la normale, le calcul ci-dessus donne un vecteur nul.
            if (liftDirection.lengthSq() < 0.0001) {
                // Dans ce cas, la portance est nulle. Seule la traînée (pression) s'applique.
                liftDirection.set(0,0,0);
            }

            const forceLift = liftDirection.multiplyScalar(Cl * pressionDynamique * surface);
            
            const forceTotalePanneau = new THREE.Vector3().add(forceLift).add(forceDrag);

            // Calcul de la composante normale de la force aéro totale (utile pour le debug ou solveur de contraintes)
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
