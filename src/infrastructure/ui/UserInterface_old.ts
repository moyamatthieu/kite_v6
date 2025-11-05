/**
 * Interface utilisateur moderne pour la simulation.
 * 
 * @module infrastructure/ui/UserInterface
 */

import './UserInterface.css';
import { SimulationEventType, EventBus } from '../../core/types/Events';

export interface UICallbacks {
    onReset?: () => void;
    onPause?: () => void;
    onWindChange?: (speed: number) => void;
    onLineLengthChange?: (length: number) => void;
    onBridleChange?: (type: 'nose' | 'intermediate' | 'center', value: number) => void;
    onAutoPilotToggle?: (enabled: boolean) => void;
    onAutoPilotModeChange?: (mode: string) => void;
    onControlDeltaChange?: (delta: number) => void;
}

/**
 * Gestionnaire de l'interface utilisateur.
 */
export class UserInterface {
    private container: HTMLElement;
    private eventBus: EventBus;
    private callbacks: UICallbacks = {};
    
    private controlPanel!: HTMLElement;
    private autoPilotPanel!: HTMLElement;
    private logPanel!: HTMLElement;
    private logContent!: HTMLElement;
    private controlSlider!: HTMLInputElement;
    private controlSliderValue!: HTMLElement;
    
    private logEntries: string[] = [];
    private maxLogEntries = 50;
    
    constructor(eventBus: EventBus, parent: HTMLElement, callbacks?: UICallbacks) {
        this.eventBus = eventBus;
        this.callbacks = callbacks || {};
        
        // Créer conteneur principal
        this.container = document.createElement('div');
        this.container.id = 'ui-container';
        parent.appendChild(this.container);
        
        this.createPanels();
        this.setupEventListeners();
        
        // S'abonner aux événements de simulation
        this.subscribeToSimulationEvents();
    }
    
    /**
     * Crée tous les panneaux de l'interface.
     */
    private createPanels(): void {
        this.createLogPanel();
        this.createControlSlider();
        this.createAutoPilotPanel();
    }
    
    /**
     * Crée le slider de contrôle central.
     */
    private createControlSlider(): void {
        const sliderPanel = document.createElement('div');
        sliderPanel.id = 'control-slider-panel';
        sliderPanel.style.cssText = `
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(20, 20, 30, 0.95);
            border: 2px solid rgba(0, 255, 136, 0.3);
            border-radius: 12px;
            padding: 20px 40px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(10px);
            z-index: 1000;
            min-width: 500px;
        `;
        
        sliderPanel.innerHTML = `
            <div style="text-align: center; margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: 600; color: #00ff88; margin-bottom: 8px;">
                    🎮 CONTRÔLE DU CERF-VOLANT
                </div>
                <div style="font-size: 11px; color: #aaa;">
                    Gauche ← → Droite | Delta: <span id="control-delta-value" style="color: #00ff88; font-weight: 600;">0.00 m</span>
                </div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="font-size: 12px; color: #ff4444; font-weight: 600; min-width: 50px; text-align: right;">
                    GAUCHE
                </div>
                
                <input type="range" 
                       id="control-slider" 
                       min="-0.3" 
                       max="0.3" 
                       value="0" 
                       step="0.01"
                       style="flex: 1; height: 8px; background: linear-gradient(to right, #ff4444, #666 50%, #4444ff); border-radius: 4px; cursor: pointer;">
                
                <div style="font-size: 12px; color: #4444ff; font-weight: 600; min-width: 50px;">
                    DROITE
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 10px; font-size: 10px; color: #666;">
                <span style="color: #ff4444;">◀</span> Tire gauche = tourne à gauche | 
                <span style="color: #4444ff;">▶</span> Tire droite = tourne à droite
            </div>
        `;
        
        this.container.appendChild(sliderPanel);
        
        this.controlSlider = document.getElementById('control-slider') as HTMLInputElement;
        this.controlSliderValue = document.getElementById('control-delta-value')!;
        
        // Événement de changement
        this.controlSlider.addEventListener('input', () => {
            const delta = parseFloat(this.controlSlider.value);
            this.controlSliderValue.textContent = delta.toFixed(2) + ' m';
            this.callbacks.onControlDeltaChange?.(delta);
        });
    }
    
