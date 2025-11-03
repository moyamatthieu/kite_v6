/**
 * Contrôleur PID réutilisable.
 * 
 * @module application/control/autopilot/PIDController
 */

/**
 * Configuration PID.
 */
export interface PIDConfig {
    Kp: number; // Proportionnel
    Ki: number; // Intégral
    Kd: number; // Dérivé
    integralLimit?: number; // Anti-windup
    outputLimit?: number; // Limite sortie
}

/**
 * Contrôleur PID générique.
 */
export class PIDController {
    private config: PIDConfig;
    private integral = 0;
    private previousError = 0;
    private previousTime?: number;
    
    constructor(config: PIDConfig) {
        this.config = config;
    }
    
    /**
     * Calcule la commande PID.
     * 
     * @param error - Erreur actuelle (setpoint - measurement)
     * @param currentTime - Temps actuel (s)
     * @returns Commande de sortie
     */
    calculate(error: number, currentTime: number): number {
        const dt = this.previousTime !== undefined 
            ? currentTime - this.previousTime 
            : 0.016; // 60 FPS par défaut
        
        // Terme proportionnel
        const P = this.config.Kp * error;
        
        // Terme intégral avec anti-windup
        this.integral += error * dt;
        if (this.config.integralLimit) {
            this.integral = Math.max(
                -this.config.integralLimit,
                Math.min(this.config.integralLimit, this.integral)
            );
        }
        const I = this.config.Ki * this.integral;
        
        // Terme dérivé
        const derivative = dt > 0 ? (error - this.previousError) / dt : 0;
        const D = this.config.Kd * derivative;
        
        // Commande totale
        let output = P + I + D;
        
        // Limiter sortie
        if (this.config.outputLimit) {
            output = Math.max(
                -this.config.outputLimit,
                Math.min(this.config.outputLimit, output)
            );
        }
        
        // Mémoriser pour prochaine itération
        this.previousError = error;
        this.previousTime = currentTime;
        
        return output;
    }
    
    /**
     * Réinitialise le contrôleur.
     */
    reset(): void {
        this.integral = 0;
        this.previousError = 0;
        this.previousTime = undefined;
    }
    
    /**
     * Met à jour la configuration.
     */
    setConfig(config: Partial<PIDConfig>): void {
        this.config = { ...this.config, ...config };
    }
}
