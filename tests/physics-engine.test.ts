/**
 * Test d'intégration du moteur physique (sans rendu 3D)
 * Simule 5 secondes de vol avec rapport de performance ASCII
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'

import { PhysicsEngine } from '../src/domain/physics/PhysicsEngine'
import { Kite, KiteFactory } from '../src/domain/kite/Kite'
import { VerletIntegrator } from '../src/domain/physics/integrators/VerletIntegrator'
import { ForceManager } from '../src/domain/physics/forces/ForceCalculator'
import { AerodynamicForceCalculator } from '../src/domain/physics/forces/AerodynamicForce'
import { GravityForceCalculator } from '../src/domain/physics/forces/GravityForce'
import { LineForceCalculator } from '../src/domain/physics/forces/LineForce'
import { createInitialState } from '../src/core/types/PhysicsState'
import { DEFAULT_CONFIG } from '../src/core/SimulationConfig'

describe('Moteur Physique - Simulation de vol (5s) avec rapport ASCII', () => {
  let kite: Kite
  let physicsEngine: PhysicsEngine
  
  const dt = 1 / 60 // 60 FPS fixe
  const duration = 5
  const steps = Math.floor(duration / dt)

  beforeEach(() => {
    // Créer un cerf-volant avec état initial
    const initialState = createInitialState()
    initialState.position.set(0, 8, 8) // Position initiale en vol
    
    // Orientation initiale : face au vent (180° rotation Y + -15° angle d'attaque X)
    const rotationY = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), 
      Math.PI
    )
    const rotationX = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), 
      -15 * Math.PI / 180
    )
    initialState.orientation.copy(rotationY.multiply(rotationX))
    
    kite = KiteFactory.createStandard(initialState)
    
    // Créer intégrateur
    const integrator = new VerletIntegrator({
      dampingFactor: DEFAULT_CONFIG.physics.dampingFactor,
      maxVelocity: DEFAULT_CONFIG.physics.maxVelocity,
      maxAngularVelocity: DEFAULT_CONFIG.physics.maxAngularVelocity,
    })
    
    integrator.setKiteGeometry(
      kite.geometry.parameters.wingspan,
      kite.geometry.parameters.height
    )
    
    // Créer gestionnaire de forces
    const forceManager = new ForceManager()
    
    // Ajouter calculateurs de forces
    forceManager.addCalculator(new AerodynamicForceCalculator(kite, {
      airDensity: DEFAULT_CONFIG.physics.airDensity,
      referenceLiftCoefficient: DEFAULT_CONFIG.kite.liftCoefficient,
      referenceDragCoefficient: DEFAULT_CONFIG.kite.dragCoefficient,
    }))
    
    forceManager.addCalculator(new GravityForceCalculator(
      kite.properties.mass,
      kite, // Pass the kite object here
      DEFAULT_CONFIG.physics.gravity
    ))
    
    // Créer moteur physique
    const windSpeed = 5 // Vent faible pour test stable
    physicsEngine = new PhysicsEngine(
      kite,
      integrator,
      forceManager,
      {
        velocity: new THREE.Vector3(0, 0, -windSpeed), // Vent vers Z-
        direction: new THREE.Vector3(0, 0, -1),
        speed: windSpeed,
        turbulence: 0,
      },
      {
        gravity: DEFAULT_CONFIG.physics.gravity,
        fixedDeltaTime: dt,
      }
    )
    
    // Ajouter calculateur de forces des lignes
    const winchPositions = {
      left: new THREE.Vector3(-0.5, 0, 0),
      right: new THREE.Vector3(0.5, 0, 0),
    }
    
    const lineCalculator = new LineForceCalculator(
      kite,
      winchPositions,
      {
        stiffness: DEFAULT_CONFIG.lines.stiffness,
        damping: DEFAULT_CONFIG.lines.damping,
        smoothingCoefficient: DEFAULT_CONFIG.lines.smoothingCoefficient,
        minTension: DEFAULT_CONFIG.lines.minTension,
      }
    )
    
    physicsEngine.setLineForceCalculator(lineCalculator)
    
    // Calculer longueur initiale des lignes
    const leftControlPoint = kite.getGlobalPointPosition('CONTROLE_GAUCHE') || 
                             kite.getGlobalPointPosition('LEFT_CONTROL')
    const rightControlPoint = kite.getGlobalPointPosition('CONTROLE_DROIT') || 
                              kite.getGlobalPointPosition('RIGHT_CONTROL')
    
    if (leftControlPoint && rightControlPoint) {
      const leftLineLength = winchPositions.left.distanceTo(leftControlPoint)
      const rightLineLength = winchPositions.right.distanceTo(rightControlPoint)
      const baseLineLength = (leftLineLength + rightLineLength) / 2
      physicsEngine.setBaseLineLength(baseLineLength)
    }
  })

  it('simule 5s de vol et affiche un rapport de performance', () => {
    const initialState = kite.getState()
    const initialY = initialState.position.y
    let totalLiftY = 0
    let samples = 0
    
    console.log('\n🪁  Début de la simulation de vol (5s) - Mode Physique Pure')
    console.log('--------------------------------------------------------------')
    console.log('| Temps (s) | Altitude (m) | Portance Y (N) | Vitesse (m/s) | Norme Q |')
    console.log('--------------------------------------------------------------')

    for (let i = 0; i < steps; i++) {
      // Mise à jour physique (delta = 0, pas de contrôle)
      const simState = physicsEngine.update(dt, 0)
      
      // Accumuler la portance verticale
      const liftY = simState.forces.aerodynamic.y
      totalLiftY += liftY
      samples++

      // Affichage chaque seconde
      if (i % Math.floor(1 / dt) === 0) {
        const t = (i * dt).toFixed(1)
        const alt = simState.kite.position.y.toFixed(2)
        const avgLiftY = (totalLiftY / samples).toFixed(2)
        const speed = simState.kite.velocity.length().toFixed(2)
        const qNorm = simState.kite.orientation.length().toFixed(4)

        console.log(`| ${t.padStart(8)} | ${alt.padStart(12)} | ${avgLiftY.padStart(14)} | ${speed.padStart(13)} | ${qNorm.padStart(7)} |`)
      }
    }

    console.log('--------------------------------------------------------------\n')

    // État final
    const finalState = kite.getState()
    const finalY = finalState.position.y
    const avgLiftY = totalLiftY / samples
    const q = finalState.orientation

    console.log('📊 Résultats de la simulation physique :')
    console.log(`   Altitude initiale  : ${initialY.toFixed(2)} m`)
    console.log(`   Altitude finale    : ${finalY.toFixed(2)} m`)
    console.log(`   Variation altitude : ${(finalY - initialY).toFixed(2)} m`)
    console.log(`   Portance Y moyenne : ${avgLiftY.toFixed(2)} N`)
    console.log(`   Vitesse finale     : ${finalState.velocity.length().toFixed(2)} m/s`)
    console.log(`   Norme quaternion   : ${q.length().toFixed(6)}`)
    console.log('')

    // --- Assertions physiques ---
    
    // 1. Le quaternion doit rester normalisé
    expect(Math.abs(1 - q.length())).toBeLessThan(1e-5)
    
    // 2. Le kite doit rester dans une plage d'altitude raisonnable
    expect(finalY).toBeGreaterThan(-10) // Pas de chute extrême
    expect(finalY).toBeLessThan(100) // Pas de montée aberrante
    
    // 3. La portance verticale moyenne doit avoir une magnitude réaliste
    expect(Math.abs(avgLiftY)).toBeGreaterThan(0.1)
    expect(Math.abs(avgLiftY)).toBeLessThan(200)
    
    // 4. Position dans des limites raisonnables (pas d'explosion numérique)
    expect(Math.abs(finalState.position.x)).toBeLessThan(50)
    expect(Math.abs(finalState.position.y)).toBeLessThan(50)
    expect(Math.abs(finalState.position.z)).toBeLessThan(50)
    
    // 5. Vitesse limitée
    const velocity = finalState.velocity.length()
    expect(velocity).toBeLessThan(50)
    
    // 6. Pas de NaN dans les valeurs
    expect(isNaN(finalY)).toBe(false)
    expect(isNaN(velocity)).toBe(false)
    expect(isNaN(avgLiftY)).toBe(false)
    
    console.log('✅ Tous les tests de stabilité physique sont passés !\n')
  })
})
