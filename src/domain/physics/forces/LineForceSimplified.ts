/**
 * Calculateur SIMPLIFIÉ de forces des lignes de contrôle.
 * 
 * PRINCIPE : Les lignes de cerf-volant sont des CONTRAINTES, pas des ressorts.
 * - Si distance < longueur_max : PAS DE FORCE (ligne détendue)
 * - Si distance > longueur_max : Force de rappel proportionnelle
 * 
 * @module domain/physics/forces/LineForceSimplified
 */

import * as THREE from 'three';
import { Vector3D, KitePhysicsState, WindState } from '../../../core/types/PhysicsState';
import { ILineForceCalculator, LineForceResult } from './ForceCalculator';
import { Kite } from '../../kite/Kite';

/**
 * Configuration simplifiée du système de lignes.
 */
export interface LineForceSimplifiedConfig {
    /** Raideur du rappel quand ligne tendue (N/m) */
    stiffness: number;
    
    /** Amortissement visqueux (Ns/m) */
    damping: number;
    
    /** Distance de sécurité avant tension max (m) */
    safetyMargin: number;
    
    /** Force maximale avant rupture (N) */
    maxTension: number;
}

/**
 * Calculateur SIMPLIFIÉ de forces des lignes.
 * 
 * ✅ REFONTE COMPLÈTE : Supprime la complexité inutile
 * - Plus de système de brides complexe
 * - Plus de résolution en 3 passes
 * - Modèle simple et stable : contrainte de longueur max
 */
export class LineForceSimplified implements ILineForceCalculator {
    public readonly name = 'LineForceSimplified';
    
    private config: LineForceSimplifiedConfig;
    private kite: Kite;
    
    // Points d'attache simplifiés (gauche/droite au niveau des brides)
    private readonly attachmentOffset = {
        x: 0.3,  // 30cm de largeur entre points
        y: -0.2, // 20cm sous le centre de masse
        z: 0.1   // 10cm vers l'avant
    };
    
    // Positions des treuils (origine par défaut)
    private winchPositions = {
        left: new THREE.Vector3(-0.5, 0, 0),   // 50cm à gauche
        right: new THREE.Vector3(0.5, 0, 0)    // 50cm à droite
    };
    
    constructor(kite: Kite, config?: Partial<LineForceSimplifiedConfig>) {
        this.kite = kite;
        this.config = {
            stiffness: config?.stiffness ?? 50,        // Plus raide pour meilleur rappel
            damping: config?.damping ?? 5,             // Amortissement modéré
            safetyMargin: config?.safetyMargin ?? 0.5, // 50cm de marge
            maxTension: config?.maxTension ?? 500      // 500N max (sécurité)
        };
    }
    
    /**
     * Calcule la force totale des lignes (interface IForceCalculator).
     */
    calculate(state: KitePhysicsState, wind: WindState, deltaTime: number): Vector3D {
        const result = this.calculateWithDelta(state, 0, 10);
        return result.force;
    }
    
    /**
     * Calcule les forces avec contrôle différentiel.
     * 
     * MODÈLE SIMPLIFIÉ :
     * 1. Calculer les points d'attache sur le kite
     * 2. Pour chaque ligne (gauche/droite) :
     *    - Si distance < longueur_max : AUCUNE FORCE
     *    - Si distance > longueur_max : Force de rappel linéaire
     * 3. Limiter les forces pour éviter explosions
     * 4. Calculer le couple résultant
     */
    calculateWithDelta(
        state: KitePhysicsState,
        delta: number,
        baseLength: number
    ): LineForceResult {
        // Longueurs des lignes avec contrôle différentiel
        const leftLength = baseLength - delta;
        const rightLength = baseLength + delta;
        
        // Points d'attache sur le kite (en coordonnées monde)
        const leftAttach = this.getAttachmentPoint(state, 'left');
        const rightAttach = this.getAttachmentPoint(state, 'right');
        
        // Calculer les forces individuelles
        const leftResult = this.calculateSingleLine(
            this.winchPositions.left,
            leftAttach,
            leftLength,
            state
        );
        
        const rightResult = this.calculateSingleLine(
            this.winchPositions.right,
            rightAttach,
            rightLength,
            state
        );
        
        // Force totale
        const totalForce = new THREE.Vector3()
            .add(leftResult.force)
            .add(rightResult.force);
        
        // Couple : r × F pour chaque ligne
        const centerOfMass = state.position;
        
        const leftLever = new THREE.Vector3().subVectors(leftAttach, centerOfMass);
        const leftTorque = new THREE.Vector3().crossVectors(leftLever, leftResult.force);
        
        const rightLever = new THREE.Vector3().subVectors(rightAttach, centerOfMass);
        const rightTorque = new THREE.Vector3().crossVectors(rightLever, rightResult.force);
        
        const totalTorque = new THREE.Vector3()
            .add(leftTorque)
            .add(rightTorque);
        
        return {
            force: totalForce,
            torque: totalTorque,
            leftForce: leftResult.force,
            rightForce: rightResult.force,
            leftTension: leftResult.tension,
            rightTension: rightResult.tension,
            leftDistance: leftResult.distance,
            rightDistance: rightResult.distance
        };
    }
    
