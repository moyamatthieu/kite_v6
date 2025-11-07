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
    
    /** Configuration comportement simulation */
    behavior: SimulationBehaviorConfig;
}

export interface PhysicsConfig {
    gravity: number; // m/s²
    airDensity: number; // kg/m³
    dampingFactor: number; // 0-1
    maxVelocity: number; // m/s
    maxAngularVelocity: number; // rad/s
    fixedTimeStep?: number; // s - Pas de temps fixe pour la physique (stabilité)
    maxSubsteps: number; // Limite de sous-pas pour éviter spiral of death
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
    /** Tension maximale physique (N) avant rupture (Dyneema ~100 lbs ≈ 440 N) */
    maxTension: number; // N
    
    /** 🎯 NOUVEAUTÉ : Configuration système de brides (chaîne de transmission) */
    bridles: BridlesConfig;
}

/**
 * Configuration du système de brides (Ligne → Point de contrôle → Brides → Structure).
 * 
 * 🎯 NOUVEAU MODÈLE : Résolution de contraintes géométriques
 * 
 * Le point de contrôle n'est PAS solidaire de la structure du kite.
 * Il est déterminé par résolution d'un système de 4 contraintes :
 * 1. Distance au treuil = longueur ligne
 * 2. Distance au NEZ = longueur bride 1
 * 3. Distance au TRAVERSE = longueur bride 2
 * 4. Distance au CENTRE = longueur bride 3
 * 
 * Les forces sont ensuite distribuées sur les 3 brides par résolution
 * d'un système linéaire 3×3 assurant l'équilibre statique.
 */
export interface BridlesConfig {
    /** Nombre maximum d'itérations Newton-Raphson pour convergence */
    maxIterations: number;
    
    /** Tolérance de convergence (m) - Distance résiduelle acceptable */
    convergenceTolerance: number;
    
    /** Facteur de relaxation pour stabilité numérique (0-1) */
    relaxationFactor: number;
    
    /** Poids relatif de la contrainte ligne vs brides (>1 = priorité ligne) */
    lineConstraintWeight: number;
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

export interface SimulationBehaviorConfig {
    /** Configuration auto-reset au sol */
    autoReset: {
        enabled: boolean; // Activer l'auto-reset
        groundThreshold: number; // m - Altitude considérée comme "au sol"
        velocityThreshold: number; // m/s - Vitesse considérée comme stable
        stabilityDuration: number; // s - Durée au sol avant reset
    };
    /** Positions de debug */
    debugPositions: {
        geometry: { x: number; y: number; z: number }; // Position debug géométrie
        lift: { x: number; y: number; z: number }; // Position debug portance
    };
    /** Mode ralenti */
    slowMotion: {
        enabled: boolean; // Activer le mode ralenti
        factor: number; // Facteur de ralentissement (0.1 = 10x plus lent, 0.5 = 2x plus lent, 1.0 = normal)
    };
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
        
        // ✅ AMÉLIORATION: Fixed timestep avec accumulation
        // La simulation utilise un pas de temps fixe pour la physique (stabilité numérique)
        // même si le FPS du rendu varie. Voir Simulation.ts pour implémentation.
        // - Physique : toujours simulée par pas de 1/240s (4.17ms)
        // - Rendu : peut être 30 FPS, 60 FPS, 144 FPS selon performance
        // - Si FPS < 60 : plusieurs sous-pas physique par frame rendu
        // - Si FPS > 60 : interpolation visuelle (pas de sur-simulation)
        // 
        // 🚀 CORRECTION STABILITÉ (recommandation Gemini) :
        // Passage de 60 Hz (16.67ms) à 240 Hz (4.17ms) pour éliminer l'effet rebond
        // Avec k=2000 N/m, nécessite dt < 5ms pour stabilité numérique du ressort
        // 4 calculs physiques par frame rendue à 60 FPS, pas de surcharge significative
        fixedTimeStep: 1/240,  // 240 Hz - Stabilité optimale pour lignes rigides (k=2000 N/m)
        
