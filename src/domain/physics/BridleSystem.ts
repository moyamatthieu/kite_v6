/**
 * Système de brides (chaîne de transmission Lignes → Brides → Structure).
 * 
 * Modélise le pendule 3D avec CONTRAINTES GÉOMÉTRIQUES RIGIDES :
 * Treuil → Ligne (longueur variable) → Point de contrôle → 3 Brides (longueurs fixes) → 3 Points d'attache
 * 
 * ⚠️ PRINCIPE FONDAMENTAL : Un pendule a des dimensions FIXES, pas élastiques !
 * Le point de contrôle doit être CALCULÉ dynamiquement pour satisfaire toutes les contraintes.
 * 
 * 🔧 CORRECTION MAJEURE (6 nov 2025) :
 * Le point de contrôle N'EST PAS solidaire de la structure ! Il est déterminé par
 * la résolution simultanée de 4 contraintes de distance :
 * - Distance(Point_contrôle, Treuil) = Longueur_ligne
 * - Distance(Point_contrôle, NEZ) = Longueur_bride_1
 * - Distance(Point_contrôle, TRAVERSE) = Longueur_bride_2
 * - Distance(Point_contrôle, CENTRE) = Longueur_bride_3
 * 
 * @module domain/physics/BridleSystem
 */

import * as THREE from 'three';
import { Vector3D, KitePhysicsState } from '../../core/types/PhysicsState';
import { Kite } from '../kite/Kite';

/**
 * Configuration du système de brides.
 */
export interface BridleSystemConfig {
    /** Nombre d'itérations max pour optimisation position point de contrôle */
    maxIterations: number;
    
    /** Tolérance d'erreur pour convergence optimisation (m) */
    convergenceTolerance: number;
    
    /** Facteur de relaxation pour Newton-Raphson (0.5-1.0) */
    relaxationFactor: number;
    
    /** Masse du point de contrôle (kg) - Généralement négligeable (~10g) */
    controlPointMass: number;
    
    /** Poids relatif de la contrainte ligne vs brides (0.5-2.0) */
    lineConstraintWeight: number;
}

/**
 * Résultat du calcul des forces sur les brides.
 */
export interface BridleForceResult {
    /** Force totale transmise à la structure (N) */
    totalForce: Vector3D;
    
    /** Couple généré sur la structure (N·m) */
    torque: Vector3D;
    
    /** Forces individuelles par point d'attache (pour debug/visualisation) */
    attachmentForces: {
        nose: Vector3D;
        intermediate: Vector3D;
        center: Vector3D;
    };
    
    /** Tensions dans les brides (N) */
    tensions: {
        nose: number;
        intermediate: number;
        center: number;
    };
}

/**
 * Système de brides pour un côté (gauche ou droit).
 * 
 * Calcule comment la force de la ligne se transmet via les 3 brides
 * aux 3 points d'attache sur la structure du cerf-volant.
 */
export class BridleSystem {
    private config: BridleSystemConfig;
    private kite: Kite;
    
    // Noms des points d'attache (définis dans KiteGeometry)
    private readonly attachmentPoints: {
        nose: string;
        intermediate: string;
        center: string;
    };
    
    // Point de contrôle (extrémité de la ligne)
    private readonly controlPointName: string;
    
    // ✅ Vecteurs temporaires pour optimisation
    private tempVector1 = new THREE.Vector3();
    private tempVector2 = new THREE.Vector3();
    private tempVector3 = new THREE.Vector3();
    
    constructor(
        kite: Kite,
        side: 'left' | 'right',
        config?: Partial<BridleSystemConfig>
    ) {
        this.kite = kite;
        
        // Définir les noms des points selon le côté
        if (side === 'left') {
            this.attachmentPoints = {
                nose: 'NEZ',
                intermediate: 'TRAVERSE_GAUCHE',
                center: 'CENTRE'
            };
            this.controlPointName = 'CONTROLE_GAUCHE';
        } else {
            this.attachmentPoints = {
                nose: 'NEZ',
                intermediate: 'TRAVERSE_DROITE',
                center: 'CENTRE'
            };
            this.controlPointName = 'CONTROLE_DROIT';
        }
        
        this.config = {
            maxIterations: config?.maxIterations ?? 20,
            convergenceTolerance: config?.convergenceTolerance ?? 0.001,  // 1mm
            relaxationFactor: config?.relaxationFactor ?? 0.8,
            controlPointMass: config?.controlPointMass ?? 0.01,  // 10g négligeable
            lineConstraintWeight: config?.lineConstraintWeight ?? 1.0,
        };
    }
    