    /**
     * Calcule la force d'une seule ligne.
     * 
     * MODÈLE CONTRAINTE SIMPLE :
     * - distance <= longueur_max : Tension = 0 (ligne détendue)
     * - distance > longueur_max : Tension = k * (distance - longueur_max) + damping
     * 
     * Protection contre explosions :
     * - Limitation progressive près de la tension max
     * - Clamping final de sécurité
     */
    private calculateSingleLine(
        winchPos: Vector3D,
        attachPos: Vector3D,
        maxLength: number,
        state: KitePhysicsState
    ): { force: Vector3D; tension: number; distance: number } {
        // Vecteur et distance
        const lineVector = new THREE.Vector3().subVectors(attachPos, winchPos);
        const distance = lineVector.length();
        
        // Sécurité : distance minimale
        if (distance < 0.01) {
            return {
                force: new THREE.Vector3(0, 0, 0),
                tension: 0,
                distance: 0
            };
        }
        
        // Direction de la ligne (normalisée)
        const lineDirection = lineVector.normalize();
        
        // === MODÈLE CONTRAINTE ===
        let tension = 0;
        
        // Dépassement de la longueur max ?
        const extension = distance - maxLength;
        
        if (extension > 0) {
            // Ligne tendue : force de rappel
            
            // Force élastique : F = k * extension
            let elasticForce = this.config.stiffness * extension;
            
            // Protection contre explosion : limitation progressive
            if (extension > this.config.safetyMargin) {
                // Au-delà de la marge de sécurité : croissance logarithmique
                const excess = extension - this.config.safetyMargin;
                const safeForce = this.config.stiffness * this.config.safetyMargin;
                
                // Logarithme pour croissance douce
                elasticForce = safeForce + this.config.stiffness * Math.log(1 + excess);
            }
            
            // Amortissement visqueux (freine les oscillations)
            const velocity = this.getAttachmentVelocity(state, attachPos);
            const radialVelocity = velocity.dot(lineDirection);
            const dampingForce = this.config.damping * Math.abs(radialVelocity);
            
            // Tension totale
            tension = elasticForce + dampingForce;
            
            // === PROTECTION FINALE ===
            // Limiter pour éviter rupture/explosion
            tension = Math.min(tension, this.config.maxTension);
            
            // Protection NaN/Inf
            if (!isFinite(tension) || isNaN(tension)) {
                console.error('❌ Tension invalide détectée, reset à 0');
                tension = 0;
            }
        }
        // Sinon : ligne détendue, tension = 0
        
        // Force vectorielle (vers le treuil)
        const force = lineDirection.multiplyScalar(-tension);
        
        return {
            force,
            tension,
            distance
        };
    }
    
    /**
     * Calcule le point d'attache sur le kite.
     */
    private getAttachmentPoint(state: KitePhysicsState, side: 'left' | 'right'): Vector3D {
        const offset = new THREE.Vector3(
            side === 'left' ? -this.attachmentOffset.x : this.attachmentOffset.x,
            this.attachmentOffset.y,
            this.attachmentOffset.z
        );
        
        // Transformer en coordonnées monde
        offset.applyQuaternion(state.orientation);
        offset.add(state.position);
        
        return offset;
    }
    
    /**
     * Calcule la vitesse au point d'attache.
     */
    private getAttachmentVelocity(state: KitePhysicsState, attachPos: Vector3D): Vector3D {
        // Vitesse = vitesse_translation + vitesse_rotation
        const lever = new THREE.Vector3().subVectors(attachPos, state.position);
        const rotationalVelocity = new THREE.Vector3()
            .crossVectors(state.angularVelocity, lever);
        
        return new THREE.Vector3()
            .add(state.velocity)
            .add(rotationalVelocity);
    }
    
    /**
     * Réinitialise le calculateur.
     */
    reset(): void {
        // Rien à réinitialiser dans la version simplifiée
    }
    
    /**
     * Met à jour les positions des treuils.
     */
    setWinchPositions(positions: { left: Vector3D; right: Vector3D }): void {
        this.winchPositions.left.copy(positions.left);
        this.winchPositions.right.copy(positions.right);
    }
}
