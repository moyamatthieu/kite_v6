/**
 * Point d'entrée principal de l'application.
 * Architecture Clean avec séparation en couches.
 * 
 * @module index
 */

import { NewSimulation } from './core/Simulation';
import { DEFAULT_CONFIG } from './core/SimulationConfig';
import { UserInterface } from './infrastructure/ui/UserInterface';
import { EventBus } from './core/types/Events';

/**
 * Bootstrap de l'application.
 */
function bootstrap() {
    // Créer le conteneur principal
    const container = document.getElementById('app');
    if (!container) {
        throw new Error('Container #app introuvable');
    }
    
    // Créer conteneur 3D
    const canvas3DContainer = document.createElement('div');
    canvas3DContainer.id = 'canvas-container';
    canvas3DContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
    `;
    container.appendChild(canvas3DContainer);
    
    // Initialiser la simulation avec config personnalisée
    const customConfig = {
        ...DEFAULT_CONFIG,
        rendering: {
            ...DEFAULT_CONFIG.rendering,
            showGrid: true,
            showDebug: true, // ✅ Afficher les vecteurs de forces par défaut
        },
        ui: {
            ...DEFAULT_CONFIG.ui,
            logInterval: 0.5, // Log toutes les 0.5s
        },
    };
    
    const simulation = new NewSimulation(canvas3DContainer, customConfig);
    
    // Créer l'interface utilisateur avec callbacks
    const ui = new UserInterface(
        simulation.getEventBus(), // Accès via getter public
        container,
        {
            onReset: () => {
                console.log('🔄 [UI] Callback onReset appelé');
                simulation.reset();
                console.log('🔄 [UI] Callback onReset terminé');
            },
            onPause: () => {
                // Toggle pause/resume
                const currentState = (window as any).__simulationPaused || false;
                if (currentState) {
                    simulation.resume();
                    (window as any).__simulationPaused = false;
                } else {
                    simulation.pause();
                    (window as any).__simulationPaused = true;
                }
            },
            onSimulationPause: (paused) => {
                if (paused) {
                    simulation.pause();
                } else {
                    simulation.resume();
                }
            },
            onWindChange: (speed) => {
                simulation.setWindSpeed(speed);
            },
            onLineLengthChange: (length) => {
                ui.addLog(`📏 Longueur lignes: ${length} m`, 'info');
                // TODO: Implémenter changement longueur dynamique
            },
            onBridleChange: (type, value) => {
                const labels = { nose: 'Nez', intermediate: 'Inter', center: 'Centre' };
                ui.addLog(`🪢 Bride ${labels[type]}: ${value.toFixed(2)} m`, 'info');
                // TODO: Implémenter changement bride dynamique
            },
            onAutoPilotToggle: (enabled) => {
                simulation.setAutoPilotActive(enabled);
            },
            onAutoPilotModeChange: (mode) => {
                simulation.setAutoPilotMode(mode);
            },
            onControlDeltaChange: (delta) => {
                simulation.setControlDelta(delta);
            },
            onGeometryDebugToggle: () => {
                simulation.toggleGeometryDebug();
            },
            onLiftDebugToggle: () => {
                simulation.toggleLiftDebug();
            },
            onForceVectorsToggle: () => {
                simulation.toggleForceVectors();
            },
            onPanelNumbersToggle: () => {
                simulation.togglePanelNumbers();
            },
        }
    );
    
    // Initialiser les valeurs de l'UI depuis la config (plus de vent/longueur/brides car simplifiés)
    
    // Connecter l'UI à la simulation pour les mises à jour automatiques
    simulation.setUIReference(ui);

    // Connecter le Logger de la simulation à l'UI
    const logger = simulation.getLogger();
    if (logger) {
        ui.connectLogger(logger);
    }

    // Message de bienvenue
    ui.addLog('✨ Nouvelle Architecture v2.0', 'success');
    ui.addLog('📦 Clean Architecture (Core/Domain/App/Infra)', 'info');
    ui.addLog('🎯 SOLID Principles + DI', 'info');
    ui.addLog('🚀 Prêt à simuler !', 'success');
    ui.addLog('🎥 Appuyez sur [H] pour l\'aide caméra', 'info');
    
    // Exposer pour debug
    (window as any).simulation = simulation;
    (window as any).ui = ui;
    
    console.log('🎯 Nouvelle simulation démarrée avec architecture propre !');
    console.log('📦 Disponible : window.simulation, window.ui');
}

// Démarrer au chargement du DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