    /**
     * 🎯 MÉTHODE AMÉLIORÉE : Résout la position du point de contrôle.
     * 
     * Le point de contrôle doit satisfaire 4 contraintes de distance simultanément.
     * Utilise un algorithme de projection alternée (ALTERNATING PROJECTIONS) robuste :
     * - Plus stable que gradient descent
     * - Converge même avec mauvaise estimation initiale
     * - Respect garanti des contraintes individuelles à chaque itération
     * 
     * Principe : Projeter alternativement sur chaque contrainte (sphère de rayon = longueur)
     * 
     * @param winchPos - Position du treuil (origine de la ligne)
     * @param lineLength - Longueur cible de la ligne (m)
     * @param attachmentPositions - Positions des 3 points d'attache (monde)
     * @param bridleLengths - Longueurs des 3 brides (m)
     * @param initialGuess - Position initiale pour optimisation (warm start)
     * @returns Position optimale du point de contrôle
     */
    private resolveControlPointPosition(
        winchPos: Vector3D,
        lineLength: number,
        attachmentPositions: { nose: Vector3D; intermediate: Vector3D; center: Vector3D },
        bridleLengths: { nose: number; intermediate: number; center: number },
        initialGuess?: Vector3D
    ): Vector3D {
        // Position initiale : 
        // 1. Si warm start disponible : utiliser l'estimation précédente
        // 2. Sinon : position entre les 3 points d'attache (barycentre)
        let P: THREE.Vector3;
        
        if (initialGuess && initialGuess.length() > 0) {
            P = initialGuess.clone();
        } else {
            // Barycentre des 3 points d'attache (meilleure estimation que trilatération)
            P = new THREE.Vector3()
                .add(attachmentPositions.nose)
                .add(attachmentPositions.intermediate)
                .add(attachmentPositions.center)
                .divideScalar(3);
        }
        
        const w_line = this.config.lineConstraintWeight;
        let bestP = P.clone();
        let bestError = Infinity;
        
        // 🎯 ALGORITHME DE PROJECTION ALTERNÉE (plus robuste que gradient descent)
        // Alterner entre projections sur les 4 sphères de contrainte
        for (let iter = 0; iter < this.config.maxIterations; iter++) {
            // 1. Projection sur contrainte ligne (pondérée)
            for (let i = 0; i < Math.ceil(w_line); i++) {
                const toWinch = this.tempVector1.subVectors(P, winchPos);
                const distWinch = toWinch.length();
                
                if (distWinch > 0.001) {
                    // Projeter sur sphère centrée en treuil de rayon = lineLength
                    const dirWinch = toWinch.normalize();
                    P.copy(winchPos).addScaledVector(dirWinch, lineLength);
                }
            }
            
            // 2. Projection sur contrainte bride nez
            const toNose = this.tempVector2.subVectors(P, attachmentPositions.nose);
            const distNose = toNose.length();
            
            if (distNose > 0.001) {
                const dirNose = toNose.normalize();
                P.copy(attachmentPositions.nose).addScaledVector(dirNose, bridleLengths.nose);
            }
            
            // 3. Projection sur contrainte bride intermédiaire
            const toIntermediate = this.tempVector3.subVectors(P, attachmentPositions.intermediate);
            const distIntermediate = toIntermediate.length();
            
            if (distIntermediate > 0.001) {
                const dirIntermediate = toIntermediate.normalize();
                P.copy(attachmentPositions.intermediate).addScaledVector(dirIntermediate, bridleLengths.intermediate);
            }
            
            // 4. Projection sur contrainte bride centre
            const toCenter = new THREE.Vector3().subVectors(P, attachmentPositions.center);
            const distCenter = toCenter.length();
            
            if (distCenter > 0.001) {
                const dirCenter = toCenter.normalize();
                P.copy(attachmentPositions.center).addScaledVector(dirCenter, bridleLengths.center);
            }
            
            // Calculer l'erreur résiduelle après ce cycle de projections
            const errorLine = Math.abs(P.distanceTo(winchPos) - lineLength);
            const errorNose = Math.abs(P.distanceTo(attachmentPositions.nose) - bridleLengths.nose);
            const errorIntermediate = Math.abs(P.distanceTo(attachmentPositions.intermediate) - bridleLengths.intermediate);
            const errorCenter = Math.abs(P.distanceTo(attachmentPositions.center) - bridleLengths.center);
            
            // Erreur totale RMS (pondérée)
            const totalError = Math.sqrt(
                (w_line * errorLine * errorLine +
                 errorNose * errorNose +
                 errorIntermediate * errorIntermediate +
                 errorCenter * errorCenter) / (w_line + 3)
            );
            
            // Garder la meilleure solution trouvée
            if (totalError < bestError) {
                bestError = totalError;
                bestP.copy(P);
            }
            
            // Convergence ?
            if (totalError < this.config.convergenceTolerance) {
                break;
            }
            
            // Protection divergence : si erreur augmente trop, revenir à la meilleure solution
            if (iter > 5 && totalError > bestError * 2) {
                P.copy(bestP);
                break;
            }
        }
        
        return bestP;
    }
    
    
    /**
     * 🎯 NOUVEAUTÉ : Calcule les tensions dans les brides par résolution système linéaire.    /**
     * 🎯 NOUVELLE MÉTHODE : Calcule les tensions dans les brides par résolution système linéaire.
     * 
     * Équilibre des forces au point de contrôle :
     * F_ligne + T1·dir1 + T2·dir2 + T3·dir3 = 0
     * 
     * Donc : T1·dir1 + T2·dir2 + T3·dir3 = -F_ligne
     * 
     * C'est un système linéaire 3×3 : J·T = -F_ligne
     * avec J = [dir1 | dir2 | dir3] (matrice des directions)
     * 
     * @param lineForce - Force de la ligne (vers le treuil)
     * @param directions - Directions unitaires des 3 brides
     * @returns Tensions [T1, T2, T3] ou null si système singulier
     */
    private solveBridleTensions(
        lineForce: Vector3D,
        directions: { nose: Vector3D; intermediate: Vector3D; center: Vector3D }
    ): { nose: number; intermediate: number; center: number } | null {
        // Construction matrice jacobienne J = [dir1 | dir2 | dir3]
        const J = new THREE.Matrix3();
        J.set(
            directions.nose.x, directions.intermediate.x, directions.center.x,
            directions.nose.y, directions.intermediate.y, directions.center.y,
            directions.nose.z, directions.intermediate.z, directions.center.z
        );
        
        // Vérifier si matrice inversible (déterminant non nul)
        const det = J.determinant();
        if (Math.abs(det) < 1e-6) {
            console.warn('[BridleSystem] Matrice jacobienne singulière (directions coplanaires), det =', det);
            // Fallback : répartition uniforme
            const avgTension = lineForce.length() / 3;
            return {
                nose: Math.max(0, avgTension),
                intermediate: Math.max(0, avgTension),
                center: Math.max(0, avgTension)
            };
        }
        
        // Résoudre J·T = -F_ligne
        const invJ = new THREE.Matrix3().copy(J).invert();
        const minusF = new THREE.Vector3().copy(lineForce).negate();
        const tensionsVec = minusF.applyMatrix3(invJ);
        
        // Extraire tensions (contrainte : >= 0, les brides ne peuvent que tirer)
        const T1 = Math.max(0, tensionsVec.x);
        const T2 = Math.max(0, tensionsVec.y);
        const T3 = Math.max(0, tensionsVec.z);
        
        // Log si certaines tensions sont négatives (bride "lâche")
        if (tensionsVec.x < 0 || tensionsVec.y < 0 || tensionsVec.z < 0) {
            console.warn('[BridleSystem] Tensions négatives détectées (brides lâches):', {
                nose: tensionsVec.x.toFixed(2),
                intermediate: tensionsVec.y.toFixed(2),
                center: tensionsVec.z.toFixed(2)
            });
        }
        
        return {
            nose: T1,
            intermediate: T2,
            center: T3
        };
    }
    