    /**
     * Crée le panneau de contrôle des paramètres (simplifié).
     */
    private createControlPanel(): void {
        this.controlPanel = document.createElement('div');
        this.controlPanel.id = 'control-panel';
        this.controlPanel.className = 'ui-panel';
        this.controlPanel.innerHTML = `
            <div class="panel-header">
                <h2 class="panel-title">
                    <span>⚙️</span>
                    <span>Contrôles</span>
                </h2>
            </div>
            
            <!-- Boutons principaux -->
            <div class="control-group">
                <div class="btn-group">
                    <button class="btn btn-primary" id="btn-reset">🔄 Reset</button>
                    <button class="btn btn-secondary" id="btn-pause">⏸️ Pause</button>
                </div>
            </div>
            
            <!-- Vent -->
            <div class="control-group">
                <label class="control-label">💨 Vent</label>
                <div class="slider-container">
                    <input type="range" class="slider" id="slider-wind" 
                           min="0" max="50" value="20" step="1">
                    <span class="slider-value" id="value-wind">20 km/h</span>
                </div>
            </div>
            
            <!-- Longueur des lignes -->
            <div class="control-group">
                <label class="control-label">📏 Longueur lignes</label>
                <div class="slider-container">
                    <input type="range" class="slider" id="slider-lines" 
                           min="5" max="100" value="15" step="1">
                    <span class="slider-value" id="value-lines">15 m</span>
                </div>
            </div>
            
            <!-- Brides -->
            <div class="control-group">
                <label class="control-label">🪢 Brides</label>
                
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 11px; color: #aaa; display: block; margin-bottom: 4px;">Nez → Contrôle</label>
                    <div class="slider-container">
                        <input type="range" class="slider" id="slider-bridle-nose" 
                               min="0.2" max="1.5" value="0.65" step="0.01">
                        <span class="slider-value" id="value-bridle-nose">0.65 m</span>
                    </div>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 11px; color: #aaa; display: block; margin-bottom: 4px;">Inter → Contrôle</label>
                    <div class="slider-container">
                        <input type="range" class="slider" id="slider-bridle-inter" 
                               min="0.2" max="1.5" value="0.65" step="0.01">
                        <span class="slider-value" id="value-bridle-inter">0.65 m</span>
                    </div>
                </div>
                
                <div>
                    <label style="font-size: 11px; color: #aaa; display: block; margin-bottom: 4px;">Centre → Contrôle</label>
                    <div class="slider-container">
                        <input type="range" class="slider" id="slider-bridle-center" 
                               min="0.2" max="1.5" value="0.65" step="0.01">
                        <span class="slider-value" id="value-bridle-center">0.65 m</span>
                    </div>
                </div>
            </div>
            
            <!-- Instructions -->
            <div class="control-group">
                <label class="control-label">🎥 Mode Caméra</label>
                <div id="camera-mode-indicator" style="
                    padding: 8px 12px;
                    background: rgba(0, 255, 136, 0.1);
                    border: 1px solid rgba(0, 255, 136, 0.3);
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 600;
                    color: #00ff88;
                    text-align: center;
                    margin-bottom: 8px;
                ">
                    ORBITE
                </div>
            </div>
            
            <!-- Instructions -->
            <div class="control-group">
                <label class="control-label">⌨️ Raccourcis</label>
                <div style="font-size: 11px; line-height: 1.8; color: #aaa;">
                    <div><strong>ESPACE</strong> : Pause/Reprise</div>
                    <div><strong>R</strong> : Reset caméra</div>
                    <div><strong>P</strong> : Autopilote ON/OFF</div>
                    <div><strong>H</strong> : Aide caméra (console)</div>
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #333;">
                        <strong>🎥 Caméra :</strong>
                    </div>
                    <div><strong>1</strong> : Mode Orbite</div>
                    <div><strong>2</strong> : Mode Libre (WASD)</div>
                    <div><strong>3</strong> : Mode Suivi</div>
                    <div><strong>F</strong> : Focus cerf-volant</div>
                </div>
            </div>
        `;
        
        this.container.appendChild(this.controlPanel);
    }
    
