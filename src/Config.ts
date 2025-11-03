/**
 * Configuration centralisée du simulateur de cerf-volant.
 * Source unique de vérité pour tous les paramètres du projet.
 */

// ============================================================================
// PARAMÈTRES PHYSIQUES
// ============================================================================

export const PHYSIQUE = {
    /** Masse du cerf-volant en kg */
    MASSE_CERF_VOLANT: 0.15,
    
    /** Accélération de la gravité en m/s² */
    GRAVITE: 9.81,
    
    /** Densité de l'air en kg/m³ (au niveau de la mer, 15°C) */
    DENSITE_AIR: 1.225,
    
    /** Facteur d'amortissement numérique pour stabilité (appliqué après calcul d'accélération) */
    FACTEUR_AMORTISSEMENT: 0.99,
    
    /** Vitesse maximale du cerf-volant en m/s */
    VITESSE_MAX: 30,
    
    /** Vitesse angulaire maximale en rad/s */
    VITESSE_ANGULAIRE_MAX: 8,
} as const;

// ============================================================================
// PARAMÈTRES DES LIGNES
// ============================================================================

export const LIGNES = {
    /** Longueur de base des lignes en mètres */
    LONGUEUR_BASE: 15,
    
    /** Longueur minimale des lignes en mètres */
    LONGUEUR_MIN: 5,
    
    /** Longueur maximale des lignes en mètres */
    LONGUEUR_MAX: 100,
    
    /** Raideur du ressort en N/m */
    RAIDEUR: 10,
    
    /** Coefficient d'amortissement en Ns/m */
    AMORTISSEMENT: 10,
    
    /** Tension minimale des lignes en Newtons */
    TENSION_MIN: 0.008,
    
    /** Tension maximale des lignes en Newtons (limite de sécurité) */
    TENSION_MAX: 200,
    
    /** Ratio de longueur au repos (97% de la longueur nominale) */
    RATIO_LONGUEUR_REPOS: 0.99,
    
    /** Coefficient de lissage temporel (0.3-0.5 recommandé) */
    COEFFICIENT_LISSAGE: 0.45,
} as const;

// ============================================================================
// PARAMÈTRES DE CONTRÔLE
// ============================================================================

export const CONTROLE = {
    /** Amplitude maximale de deltaLongueur depuis le centre en mètres (±0.5m) */
    DELTA_MAX: 0.5,
    
    /** Vitesse de changement de longueur en m/s (contrôle manuel) - réduit pour progressivité */
    VITESSE_DELTA: 0.25,
    
    /** Vitesse de retour à zéro en m/s (contrôle manuel) - réduit pour fluidité */
    VITESSE_RETOUR: 0.4,
} as const;

// ============================================================================
// PARAMÈTRES DE GÉOMÉTRIE DU CERF-VOLANT
// ============================================================================

export const GEOMETRIE = {
    /** Envergure du cerf-volant en mètres */
    ENVERGURE: 1.65,
    
    /** Hauteur du cerf-volant en mètres */
    HAUTEUR: 0.65,
    
    /** Profondeur du cerf-volant en mètres */
    PROFONDEUR: 0.15,
    
    /** Diamètre de la structure en mètres */
    DIAMETRE_STRUCTURE: 0.01,
    
    /** Longueurs des brides en mètres */
    BRIDES: {
        /** Longueur de la bride du nez au point de contrôle */
        NEZ: 0.65,
        
        /** Longueur de la bride du point intermédiaire au point de contrôle */
        INTER: 0.65,
        
        /** Longueur de la bride du centre au point de contrôle */
        CENTRE: 0.65,
    },
} as const;

// ============================================================================
// PARAMÈTRES D'AUTOPILOTAGE (PID)
// ============================================================================

export const AUTOPILOTE = {
    /** Altitude minimale en mètres */
    ALTITUDE_MIN: 3.0,
    
    /** Altitude maximale en mètres */
    ALTITUDE_MAX: 15.0,
    
    /** Distance horizontale maximale en mètres */
    DISTANCE_MAX: 20.0,
    
    /** Contrôleur PID pour l'altitude */
    PID_ALTITUDE: {
        kp: 0.8,
        ki: 0.05,
        kd: 0.3,
    },
    
    /** Contrôleur PID pour le déplacement latéral */
    PID_LATERAL: {
        kp: 1.2,
        ki: 0.08,
        kd: 0.4,
    },
    
    /** Contrôleur PID pour la stabilisation (roulis) */
    PID_STABILISATION: {
        kp: 2.0,
        ki: 0.1,
        kd: 0.5,
    },
    
    /** Limites anti-windup pour les termes intégraux */
    LIMITE_INTEGRALE_ALTITUDE: 3,
    LIMITE_INTEGRALE_LATERAL: 3,
    LIMITE_INTEGRALE_ROLL: 2,
    
    /** Rayon par défaut pour le mode trajectoire circulaire en mètres */
    RAYON_CIRCULAIRE: 3.0,
    
    /** Vitesse angulaire pour le mode trajectoire circulaire en rad/s */
    VITESSE_ANGULAIRE_CIRCULAIRE: 0.5,
} as const;

// ============================================================================
// PARAMÈTRES DE VENT
// ============================================================================

export const VENT = {
    /** Vitesse par défaut du vent en km/h */
    VITESSE_DEFAUT: 20,
    
    /** Vitesse minimale du vent en km/h */
    VITESSE_MIN: 0,
    
    /** Vitesse maximale du vent en km/h */
    VITESSE_MAX: 50,
    
    /** Direction par défaut du vent (vecteur normalisé dans le repère monde) */
    DIRECTION_DEFAUT: { x: -1, y: 0, z: 0 }, // Souffle de X+ vers X-
} as const;

// ============================================================================
// PARAMÈTRES D'INTERFACE UTILISATEUR
// ============================================================================

export const UI = {
    /** Intervalle de mise à jour des logs en secondes */
    LOG_INTERVAL: 0.25,
    
    /** Nombre maximum d'entrées dans le buffer de logs (8s / 0.25s = 32 entrées) */
    MAX_LOG_ENTRIES: 32,
    
    /** Nombre maximum de points dans la trajectoire */
    MAX_TRAJECTOIRE_POINTS: 500,
    
    /** Distance minimale entre deux points de trajectoire en mètres */
    DISTANCE_MIN_TRAJECTOIRE: 0.2,
} as const;

// ============================================================================
// PARAMÈTRES DE RENDU 3D
// ============================================================================

export const RENDU = {
    /** Port du serveur de développement */
    PORT: 3000,
    
    /** Taille de la grille en mètres */
    TAILLE_GRILLE: 20,
    
    /** FPS cible de la simulation */
    FPS_CIBLE: 60,
} as const;

// ============================================================================
// SYSTÈME DE COORDONNÉES
// ============================================================================

/**
 * Repère global du simulateur :
 * - X+ : Direction du vent (souffle de X+ vers X-)
 * - Y+ : Altitude (vers le haut)
 * - Z+ : Extrados du cerf-volant (face exposée)
 * - Z- : Intrados (face qui reçoit le vent)
 */
export const COORDONNEES = {
    /** Rotation initiale du cerf-volant (quaternion) */
    ROTATION_INITIALE: {
        /** Axe de rotation (Y) */
        AXE: { x: 0, y: 1, z: 0 },
        /** Angle de rotation en radians (-90° = -π/2) */
        ANGLE: -Math.PI / 2,
    },
} as const;
