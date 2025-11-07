/**
 * Calculateur de forces des lignes de contrôle.
 * 
 * Modèle PENDULE 3D : Treuil → Ligne → Point de contrôle → Brides → Structure
 * 
 * @module domain/physics/forces/LineForce
 */

import * as THREE from 'three';
import { Vector3D, KitePhysicsState, WindState } from '../../../core/types/PhysicsState';
import { ILineForceCalculator, LineForceResult } from './ForceCalculator';
import { Kite } from '../../kite/Kite';
import { BridleSystem } from '../BridleSystem';

/**
 * Configuration du système de lignes.
 */
export interface LineForceConfig {
    /** Raideur du ressort linéaire (N/m) - Zone proche */
    stiffness: number;

    /** Amortissement (Ns/m) */
    damping: number;

    /** Coefficient de lissage temporel (0-1) */
    smoothingCoefficient: number;

    /** Tension minimale en régime 1 (N) */
    minTension: number;

    /** 🔧 NOUVEAU : Seuil d'activation de la zone exponentielle (m) */
    exponentialThreshold: number;

    /** 🔧 NOUVEAU : Coefficient d'intensité exponentielle (N) */
    exponentialStiffness: number;

    /** 🔧 NOUVEAU : Taux de croissance exponentiel (1/m) */
    exponentialRate: number;

    /** 🔧 NOUVEAU : Tension maximale sûre (N) avant clamp (rupture ligne) */
    maxTension: number;
}

/**
 * Position des treuils (station de contrôle).
 */
export interface WinchPositions {
    left: Vector3D;
    right: Vector3D;
}

/**
 * Calculateur de forces des lignes (modèle bi-régime ressort-amortisseur).
 * ✅ REFACTORISÉ : Intègre BridleSystem pour chaîne de transmission complète
 * ✅ OPTIMISÉ: Vecteurs temporaires réutilisables pour réduire allocations
 */
export class LineForceCalculator implements ILineForceCalculator {
    public readonly name = 'LineForce';
    
    private config: LineForceConfig;
    private kite: Kite;
    private winchPositions: WinchPositions;
    
    // 🎯 NOUVEAUTÉ : Systèmes de brides gauche/droit
    private leftBridleSystem: BridleSystem;
    private rightBridleSystem: BridleSystem;
    
    // Tensions lissées pour éviter oscillations
    private smoothedLeftTension: number;
    private smoothedRightTension: number;
    
    // 🎯 NOUVEAUTÉ : Cache des positions précédentes des points de contrôle (warm start optimisation)
    private leftControlPointCache?: THREE.Vector3;
    private rightControlPointCache?: THREE.Vector3;
    
    // ✅ OPTIMISATION: Vecteurs temporaires réutilisables (réduire allocations)
    private tempVector1 = new THREE.Vector3();
    private tempVector2 = new THREE.Vector3();
    private tempVector3 = new THREE.Vector3();
    
    constructor(
        kite: Kite,
        winchPositions: WinchPositions,
        config?: Partial<LineForceConfig>,
        bridleConfig?: Partial<import('../BridleSystem').BridleSystemConfig>
    ) {
        this.kite = kite;
        this.winchPositions = winchPositions;
        this.config = {
            stiffness: config?.stiffness ?? 20,
            damping: config?.damping ?? 10,
            smoothingCoefficient: config?.smoothingCoefficient ?? 0.2,
            minTension: config?.minTension ?? 1.5,
            exponentialThreshold: config?.exponentialThreshold ?? 1.0,
            exponentialStiffness: config?.exponentialStiffness ?? 50,
            exponentialRate: config?.exponentialRate ?? 1.5,
            maxTension: config?.maxTension ?? 400,
        };
        
        this.smoothedLeftTension = this.config.minTension;
        this.smoothedRightTension = this.config.minTension;
        
        // 🎯 NOUVEAUTÉ : Initialiser les systèmes de brides avec config dédiée
        const defaultBridleConfig = {
            maxIterations: bridleConfig?.maxIterations ?? 20,
            convergenceTolerance: bridleConfig?.convergenceTolerance ?? 0.001,  // 1mm
            relaxationFactor: bridleConfig?.relaxationFactor ?? 0.8,
            controlPointMass: bridleConfig?.controlPointMass ?? 0.01,  // 10g
            lineConstraintWeight: bridleConfig?.lineConstraintWeight ?? 1.0,
        };
        
        this.leftBridleSystem = new BridleSystem(kite, 'left', defaultBridleConfig);
        this.rightBridleSystem = new BridleSystem(kite, 'right', defaultBridleConfig);
    }
    