    /**
     * Calcule la répartition d'une force de ligne sur les 3 brides.
     * 
     * 🎯 REFACTORISÉ (6 nov 2025) : Utilise résolution de contraintes géométriques
     * 
     * Principe physique correct :
     * 1. Résoudre position du point de contrôle (satisfait 4 contraintes : 1 ligne + 3 brides)
     * 2. Calculer tensions des brides par résolution système linéaire (conservation force)
     * 3. Appliquer forces aux points d'attache et calculer couple
     * 
     * @param lineForce - Force de la ligne appliquée au point de contrôle (N)
     * @param winchPos - Position du treuil (origine)
     * @param targetLineLength - Longueur cible de la ligne (m)
     * @param state - État physique actuel du cerf-volant
     * @param previousControlPoint - Position précédente du point de contrôle (warm start)
     * @returns Résultat avec forces par point d'attache + couple
     */
    calculateBridleForces(
        lineForce: Vector3D,
        winchPos: Vector3D,
        targetLineLength: number,
        state: KitePhysicsState,
        previousControlPoint?: Vector3D
    ): BridleForceResult & { controlPointPosition: Vector3D } {
        // 1. Récupérer les positions globales des points d'attache
        const nosePos = this.kite.getGlobalPointPosition(this.attachmentPoints.nose);
        const intermediatePos = this.kite.getGlobalPointPosition(this.attachmentPoints.intermediate);
        const centerPos = this.kite.getGlobalPointPosition(this.attachmentPoints.center);
        
        if (!nosePos || !intermediatePos || !centerPos) {
            console.warn('[BridleSystem] Points manquants dans la géométrie');
            return {
                ...this.createEmptyResult(),
                controlPointPosition: new THREE.Vector3()
            };
        }
        
        // 2. 🎯 NOUVEAUTÉ : Résoudre la position du point de contrôle
        const bridleLengths = {
            nose: this.kite.geometry.parameters.bridles.nose,
            intermediate: this.kite.geometry.parameters.bridles.intermediate,
            center: this.kite.geometry.parameters.bridles.center
        };
        
        const controlPointPos = this.resolveControlPointPosition(
            winchPos,
            targetLineLength,
            { nose: nosePos, intermediate: intermediatePos, center: centerPos },
            bridleLengths,
            previousControlPoint
        );
        
        // 🔍 DIAGNOSTIC AMÉLIORÉ : Vérifier contraintes géométriques
        const actualLineLength = controlPointPos.distanceTo(winchPos);
        const actualNoseLength = controlPointPos.distanceTo(nosePos);
        const actualIntermediateLength = controlPointPos.distanceTo(intermediatePos);
        const actualCenterLength = controlPointPos.distanceTo(centerPos);
        
        const constraintErrors = {
            line: Math.abs(actualLineLength - targetLineLength),
            nose: Math.abs(actualNoseLength - bridleLengths.nose),
            intermediate: Math.abs(actualIntermediateLength - bridleLengths.intermediate),
            center: Math.abs(actualCenterLength - bridleLengths.center)
        };
        
        const maxConstraintError = Math.max(
            constraintErrors.line,
            constraintErrors.nose,
            constraintErrors.intermediate,
            constraintErrors.center
        );
        
        // ✅ Log uniquement si erreur significative (> 1cm)
        if (maxConstraintError > 0.01) {
            const errorType = maxConstraintError > this.config.convergenceTolerance * 5 ? 'CRITIQUE' :
                             maxConstraintError > this.config.convergenceTolerance * 2 ? 'ÉLEVÉE' : 'Modérée';
            
            console.warn(`[BridleSystem] Erreur contraintes ${errorType}: ${maxConstraintError.toFixed(4)}m`, {
                tolérance: this.config.convergenceTolerance.toFixed(4) + 'm',
                détails: {
                    ligne: `${constraintErrors.line.toFixed(4)}m (cible: ${targetLineLength.toFixed(2)}m, actuel: ${actualLineLength.toFixed(4)}m)`,
                    nez: `${constraintErrors.nose.toFixed(4)}m (cible: ${bridleLengths.nose.toFixed(2)}m, actuel: ${actualNoseLength.toFixed(4)}m)`,
                    inter: `${constraintErrors.intermediate.toFixed(4)}m (cible: ${bridleLengths.intermediate.toFixed(2)}m, actuel: ${actualIntermediateLength.toFixed(4)}m)`,
                    centre: `${constraintErrors.center.toFixed(4)}m (cible: ${bridleLengths.center.toFixed(2)}m, actuel: ${actualCenterLength.toFixed(4)}m)`
                }
            });
        }
        
        // 3. Calculer les directions des brides (contrôle → attaches)
        const dirNose = this.tempVector1.subVectors(nosePos, controlPointPos).normalize();
        const dirIntermediate = this.tempVector2.subVectors(intermediatePos, controlPointPos).normalize();
        const dirCenter = this.tempVector3.subVectors(centerPos, controlPointPos).normalize();
        
        // 4. 🎯 NOUVEAUTÉ : Calculer tensions par résolution système linéaire
        const tensions = this.solveBridleTensions(
            lineForce,
            { nose: dirNose, intermediate: dirIntermediate, center: dirCenter }
        );
        
        if (!tensions) {
            console.warn('[BridleSystem] Échec résolution tensions - utilisation fallback');
            return {
                ...this.createEmptyResult(),
                controlPointPosition: controlPointPos
            };
        }
        
        // 🎯 PROTECTION AMÉLIORÉE : Réduire forces si contraintes mal respectées
        // Utilise une fonction smooth (pas de saut brutal)
        let tensionMultiplier = 1.0;
        if (maxConstraintError > this.config.convergenceTolerance) {
            // Fonction de pénalité smooth : exp(-k * error²)
            const k = 200; // Pente de décroissance
            const normalizedError = maxConstraintError / this.config.convergenceTolerance;
            tensionMultiplier = Math.exp(-k * (normalizedError - 1) * (normalizedError - 1));
            tensionMultiplier = Math.max(0.05, tensionMultiplier); // Minimum 5% des forces
            
            if (tensionMultiplier < 0.9) {
                console.log(`[BridleSystem] Forces réduites à ${(tensionMultiplier * 100).toFixed(0)}% (erreur ${maxConstraintError.toFixed(4)}m)`);
            }
        }
        
        // 5. Calculer les forces vectorielles sur chaque point d'attache (avec protection smooth)
        const forceNose = dirNose.clone().multiplyScalar(tensions.nose * tensionMultiplier);
        const forceIntermediate = dirIntermediate.clone().multiplyScalar(tensions.intermediate * tensionMultiplier);
        const forceCenter = dirCenter.clone().multiplyScalar(tensions.center * tensionMultiplier);
        
        // 6. Force totale = somme des 3 forces (doit être ≈ -lineForce)
        const totalForce = new THREE.Vector3()
            .add(forceNose)
            .add(forceIntermediate)
            .add(forceCenter);
        
        // 7. Vérification conservation force (debug)
        const forceError = totalForce.clone().add(lineForce).length();
        if (forceError > 0.1) {  // Erreur > 0.1 N
            console.warn('[BridleSystem] Erreur conservation force:', forceError.toFixed(3), 'N');
        }
        
        // 8. Couple = somme des (bras_de_levier × force) pour chaque attache
        const centerOfMass = state.position;
        
        const leverNose = new THREE.Vector3().subVectors(nosePos, centerOfMass);
        const leverIntermediate = new THREE.Vector3().subVectors(intermediatePos, centerOfMass);
        const leverCenter = new THREE.Vector3().subVectors(centerPos, centerOfMass);
        
        const torqueNose = new THREE.Vector3().crossVectors(leverNose, forceNose);
        const torqueIntermediate = new THREE.Vector3().crossVectors(leverIntermediate, forceIntermediate);
        const torqueCenter = new THREE.Vector3().crossVectors(leverCenter, forceCenter);
        
        const totalTorque = new THREE.Vector3()
            .add(torqueNose)
            .add(torqueIntermediate)
            .add(torqueCenter);
        
        // 9. Retourner le résultat structuré
        return {
            totalForce,
            torque: totalTorque,
            attachmentForces: {
                nose: forceNose,
                intermediate: forceIntermediate,
                center: forceCenter
            },
            tensions: {
                nose: tensions.nose * tensionMultiplier,
                intermediate: tensions.intermediate * tensionMultiplier,
                center: tensions.center * tensionMultiplier
            },
            controlPointPosition: controlPointPos  // ✅ Position résolue dynamiquement
        };
    }
    
    /**
     * Crée un résultat vide (cas d'erreur).
     */
    private createEmptyResult(): BridleForceResult {
        return {
            totalForce: new THREE.Vector3(0, 0, 0),
            torque: new THREE.Vector3(0, 0, 0),
            attachmentForces: {
                nose: new THREE.Vector3(0, 0, 0),
                intermediate: new THREE.Vector3(0, 0, 0),
                center: new THREE.Vector3(0, 0, 0)
            },
            tensions: {
                nose: 0,
                intermediate: 0,
                center: 0
            }
        };
    }
    
    /**
     * Retourne le nom du point de contrôle.
     */
    getControlPointName(): string {
        return this.controlPointName;
    }
    
    /**
     * Retourne les noms des points d'attache.
     */
    getAttachmentPointNames(): { nose: string; intermediate: string; center: string } {
        return { ...this.attachmentPoints };
    }
}
