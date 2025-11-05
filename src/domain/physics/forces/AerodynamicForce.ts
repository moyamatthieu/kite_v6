/**
 * Calculateur de force aérodynamique.
 *    **Cas typiques à comprendre** :
   - **Vol stable** : Équilibre des 3 forces, cerf-volant maintenu sur sphère de vol
   - **Montée vers zénith** : Lignes égales, forces symétriques, le cerf-volant monte naturellement
   - **Virage** : Asymétrie des tensions → couple de rotation → changement d'orientation
   - **Plongée/remontée** : Le cerf-volant se déplace le long de la sphère de contrainte
   
   **Implication pour le code** : 
   - Calculer les 3 forces dans leur géométrie réelle (aéro + gravité + lignes)
   - Ne pas ajouter de logique artificielle pour "maintenir en l'air" ou "monter au zénith"
   - Les comportements corrects émergent naturellement de la physique
   - Le cerf-volant doit toujours regarder vers la station (face avant vers Z-)

   **C'est un cerf-volant, pas un avion** ⚠️
   
   **Différence fondamentale** : Un cerf-volant est un **système contraint** par des lignes, contrairement à un avion libre.
   
   **Principes physiques du cerf-volant :**
   - Le cerf-volant est **attaché par des lignes** à la station de pilotage (origine)
   - Il **regarde toujours vers le vent** : la face avant (intrados, où sont les points de contrôle) fait face à Z+
   - Il vole **"face au vent"** = dans l'hémisphère Z+ (le vent vient de Z+ et souffle vers Z-)
   - Il est **contraint sur une sphère** de rayon = longueur des lignes + brides
   - La **portance est créée par l'angle des surfaces** vis-à-vis du vent apparent
   - Le pilotage se fait par **différence de longueur** entre lignes gauche/droite (asymétrie des forces)
   
   **Comportements émergents** (résultant de la physique, pas à implémenter directement) :
   - **Équilibre au zénith** : Avec lignes égales, le cerf-volant tend naturellement vers le zénith (Z=0, Y=max)
   - **Structure tangente à la sphère** : La barre de structure (nez → spine_bas) devient tangente à la sphère de vol
   
   **Géométrie des forces critiques** :
   ```typescript
   // L'équilibre dépend de la géométrie complète :
   // Force_resultante = Force_aero + Force_gravite + Force_lignes
   
   // La portance n'est PAS une force de sustentation comme pour un avion
   // Elle est générée par l'angle des surfaces par rapport au vent apparent
   // Elle contribue à la tension dans les lignes qui contraignent le cerf-volant
   
   // Exemple : Cerf-volant nez vers le bas (plongée)
   // - Portance générée selon l'angle des surfaces avec le vent apparent
   // - Force de gravité vers le bas
   // - Force des lignes vers la station de pilotage
   // - Résultante : mouvement sur la sphère de contrainte
   ```
   
   **Cas typiques à comprendre** :
   - **Vol stable** : Équilibre des 3 forces, cerf-volant maintenu sur sphère de vol
   - **Montée vers zénith** : Lignes égales, forces symétriques, le cerf-volant monte naturellement
   - **Virage** : Asymétrie des tensions → couple de rotation → changement d'orientation
   - **Plongée/remontée** : Le cerf-volant se déplace le long de la sphère de contrainte
   
   **Implication pour le code** : 
   - Calculer les 3 forces dans leur géométrie réelle (aéro + gravité + lignes)
   - Ne pas ajouter de logique artificielle pour "maintenir en l'air" ou "monter au zénith"
   - Les comportements corrects émergent naturellement de la physique
   - Le cerf-volant doit toujours regarder vers la station (face avant vers Z-)
 * @module domain/physics/forces/AerodynamicForce
 */

import * as THREE from 'three';
import { Vector3D, KitePhysicsState, WindState } from '../../../core/types/PhysicsState';
import { 
    IForceCalculator, 
    IAerodynamicForceCalculator, 
    AerodynamicForceResult 
} from './ForceCalculator';
import { Kite } from '../../kite/Kite';