    /**
     * Crée le panneau d'autopilote.
     */
    private createAutoPilotPanel(): void {
        this.autoPilotPanel = document.createElement('div');
        this.autoPilotPanel.id = 'autopilot-panel';
        this.autoPilotPanel.className = 'ui-panel';
        this.autoPilotPanel.innerHTML = `
            <div class="panel-header">
                <h2 class="panel-title">
                    <span>🤖</span>
                    <span>Autopilote</span>
                </h2>
                <label class="toggle-switch">
                    <input type="checkbox" id="toggle-autopilot">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <!-- Modes -->
            <div class="autopilot-modes" id="autopilot-modes">
                <button class="autopilot-btn" data-mode="manual">
                    <div style="font-size: 16px; margin-bottom: 4px;">✋</div>
                    <div>Manuel</div>
                </button>
                <button class="autopilot-btn" data-mode="stabilization">
                    <div style="font-size: 16px; margin-bottom: 4px;">⚖️</div>
                    <div>Stabilisation</div>
                </button>
                <button class="autopilot-btn" data-mode="altitude">
                    <div style="font-size: 16px; margin-bottom: 4px;">📈</div>
                    <div>Altitude</div>
                </button>
                <button class="autopilot-btn" data-mode="position">
                    <div style="font-size: 16px; margin-bottom: 4px;">📍</div>
                    <div>Position</div>
                </button>
                <button class="autopilot-btn active" data-mode="zenith">
                    <div style="font-size: 16px; margin-bottom: 4px;">⬆️</div>
                    <div>Zénith</div>
                </button>
                <button class="autopilot-btn" data-mode="circular">
                    <div style="font-size: 16px; margin-bottom: 4px;">🔄</div>
                    <div>Circulaire</div>
                </button>
            </div>
            
            <!-- Statut -->
            <div class="autopilot-status" id="autopilot-status">
                <div style="color: #00ff88; font-weight: 600; margin-bottom: 4px;">Mode: Zénith</div>
                <div style="font-size: 10px; color: #aaa;">Maintien au point le plus haut</div>
            </div>
        `;
        
        this.container.appendChild(this.autoPilotPanel);
    }
    
    /**
     * Crée le panneau de log.
     */
    private createLogPanel(): void {
        this.logPanel = document.createElement('div');
        this.logPanel.id = 'log-panel';
        this.logPanel.className = 'ui-panel';
        this.logPanel.innerHTML = `
            <div class="panel-header">
                <h2 class="panel-title">
                    <span>📝</span>
                    <span>Journal</span>
                </h2>
                <button class="btn btn-small btn-secondary" id="btn-copy-log">📋 Copier</button>
            </div>
            
            <div id="log-content"></div>
        `;
        
        this.logContent = this.logPanel.querySelector('#log-content')!;
        this.container.appendChild(this.logPanel);
        
        // Message initial
        this.addLog('✅ Interface initialisée', 'info');
        this.addLog('🚀 Simulation prête', 'success');
    }
    
