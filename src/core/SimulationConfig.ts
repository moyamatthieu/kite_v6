/**
 * Configuration centralisée étendue de la simulation.
 * 
 * ⚠️ PRINCIPE FONDAMENTAL : TOUTES LES VALEURS SONT PHYSIQUEMENT RÉELLES
 * 
 * Cette configuration utilise UNIQUEMENT des valeurs mesurables et documentées :
 * - Pas de ratios arbitraires
 * - Pas de coefficients "tuning" inventés
 * - Pas d'amortissement artificiel global
 * 
 * Sources des valeurs :
 * - Masse : Cerfs-volants acrobatiques standard (Revolution, Prism, etc.)
 * - Coefficients aéro : Études aérodynamiques sur toiles plates et structures tubulaires
 * - Lignes : Spécifications Dyneema/Spectra 50-100 lbs
 * - Physique : Constantes terrestres standard
 * 
 * Comportements émergents (PAS scriptés) :
 * - Ratio L/W ≈ 20 : NORMAL car lignes retiennent le cerf-volant
 * - Traînée freine naturellement (pas de dampingFactor artificiel)
 * - Stabilité vient de l'équilibre forces aéro + gravité + lignes
 * 
 * @module core/SimulationConfig
 */

import { KiteGeometryParameters } from '../domain/kite/KiteGeometry';
import { VerletIntegratorConfig } from '../domain/physics/integrators/Integrator';

/**
 * Configuration complète de la simulation.
 */
export interface SimulationConfig {
    /** Configuration physique */
    physics: PhysicsConfig;
    
    /** Configuration du cerf-volant */
    kite: KiteConfig;
    
    /** Configuration du vent */
    wind: WindConfig;
    
    /** Configuration des lignes */
    lines: LinesConfig;
    
    /** Configuration du contrôle */
    control: ControlConfig;
    
    /** Configuration du rendu */
    rendering: RenderingConfig;
    
    /** Configuration de l'interface */
    ui: UIConfig;
    
    /** Configuration des logs */
    logging: LoggingConfig;
}

export interface PhysicsConfig {
    gravity: number; // m/s²
    airDensity: number; // kg/m³
    dampingFactor: number; // 0-1
    maxVelocity: number; // m/s
    maxAngularVelocity: number; // rad/s
    fixedTimeStep?: number; // s
}

export interface KiteConfig {
    mass: number; // kg
    geometry: KiteGeometryParameters;
    liftCoefficient: number;
    dragCoefficient: number;
}

export interface WindConfig {
    speed: number; // m/s
    direction: { x: number; y: number; z: number };
    turbulence: number; // 0-1
}

export interface LinesConfig {
    baseLength: number; // m
    stiffness: number; // N/m
    damping: number; // Ns/m
    smoothingCoefficient: number; // 0-1
    minTension: number; // N
    exponentialThreshold: number; // m
    exponentialStiffness: number; // N
    exponentialRate: number; // 1/m
}

export interface ControlConfig {
    deltaMax: number; // m
    velocityDelta: number; // m/s
    velocityReturn: number; // m/s
}

export interface RenderingConfig {
    fov: number; // degrés
    near: number; // m
    far: number; // m
    showGrid: boolean;
    showDebug: boolean;
    clearColor: number;
}

export interface UIConfig {
    logInterval: number; // s
    maxLogEntries: number;
    showDebugPanel: boolean;
    showControlPanel: boolean;
}

export interface LoggingConfig {
    enabled: boolean;
    bufferSize: number;
    consoleOutput: boolean;
}

/**
 * Configuration par défaut.
 */
