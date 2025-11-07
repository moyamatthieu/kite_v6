import * as THREE from 'three';
import { AerodynamicForceCalculator } from './src/domain/physics/forces/AerodynamicForce';
import { KiteGeometry, DEFAULT_KITE_PARAMETERS } from './src/domain/kite/KiteGeometry';
import { Kite } from './src/domain/kite/Kite';

// Créer un kite simple
const kite = new Kite(DEFAULT_KITE_PARAMETERS, {
    mass: 0.25,
    momentOfInertia: new THREE.Vector3(0.01, 0.01, 0.01),
    centerOfMass: new THREE.Vector3(0, 0, 0)
}, {
    position: new THREE.Vector3(0, 8, 10),
    velocity: new THREE.Vector3(0, 0, 0),
    orientation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI),
    angularVelocity: new THREE.Vector3(0, 0, 0),
    acceleration: new THREE.Vector3(0, 0, 0)
});

// Créer le calculateur aérodynamique
const aeroCalc = new AerodynamicForceCalculator(kite, {
    airDensity: 1.225,
    referenceLiftCoefficient: 1.5,
    referenceDragCoefficient: 1.5,
});

// État du vent
const wind = {
    velocity: new THREE.Vector3(0, 0, -12), // Vent de Z- vers Z+ (12 m/s)
    direction: new THREE.Vector3(0, 0, -1),
    speed: 12,
    turbulence: 0
};

// Calculer les forces
const result = aeroCalc.calculateDetailed(kite.getState(), wind, 1/60);

console.log('=== TEST FORCES AÉRODYNAMIQUES ===');
console.log(`Surface totale: ${kite.getTotalArea().toFixed(3)} m²`);
console.log(`Vent: ${wind.speed} m/s`);
console.log(`Pression dynamique: ${(0.5 * 1.225 * wind.speed * wind.speed).toFixed(1)} Pa`);
console.log(`Forces calculées:`);
console.log(`  Portance: (${result.lift.x.toFixed(2)}, ${result.lift.y.toFixed(2)}, ${result.lift.z.toFixed(2)}) N = ${result.lift.length().toFixed(2)} N`);
console.log(`  Traînée: (${result.drag.x.toFixed(2)}, ${result.drag.y.toFixed(2)}, ${result.drag.z.toFixed(2)}) N = ${result.drag.length().toFixed(2)} N`);
console.log(`  Total: (${result.total.x.toFixed(2)}, ${result.total.y.toFixed(2)}, ${result.total.z.toFixed(2)}) N = ${result.total.length().toFixed(2)} N`);
console.log(`Angle d'attaque moyen: ${(result.angleOfAttack * 180 / Math.PI).toFixed(1)}°`);
console.log(`Coefficient portance: ${result.liftCoefficient.toFixed(2)}`);
console.log(`Coefficient traînée: ${result.dragCoefficient.toFixed(2)}`);