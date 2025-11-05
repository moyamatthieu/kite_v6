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
 */
export class AerodynamicForceCalculator implements IAerodynamicForceCalculator {
    public readonly name = 'AerodynamicForce';
    
    private config: AerodynamicForceConfig;
    private kite: Kite;
    
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
     */
    calculateDetailed(state: KitePhysicsState, wind: WindState, deltaTime: number): AerodynamicForceResult {
        const totalLift = new THREE.Vector3(0, 0, 0);
        const totalDrag = new THREE.Vector3(0, 0, 0);
        
        // Calculer le vent apparent
        const apparentWind = wind.velocity.clone().sub(state.velocity);
        const windSpeed = apparentWind.length();
        
        if (windSpeed < 0.1) {
            // Pas de vent apparent significatif
            return {
                lift: totalLift,
                drag: totalDrag,
                total: new THREE.Vector3(0, 0, 0),
                angleOfAttack: 0,
                apparentWind,
                liftCoefficient: 0,
                dragCoefficient: 0,
            };
        }
        
        const windDirection = apparentWind.clone().normalize();
        
        // Sommer les forces sur tous les panneaux
        const panelCount = this.kite.getPanelCount();
        
        for (let i = 0; i < panelCount; i++) {
            const panelForce = this.calculatePanelForce(
                i,
                state,
                apparentWind,
                windDirection,
                windSpeed
            );
            
            totalLift.add(panelForce.lift);
            totalDrag.add(panelForce.drag);
        }
        
        const total = totalLift.clone().add(totalDrag);
        
        // Angle d'attaque moyen (simplifié: panneau central)
        const centralPanelIndex = Math.floor(panelCount / 2);
        const centralNormal = this.kite.getGlobalPanelNormal(centralPanelIndex);
        const angleOfAttack = Math.asin(Math.abs(centralNormal.dot(windDirection)));
        
        return {
            lift: totalLift,
            drag: totalDrag,
            total,
            angleOfAttack,
            apparentWind,
            liftCoefficient: this.getLiftCoefficient(angleOfAttack),
            dragCoefficient: this.getDragCoefficient(angleOfAttack),
        };
    }
    
    /**
     * Calcule la force sur un panneau spécifique.
     * 
     * La portance dépend de l'angle d'attaque et de l'orientation relative au vent.
     * Pour un profil aérodynamique correctement orienté :
     * - Intrados frappé par le vent (normalWindComponent > 0) : portance positive
     * - Extrados frappé par le vent (normalWindComponent < 0) : portance négative (profil inversé)
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

        // 🔧 CORRECTION: Composante du vent sur la normale du panneau
        // windDirection = direction où VA le vent (de Z+ vers Z-)
        // Le kite regarde vers Z+ (face au vent), donc son intrados (face avant) fait face à Z+
        // Le vent arrive de Z+ et va vers Z-, donc windDirection pointe vers Z-
        // Quand le vent frappe l'intrados : normalWindComponent > 0 (normale et vent colinéaires)
        // Quand le vent frappe l'extrados : normalWindComponent < 0 (normale et vent opposés)
        const normalWindComponent = panelNormal.dot(windDirection);

        // Angle d'attaque basé sur la valeur absolue (pour les courbes Cl/Cd standards)
        const alpha = Math.asin(Math.min(1, Math.abs(normalWindComponent)));
        
        const Cl = this.getLiftCoefficient(alpha);
        const Cd = this.getDragCoefficient(alpha);
        
        // Pression dynamique : q = 0.5 * ρ * v²
        const dynamicPressure = 0.5 * this.config.airDensity * windSpeed * windSpeed;
        
        // Forces aérodynamiques : F = q * S * C
        const liftMagnitude = dynamicPressure * panelArea * Cl;
        const dragMagnitude = dynamicPressure * panelArea * Cd;

        // 🔧 TRAÎNÉE : Opposée au vent apparent (dans la direction -windDirection)
        const drag = windDirection.clone().multiplyScalar(-dragMagnitude);

        // 🔧 PORTANCE : Perpendiculaire au vent apparent
        // Calculer la portance dans le plan (normale, vent)
        // Direction de portance = normale - (normale·vent)*vent (projection orthogonale)
        const normalDotWind = panelNormal.dot(windDirection);
        const liftDirection = panelNormal.clone()
            .sub(windDirection.clone().multiplyScalar(normalDotWind))
            .normalize();
        
        // Si le vent est parallèle à la normale, pas de portance latérale
        if (liftDirection.length() < 0.01) {
            return { 
                lift: new THREE.Vector3(0, 0, 0), 
                drag 
            };
        }
        
        // Signe de la portance : positif si le vent frappe l'intrados
        const liftSign = Math.sign(normalDotWind) || 1; // Éviter 0
        const lift = liftDirection.multiplyScalar(liftMagnitude * liftSign);
        
        return { lift, drag };
    }
    
    /**
     * Coefficient de portance en fonction de l'angle d'attaque.
     * 
     * Modèle pour cerf-volant : portance maximale à ~15-20°, puis décrochage progressif.
     * Courbe Cl(α) linéaire jusqu'à 15°, puis décrochage progressif.
     */
    private getLiftCoefficient(alpha: number): number {
        const alphaDeg = (alpha * 180) / Math.PI;
        
        if (alphaDeg <= 15) {
            // Zone linéaire (0-15°) : Cl croît linéairement avec l'angle
            return this.config.referenceLiftCoefficient * (alphaDeg / 15);
        }
        
        if (alphaDeg <= 25) {
            // Zone de portance maximale (15-25°)
            return this.config.referenceLiftCoefficient;
        }
        
        if (alphaDeg <= 45) {
            // Décrochage progressif (25-45°)
            const t = (alphaDeg - 25) / 20;
            return this.config.referenceLiftCoefficient * (1 - 0.5 * t);
        }
        
        // Décrochage complet (>45°)
        return this.config.referenceLiftCoefficient * 0.5;
    }
    
    /**
     * Coefficient de traînée en fonction de l'angle d'attaque.
     */
    private getDragCoefficient(alpha: number): number {
        const alphaDeg = (alpha * 180) / Math.PI;
        
        // Cd = Cd_ref + k * alpha²
        const k = 0.02;
        return this.config.referenceDragCoefficient + k * alphaDeg * alphaDeg;
    }
}
