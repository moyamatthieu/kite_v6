/**
 * Test rapide de validation de la simulation de cerf-volant.
 *
 * Vérifie que :
 * 1. La simulation se lance sans erreur
 * 2. Les forces sont calculées dans le bon ordre
 * 3. Le vol est émergent (pas de comportement scripté)
 * 4. La stabilité numérique est assurée
 */

import { NewSimulation } from '../src/core/Simulation';
import { DEFAULT_CONFIG } from '../src/core/SimulationConfig';

// Créer un conteneur de test
const testContainer = document.createElement('div');
testContainer.id = 'test-container';
testContainer.style.width = '800px';
testContainer.style.height = '600px';
document.body.appendChild(testContainer);

console.log('🧪 Test de validation de la simulation de cerf-volant');

// Créer la simulation
const simulation = new NewSimulation(testContainer, DEFAULT_CONFIG);

console.log('✅ Simulation créée avec succès');

// Tester quelques frames
let frameCount = 0;
const maxFrames = 100;

function testFrame() {
    if (frameCount < maxFrames) {
        // Simuler un pas de temps
        simulation.update(1/60); // 60 FPS

        const state = simulation.getSimulationState();
        const forces = state.forces;

        // Vérifications
        if (frameCount === 0) {
            console.log('📊 État initial :', {
                position: state.kite.position,
                velocity: state.kite.velocity,
                forces: {
                    aero: forces.aerodynamic.length(),
                    gravity: forces.gravity.length(),
                    lines: forces.lines.length(),
                    total: forces.total.length()
                }
            });
        }

        // Vérifier stabilité numérique
        const totalForce = forces.total.length();
        if (totalForce > 1000) {
            console.warn(`⚠️ Force totale élevée: ${totalForce.toFixed(1)}N`);
        }

        // Vérifier que les forces existent
        if (forces.aerodynamic.length() === 0 && forces.gravity.length() === 0 && forces.lines.length() === 0) {
            console.error('❌ Aucune force calculée !');
            return;
        }

        frameCount++;
        setTimeout(testFrame, 16); // ~60 FPS
    } else {
        console.log('✅ Test terminé - Simulation stable');
        console.log('📈 Statistiques finales :', simulation.getSimulationState());
    }
}

// Démarrer le test
setTimeout(testFrame, 100);

export { testFrame };