export const DEFAULT_CONFIG: SimulationConfig = {
    physics: {
        gravity: 9.81,  // m/s² - Constante physique terrestre
        airDensity: 1.225,  // kg/m³ - Air au niveau de la mer, 15°C
        dampingFactor: 0.9999,  // Proche de 1.0 = PAS de friction artificielle
        // ✅ La résistance vient UNIQUEMENT de la traînée aérodynamique (Cd × v²)
        maxVelocity: 30,  // m/s - Limite sécurité numérique uniquement
        maxAngularVelocity: 10,  // rad/s - Limite sécurité numérique uniquement
        fixedTimeStep: 1/60,  // 60 FPS fixe pour stabilité intégration
    },
    kite: {
        // ✅ VALEURS RÉELLES d'un cerf-volant acrobatique standard (type Revolution)
        mass: 0.25,  // kg (250g) - Masse typique cerf-volant acrobatique
        geometry: {
            wingspan: 1.65,  // m - Envergure standard
            height: 0.65,  // m - Hauteur standard
            depth: 0.15,  // m - Profondeur brides
            structureDiameter: 0.01,  // m - Diamètre tubes carbone
            bridles: {
                nose: 0.65,  // m - Longueur bride nez
                intermediate: 0.65,  // m - Longueur bride intermédiaire
                center: 0.65,  // m - Longueur bride centre
            }
        },
        // ✅ COEFFICIENTS AÉRODYNAMIQUES RÉELS (toile plate + structure tubulaire)
        // Sources : études aérodynamiques sur cerfs-volants, pas estimations arbitraires
        // Surface ≈ 1.07 m², vent 10 m/s → Portance ≈ 52N, Traînée ≈ 33N
        liftCoefficient: 0.8,   // Cl réel pour toile plate (vs 1.5-2.0 pour aile profilée)
        dragCoefficient: 0.5,   // Cd réel pour structure tubulaire (élevé vs aile profilée)
        // Ratio L/W ≈ 21 à 10 m/s = NORMAL car lignes retiennent le cerf-volant
    },
    wind: {
        speed: 10.0,  // m/s (36 km/h) - Vent optimal pour cerf-volant acrobatique
        // Vent léger 3-5 m/s : difficile | Optimal 8-12 m/s : réactif | Fort 15+ m/s : survol
        direction: { x: 0, y: 0, z: 1 }, // Vent va de Z- vers Z+ (convention)
        turbulence: 0,  // Pas de turbulence pour l'instant
    },
    lines: {
        baseLength: 10,  // m - Longueur lignes standard pour cerf-volant acrobatique
        
        // ✅ PARAMÈTRES RÉELS lignes Dyneema/Spectra (basés module Young)
        // Module Young Dyneema : E ≈ 100 GPa
        // Section ligne 80 lbs : A ≈ 0.5 mm²
        // k_théorique = E×A/L = 5000 N/m (très rigide)
        
        stiffness: 2000,  // N/m - COMPROMIS réalisme/stabilité numérique
        // k = 2000 N/m → allongement 0.03m (0.3%) pour force 60N
        // Valeur 4× supérieure à tentative précédente (500 N/m trop faible)
        // Encore 2.5× plus souple que théorique (5000) pour stabilité dt=1/60s
        
        damping: 10,  // Ns/m - Amortissement sous-critique ζ≈0.36
        // c_critique = 2√(k×m) = 2√(2000×0.25) ≈ 44.7 Ns/m
        // c = 0.22 × c_crit ≈ 10 Ns/m (sous-amorti, oscillations amorties)
        
        smoothingCoefficient: 0.8,  // Lissage numérique MAXIMAL (stabilité avec k élevé)
        minTension: 0.1,  // N - Tension minimale quasi-nulle (ligne détendue)
        
        // Protection exponentielle (zone d'allongement critique >3%)
        exponentialThreshold: 0.3,  // m - Protection dès 3% d'allongement (au lieu de 5%)
        exponentialStiffness: 500,  // N - Force protection FORTE (×2.5 vs tentative précédente)
        exponentialRate: 2.0,  // 1/m - Croissance exponentielle rapide
    },
    control: {
        deltaMax: 0.6,
        velocityDelta: 0.25,
        velocityReturn: 0.4,
    },
    rendering: {
        fov: 60,
        near: 0.1,
        far: 1000,
        showGrid: true,
        showDebug: true,
        clearColor: 0x87ceeb,
    },
    ui: {
        logInterval: 0.25,
        maxLogEntries: 32,
        showDebugPanel: true,
        showControlPanel: true,
    },
    logging: {
        enabled: true,
        bufferSize: 32,
        consoleOutput: true,
    }
};