    /**
     * Calcule la force totale (wrapper pour interface IForceCalculator).
     */
    calculate(state: KitePhysicsState, wind: WindState, deltaTime: number): Vector3D {
        // Utiliser delta = 0 par défaut (lignes équilibrées)
        const result = this.calculateWithDelta(state, 0, 10);
        return result.force;
    }
    
    /**
     * Calcule les forces des lignes avec détails.
     * 🎯 REFACTORISÉ (6 nov 2025) : Utilise maintenant la chaîne Ligne → Point de contrôle → Brides → Structure
     * ✅ CORRECTION CRITIQUE (7 nov 2025) : Supprime le délai d'1 frame en résolvant la position AVANT de calculer la force.
     * 
     * PRINCIPE : Approche en 3 passes pour éliminer l'instabilité numérique
     * 1. Résoudre la position géométrique actuelle (avec force dummy)
     * 2. Calculer la vraie tension du ressort avec cette position actuelle
     * 3. Distribuer la force réelle sur les brides pour obtenir couple et forces finales
     */
    calculateWithDelta(state: KitePhysicsState, delta: number, baseLength: number): LineForceResult {
        // Longueurs des lignes avec delta
        const leftLength = baseLength - delta;
        const rightLength = baseLength + delta;
        
        // ═══════════════════════════════════════════════════════════════════════════
        // CORRECTION CRITIQUE : Résolution en 3 passes pour supprimer le délai d'1 frame
        // ═══════════════════════════════════════════════════════════════════════════
        
        // === PASSE 1 : RÉSOUDRE LA POSITION GÉOMÉTRIQUE ACTUELLE ===
        // Nous appelons le solveur avec une force factice (0,0,0) juste pour 
        // obtenir la position géométrique résolue du point de contrôle pour CETTE frame.
        // Cela évite d'utiliser la position de la frame précédente qui cause l'instabilité.
        
        const dummyForce = this.tempVector3.set(0, 0, 0); // Force nulle pour résolution pure
        
        const leftResolvedState = this.leftBridleSystem.calculateBridleForces(
            dummyForce,
            this.winchPositions.left,
            leftLength,
            state,
            this.leftControlPointCache  // Warm start avec position précédente
        );
        const leftControlPoint_CURRENT = leftResolvedState.controlPointPosition;
        
        const rightResolvedState = this.rightBridleSystem.calculateBridleForces(
            dummyForce,
            this.winchPositions.right,
            rightLength,
            state,
            this.rightControlPointCache // Warm start avec position précédente
        );
        const rightControlPoint_CURRENT = rightResolvedState.controlPointPosition;
        
        // Mettre à jour le cache immédiatement pour le warm start de la prochaine frame
        this.leftControlPointCache = leftControlPoint_CURRENT.clone();
        this.rightControlPointCache = rightControlPoint_CURRENT.clone();
        
        // === PASSE 2 : CALCULER LA VRAIE TENSION AVEC LA POSITION ACTUELLE ===
        // Maintenant, nous calculons la force de ressort (le "pull") en utilisant 
        // la position que nous venons de résoudre. Plus de délai = pas d'instabilité.
        
        const leftLineForceData = this.calculateSingleLineForce(
            this.winchPositions.left,
            leftControlPoint_CURRENT, // ✅ Utilise la position résolue de CETTE frame
            leftLength,
            state,
            true
        );
        
        const rightLineForceData = this.calculateSingleLineForce(
            this.winchPositions.right,
            rightControlPoint_CURRENT, // ✅ Utilise la position résolue de CETTE frame
            rightLength,
            state,
            false
        );
        
        // === PASSE 3 : DISTRIBUER LA VRAIE FORCE (POUR COUPLE ET FORCES FINALES) ===
        // On rappelle le solveur avec la force réelle pour obtenir la 
        // distribution de force correcte sur les brides et le couple résultant.
        // C'est rapide car la position a déjà été résolue (warm start efficace).
        
        const leftBridleResult = this.leftBridleSystem.calculateBridleForces(
            leftLineForceData.force, // ✅ Utilise la VRAIE force calculée avec position actuelle
            this.winchPositions.left,
            leftLength,
            state,
            this.leftControlPointCache
        );
        
        const rightBridleResult = this.rightBridleSystem.calculateBridleForces(
            rightLineForceData.force, // ✅ Utilise la VRAIE force calculée avec position actuelle
            this.winchPositions.right,
            rightLength,
            state,
            this.rightControlPointCache
        );
        
        // ═══════════════════════════════════════════════════════════════════════════
        // FIN DE LA CORRECTION - Forces et couple maintenant cohérents avec position actuelle
        // ═══════════════════════════════════════════════════════════════════════════
        
        // Force totale = somme des forces transmises par les brides
        const totalForce = new THREE.Vector3()
            .add(leftBridleResult.totalForce)
            .add(rightBridleResult.totalForce);
        
        // Couple total = somme des couples des deux systèmes de brides
        const totalTorque = new THREE.Vector3()
            .add(leftBridleResult.torque)
            .add(rightBridleResult.torque);
        
        // 🔍 LOG DÉTAILLÉ : Distances et extensions des lignes (1% du temps pour éviter spam)
        if (Math.random() < 0.01) {
            const leftExtension = leftLineForceData.distance - leftLength;
            const rightExtension = rightLineForceData.distance - rightLength;
            
            console.log('═══════════════════════════════════════════════════════');
            console.log('📏 DIAGNOSTIC LIGNES');
            console.log('═══════════════════════════════════════════════════════');
            console.log(`LIGNE GAUCHE:`);
            console.log(`  Treuil      : (${this.winchPositions.left.x.toFixed(2)}, ${this.winchPositions.left.y.toFixed(2)}, ${this.winchPositions.left.z.toFixed(2)})`);
            console.log(`  Point ctrl  : (${leftControlPoint_CURRENT.x.toFixed(2)}, ${leftControlPoint_CURRENT.y.toFixed(2)}, ${leftControlPoint_CURRENT.z.toFixed(2)})`);
            console.log(`  Distance    : ${leftLineForceData.distance.toFixed(3)} m`);
            console.log(`  Longueur obj: ${leftLength.toFixed(3)} m`);
            console.log(`  Extension   : ${leftExtension.toFixed(3)} m (${((leftExtension/leftLength)*100).toFixed(1)}%)`);
            console.log(`  Tension     : ${leftLineForceData.tension.toFixed(1)} N`);
            console.log(``);
            console.log(`LIGNE DROITE:`);
            console.log(`  Treuil      : (${this.winchPositions.right.x.toFixed(2)}, ${this.winchPositions.right.y.toFixed(2)}, ${this.winchPositions.right.z.toFixed(2)})`);
            console.log(`  Point ctrl  : (${rightControlPoint_CURRENT.x.toFixed(2)}, ${rightControlPoint_CURRENT.y.toFixed(2)}, ${rightControlPoint_CURRENT.z.toFixed(2)})`);
            console.log(`  Distance    : ${rightLineForceData.distance.toFixed(3)} m`);
            console.log(`  Longueur obj: ${rightLength.toFixed(3)} m`);
            console.log(`  Extension   : ${rightExtension.toFixed(3)} m (${((rightExtension/rightLength)*100).toFixed(1)}%)`);
            console.log(`  Tension     : ${rightLineForceData.tension.toFixed(1)} N`);
            console.log('═══════════════════════════════════════════════════════');
        }
        
        return {
            force: totalForce,
            torque: totalTorque,
            leftForce: leftBridleResult.totalForce,
            rightForce: rightBridleResult.totalForce,
            leftTension: leftLineForceData.tension,
            rightTension: rightLineForceData.tension,
            leftDistance: leftLineForceData.distance,
            rightDistance: rightLineForceData.distance,
        };
    }
    
