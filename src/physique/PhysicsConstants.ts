/**
 * Constantes physiques centralisées pour la simulation de cerf-volant.
 * Toutes les valeurs sont en unités SI (mètres, kilogrammes, secondes, Newtons).
 */

// ============================================================================
// PROPRIÉTÉS DU CERF-VOLANT
// ============================================================================

export const KITE_MASS = 0.15; // kg - Masse typique d'un cerf-volant acrobatique
export const KITE_INERTIA = {
    x: 0.06, // kg⋅m² - Rotation autour de l'axe transversal
    y: 0.06, // kg⋅m² - Rotation autour de l'axe vertical
    z: 0.09  // kg⋅m² - Rotation autour de l'axe longitudinal
};

// ============================================================================
// SYSTÈME DE LIGNES
// ============================================================================

export const LINE_STIFFNESS = 150; // N/m - Raideur des lignes (compromis stabilité/réalisme)
export const LINE_DAMPING = 34; // Ns/m - Amortissement sur-critique (2× critique ≈ 17)
export const LINE_MIN_TENSION = 0.8; // N - Tension minimale (poids des lignes)
export const LINE_REST_LENGTH_RATIO = 0.97; // 97% de la longueur nominale
export const LINE_SMOOTHING_FACTOR = 0.5; // Coefficient de lissage temporel (0-1)
export const LINE_DEFAULT_LENGTH = 10; // m - Longueur par défaut des lignes

// ============================================================================
// AÉRODYNAMIQUE
// ============================================================================

export const AIR_DENSITY = 1.225; // kg/m³ - Densité de l'air au niveau de la mer
export const MAX_LIFT_COEFFICIENT = 2.0; // Cl max réaliste pour un cerf-volant
export const MAX_DRAG_COEFFICIENT = 1.5; // Cd max réaliste
export const MAX_FORCE_PER_PANEL = 20; // N - Force max par panneau (sécurité)
export const MAX_APPARENT_WIND = 20; // m/s - Vent apparent max (sécurité)
export const STALL_ANGLE = 25 * Math.PI / 180; // rad - Angle de décrochage

// ============================================================================
// INTÉGRATION NUMÉRIQUE
// ============================================================================

export const DAMPING_FACTOR = 0.99; // Amortissement numérique global (stabilité)
export const MAX_VELOCITY = 30; // m/s - Vitesse linéaire max (protection overflow)
export const MAX_ANGULAR_VELOCITY = 8; // rad/s - Vitesse angulaire max
export const GRAVITY = 9.81; // m/s² - Accélération gravitationnelle

// ============================================================================
// CONTRAINTES ET COLLISIONS
// ============================================================================

export const GROUND_HEIGHT = 0.05; // m - Hauteur minimale au-dessus du sol
export const GROUND_RESTITUTION = 0.5; // Coefficient de rebond au sol
export const GROUND_FRICTION = 0.95; // Coefficient de friction au sol (réduit)
export const GROUND_ANGULAR_DAMPING = 0.9; // Amortissement angulaire au sol

// ============================================================================
// CONTRÔLES UTILISATEUR
// ============================================================================

export const CONTROL_DELTA_SPEED = 0.8; // m/s - Vitesse de changement de longueur
export const CONTROL_RETURN_SPEED = 1.0; // m/s - Vitesse de retour à zéro
export const CONTROL_MAX_DELTA = 0.6; // m - Différence de longueur max (±60cm)

// ============================================================================
// INTERFACE UTILISATEUR
// ============================================================================

export const LOG_INTERVAL = 0.5; // s - Intervalle entre les logs
export const MAX_LOG_ENTRIES = 8; // Nombre de logs dans le buffer
export const TRAJECTORY_MAX_POINTS = 2000; // Points max pour la trajectoire
export const TRAJECTORY_POINT_SPACING = 0.2; // m - Espacement entre points

// ============================================================================
// RENDU ET VISUALISATION
// ============================================================================

export const DEBUG_FORCE_SCALE = 0.5; // Échelle des vecteurs de force en mode debug
export const CAMERA_FOV = 75; // degrés - Champ de vision de la caméra
export const CAMERA_NEAR = 0.1; // m - Plan de clipping proche
export const CAMERA_FAR = 1000; // m - Plan de clipping lointain
