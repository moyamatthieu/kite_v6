import * as THREE from 'three';
import { ParametresVent } from '../physique/Vent';
import { MoteurPhysique } from '../physique/MoteurPhysique';
import { CerfVolant } from '../cerfvolant/CerfVolant';

type CallbackVent = (params: Partial<ParametresVent>) => void;
type CallbackLignes = (longueur: number) => void;
type CallbackBrides = (type: 'nez' | 'inter' | 'centre', longueur: number) => void;
type CallbackDebug = (actif: boolean) => void;

/**
 * Gère les interactions avec les éléments de l'interface (DOM).
 */
export class InterfaceUtilisateur {
    private onReset: () => void;
    private onTogglePause: () => void;
    private onVentChange: CallbackVent = () => {};
    private onLignesChange: CallbackLignes = () => {};
    private onBridesChange: CallbackBrides = () => {};
    private onDebugChange: CallbackDebug = () => {};
    
    public debugActif = true;

    constructor(onReset: () => void, onTogglePause: () => void) {
        this.onReset = onReset;
        this.onTogglePause = onTogglePause;
        this.initialiserControles();
    }

    /**
     * Synchronise les valeurs de l'interface avec la configuration actuelle
     */
    public synchroniserValeurs(moteurPhysique: any, geometrie: any): void {
        // Synchroniser la vitesse du vent
        const sliderVent = document.getElementById('wind-speed') as HTMLInputElement;
        const valeurVent = document.getElementById('wind-speed-value');
        if (sliderVent && valeurVent) {
            const vitesse = moteurPhysique.vent.parametres.vitesse;
            sliderVent.value = vitesse.toString();
            valeurVent.textContent = `${vitesse.toFixed(0)} km/h`;
        }

        // Synchroniser la longueur des lignes
        const sliderLignes = document.getElementById('line-length') as HTMLInputElement;
        const valeurLignes = document.getElementById('line-length-value');
        if (sliderLignes && valeurLignes) {
            const longueur = moteurPhysique.systemeLignes.longueurLignes;
            sliderLignes.value = longueur.toString();
            valeurLignes.textContent = `${longueur.toFixed(0)}m`;
        }

        // Synchroniser les brides
        const parametresBrides = geometrie.parametresBrides;
        
        const sliderNez = document.getElementById('bridle-nez') as HTMLInputElement;
        const valeurNez = document.getElementById('bridle-nez-value');
        if (sliderNez && valeurNez) {
            sliderNez.value = parametresBrides.nez.toString();
            valeurNez.textContent = `${parametresBrides.nez.toFixed(2)}m`;
        }

        const sliderInter = document.getElementById('bridle-inter') as HTMLInputElement;
        const valeurInter = document.getElementById('bridle-inter-value');
        if (sliderInter && valeurInter) {
            sliderInter.value = parametresBrides.inter.toString();
            valeurInter.textContent = `${parametresBrides.inter.toFixed(2)}m`;
        }

        const sliderCentre = document.getElementById('bridle-centre') as HTMLInputElement;
        const valeurCentre = document.getElementById('bridle-centre-value');
        if (sliderCentre && valeurCentre) {
            sliderCentre.value = parametresBrides.centre.toString();
            valeurCentre.textContent = `${parametresBrides.centre.toFixed(2)}m`;
        }
    }

    private initialiserControles(): void {
        this.lierBouton('reset-sim', this.onReset);
        this.lierBouton('play-pause', this.onTogglePause);
        this.lierBouton('copy-log', this.copierLog.bind(this));
        this.lierBouton('clear-log', this.viderLog.bind(this));
        
        const boutonDebug = document.getElementById('debug-physics');
        boutonDebug?.addEventListener('click', () => {
            this.debugActif = !this.debugActif;
            boutonDebug.textContent = this.debugActif ? "🔍 Debug ON" : "🔍 Debug OFF";
            boutonDebug.classList.toggle('active', this.debugActif);
            document.getElementById('debug-panel')!.style.display = this.debugActif ? 'block' : 'none';
            this.onDebugChange(this.debugActif);
        });

        this.lierSlider('wind-speed', 'wind-speed-value', ' km/h', (valeur) => this.onVentChange({ vitesse: valeur }));
        this.lierSlider('line-length', 'line-length-value', 'm', (valeur) => this.onLignesChange(valeur));
        this.lierSlider('bridle-nez', 'bridle-nez-value', 'm', (valeur) => this.onBridesChange('nez', valeur));
        this.lierSlider('bridle-inter', 'bridle-inter-value', 'm', (valeur) => this.onBridesChange('inter', valeur));
        this.lierSlider('bridle-centre', 'bridle-centre-value', 'm', (valeur) => this.onBridesChange('centre', valeur));
    }
    
    private lierBouton(id: string, action: () => void): void {
        document.getElementById(id)?.addEventListener('click', action);
    }
    
