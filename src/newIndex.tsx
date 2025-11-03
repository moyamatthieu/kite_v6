/**
 * Point d'entrée pour la nouvelle simulation avec architecture propre.
 * 
 * @module newIndex
 */

import { NewSimulation } from './core/NewSimulation';
import { DEFAULT_CONFIG } from './core/SimulationConfig';
import './ui/InterfaceUtilisateur.css';

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
    
    // Créer panneau UI
    const uiPanel = document.createElement('div');
    uiPanel.id = 'ui-overlay';
    uiPanel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 100;
        background: rgba(0, 0, 0, 0.8);
        color: #00ff00;
        font-family: 'Courier New', monospace;
        padding: 20px;
        border-radius: 8px;
        border: 2px solid #00ff00;
        box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
        backdrop-filter: blur(10px);
        min-width: 300px;
    `;
    
    uiPanel.innerHTML = `
        <h2 style="margin: 0 0 15px 0; font-size: 18px; text-align: center; border-bottom: 1px solid #00ff00; padding-bottom: 10px;">
            🪁 NOUVELLE SIMULATION
        </h2>
        
        <div style="margin-bottom: 15px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #00ff00;">Contrôles :</h3>
            <div style="font-size: 12px; line-height: 1.6;">
                <div><strong>ESPACE</strong> : Pause/Reprise</div>
                <div><strong>R</strong> : Reset</div>
                <div><strong>A</strong> : Autopilote ON/OFF</div>
                <div><strong>5</strong> : Mode Zenith</div>
                <div><strong>←/→</strong> ou <strong>Q/D</strong> : Contrôle manuel</div>
            </div>
        </div>
        
        <div style="margin-bottom: 15px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #00ff00;">Statut :</h3>
            <div id="status-display" style="font-size: 12px; line-height: 1.6; color: #33ff33;">
                ▶️ En cours...
            </div>
        </div>
        
        <div>
            <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #00ff00;">Log :</h3>
            <div id="log-display" style="
                font-size: 11px;
                line-height: 1.4;
                color: #66ff66;
                max-height: 200px;
                overflow-y: auto;
                background: rgba(0, 0, 0, 0.5);
                padding: 8px;
                border-radius: 4px;
                border: 1px solid #00ff00;
            ">
                Initialisation...
            </div>
        </div>
    `;
    
    container.appendChild(uiPanel);
    
    // Initialiser la simulation avec config personnalisée
    const customConfig = {
        ...DEFAULT_CONFIG,
        rendering: {
            ...DEFAULT_CONFIG.rendering,
            showGrid: true,
            showDebug: true,
        },
        ui: {
            ...DEFAULT_CONFIG.ui,
            logInterval: 0.25, // Log toutes les 0.25s
        },
    };
    
    const simulation = new NewSimulation(canvas3DContainer, customConfig);
    
    // Afficher message de bienvenue
    const logDisplay = document.getElementById('log-display');
    if (logDisplay) {
        logDisplay.innerHTML = `
            <div style="color: #00ff00; font-weight: bold;">✅ Nouvelle architecture chargée !</div>
            <div style="margin-top: 5px;">• Architecture découplée (Core/Domain/Application/Infrastructure)</div>
            <div>• Dependency Injection</div>
            <div>• EventBus pour communication</div>
            <div>• SOLID principles</div>
            <div style="margin-top: 8px; color: #ffff00;">Prêt à simuler ! 🚀</div>
        `;
    }
    
    // Exposer pour debug
    (window as any).simulation = simulation;
    
    console.log('🎯 Nouvelle simulation démarrée avec architecture propre !');
    console.log('📦 Simulation disponible : window.simulation');
}

// Démarrer au chargement du DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