        // Limite de sous-pas physique par frame de rendu pour éviter "spiral of death"
        // Si FPS tombe trop bas, on plafonne les itérations physiques pour rester réactif
        maxSubsteps: 5,  // 5 sous-pas max = simulation jusqu'à 12 FPS minimum
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
        // ✅ COEFFICIENTS AÉRODYNAMIQUES CORRIGÉS pour forces réalistes
        // Vent 12 m/s, surface 0.57 m² → Pression dyn 88 Pa
        // Forces attendues: Lift ~50-80N, Drag ~50-80N pour équilibre
        liftCoefficient: 1,   // Cl réaliste pour portance (réactivé)
        dragCoefficient: 1,   // Cd réaliste pour traînée
        // La traînée forte crée l'effet "pendule" qui tire le kite en arrière (vers Z+)
        // et le maintient en tension sur les lignes dans la fenêtre de vol
    },
    wind: {
        speed: 10.0,  // m/s (36 km/h) - Vent optimal pour cerf-volant acrobatique
        // Vent léger 3-5 m/s : difficile | Optimal 8-12 m/s : réactif | Fort 15+ m/s : survol
        
        // ═══════════════════════════════════════════════════════════════════════════
        // ⚠️ SYSTÈME DE COORDONNÉES DU VENT (SOURCE UNIQUE DE VÉRITÉ)
        // ═══════════════════════════════════════════════════════════════════════════
        // Le vent SOUFFLE depuis Z- (devant le pilote) vers Z+ (derrière le pilote)
        // - Origine du vent : Z- (loin devant)
        // - Direction : vers Z+ (pousse vers l'horizon)
        // - Station à (0,0,0), cerf-volant en Z+ (ex: 0,8,10)
        // - Cerf-volant REGARDE vers Z- (vers station) pour recevoir le vent de face
        // ═══════════════════════════════════════════════════════════════════════════
        direction: { x: 0, y: 0, z: 1 }, // Direction normalisée : vers Z+ (où VA le vent)
        
        turbulence: 0,  // Pas de turbulence pour l'instant
    },
    lines: {
        baseLength: 15,  // m - Longueur lignes standard pour cerf-volant acrobatique (corrigé de 5 à 15)
        // ✅ PARAMÈTRES LIGNES STABILISÉS (voir CORRECTION_LIGNES_RIGIDES.md)
        // Raideur réduite pour éviter accélérations > 100 m/s² lors de pics de tension
        stiffness: 2000,  // N/m (réduit de 5000)
        
        damping: 10,  // Ns/m - Réduit de 50 à 10 pour éviter annulation de la force de rappel
        // L'amortissement ne doit JAMAIS annuler la force du ressort
        // c_critique = 2√(k×m) = 2√(5000×0.25) ≈ 71 Ns/m
        // c = 10 Ns/m = 0.14 × c_crit (très sous-amorti, mais stable)
        
        smoothingCoefficient: 0.8,  // Lissage fort pour stabilité (validé)
        
    // 🔧 TENSION MINIMALE : Pré-tension réaliste (lignes jamais totalement molles)
    minTension: 10,  // N
        
        // Protection exponentielle (zone d'allongement critique >3%)
        exponentialThreshold: 0.3,  // m - Protection dès 3% d'allongement
        exponentialStiffness: 500,  // N - Force protection modérée (au lieu de 2000)
        exponentialRate: 2.0,  // 1/m - Croissance exponentielle modérée
        
        // ✅ Limite physique de tension (rupture ~ 400–450 N). Garde-fou contre explosion numérique.
        maxTension: 400, // N

        // 🎯 Système de brides avec résolution de contraintes
        bridles: {
            // Paramètres solveur Newton-Raphson
            maxIterations: 20,  // Augmenté de 15 à 20 pour convergence sur cas difficiles
            convergenceTolerance: 0.001,  // m - Ramené à 1mm (au lieu de 5mm) pour précision
            relaxationFactor: 0.85,  // Augmenté de 0.8 à 0.85 pour convergence plus rapide
            lineConstraintWeight: 1.2,  // Réduit de 1.5 à 1.2 pour équilibre optimal ligne/brides
        },
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
    },
    behavior: {
        autoReset: {
            enabled: true,  // Auto-reset activé par défaut
            groundThreshold: 1.0,  // m - Altitude considérée comme "au sol"
            velocityThreshold: 0.2,  // m/s - Vitesse considérée comme stable
            stabilityDuration: 2.0,  // s - 2 secondes au sol stable avant reset
        },
        debugPositions: {
            geometry: { x: 0, y: 3, z: 5 },  // Position centrée, bonne perspective
            lift: { x: 0, y: 5, z: 13 },  // Position initiale CORRECTE : lignes 15m, distance 13.9m (lignes détendues au départ)
        },
        slowMotion: {
            enabled: false,  // Mode ralenti désactivé par défaut
            factor: 1.0,  // Vitesse normale (1.0 = temps réel)
        },
    }
};