    /**
     * Configure les écouteurs d'événements.
     */
    private setupEventListeners(): void {
        // Boutons principaux
        this.addClickListener('btn-reset', () => this.callbacks.onReset?.());
        this.addClickListener('btn-pause', () => this.callbacks.onPause?.());
        this.addClickListener('btn-copy-log', () => this.copyLog());
        
        // Sliders
        this.addSliderListener('slider-wind', 'value-wind', ' km/h', 
            (value) => this.callbacks.onWindChange?.(value));
        
        this.addSliderListener('slider-lines', 'value-lines', ' m', 
            (value) => this.callbacks.onLineLengthChange?.(value));
        
        this.addSliderListener('slider-bridle-nose', 'value-bridle-nose', ' m', 
            (value) => this.callbacks.onBridleChange?.('nose', value));
        
        this.addSliderListener('slider-bridle-inter', 'value-bridle-inter', ' m', 
            (value) => this.callbacks.onBridleChange?.('intermediate', value));
        
        this.addSliderListener('slider-bridle-center', 'value-bridle-center', ' m', 
            (value) => this.callbacks.onBridleChange?.('center', value));
        
        // Autopilote
        const toggleAutopilot = document.getElementById('toggle-autopilot') as HTMLInputElement;
        toggleAutopilot?.addEventListener('change', (e) => {
            const enabled = (e.target as HTMLInputElement).checked;
            this.callbacks.onAutoPilotToggle?.(enabled);
            this.addLog(`🤖 Autopilote ${enabled ? 'activé' : 'désactivé'}`, 'info');
        });
        
        // Modes autopilote
        const modeButtons = document.querySelectorAll('.autopilot-btn');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-mode') || 'zenith';
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.callbacks.onAutoPilotModeChange?.(mode);
                this.updateAutopilotStatus(mode);
            });
        });
    }
    
    /**
     * Ajoute un écouteur de clic.
     */
    private addClickListener(id: string, callback: () => void): void {
        const element = document.getElementById(id);
        element?.addEventListener('click', callback);
    }
    
    /**
     * Ajoute un écouteur de slider.
     */
    private addSliderListener(
        sliderId: string, 
        valueId: string, 
        unit: string,
        callback: (value: number) => void
    ): void {
        const slider = document.getElementById(sliderId) as HTMLInputElement;
        const valueDisplay = document.getElementById(valueId);
        
        slider?.addEventListener('input', () => {
            const value = parseFloat(slider.value);
            if (valueDisplay) {
                valueDisplay.textContent = value.toFixed(value < 10 ? 2 : 0) + unit;
            }
            callback(value);
        });
    }
    
    /**
     * S'abonne aux événements de simulation.
     */
    private subscribeToSimulationEvents(): void {
        this.eventBus.subscribe(SimulationEventType.SIMULATION_START, () => {
            this.addLog('▶️ Simulation démarrée', 'success');
        });
        
        this.eventBus.subscribe(SimulationEventType.SIMULATION_PAUSE, () => {
            this.addLog('⏸️ Simulation en pause', 'warning');
            const btn = document.getElementById('btn-pause');
            if (btn) btn.textContent = '▶️ Reprendre';
        });
        
        this.eventBus.subscribe(SimulationEventType.SIMULATION_RESUME, () => {
            this.addLog('▶️ Simulation reprise', 'success');
            const btn = document.getElementById('btn-pause');
            if (btn) btn.textContent = '⏸️ Pause';
        });
        
        this.eventBus.subscribe(SimulationEventType.SIMULATION_RESET, () => {
            this.addLog('🔄 Simulation réinitialisée', 'info');
        });
        
        this.eventBus.subscribe(SimulationEventType.PHYSICS_UPDATE, (event) => {
            // Log périodique (toutes les 2 secondes environ)
            if (Math.random() < 0.03) {
                const state = event.data;
                const pos = state.kite.position;
                const vel = state.kite.velocity;
                this.addLog(
                    `📊 Pos:(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}) V:${vel.length().toFixed(1)}m/s`,
                    'data'
                );
            }
        });
    }
    
    /**
     * Ajoute une entrée au log.
     */
    public addLog(message: string, type: 'info' | 'success' | 'warning' | 'error' | 'data' = 'info'): void {
        const timestamp = new Date().toLocaleTimeString('fr-FR');
        const colors = {
            info: '#00ff88',
            success: '#00ff00',
            warning: '#ffaa00',
            error: '#ff0000',
            data: '#0088ff',
        };
        
        const entry = `
            <div class="log-entry" style="border-left-color: ${colors[type]}">
                <span class="log-timestamp">[${timestamp}]</span>
                <span class="log-message">${message}</span>
            </div>
        `;
        
        this.logEntries.push(entry);
        
        // Limiter le nombre d'entrées
        if (this.logEntries.length > this.maxLogEntries) {
            this.logEntries.shift();
        }
        
        this.logContent.innerHTML = this.logEntries.join('');
        this.logContent.scrollTop = this.logContent.scrollHeight;
    }
    
    /**
     * Copie le log dans le presse-papiers.
     */
    private async copyLog(): Promise<void> {
        const logText = this.logEntries
            .map(entry => {
                const div = document.createElement('div');
                div.innerHTML = entry;
                return div.textContent || '';
            })
            .join('\n');
        
        try {
            await navigator.clipboard.writeText(logText);
            this.addLog('📋 Log copié dans le presse-papiers', 'success');
        } catch (err) {
            this.addLog('❌ Erreur lors de la copie', 'error');
        }
    }
    
    /**
     * Met à jour le statut de l'autopilote.
     */
    private updateAutopilotStatus(mode: string): void {
        const statusDiv = document.getElementById('autopilot-status');
        const descriptions: Record<string, { title: string; desc: string }> = {
            manual: { title: 'Manuel', desc: 'Contrôle total par l\'utilisateur' },
            stabilization: { title: 'Stabilisation', desc: 'Maintien de l\'orientation' },
            altitude: { title: 'Altitude', desc: 'Vol à altitude constante' },
            position: { title: 'Position', desc: 'Stabilisation XYZ' },
            zenith: { title: 'Zénith', desc: 'Maintien au point le plus haut' },
            circular: { title: 'Circulaire', desc: 'Vol en cercle' },
        };
        
        const info = descriptions[mode] || descriptions.manual;
        
        if (statusDiv) {
            statusDiv.innerHTML = `
                <div style="color: #00ff88; font-weight: 600; margin-bottom: 4px;">Mode: ${info.title}</div>
                <div style="font-size: 10px; color: #aaa;">${info.desc}</div>
            `;
        }
        
        this.addLog(`🎯 Mode: ${info.title}`, 'info');
    }
    
    /**
     * Met à jour les valeurs affichées.
     */
    public updateValues(values: {
        wind?: number;
        lineLength?: number;
        bridleNose?: number;
        bridleInter?: number;
        bridleCenter?: number;
    }): void {
        if (values.wind !== undefined) {
            this.updateSliderValue('slider-wind', 'value-wind', values.wind, ' km/h');
        }
        if (values.lineLength !== undefined) {
            this.updateSliderValue('slider-lines', 'value-lines', values.lineLength, ' m');
        }
        if (values.bridleNose !== undefined) {
            this.updateSliderValue('slider-bridle-nose', 'value-bridle-nose', values.bridleNose, ' m');
        }
        if (values.bridleInter !== undefined) {
            this.updateSliderValue('slider-bridle-inter', 'value-bridle-inter', values.bridleInter, ' m');
        }
        if (values.bridleCenter !== undefined) {
            this.updateSliderValue('slider-bridle-center', 'value-bridle-center', values.bridleCenter, ' m');
        }
    }
    
    /**
     * Met à jour l'indicateur de mode caméra.
     */
    public updateCameraMode(mode: string): void {
        const indicator = document.getElementById('camera-mode-indicator');
        if (!indicator) return;
        
        const modeConfig: Record<string, { text: string; color: string; bg: string; border: string }> = {
            orbit: { 
                text: 'ORBITE', 
                color: '#00ff88', 
                bg: 'rgba(0, 255, 136, 0.1)', 
                border: 'rgba(0, 255, 136, 0.3)' 
            },
            free: { 
                text: 'LIBRE (WASD)', 
                color: '#ffaa00', 
                bg: 'rgba(255, 170, 0, 0.1)', 
                border: 'rgba(255, 170, 0, 0.3)' 
            },
            follow: { 
                text: 'SUIVI', 
                color: '#00aaff', 
                bg: 'rgba(0, 170, 255, 0.1)', 
                border: 'rgba(0, 170, 255, 0.3)' 
            },
        };
        
        const config = modeConfig[mode] || modeConfig.orbit;
        
        indicator.textContent = config.text;
        indicator.style.color = config.color;
        indicator.style.background = config.bg;
        indicator.style.borderColor = config.border;
    }
    
    /**
     * Met à jour un slider et sa valeur affichée.
     */
    private updateSliderValue(sliderId: string, valueId: string, value: number, unit: string): void {
        const slider = document.getElementById(sliderId) as HTMLInputElement;
        const valueDisplay = document.getElementById(valueId);
        
        if (slider) slider.value = value.toString();
        if (valueDisplay) {
            valueDisplay.textContent = value.toFixed(value < 10 ? 2 : 0) + unit;
        }
    }
    
    /**
     * Nettoie l'interface.
     */
    public dispose(): void {
        this.container.remove();
    }
}