    /**
     * Calcule la force d'une seule ligne (modèle bi-régime).
     * ✅ OPTIMISÉ: Réutilise vecteurs temporaires au lieu de créer/cloner
     */
    private calculateSingleLineForce(
        winchPos: Vector3D,
        attachPos: Vector3D,
        targetLength: number,
        state: KitePhysicsState,
        isLeft: boolean
    ): { force: Vector3D; tension: number; distance: number } {
        // Vecteur ligne et distance (réutilise tempVector1)
        this.tempVector1.subVectors(attachPos, winchPos);
        const currentDistance = this.tempVector1.length();
        
        if (currentDistance < 0.01) {
            return {
                force: new THREE.Vector3(0, 0, 0),
                tension: 0,
                distance: currentDistance,
            };
        }
        
        // Direction de la ligne (réutilise tempVector2)
        this.tempVector2.copy(this.tempVector1).normalize();
        
        const restLength = targetLength;
        
        // Vitesse au point d'attache (réutilise tempVector3)
        this.tempVector3.subVectors(attachPos, state.position);
        const rotationalVelocity = new THREE.Vector3()
            .copy(state.angularVelocity)
            .cross(this.tempVector3);
        const attachVelocity = state.velocity.clone().add(rotationalVelocity);
        
        let tension = 0;
        
        // 🔧 MODÈLE CORRIGÉ : Lignes de cerf-volant (tension uniquement)
        // 
        // Un cerf-volant réel :
        // - Les lignes NE PEUVENT QUE TIRER (pas pousser)
        // - Elles sont SOUS TENSION en permanence due au vent et à la gravité
        // - Pas de "compression" : les lignes ne peuvent pas être plus courtes que leur longueur
        // - Modèle physique : ressort avec tension minimale (pré-tension)
        //
        // CORRECTION : Seulement extension positive (allongement)
        // - Si distance < longueur_cible : tension minimale (lignes légèrement tendues)
        // - Si distance > longueur_cible : ressort linéaire + protection exponentielle
        
        const extension = Math.max(0, currentDistance - restLength); // UNIQUEMENT positif
        
        // Vitesse radiale pour amortissement
        const radialVelocity = attachVelocity.dot(this.tempVector2);
        
        // Force de rappel (extension uniquement)
        let springForce: number;
        
        if (extension < this.config.exponentialThreshold) {
            // Zone linéaire : F = k × x
            springForce = this.config.stiffness * extension;
        } else {
            // Zone exponentielle : Protection contre sur-étirement
            const thresholdForce = this.config.stiffness * this.config.exponentialThreshold;
            const excessExtension = extension - this.config.exponentialThreshold;
            
            // ✅ PROTECTION OVERFLOW : Clamper l'argument exponentiel pour éviter Infinity
            // exp(20) ≈ 485 millions → Limite à 15 pour sécurité
            const expArg = Math.min(15, this.config.exponentialRate * excessExtension);
            const expTerm = Math.exp(expArg) - 1;
            
            springForce = this.config.exponentialStiffness * expTerm + thresholdForce;
            
            // ✅ PROTECTION SUPPLÉMENTAIRE : Si encore trop grand, clamper directement
            const MAX_SPRING_FORCE = 50000; // N - Force maximale physiquement possible
            springForce = Math.min(MAX_SPRING_FORCE, springForce);
        }
        
        // Amortissement : F_damp = c × v_radial
        const dampingForce = this.config.damping * radialVelocity;
        
        // Tension totale
        tension = springForce + dampingForce;
        
        // ✅ LISSAGE TEMPOREL : Applique le smoothingCoefficient configuré
        // Évite les variations brutales de tension frame par frame
        // smoothing = 0.8 → nouvelle tension = 80% ancienne + 20% calculée
        if (isLeft) {
            this.smoothedLeftTension = this.config.smoothingCoefficient * this.smoothedLeftTension
                                     + (1 - this.config.smoothingCoefficient) * tension;
            tension = this.smoothedLeftTension;
        } else {
            this.smoothedRightTension = this.config.smoothingCoefficient * this.smoothedRightTension
                                      + (1 - this.config.smoothingCoefficient) * tension;
            tension = this.smoothedRightTension;
        }
        
        // ✅ PHYSIQUE CORRECTE : Pré-tension SEULEMENT si ligne est étirée
        // Si extension > 0 : ligne tendue, appliquer tension minimale réaliste
        // Si extension = 0 : ligne détendue, AUCUNE force (peut arriver en décrochage)
        if (extension > 0) {
            const preTension = this.config.minTension;
            tension = Math.max(preTension, tension);
        } else {
            // Ligne détendue : aucune force (sauf si vitesse d'approche créerait compression)
            // Dans ce cas, on clamp à zéro (pas de force de compression possible)
            tension = Math.max(0, tension);
        }
        
    // ✅ CORRECTION CRITIQUE : Clamper la tension pour éviter explosion numérique
    // Utilise la limite fournie par la config (ex: Dyneema 100 lbs ≈ 440N)
    const MAX_SAFE_TENSION = this.config.maxTension;
        
        if (!isFinite(tension) || isNaN(tension)) {
            console.error(`❌ Tension NaN/Inf détectée ${isLeft ? 'gauche' : 'droite'} - CLAMP à MAX`);
            // ✅ CORRECTION : Clamper à MAX au lieu de reset à 0 !
            // Si NaN/Inf, c'est qu'il y a une force énorme, pas zéro
            tension = MAX_SAFE_TENSION;
        }
        
        if (tension > MAX_SAFE_TENSION) {
            console.warn(`⚠️ Tension excessive ${isLeft ? 'gauche' : 'droite'}: ${tension.toFixed(0)}N (clampé à ${MAX_SAFE_TENSION}N)`);
            tension = MAX_SAFE_TENSION;
        }
        
        // ✅ Les lignes ne peuvent que TIRER, jamais pousser
        tension = Math.max(0, tension);
        
        // Force = tension × direction (vers le treuil) - réutilise tempVector2 qui contient lineDirection
        const force = this.tempVector2.clone().multiplyScalar(-tension);
        
        // 🔍 DEBUG TEMPORAIRE : Vérifier direction force
        if (Math.random() < 0.01) { // Log 1% du temps pour éviter spam
            console.log(`[LineForce] ${isLeft ? 'GAUCHE' : 'DROITE'} - Treuil: (${winchPos.x.toFixed(2)}, ${winchPos.y.toFixed(2)}, ${winchPos.z.toFixed(2)})`);
            console.log(`[LineForce] ${isLeft ? 'GAUCHE' : 'DROITE'} - Attache: (${attachPos.x.toFixed(2)}, ${attachPos.y.toFixed(2)}, ${attachPos.z.toFixed(2)})`);
            console.log(`[LineForce] ${isLeft ? 'GAUCHE' : 'DROITE'} - Direction: (${this.tempVector2.x.toFixed(3)}, ${this.tempVector2.y.toFixed(3)}, ${this.tempVector2.z.toFixed(3)})`);
            console.log(`[LineForce] ${isLeft ? 'GAUCHE' : 'DROITE'} - Tension: ${tension.toFixed(1)}N`);
            console.log(`[LineForce] ${isLeft ? 'GAUCHE' : 'DROITE'} - Force: (${force.x.toFixed(1)}, ${force.y.toFixed(1)}, ${force.z.toFixed(1)}) N`);
        }
        
        return { force, tension, distance: currentDistance };
    }
    
