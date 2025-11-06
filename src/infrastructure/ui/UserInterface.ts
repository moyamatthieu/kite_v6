/**
 * Interface utilisateur refaite - Logs gauche, Slider centre, Autopilote droite.
 *
 * @module infrastructure/ui/UserInterface
 */

import './UserInterface.css';
import { SimulationEventType, EventBus } from '../../core/types/Events';
import { Logger, LogEntry, LogLevel } from '../../application/logging/Logger';

export interface UICallbacks {
    onReset?: () => void;
    onPause?: () => void;
    onWindChange?: (speed: number) => void;
    onLineLengthChange?: (length: number) => void;
    onBridleChange?: (type: 'nose' | 'intermediate' | 'center', value: number) => void;
    onAutoPilotToggle?: (enabled: boolean) => void;
    onAutoPilotModeChange?: (mode: string) => void;
    onControlDeltaChange?: (delta: number) => void;
    onSimulationPause?: (paused: boolean) => void;
    onGeometryDebugToggle?: () => void;
    onLiftDebugToggle?: () => void;
    onForceVectorsToggle?: () => void;
    onPanelNumbersToggle?: () => void;
}

/**
 * Gestionnaire de l'interface utilisateur.
 */
export class UserInterface {
    private container: HTMLElement;
    private eventBus: EventBus;
    private callbacks: UICallbacks = {};
    
    private logPanel!: HTMLElement;
    private logContent!: HTMLElement;
    private autoPilotPanel!: HTMLElement;
    private cameraInfoPanel!: HTMLElement;
    private controlSlider!: HTMLInputElement;
    private controlSliderValue!: HTMLElement;
    
    private logEntries: string[] = [];
    private maxLogEntries = 50;
    
    // Dernières informations de la caméra pour la copie
    private lastCameraInfo = {
        position: { x: 0, y: 0, z: 0 },
        azimuth: 0,
        elevation: 0,
        distance: 0
    };
    
    constructor(eventBus: EventBus, parent: HTMLElement, callbacks?: UICallbacks) {
        this.eventBus = eventBus;
        this.callbacks = callbacks || {};
        
        // Créer conteneur principal
        this.container = document.createElement('div');
        this.container.id = 'ui-container';
        parent.appendChild(this.container);
        
        this.createPanels();
        this.setupEventListeners();
        this.subscribeToSimulationEvents();
    }
    
    /**
     * Crée tous les panneaux de l'interface.
     */
    private createPanels(): void {
        this.createSimulationControlPanel();
        this.createLogPanel();
        this.createControlSlider();
        this.createAutoPilotPanel();
        this.createCameraInfoPanel();
    }

    /**
     * Fonction factory pour créer un slider avec label et valeur.
     * Principe DRY (Don't Repeat Yourself) - Élimine la duplication de code HTML.
     * 
     * @param id - Identifiant unique du slider (sans suffixe -slider/-value)
     * @param label - Label affiché à gauche
     * @param unit - Unité affichée après la valeur (ex: "m/s", "m", "")
     * @param min - Valeur minimale
     * @param max - Valeur maximale
     * @param step - Pas d'incrémentation
     * @param value - Valeur initiale
     * @param showInLabel - Si true, affiche la valeur dans le label principal (style vent/longueur)
     * @returns HTML du slider complet
     */
    private createSlider(
        id: string,
        label: string,
        unit: string,
        min: number,
        max: number,
        step: number,
        value: number,
        showInLabel: boolean = false
    ): string {
        const formattedValue = step < 1 ? value.toFixed(2) : value.toFixed(1);
        
        if (showInLabel) {
            // Style vent/longueur (valeur dans le label principal)
            return `
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 12px; color: #00ff88; font-weight: 600; margin-bottom: 8px;">
                        ${label}: <span id="${id}-value" style="color: #fff;">${formattedValue} ${unit}</span>
                    </div>
                    <input type="range"
                           id="${id}-slider"
                           min="${min}"
                           max="${max}"
                           value="${value}"
                           step="${step}"
                           style="
                               width: 100%;
                               height: 6px;
                               -webkit-appearance: none;
                               appearance: none;
                               background: linear-gradient(to right, #666 0%, #00ff88 50%, #666 100%);
                               border-radius: 3px;
                               cursor: pointer;
                               outline: none;
                           ">
                </div>
            `;
        } else {
            // Style brides (label + valeur séparés)
            return `
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <span style="font-size: 11px; color: #aaa;">${label}:</span>
                        <span id="${id}-value" style="font-size: 11px; color: #00ff88; font-weight: 600;">${formattedValue}${unit ? ' ' + unit : ''}</span>
                    </div>
                    <input type="range"
                           id="${id}-slider"
                           min="${min}"
                           max="${max}"
                           value="${value}"
                           step="${step}"
                           style="
                               width: 100%;
                               height: 6px;
                               -webkit-appearance: none;
                               appearance: none;
                               background: linear-gradient(to right, #666 0%, #00ff88 50%, #666 100%);
                               border-radius: 3px;
                               cursor: pointer;
                               outline: none;
                           ">
                </div>
            `;
        }
    }

