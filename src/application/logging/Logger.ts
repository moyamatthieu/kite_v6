/**
 * Système de logging structuré.
 * 
 * @module application/logging
 */

/**
 * Niveaux de log.
 */
export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
}

/**
 * Catégories de log pour le vol du cerf-volant.
 */
export enum FlightLogCategory {
    FLIGHT_STATUS = 'flight_status',
    SYSTEM_STATUS = 'system_status',
    PERFORMANCE = 'performance',
    CONTROL = 'control',
}

/**
 * Entrée de log structurée.
 */
export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: number;
    data?: any;
}

/**
 * Snapshot de l'état de simulation pour logging.
 */
export interface SimulationSnapshot {
    time: number;
    position: { x: number; y: number; z: number };
    orientation: { pitch: number; roll: number; yaw: number };
    velocity: { x: number; y: number; z: number };
    forces: {
        aerodynamic: { x: number; y: number; z: number };
        gravity: { x: number; y: number; z: number };
        lines: { x: number; y: number; z: number };
        total: { x: number; y: number; z: number };
    };
    lines: {
        leftTension: number;
        rightTension: number;
        totalTension: number;
        leftDistance: number;      // 🆕 Distance réelle treuil gauche → point de contrôle gauche
        rightDistance: number;     // 🆕 Distance réelle treuil droit → point de contrôle droit
        targetLength: number;      // 🆕 Longueur de ligne objectif (sans delta)
    };
}

/**
 * Buffer circulaire pour logs.
 */
export class LogBuffer {
    private buffer: LogEntry[] = [];
    private maxSize: number;
    
    constructor(maxSize = 32) {
        this.maxSize = maxSize;
    }
    
    add(entry: LogEntry): void {
        this.buffer.push(entry);
        if (this.buffer.length > this.maxSize) {
            this.buffer.shift();
        }
    }
    
    getAll(): readonly LogEntry[] {
        return this.buffer;
    }
    
    clear(): void {
        this.buffer = [];
    }
}

/**
 * Logger principal.
 */
export class Logger {
    private buffer: LogBuffer;
    private callbacks: Set<(entry: LogEntry) => void> = new Set();
    private snapshotBuffer: SimulationSnapshot[] = [];
    private maxSnapshotSize = 10; // ✅ Maximum 10 snapshots
    
    constructor(bufferSize = 32) {
        this.buffer = new LogBuffer(bufferSize);
    }
    
    debug(message: string, data?: any): void {
        this.log(LogLevel.DEBUG, message, data);
    }
    
    info(message: string, data?: any): void {
        this.log(LogLevel.INFO, message, data);
    }
    
    warning(message: string, data?: any): void {
        this.log(LogLevel.WARNING, message, data);
    }
    
    error(message: string, data?: any): void {
        this.log(LogLevel.ERROR, message, data);
    }

    /**
     * Log le statut de vol (position, altitude, vitesse).
     */
    flightStatus(message: string, data?: any): void {
        this.log(LogLevel.INFO, `[VOL] ${message}`, data);
    }

    /**
     * Log les performances (forces, stabilité, efficacité).
     */
    performance(message: string, data?: any): void {
        this.log(LogLevel.INFO, `[PERF] ${message}`, data);
    }

    /**
     * Log les actions de contrôle (autopilote, commandes manuelles).
     */
    control(message: string, data?: any): void {
        this.log(LogLevel.INFO, `[CTRL] ${message}`, data);
    }

    /**
     * ✅ NOUVEAU: Log un snapshot complet de l'état de simulation.
     * Maintient un buffer circulaire des 10 derniers snapshots.
     */
    logSimulationSnapshot(snapshot: SimulationSnapshot): void {
        this.snapshotBuffer.push(snapshot);
        if (this.snapshotBuffer.length > this.maxSnapshotSize) {
            this.snapshotBuffer.shift();
        }
    }

    /**
     * ✅ NOUVEAU: Récupère les snapshots de simulation.
     */
    getSimulationSnapshots(): readonly SimulationSnapshot[] {
        return this.snapshotBuffer;
    }