    /**
     * Réinitialise les tensions lissées (appelé lors d'un reset).
     */
    reset(): void {
        // ✅ CORRECTION: Réinitialiser le cache des positions contraintes
        // Pour forcer un recalcul complet à la prochaine frame
        this.leftControlPointCache = undefined;
        this.rightControlPointCache = undefined;
    }
    
    /**
     * Met à jour les positions des treuils.
     */
    setWinchPositions(positions: WinchPositions): void {
        this.winchPositions = positions;
    }
    
    /**
     * 🎯 NOUVEAUTÉ : Retourne les positions contraintes résolues des points de contrôle.
     * Utilisé par le moteur physique pour mettre à jour la géométrie après calcul des forces.
     */
    getResolvedControlPoints(): { left?: THREE.Vector3; right?: THREE.Vector3 } {
        return {
            left: this.leftControlPointCache?.clone(),
            right: this.rightControlPointCache?.clone()
        };
    }

    /**
     * Résout la position d'attache d'une ligne en testant plusieurs alias.
     * ✅ CORRECTION : Utilise une position de fallback géométriquement cohérente
     */
    private resolveAttachPoint(names: string[], fallback: Vector3D): Vector3D {
        for (const name of names) {
            const point = this.kite.getGlobalPointPosition(name);
            if (point) {
                return point;
            }
        }

        // 🎯 CORRECTION : Au lieu d'utiliser le centre de masse comme fallback,
        // estimer une position géométriquement cohérente pour un point de contrôle
        // Utiliser une position légèrement en avant du centre de masse (typique d'un point de contrôle)
        const estimatedControlPoint = fallback.clone();
        estimatedControlPoint.z += 0.5; // 50cm vers l'avant (Z+)
        estimatedControlPoint.y -= 0.2; // 20cm vers le bas (position typique brides)
        
        console.warn('[LineForce] Points de contrôle non trouvés, utilisation estimation géométrique');
        return estimatedControlPoint;
    }
}