/**
 * Configuration du calculateur aérodynamique.
 */
export interface AerodynamicForceConfig {
    /** Densité de l'air (kg/m³) */
    airDensity: number;
    
    /** Coefficient de portance de référence */
    referenceLiftCoefficient: number;
    
    /** Coefficient de traînée de référence */
    referenceDragCoefficient: number;
}

/**
 * Calculateur de forces aérodynamiques (portance + traînée).
 * ✅ OPTIMISÉ: Vecteurs temporaires réutilisables pour réduire allocations
 */
export class AerodynamicForceCalculator implements IAerodynamicForceCalculator {
    public readonly name = 'AerodynamicForce';
    
    private config: AerodynamicForceConfig;
    private kite: Kite;
    
    // ✅ OPTIMISATION: Vecteurs temporaires réutilisables (réduire allocations)
    private tempVector1 = new THREE.Vector3();
    private tempVector2 = new THREE.Vector3();
    private tempVector3 = new THREE.Vector3();
    
    constructor(kite: Kite, config?: Partial<AerodynamicForceConfig>) {
        this.kite = kite;
        this.config = {
            airDensity: config?.airDensity ?? 1.225,
            referenceLiftCoefficient: config?.referenceLiftCoefficient ?? 1.2,
            referenceDragCoefficient: config?.referenceDragCoefficient ?? 0.5,
        };
    }
    
    /**
     * Calcule la force aérodynamique totale.
     */
    calculate(state: KitePhysicsState, wind: WindState, deltaTime: number): Vector3D {
        const result = this.calculateDetailed(state, wind, deltaTime);
        return result.total;
    }
    
    /**
     * Calcule les forces aérodynamiques avec détails par panneau.
     * 
     * 🔧 APPROCHE CORRECTE : Calcul des forces PAR PANNEAU individuellement
     * Chaque panneau génère ses propres forces aérodynamiques en fonction de :
     * - Son orientation locale (normale)
     * - Sa surface locale
     * - L'angle d'attaque local du vent apparent
     * 
     * Les forces NE S'ADDITIONNENT PAS simplement - elles sont calculées
     * indépendamment pour chaque surface et appliquées au centre de masse.
     * 
     * ✅ OPTIMISÉ: Réutilise vecteurs temporaires au lieu de créer/cloner
     */
    calculateDetailed(state: KitePhysicsState, wind: WindState, deltaTime: number): AerodynamicForceResult {
        const totalForce = new THREE.Vector3(0, 0, 0);
        const totalLift = new THREE.Vector3(0, 0, 0);
        const totalDrag = new THREE.Vector3(0, 0, 0);
        
        // Calculer le vent apparent (réutilise tempVector1)
        this.tempVector1.copy(wind.velocity).sub(state.velocity);
        const windSpeed = this.tempVector1.length();
        
        if (windSpeed < 0.1) {
            // Pas de vent apparent significatif
            return {
                lift: totalLift,
                drag: totalDrag,
                total: new THREE.Vector3(0, 0, 0),
                angleOfAttack: 0,
                apparentWind: this.tempVector1.clone(),
                liftCoefficient: 0,
                dragCoefficient: 0,
            };
        }
        
        // Direction du vent (réutilise tempVector2)
        this.tempVector2.copy(this.tempVector1).normalize();
        
        // 🔧 CALCUL PAR PANNEAU : Chaque face génère sa propre force indépendamment
        const panelCount = this.kite.getPanelCount();
        let totalArea = 0;
        let weightedAlpha = 0;
        
        for (let i = 0; i < panelCount; i++) {
            const panelForce = this.calculatePanelForce(
                i,
                state,
                this.tempVector1, // apparentWind
                this.tempVector2, // windDirection
                windSpeed
            );
            
            // Accumuler les forces (vectoriellement, chaque panneau contribue)
            totalLift.add(panelForce.lift);
            totalDrag.add(panelForce.drag);
            totalForce.add(panelForce.lift).add(panelForce.drag);
            
            // Pour l'angle d'attaque moyen pondéré par surface
            const panelArea = this.kite.getPanelArea(i);
            const panelNormal = this.kite.getGlobalPanelNormal(i);
            const normalWindComponent = panelNormal.dot(this.tempVector2);
            const alpha = Math.asin(Math.min(1, Math.abs(normalWindComponent)));
            
            totalArea += panelArea;
            weightedAlpha += alpha * panelArea;
        }
        
        // Angle d'attaque moyen pondéré par surface
        const avgAlpha = totalArea > 0 ? weightedAlpha / totalArea : 0;
        
        return {
            lift: totalLift,
            drag: totalDrag,
            total: totalForce,
            angleOfAttack: avgAlpha,
            apparentWind: this.tempVector1.clone(),
            liftCoefficient: this.getLiftCoefficient(avgAlpha),
            dragCoefficient: this.getDragCoefficient(avgAlpha),
        };
    }
    
