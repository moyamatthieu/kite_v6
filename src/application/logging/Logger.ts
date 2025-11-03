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
 * Entrée de log structurée.
 */
export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: number;
    data?: any;
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