    /**
     * Crée le panneau de contrôle de simulation (en haut à gauche).
     */
    private createSimulationControlPanel(): void {
        const controlPanel = document.createElement('div');
        controlPanel.id = 'simulation-control-panel';

        controlPanel.innerHTML = `
            <div style="margin-bottom: 15px; border-bottom: 1px solid rgba(0, 255, 136, 0.2); padding-bottom: 10px;">
                <div style="font-size: 14px; font-weight: 600; color: #00ff88; text-align: center;">
                    🎛️ CONTRÔLE SIMULATION
                </div>
            </div>

            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <button id="btn-pause" style="
                    flex: 1;
                    background: rgba(255, 165, 0, 0.1);
                    border: 1px solid rgba(255, 165, 0, 0.3);
                    color: #ffa500;
                    padding: 10px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">⏸️ PAUSE</button>

                <button id="btn-reset" style="
                    flex: 1;
                    background: rgba(255, 68, 68, 0.1);
                    border: 1px solid rgba(255, 68, 68, 0.3);
                    color: #ff4444;
                    padding: 10px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">🔄 RESET</button>
            </div>
            
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <button id="btn-geometry" style="
                    flex: 1;
                    background: rgba(68, 136, 255, 0.1);
                    border: 1px solid rgba(68, 136, 255, 0.3);
                    color: #4488ff;
                    padding: 10px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">🔍 GÉOMÉTRIE</button>
                
                <button id="btn-lift-debug" style="
                    flex: 1;
                    background: rgba(255, 136, 68, 0.1);
                    border: 1px solid rgba(255, 136, 68, 0.3);
                    color: #ff8844;
                    padding: 10px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">🪁 PORTANCE</button>
            </div>
            
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <button id="btn-forces" style="
                    flex: 1;
                    background: rgba(255, 215, 0, 0.1);
                    border: 1px solid rgba(255, 215, 0, 0.3);
                    color: #ffd700;
                    padding: 10px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">⚡ FORCES</button>
            </div>
            
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <button id="btn-panel-numbers" style="
                    flex: 1;
                    background: rgba(255, 255, 0, 0.1);
                    border: 1px solid rgba(255, 255, 0, 0.3);
                    color: #ffff00;
                    padding: 10px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">🔢 PANNEAUX</button>
            </div>

            ${this.createSlider('wind-speed', '🌬️ Vent', 'm/s', 0, 15, 0.1, 3, true)}

            ${this.createSlider('line-length', '📏 Longueur des lignes', 'm', 0, 50, 0.5, 15, true)}

            <div style="margin-bottom: 10px;">
                <div style="font-size: 12px; color: #00ff88; font-weight: 600; margin-bottom: 8px;">
                    🎯 Brides (0.2 - 0.8)
                </div>
            </div>

            ${this.createSlider('bridle-nose', 'Nez', '', 0.2, 0.8, 0.01, 0.65, false)}
            ${this.createSlider('bridle-intermediate', 'Intermédiaire', '', 0.2, 0.8, 0.01, 0.65, false)}
            ${this.createSlider('bridle-center', 'Centre', '', 0.2, 0.8, 0.01, 0.65, false)}
        `;

        this.container.appendChild(controlPanel);

        // Ajouter les styles pour les sliders
        const style = document.createElement('style');
        style.textContent += `
            #wind-speed-slider::-webkit-slider-thumb,
            #line-length-slider::-webkit-slider-thumb,
            #bridle-nose-slider::-webkit-slider-thumb,
            #bridle-intermediate-slider::-webkit-slider-thumb,
            #bridle-center-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #00ff88;
                cursor: pointer;
                box-shadow: 0 0 6px rgba(0, 255, 136, 0.5);
            }
            #wind-speed-slider::-moz-range-thumb,
            #line-length-slider::-moz-range-thumb,
            #bridle-nose-slider::-moz-range-thumb,
            #bridle-intermediate-slider::-moz-range-thumb,
            #bridle-center-slider::-moz-range-thumb {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #00ff88;
                cursor: pointer;
                border: none;
                box-shadow: 0 0 6px rgba(0, 255, 136, 0.5);
            }
            #btn-pause:hover {
                background: rgba(255, 165, 0, 0.2) !important;
                transform: translateY(-1px);
            }
            #btn-reset:hover {
                background: rgba(255, 68, 68, 0.2) !important;
                transform: translateY(-1px);
            }
            #btn-geometry:hover {
                background: rgba(68, 136, 255, 0.2) !important;
                transform: translateY(-1px);
            }
            #btn-lift-debug:hover {
                background: rgba(255, 136, 68, 0.2) !important;
                transform: translateY(-1px);
            }
            #btn-forces:hover {
                background: rgba(255, 215, 0, 0.2) !important;
                transform: translateY(-1px);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Crée le panneau de log (en bas à droite).
     */
    private createLogPanel(): void {
        this.logPanel = document.createElement('div');
        this.logPanel.id = 'log-panel';
        
        this.logPanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 136, 0.2); padding-bottom: 8px;">
                <div style="font-size: 14px; font-weight: 600; color: #00ff88;">
                    📝 JOURNAL
                </div>
                <button id="btn-copy-log" style="
                    background: rgba(0, 255, 136, 0.1);
                    border: 1px solid rgba(0, 255, 136, 0.3);
                    color: #00ff88;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s;
                ">📋 Copier</button>
            </div>
            <div id="log-content" style="
                max-height: 230px;
                overflow-y: auto;
                font-size: 13px;
                line-height: 1.6;
            "></div>
        `;
        
        this.logContent = this.logPanel.querySelector('#log-content')!;
        this.container.appendChild(this.logPanel);
        
        // Messages initiaux
        this.addLog('✅ Interface initialisée', 'info');
        this.addLog('🚀 Simulation prête', 'success');
    }
    