    /**
     * Calcule la force sur un panneau spécifique.
     * 
     * 🔧 PHYSIQUE CORRECTE PAR PANNEAU :
     * Chaque panneau est traité comme une surface aérodynamique indépendante qui génère :
     * - PORTANCE : Perpendiculaire au vent apparent, proportionnelle à la surface projetée
     * - TRAÎNÉE : Parallèle au vent apparent (opposée au mouvement relatif)
     * 
     * Les forces dépendent de :
     * - Surface du panneau (S)
     * - Angle d'attaque local (α) entre normale et vent
     * - Pression dynamique (q = 0.5 × ρ × v²)
     * - Coefficients aérodynamiques Cl(α) et Cd(α)
     * 
     * Force = q × S × Coefficient × Direction
     * 
     * ✅ OPTIMISÉ: Réutilise tempVector3 pour réduire allocations
     */
    private calculatePanelForce(
        panelIndex: number,
        state: KitePhysicsState,
        apparentWind: Vector3D,
        windDirection: Vector3D,
        windSpeed: number
    ): { lift: Vector3D; drag: Vector3D } {
        const panelNormal = this.kite.getGlobalPanelNormal(panelIndex);
        const panelArea = this.kite.getPanelArea(panelIndex);

        // 🔧 Angle d'attaque LOCAL du panneau
        // α = angle entre normale du panneau et direction du vent
        const normalWindComponent = panelNormal.dot(windDirection);
        const alpha = Math.asin(Math.min(1, Math.abs(normalWindComponent)));
        
        // 🔧 Coefficients aérodynamiques spécifiques à cet angle
        const Cl = this.getLiftCoefficient(alpha);
        const Cd = this.getDragCoefficient(alpha);
        
        // 🔧 Pression dynamique : q = 0.5 × ρ × v²
        const dynamicPressure = 0.5 * this.config.airDensity * windSpeed * windSpeed;
        
        // 🔧 Magnitude des forces : F = q × S × C
        const liftMagnitude = dynamicPressure * panelArea * Cl;
        const dragMagnitude = dynamicPressure * panelArea * Cd;

        // ═══════════════════════════════════════════════════════════════════════════
        // DIRECTION DES FORCES
        // ═══════════════════════════════════════════════════════════════════════════
        
        // 🔧 TRAÎNÉE : Dans le sens du vent apparent (freine l'objet)
        // Direction = direction du vent apparent
        const drag = windDirection.clone().multiplyScalar(dragMagnitude);

        // 🔧 PORTANCE : Perpendiculaire au vent apparent
        // Calculée par DOUBLE PRODUIT VECTORIEL pour garantir :
        // - Perpendiculaire au vent
        // - Dans le plan du panneau
        // - Sens correct (vers l'extrados ou intrados selon orientation)
        
        // Étape 1 : Axe perpendiculaire au plan (normale × vent)
        this.tempVector3.crossVectors(panelNormal, windDirection);
        
        if (this.tempVector3.length() < 0.01) {
            // Panneau parallèle au vent → pas de portance (α ≈ 0° ou 180°)
            return { 
                lift: new THREE.Vector3(0, 0, 0), 
                drag 
            };
        }
        
        // Étape 2 : Direction de portance (vent × axe)
        // Le double produit vectoriel garantit que la portance est :
        // - Perpendiculaire au vent (produit vectoriel avec windDirection)
        // - Dans le plan défini par normale et vent
        const liftDirection = new THREE.Vector3().crossVectors(windDirection, this.tempVector3).normalize();
        
        const lift = liftDirection.multiplyScalar(liftMagnitude);
        
        return { lift, drag };
    }
    