    private lierSlider(idSlider: string, idValeur: string, suffixe: string, action: (valeur: number) => void): void {
        const slider = document.getElementById(idSlider) as HTMLInputElement;
        const affichageValeur = document.getElementById(idValeur);
        if (slider && affichageValeur) {
            slider.addEventListener('input', () => {
                const valeur = parseFloat(slider.value);
                affichageValeur.textContent = `${valeur.toFixed(slider.step.includes('.') ? 2 : 0)}${suffixe}`;
                action(valeur);
            });
        }
    }

    private copierLog(): void {
        const logContent = document.getElementById('log-content');
        const copyButton = document.getElementById('copy-log');
        if (logContent && copyButton) {
            navigator.clipboard.writeText(logContent.innerText).then(() => {
                const originalText = copyButton.textContent;
                copyButton.textContent = 'Copié !';
                setTimeout(() => {
                    copyButton.textContent = originalText;
                }, 1500);
            }).catch(err => {
                console.error('Erreur lors de la copie du log : ', err);
            });
        }
    }

    private viderLog(): void {
        const logContent = document.getElementById('log-content');
        if (logContent) {
            logContent.innerHTML = '<pre>Journal vidé.</pre>';
        }
    }

    public ajouterEntreeLog(message: string): void {
        const logContent = document.getElementById('log-content');
        if (logContent) {
            // Supprimer le message initial
            const initialMessage = logContent.querySelector('pre');
            if (initialMessage && initialMessage.textContent?.includes('Initialisation')) {
                initialMessage.remove();
            }

            const logEntry = document.createElement('pre');
            logEntry.textContent = message;
            logContent.prepend(logEntry);

            // Limiter le nombre d'entrées pour éviter de surcharger le DOM
            while (logContent.children.length > 100) {
                logContent.removeChild(logContent.lastChild!);
            }
        }
    }

    public remplacerLog(contenu: string): void {
        const logContent = document.getElementById('log-content');
        if (logContent) {
            logContent.innerHTML = `<pre>${contenu}</pre>`;
        }
    }

    // Méthodes pour s'abonner aux événements de l'UI
    public surChangementVent(callback: CallbackVent): void { this.onVentChange = callback; }
    public surChangementLignes(callback: CallbackLignes): void { this.onLignesChange = callback; }
    public surChangementBrides(callback: CallbackBrides): void { this.onBridesChange = callback; }
    public surChangementDebug(callback: CallbackDebug): void { this.onDebugChange = callback; }

    public mettreAJourBoutonPause(estEnPause: boolean): void {
        const bouton = document.getElementById('play-pause');
        if (bouton) bouton.textContent = estEnPause ? "▶️ Lancer" : "⏸️ Pause";
    }

    public mettreAJourInfosDebug(moteur: MoteurPhysique, cerfVolant: CerfVolant): void {
        const divInfos = document.getElementById('debug-info');
        if (!divInfos) return;

        const etat = moteur.etatCerfVolant;
        const vent = moteur.vent.parametres;
        
        // Convertir le quaternion en angles d'Euler pour un affichage lisible
        const euler = new THREE.Euler().setFromQuaternion(etat.orientation, 'XYZ');
        const pitch = (euler.x * 180 / Math.PI).toFixed(1);
        const yaw = (euler.y * 180 / Math.PI).toFixed(1);
        const roll = (euler.z * 180 / Math.PI).toFixed(1);

        divInfos.innerHTML = `
            <strong>Position:</strong> ${etat.position.x.toFixed(1)}, ${etat.position.y.toFixed(1)}, ${etat.position.z.toFixed(1)}<br>
            <strong>Vitesse:</strong> ${etat.velocite.length().toFixed(2)} m/s<br>
            <strong>Orientation:</strong> P:${pitch}° Y:${yaw}° R:${roll}°<br>
            <strong>Vent:</strong> ${vent.vitesse.toFixed(1)} km/h<br>
            <strong>Lignes:</strong> ${moteur.systemeLignes.longueurLignes} m
        `;
    }

    /**
     * Met à jour l'indicateur visuel de pilotage actif.
     */
    public mettreAJourIndicateurPilotage(estActif: boolean, deltaLongueur: number, infosAutoPilote?: string | null): void {
        const indicateur = document.getElementById('pilot-indicator');
        if (!indicateur) return;

        // Afficher les informations d'autopilotage si disponibles
        if (infosAutoPilote) {
            indicateur.classList.add('active');
            indicateur.innerHTML = `🤖 ${infosAutoPilote.replace('\n', '<br>')}`;
        } else if (estActif) {
            indicateur.classList.add('active');
            const direction = deltaLongueur > 0.1 ? 'GAUCHE ←' : deltaLongueur < -0.1 ? 'DROITE →' : 'CENTRE';
            indicateur.textContent = `🎮 Pilotage: ${direction}`;
        } else {
            indicateur.classList.remove('active');
            indicateur.textContent = '🎮 Pilotage: Repos';
        }
    }
}