    /**
     * Crée le slider de contrôle central.
     */
    private createControlSlider(): void {
        const sliderPanel = document.createElement('div');
        sliderPanel.id = 'control-slider-panel';
        
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
                    ◀ GAUCHE
                </div>
                
                <input type="range" 
                       id="control-slider" 
                       min="-0.6" 
                       max="0.6" 
                       value="0" 
                       step="0.01"
                       style="
                           flex: 1; 
                           height: 8px; 
                           -webkit-appearance: none;
                           appearance: none;
                           background: linear-gradient(to right, #ff4444 0%, #666 50%, #4444ff 100%); 
                           border-radius: 4px; 
                           cursor: pointer;
                           outline: none;
                       ">
                
                <div style="font-size: 12px; color: #4444ff; font-weight: 600; min-width: 50px;">
                    DROITE ▶
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 10px; font-size: 10px; color: #666;">
                ⌨️ Flèches ← → ou slider pour contrôler | ESPACE = Pause | R = Reset
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
     * Crée le panneau d'autopilote (à droite).
     */
    private createAutoPilotPanel(): void {
        this.autoPilotPanel = document.createElement('div');
        this.autoPilotPanel.id = 'autopilot-panel';
        
        this.autoPilotPanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid rgba(0, 255, 136, 0.2); padding-bottom: 10px;">
                <div style="font-size: 14px; font-weight: 600; color: #00ff88;">
                    🤖 AUTOPILOTE
                </div>
                <label style="display: inline-flex; cursor: pointer;">
                    <input type="checkbox" id="toggle-autopilot" style="
                        width: 44px;
                        height: 24px;
                        -webkit-appearance: none;
                        appearance: none;
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 12px;
                        position: relative;
                        cursor: pointer;
                        outline: none;
                        transition: all 0.3s;
                    ">
                </label>
            </div>
            
            <div id="autopilot-modes" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px;">
                <button class="autopilot-btn" data-mode="manual" style="
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: #aaa;
                    padding: 12px 8px;
                    border-radius: 8px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: center;
                ">
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
            
            <div id="autopilot-status" style="
                background: rgba(0, 255, 136, 0.05);
                border: 1px solid rgba(0, 255, 136, 0.2);
                border-radius: 8px;
                padding: 12px;
                font-size: 11px;
            ">
                <div style="color: #00ff88; font-weight: 600; margin-bottom: 4px;">Mode: Zénith</div>
                <div style="font-size: 10px; color: #aaa;">Maintien au point le plus haut</div>
            </div>
            
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="font-size: 11px; color: #aaa; line-height: 1.6;">
                    <div><strong style="color: #00ff88;">P</strong> : Toggle Autopilote</div>
                    <div><strong style="color: #00ff88;">1-6</strong> : Changer mode</div>
                </div>
            </div>
        `;
        
        this.container.appendChild(this.autoPilotPanel);
        
        // Style les boutons autopilote
        const style = document.createElement('style');
        style.textContent = `
            .autopilot-btn {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: #aaa;
                padding: 12px 8px;
                border-radius: 8px;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s;
                text-align: center;
            }
            .autopilot-btn:hover {
                background: rgba(0, 255, 136, 0.1);
                border-color: rgba(0, 255, 136, 0.3);
                color: #00ff88;
            }
            .autopilot-btn.active {
                background: rgba(0, 255, 136, 0.2);
                border-color: rgba(0, 255, 136, 0.5);
                color: #00ff88;
                font-weight: 600;
            }
            #control-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #00ff88;
                cursor: pointer;
                box-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
            }
            #control-slider::-moz-range-thumb {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #00ff88;
                cursor: pointer;
                border: none;
                box-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
            }
            #toggle-autopilot:checked {
                background: #00ff88 !important;
            }
            #toggle-autopilot:checked::before {
                transform: translateX(20px);
            }
            #toggle-autopilot::before {
                content: '';
                position: absolute;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                top: 2px;
                left: 2px;
                background: white;
                transition: transform 0.3s;
            }
        `;
        document.head.appendChild(style);
    }
    
    /**
     * Crée le panneau d'information de la caméra (bas droite, au-dessus de l'autopilote).
     */
    private createCameraInfoPanel(): void {
        this.cameraInfoPanel = document.createElement('div');
        this.cameraInfoPanel.id = 'camera-info-panel';
        this.cameraInfoPanel.className = 'ui-panel';
        
        this.cameraInfoPanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(0, 255, 136, 0.2); padding-bottom: 8px;">
                <div style="font-size: 13px; font-weight: 600; color: #00ff88;">
                    📹 CAMÉRA
                </div>
                <button id="btn-copy-camera" style="
                    background: rgba(0, 170, 255, 0.1);
                    border: 1px solid rgba(0, 170, 255, 0.3);
                    color: #00aaff;
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s;
                " title="Copier les informations de la caméra">
                    📋
                </button>
            </div>
            
            <div style="font-size: 11px; color: #aaa; line-height: 1.8;">
                <div style="margin-bottom: 8px;">
                    <div style="color: #00aaff; font-weight: 600; margin-bottom: 4px;">Position</div>
                    <div id="camera-position" style="font-family: 'Courier New', monospace; color: #fff;">
                        X: 0.00 m<br>
                        Y: 0.00 m<br>
                        Z: 0.00 m
                    </div>
                </div>
                
                <div>
                    <div style="color: #00aaff; font-weight: 600; margin-bottom: 4px;">Orientation</div>
                    <div id="camera-orientation" style="font-family: 'Courier New', monospace; color: #fff;">
                        Azimut: 0°<br>
                        Élévation: 0°<br>
                        Distance: 0.00 m
                    </div>
                </div>
            </div>
        `;
        
        this.container.appendChild(this.cameraInfoPanel);
    }
    
    /**
     * Configure les écouteurs d'événements.
     */
    private setupEventListeners(): void {
        // Boutons pause et reset
        const pauseBtn = document.getElementById('btn-pause');
        const resetBtn = document.getElementById('btn-reset');
        const geometryBtn = document.getElementById('btn-geometry');
        const liftDebugBtn = document.getElementById('btn-lift-debug');
        const forcesBtn = document.getElementById('btn-forces');
        const panelNumbersBtn = document.getElementById('btn-panel-numbers');

        pauseBtn?.addEventListener('click', () => {
            // Toggle pause/resume
            const currentlyPaused = pauseBtn.textContent?.includes('REPRENDRE') || false;
            this.callbacks.onPause?.();
            if (currentlyPaused) {
                this.addLog('▶️ Simulation reprise', 'success');
                this.updatePauseButton(false);
            } else {
                this.addLog('⏸️ Simulation mise en pause', 'warning');
                this.updatePauseButton(true);
            }
        });

        resetBtn?.addEventListener('click', () => {
            console.log('🔄 [BUTTON] Bouton reset cliqué');
            this.callbacks.onReset?.();
            this.addLog('🔄 Simulation réinitialisée', 'info');
            this.updatePauseButton(false);
            console.log('🔄 [BUTTON] Bouton reset traité');
        });
        
        geometryBtn?.addEventListener('click', () => {
            this.callbacks.onGeometryDebugToggle?.();
            this.addLog('🔍 Mode géométrie basculé', 'info');
        });
        
        liftDebugBtn?.addEventListener('click', () => {
            this.callbacks.onLiftDebugToggle?.();
            this.addLog('🪁 Mode debug portance basculé', 'info');
        });
        
        forcesBtn?.addEventListener('click', () => {
            this.callbacks.onForceVectorsToggle?.();
            this.addLog('⚡ Vecteurs de forces basculés', 'info');
        });
        
        panelNumbersBtn?.addEventListener('click', () => {
            this.callbacks.onPanelNumbersToggle?.();
            this.addLog('🔢 Numéros de panneaux basculés', 'info');
        });

        // Slider vitesse du vent
        const windSpeedSlider = document.getElementById('wind-speed-slider') as HTMLInputElement;
        const windSpeedValue = document.getElementById('wind-speed-value');

        windSpeedSlider?.addEventListener('input', () => {
            const speed = parseFloat(windSpeedSlider.value);
            const beaufort = this.getBeaufortScale(speed);
            windSpeedValue!.textContent = `${speed.toFixed(1)} m/s`;
            
            // Mettre à jour l'affichage Beaufort
            const beaufortDisplay = windSpeedValue?.parentElement?.querySelector('span:last-child');
            if (beaufortDisplay) {
                beaufortDisplay.textContent = `(~${beaufort.toFixed(1)} Beaufort)`;
            }
            
            this.callbacks.onWindChange?.(speed);
            this.addLog(`💨 Vent: ${speed.toFixed(1)} m/s (~${beaufort.toFixed(1)} Beaufort)`, 'info');
        });

        // Slider longueur des lignes
        const lineLengthSlider = document.getElementById('line-length-slider') as HTMLInputElement;
        const lineLengthValue = document.getElementById('line-length-value');

        lineLengthSlider?.addEventListener('input', () => {
            const length = parseFloat(lineLengthSlider.value);
            lineLengthValue!.textContent = length.toFixed(1) + ' m';
            this.callbacks.onLineLengthChange?.(length);
            this.addLog(`📏 Longueur des lignes: ${length.toFixed(1)} m`, 'info');
        });

        // Sliders des brides
        const bridleSliders = [
            { id: 'bridle-nose-slider', type: 'nose' as const, valueId: 'bridle-nose-value' },
            { id: 'bridle-intermediate-slider', type: 'intermediate' as const, valueId: 'bridle-intermediate-value' },
            { id: 'bridle-center-slider', type: 'center' as const, valueId: 'bridle-center-value' }
        ];

        bridleSliders.forEach(({ id, type, valueId }) => {
            const slider = document.getElementById(id) as HTMLInputElement;
            const valueSpan = document.getElementById(valueId);

            slider?.addEventListener('input', () => {
                const value = parseFloat(slider.value);
                valueSpan!.textContent = value.toFixed(2);
                this.callbacks.onBridleChange?.(type, value);
                this.addLog(`🎯 Bride ${type}: ${value.toFixed(2)}`, 'info');
            });
        });

        // Copier log
        const copyBtn = document.getElementById('btn-copy-log');
        copyBtn?.addEventListener('click', () => this.copyLog());
        
        // Copier informations caméra
        const copyCameraBtn = document.getElementById('btn-copy-camera');
        copyCameraBtn?.addEventListener('click', () => this.copyCameraInfo());

        // Toggle autopilote
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
     * S'abonne aux événements de simulation.
     */
    private subscribeToSimulationEvents(): void {
        // On pourrait afficher des stats en temps réel ici si besoin
    }
    
    /**
     * Ajoute un helper pour les clicks.
     */
    private addClickListener(id: string, callback: () => void): void {
        const element = document.getElementById(id);
        element?.addEventListener('click', callback);
    }
    
    /**
     * Ajoute une entrée au log.
     * ✅ OPTIMISÉ: Utilise appendChild au lieu de innerHTML pour éviter re-parsing complet
     */
    public addLog(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
        const colors = {
            info: '#00aaff',
            success: '#00ff88',
            warning: '#ffaa00',
            error: '#ff4444',
        };
        
        const timestamp = new Date().toLocaleTimeString('fr-FR');
        
        // ✅ Créer élément DOM directement au lieu de HTML string
        const logDiv = document.createElement('div');
        logDiv.style.color = colors[type];
        logDiv.style.marginBottom = '4px';
        
        const timeSpan = document.createElement('span');
        timeSpan.style.color = '#666';
        timeSpan.textContent = `[${timestamp}]`;
        
        logDiv.appendChild(timeSpan);
        logDiv.appendChild(document.createTextNode(` ${message}`));
        
        // Ajouter au DOM
        this.logContent.appendChild(logDiv);
        
        // Gérer limite d'entrées
        while (this.logContent.children.length > this.maxLogEntries) {
            this.logContent.removeChild(this.logContent.firstChild!);
        }
        
        // Stocker la référence HTML pour la fonction copyLog
        const entry = logDiv.outerHTML;
        this.logEntries.push(entry);
        if (this.logEntries.length > this.maxLogEntries) {
            this.logEntries.shift();
        }
        
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
     * Copie les informations de la caméra dans le presse-papiers.
     */
    private async copyCameraInfo(): Promise<void> {
        const { position, azimuth, elevation, distance } = this.lastCameraInfo;
        const azimuthDeg = (azimuth * 180 / Math.PI).toFixed(1);
        const elevationDeg = (elevation * 180 / Math.PI).toFixed(1);
        
        const cameraText = `INFORMATIONS CAMÉRA
━━━━━━━━━━━━━━━━━━━━━
Position:
  X: ${position.x.toFixed(2)} m
  Y: ${position.y.toFixed(2)} m
  Z: ${position.z.toFixed(2)} m

Orientation:
  Azimut: ${azimuthDeg}°
  Élévation: ${elevationDeg}°
  Distance: ${distance.toFixed(2)} m`;
        
        try {
            await navigator.clipboard.writeText(cameraText);
            this.addLog('📋 Infos caméra copiées', 'success');
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
     * Met à jour les informations de la caméra.
     * @param position - Position de la caméra dans le monde
     * @param azimuth - Angle azimut en radians
     * @param elevation - Angle d'élévation en radians
     * @param distance - Distance de la caméra à la cible
     */
    public updateCameraInfo(
        position: { x: number; y: number; z: number },
        azimuth: number,
        elevation: number,
        distance: number
    ): void {
        // Stocker les dernières valeurs pour la copie
        this.lastCameraInfo = { position, azimuth, elevation, distance };
        
        const positionDiv = document.getElementById('camera-position');
        const orientationDiv = document.getElementById('camera-orientation');
        
        if (positionDiv) {
            positionDiv.innerHTML = `
                X: ${position.x.toFixed(2)} m<br>
                Y: ${position.y.toFixed(2)} m<br>
                Z: ${position.z.toFixed(2)} m
            `;
        }
        
        if (orientationDiv) {
            const azimuthDeg = (azimuth * 180 / Math.PI).toFixed(1);
            const elevationDeg = (elevation * 180 / Math.PI).toFixed(1);
            
            orientationDiv.innerHTML = `
                Azimut: ${azimuthDeg}°<br>
                Élévation: ${elevationDeg}°<br>
                Distance: ${distance.toFixed(2)} m
            `;
        }
    }
    
    /**
     * Met à jour la position du slider (pour autopilote).
     */
    public updateControlSlider(delta: number): void {
        if (this.controlSlider) {
            this.controlSlider.value = delta.toString();
            this.controlSliderValue.textContent = delta.toFixed(2) + ' m';
        }
    }

    /**
     * Met à jour l'apparence du bouton pause.
     */
    private updatePauseButton(paused: boolean): void {
        const pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement;
        if (pauseBtn) {
            if (paused) {
                pauseBtn.textContent = '▶️ REPRENDRE';
                pauseBtn.style.background = 'rgba(0, 255, 136, 0.1)';
                pauseBtn.style.borderColor = 'rgba(0, 255, 136, 0.3)';
                pauseBtn.style.color = '#00ff88';
            } else {
                pauseBtn.textContent = '⏸️ PAUSE';
                pauseBtn.style.background = 'rgba(255, 165, 0, 0.1)';
                pauseBtn.style.borderColor = 'rgba(255, 165, 0, 0.3)';
                pauseBtn.style.color = '#ffa500';
            }
        }
    }

    /**
     * Connecte le Logger à l'interface utilisateur pour afficher les logs structurés.
     */
    public connectLogger(logger: Logger): () => void {
        const unsubscribe = logger.subscribe((entry: LogEntry) => {
            this.addStructuredLog(entry);
        });
        return unsubscribe;
    }

    /**
     * Ajoute un log structuré depuis le Logger.
     */
    private addStructuredLog(entry: LogEntry): void {
        const colors = {
            [LogLevel.DEBUG]: '#888888',
            [LogLevel.INFO]: '#00aaff',
            [LogLevel.WARNING]: '#ffaa00',
            [LogLevel.ERROR]: '#ff4444',
        };

        const timestamp = new Date(entry.timestamp).toLocaleTimeString('fr-FR');
        const levelEmoji = {
            [LogLevel.DEBUG]: '🔍',
            [LogLevel.INFO]: 'ℹ️',
            [LogLevel.WARNING]: '⚠️',
            [LogLevel.ERROR]: '❌',
        };

        let message = entry.message;
        let type: 'info' | 'success' | 'warning' | 'error' = 'info';

        // Déterminer le type basé sur le niveau
        switch (entry.level) {
            case LogLevel.DEBUG:
                type = 'info';
                break;
            case LogLevel.INFO:
                type = 'info';
                break;
            case LogLevel.WARNING:
                type = 'warning';
                break;
            case LogLevel.ERROR:
                type = 'error';
                break;
        }

        // Formater le message avec les données si présentes
        if (entry.data) {
            if (typeof entry.data === 'object') {
                const dataStr = Object.entries(entry.data)
                    .map(([key, value]) => `${key}:${value}`)
                    .join(' ');
                message += ` | ${dataStr}`;
            } else {
                message += ` | ${entry.data}`;
            }
        }

        // ✅ OPTIMISÉ: Créer élément DOM directement
        const logDiv = document.createElement('div');
        logDiv.style.color = colors[entry.level];
        logDiv.style.marginBottom = '4px';
        logDiv.style.fontSize = '10px';
        
        const timeSpan = document.createElement('span');
        timeSpan.style.color = '#666';
        timeSpan.textContent = `[${timestamp}]`;
        
        const emojiSpan = document.createElement('span');
        emojiSpan.style.color = colors[entry.level];
        emojiSpan.style.marginRight = '4px';
        emojiSpan.textContent = levelEmoji[entry.level];
        
        logDiv.appendChild(timeSpan);
        logDiv.appendChild(document.createTextNode(' '));
        logDiv.appendChild(emojiSpan);
        logDiv.appendChild(document.createTextNode(message));
        
        // Ajouter au DOM
        this.logContent.appendChild(logDiv);
        
        // Gérer limite d'entrées
        while (this.logContent.children.length > this.maxLogEntries) {
            this.logContent.removeChild(this.logContent.firstChild!);
        }
        
        // Stocker la référence HTML pour copyLog
        const entryHtml = logDiv.outerHTML;
        this.logEntries.push(entryHtml);
        if (this.logEntries.length > this.maxLogEntries) {
            this.logEntries.shift();
        }

        this.logContent.scrollTop = this.logContent.scrollHeight;
    }
    
    /**
     * Convertit une vitesse de vent (m/s) en échelle Beaufort.
     */
    private getBeaufortScale(speedMs: number): number {
        if (speedMs < 0.5) return 0;
        if (speedMs < 1.6) return 1;
        if (speedMs < 3.4) return 2;
        if (speedMs < 5.5) return 3;
        if (speedMs < 8.0) return 4;
        if (speedMs < 10.8) return 5;
        if (speedMs < 13.9) return 6;
        if (speedMs < 17.2) return 7;
        if (speedMs < 20.8) return 8;
        if (speedMs < 24.5) return 9;
        if (speedMs < 28.5) return 10;
        if (speedMs < 32.7) return 11;
        return 12;
    }

    /**
     * Nettoie l'interface.
     */
    public dispose(): void {
        this.container.remove();
    }
}