    /**
     * ✅ NOUVEAU: Formate les snapshots pour affichage.
     */
    formatSnapshots(): string {
        if (this.snapshotBuffer.length === 0) {
            return 'Aucune donnée de simulation disponible';
        }

        /**
         * Formatte un nombre avec gestion des valeurs aberrantes.
         */
        const formatNumber = (value: number, decimals: number = 2, width: number = 7): string => {
            if (!isFinite(value) || isNaN(value)) {
                return 'NaN'.padStart(width, ' ');
            }
            
            const absValue = Math.abs(value);
            
            // Valeurs aberrantes (>1e10) en notation scientifique compacte
            if (absValue > 1e10) {
                const exp = Math.floor(Math.log10(absValue));
                const mantissa = value / Math.pow(10, exp);
                return `${mantissa.toFixed(1)}e${exp}`.padStart(width, ' ');
            }
            
            // Valeurs normales
            return value.toFixed(decimals).padStart(width, ' ');
        };

        const lines: string[] = [];
        lines.push('═══════════════════════════════════════════════════════════════════');
        lines.push('JOURNAL DE SIMULATION - 10 DERNIÈRES ENTRÉES');
        lines.push('═══════════════════════════════════════════════════════════════════');
        lines.push('');

        this.snapshotBuffer.forEach((snapshot, index) => {
            const num = (index + 1).toString().padStart(2, '0');
            const time = formatNumber(snapshot.time, 1, 6);
            
            lines.push(`┌─ Entrée ${num} ─────────────────────────────────── T=${time}s ─┐`);
            
            // Position
            lines.push(`│ POSITION    X: ${formatNumber(snapshot.position.x)} m  ` +
                       `Y: ${formatNumber(snapshot.position.y)} m  ` +
                       `Z: ${formatNumber(snapshot.position.z)} m │`);
            
            // Vitesse
            const vMag = Math.sqrt(
                snapshot.velocity.x ** 2 + 
                snapshot.velocity.y ** 2 + 
                snapshot.velocity.z ** 2
            );
            lines.push(`│ VITESSE     X: ${formatNumber(snapshot.velocity.x)} m/s ` +
                       `Y: ${formatNumber(snapshot.velocity.y)} m/s ` +
                       `Z: ${formatNumber(snapshot.velocity.z)} m/s │`);
            lines.push(`│             Magnitude: ${formatNumber(vMag)} m/s${'                                 '}│`);
            
            // Orientation (en degrés)
            lines.push(`│ ORIENTATION Pitch: ${formatNumber(snapshot.orientation.pitch, 1, 6)}° ` +
                       `Roll: ${formatNumber(snapshot.orientation.roll, 1, 6)}° ` +
                       `Yaw: ${formatNumber(snapshot.orientation.yaw, 1, 6)}° │`);
            
            // Forces aérodynamiques
            const aeroMag = Math.sqrt(
                snapshot.forces.aerodynamic.x ** 2 + 
                snapshot.forces.aerodynamic.y ** 2 + 
                snapshot.forces.aerodynamic.z ** 2
            );
            lines.push(`│ AÉRO        X: ${formatNumber(snapshot.forces.aerodynamic.x, 1)} N  ` +
                       `Y: ${formatNumber(snapshot.forces.aerodynamic.y, 1)} N  ` +
                       `Z: ${formatNumber(snapshot.forces.aerodynamic.z, 1)} N  │`);
            lines.push(`│             Magnitude: ${formatNumber(aeroMag, 1)} N${'                                  '}│`);
            
            // Forces des lignes
            const linesMag = Math.sqrt(
                snapshot.forces.lines.x ** 2 + 
                snapshot.forces.lines.y ** 2 + 
                snapshot.forces.lines.z ** 2
            );
            lines.push(`│ LIGNES      X: ${formatNumber(snapshot.forces.lines.x, 1)} N  ` +
                       `Y: ${formatNumber(snapshot.forces.lines.y, 1)} N  ` +
                       `Z: ${formatNumber(snapshot.forces.lines.z, 1)} N  │`);
            lines.push(`│             Tensions: G=${formatNumber(snapshot.lines.leftTension, 0, 4)}N ` +
                       `D=${formatNumber(snapshot.lines.rightTension, 0, 4)}N ` +
                       `Tot=${formatNumber(snapshot.lines.totalTension, 0, 4)}N${'           '}│`);
            
            // 🆕 Distances réelles vs objectif
            const leftExt = snapshot.lines.leftDistance - snapshot.lines.targetLength;
            const rightExt = snapshot.lines.rightDistance - snapshot.lines.targetLength;
            lines.push(`│             Distances: G=${formatNumber(snapshot.lines.leftDistance, 2, 5)}m ` +
                       `D=${formatNumber(snapshot.lines.rightDistance, 2, 5)}m ` +
                       `Obj=${formatNumber(snapshot.lines.targetLength, 2, 5)}m${'      '}│`);
            lines.push(`│             Extensions: G=${formatNumber(leftExt, 3, 6)}m (${formatNumber(leftExt/snapshot.lines.targetLength*100, 1, 4)}%) ` +
                       `D=${formatNumber(rightExt, 3, 6)}m (${formatNumber(rightExt/snapshot.lines.targetLength*100, 1, 4)}%)${'  '}│`);
            
            // Force totale
            const totalMag = Math.sqrt(
                snapshot.forces.total.x ** 2 + 
                snapshot.forces.total.y ** 2 + 
                snapshot.forces.total.z ** 2
            );
            lines.push(`│ TOTAL       X: ${formatNumber(snapshot.forces.total.x, 1)} N  ` +
                       `Y: ${formatNumber(snapshot.forces.total.y, 1)} N  ` +
                       `Z: ${formatNumber(snapshot.forces.total.z, 1)} N  │`);
            lines.push(`│             Magnitude: ${formatNumber(totalMag, 1)} N${'                                  '}│`);
            
            lines.push('└──────────────────────────────────────────────────────────────┘');
            
            if (index < this.snapshotBuffer.length - 1) {
                lines.push('');
            }
        });
        
        lines.push('');
        lines.push('═══════════════════════════════════════════════════════════════════');

        return lines.join('\n');
    }

    private log(level: LogLevel, message: string, data?: any): void {
        const entry: LogEntry = {
            level,
            message,
            timestamp: Date.now(),
            data,
        };
        
        this.buffer.add(entry);
        this.callbacks.forEach(cb => cb(entry));
        
        // Console output
        console.log(`[${level.toUpperCase()}] ${message}`, data ?? '');
    }
    
    subscribe(callback: (entry: LogEntry) => void): () => void {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }
    
    getBuffer(): LogBuffer {
        return this.buffer;
    }
    
    clear(): void {
        this.buffer.clear();
        this.snapshotBuffer = [];
    }
}

/**
 * Formatteur de logs pour affichage.
 */
export class LogFormatter {
    static formatEntry(entry: LogEntry): string {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        return `[${time}] ${entry.message}`;
    }
    
    static formatBuffer(buffer: LogBuffer): string {
        return buffer.getAll()
            .map(entry => this.formatEntry(entry))
            .join('\n');
    }
}
