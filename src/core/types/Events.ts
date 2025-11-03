/**
 * Système d'événements centralisé pour communication découplée entre modules.
 * 
 * @module core/types/Events
 */

/**
 * Types d'événements disponibles dans la simulation.
 */
export enum SimulationEventType {
    // Événements physiques
    PHYSICS_UPDATE = 'physics:update',
    PHYSICS_RESET = 'physics:reset',
    
    // Événements cerf-volant
    KITE_CRASH = 'kite:crash',
    KITE_POSITION_CHANGE = 'kite:position:change',
    KITE_ORIENTATION_CHANGE = 'kite:orientation:change',
    
    // Événements lignes
    LINES_TENSION_HIGH = 'lines:tension:high',
    LINES_TENSION_LOW = 'lines:tension:low',
    LINES_LENGTH_CHANGE = 'lines:length:change',
    
    // Événements vent
    WIND_CHANGE = 'wind:change',
    WIND_GUST = 'wind:gust',
    
    // Événements contrôle
    CONTROL_INPUT = 'control:input',
    AUTOPILOT_ENABLE = 'autopilot:enable',
    AUTOPILOT_DISABLE = 'autopilot:disable',
    AUTOPILOT_MODE_CHANGE = 'autopilot:mode:change',
    
    // Événements simulation
    SIMULATION_START = 'simulation:start',
    SIMULATION_PAUSE = 'simulation:pause',
    SIMULATION_RESUME = 'simulation:resume',
    SIMULATION_RESET = 'simulation:reset',
    
    // Événements UI
    UI_CONTROL_PANEL_CHANGE = 'ui:control:panel:change',
    UI_DEBUG_TOGGLE = 'ui:debug:toggle',
    
    // Événements logging
    LOG_MESSAGE = 'log:message',
    LOG_CLEAR = 'log:clear',
}

/**
 * Structure de base pour tous les événements.
 */
export interface SimulationEvent<T = any> {
    /** Type d'événement */
    type: SimulationEventType;
    
    /** Timestamp de l'événement (ms depuis epoch) */
    timestamp: number;
    
    /** Données associées à l'événement */
    data: T;
    
    /** Source de l'événement (optionnel) */
    source?: string;
}

/**
 * Callback pour les listeners d'événements.
 */
export type EventListener<T = any> = (event: SimulationEvent<T>) => void;

/**
 * Bus d'événements central pour communication découplée.
 * 
 * @example
 * ```typescript
 * const eventBus = new EventBus();
 * 
 * // S'abonner
 * eventBus.subscribe(SimulationEventType.KITE_CRASH, (event) => {
 *   console.log('Crash détecté!', event.data);
 * });
 * 
 * // Publier
 * eventBus.publish({
 *   type: SimulationEventType.KITE_CRASH,
 *   timestamp: Date.now(),
 *   data: { position: [0, 0, 0], velocity: 10 }
 * });
 * ```
 */
export class EventBus {
    private listeners = new Map<SimulationEventType, Set<EventListener>>();
    private oneTimeListeners = new Map<SimulationEventType, Set<EventListener>>();
    
    /**
     * S'abonne à un type d'événement.
     * 
     * @param type - Type d'événement à écouter
     * @param callback - Fonction appelée lors de l'événement
     * @returns Fonction de désabonnement
     */
    subscribe<T = any>(type: SimulationEventType, callback: EventListener<T>): () => void {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        
        this.listeners.get(type)!.add(callback as EventListener);
        
        // Retourner fonction de désabonnement
        return () => this.unsubscribe(type, callback);
    }
    
    /**
     * S'abonne à un événement pour une seule exécution.
     * 
     * @param type - Type d'événement à écouter
     * @param callback - Fonction appelée une seule fois
     */
    subscribeOnce<T = any>(type: SimulationEventType, callback: EventListener<T>): void {
        if (!this.oneTimeListeners.has(type)) {
            this.oneTimeListeners.set(type, new Set());
        }
        
        this.oneTimeListeners.get(type)!.add(callback as EventListener);
    }
    
    /**
     * Se désabonne d'un type d'événement.
     * 
     * @param type - Type d'événement
     * @param callback - Callback à retirer
     */
    unsubscribe(type: SimulationEventType, callback: EventListener): void {
        this.listeners.get(type)?.delete(callback);
    }
    
    /**
     * Publie un événement à tous les abonnés.
     * 
     * @param event - Événement à publier
     */
    publish<T = any>(event: SimulationEvent<T>): void {
        // Appeler listeners permanents
        const listeners = this.listeners.get(event.type);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(event);
                } catch (error) {
                    console.error(`Erreur dans listener pour ${event.type}:`, error);
                }
            });
        }
        
        // Appeler et retirer listeners one-time
        const oneTimeListeners = this.oneTimeListeners.get(event.type);
        if (oneTimeListeners) {
            oneTimeListeners.forEach(callback => {
                try {
                    callback(event);
                } catch (error) {
                    console.error(`Erreur dans one-time listener pour ${event.type}:`, error);
                }
            });
            this.oneTimeListeners.delete(event.type);
        }
    }
    
    /**
     * Supprime tous les listeners d'un type spécifique.
     * 
     * @param type - Type d'événement à nettoyer
     */
    clear(type: SimulationEventType): void {
        this.listeners.delete(type);
        this.oneTimeListeners.delete(type);
    }
    
    /**
     * Supprime tous les listeners de tous les types.
     */
    clearAll(): void {
        this.listeners.clear();
        this.oneTimeListeners.clear();
    }
    
    /**
     * Retourne le nombre de listeners pour un type d'événement.
     * 
     * @param type - Type d'événement
     * @returns Nombre total de listeners (permanents + one-time)
     */
    getListenerCount(type: SimulationEventType): number {
        const permanent = this.listeners.get(type)?.size || 0;
        const oneTime = this.oneTimeListeners.get(type)?.size || 0;
        return permanent + oneTime;
    }
}