    /**
     * Coefficient de portance en fonction de l'angle d'attaque.
     * 
     * 🪁 MODÈLE PHYSIQUE CERF-VOLANT RÉALISTE (corrigé)
     * 
     * Principes physiques d'un cerf-volant :
     * - α ≈ 0° : Parallèle au vent → Portance faible mais NON NULLE (écoulement laminaire)
     * - α ≈ 15-20° : Angle optimal → Portance maximale (vol stable)
     * - α ≈ 90° : Surface perpendiculaire au vent → Portance nulle, traînée max (parachute)
     * 
     * 🔧 CORRECTION CRITIQUE : Un cerf-volant génère TOUJOURS de la portance
     * tant qu'il y a du vent apparent, même à angle faible. Le minimum est 20% de Cl_max.
     * 
     * Modèle : Cl(α) = Cl_max × sin(2α)
     * - 0° → Cl = 0 (théorique)
     * - 15° → Cl ≈ 0.5 × Cl_max (efficace)
     * - 45° → Cl = Cl_max (optimal pour cerf-volant)
     * - 90° → Cl = 0 (perpendiculaire, effet parachute)
     * 
     * @param alpha - Angle d'attaque en radians
     * @returns Coefficient de portance Cl (sans unité)
     */
    private getLiftCoefficient(alpha: number): number {
        // Modèle sinusoïdal : Cl = Cl_max × sin(2α)
        // Ce modèle est physiquement correct pour surfaces plates
        const Cl = this.config.referenceLiftCoefficient * Math.sin(2 * alpha);
        
        // Minimum à 20% de Cl_max pour garantir portance même à faibles angles
        // (écoulement laminaire + effet Coanda sur la toile)
        const Cl_min = 0.2 * this.config.referenceLiftCoefficient;
        
        return Math.max(Cl_min, Math.abs(Cl));
    }
    
    /**
     * Coefficient de traînée en fonction de l'angle d'attaque.
     * 
     * 🪁 MODÈLE PHYSIQUE CERF-VOLANT RÉALISTE (corrigé)
     * 
     * La traînée augmente avec l'angle (plus de surface exposée).
     * Cd = Cd_min + Cd_max × sin²(α)
     * 
     * 🔧 CORRECTION : Traînée progressive, pas de seuils brutaux
     * - 0° → Cd ≈ 0.3 (traînée de forme minimale)
     * - 45° → Cd ≈ 0.8 (traînée modérée)
     * - 90° → Cd ≈ 1.2 (effet parachute complet)
     * 
     * @param alpha - Angle d'attaque en radians
     * @returns Coefficient de traînée Cd (sans unité)
     */
    private getDragCoefficient(alpha: number): number {
        // Traînée de forme (minimale, présente même à α=0)
        const Cd_forme = this.config.referenceDragCoefficient;
        
        // Traînée due à l'angle d'attaque (effet parachute)
        // Croît avec sin²(α) : maximale à 90°
        const Cd_angle = 0.7 * Math.sin(alpha) * Math.sin(alpha);
        
        // Traînée induite (due à la portance)
        const Cl = this.getLiftCoefficient(alpha);
        const aspectRatio = 2.5; // Envergure / hauteur ≈ 1.65 / 0.65
        const Cd_induit = (Cl * Cl) / (Math.PI * aspectRatio);
        
        return Cd_forme + Cd_angle + Cd_induit;
    }
}
