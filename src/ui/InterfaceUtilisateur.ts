import * as THREE from 'three';
import { ParametresVent } from '../physique/Vent';
import { MoteurPhysique } from '../physique/MoteurPhysique';
import { CerfVolant } from '../cerfvolant/CerfVolant';
import { ModeAutoPilote } from '../controles/AutoPilote';

type CallbackVent = (params: Partial<ParametresVent>) => void;
type CallbackLignes = (longueur: number) => void;
type CallbackBrides = (type: 'nez' | 'inter' | 'centre', longueur: number) => void;
type CallbackDebug = (actif: boolean) => void;
type CallbackAutoPiloteToggle = () => void;
type CallbackAutoPiloteMode = (mode: ModeAutoPilote) => void;
type CallbackSliderControl = (delta: number) => void;

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
    private onAutoPiloteToggle: CallbackAutoPiloteToggle = () => {};
    private onAutoPiloteMode: CallbackAutoPiloteMode = () => {};
    private onSliderControl: CallbackSliderControl = () => {};
    
    public debugActif = true;
    private sliderUtilisateurActif = false; // Flag pour savoir si c'est l'utilisateur qui manipule le slider

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
        
        // Initialiser les contrôles de l'autopilote
        this.initialiserControlesAutoPilote();
        
        // Initialiser le slider de contrôle
        this.initialiserSliderControle();
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
    public surToggleAutoPilote(callback: CallbackAutoPiloteToggle): void { this.onAutoPiloteToggle = callback; }
    public surChangementModeAutoPilote(callback: CallbackAutoPiloteMode): void { this.onAutoPiloteMode = callback; }
    public surSliderControl(callback: CallbackSliderControl): void { this.onSliderControl = callback; }

    /**
     * Initialise les contrôles de l'autopilote (boutons de mode)
     */
    private initialiserControlesAutoPilote(): void {
        // Bouton toggle autopilote
        const boutonToggle = document.getElementById('autopilot-toggle');
        boutonToggle?.addEventListener('click', () => {
            this.onAutoPiloteToggle();
        });
        
        // Boutons de sélection de mode
        const boutonsModes = document.querySelectorAll('.autopilot-mode-btn');
        boutonsModes.forEach(bouton => {
            bouton.addEventListener('click', () => {
                const mode = (bouton as HTMLElement).getAttribute('data-mode') as ModeAutoPilote;
                if (mode) {
                    this.onAutoPiloteMode(mode);
                    this.mettreAJourBoutonsModes(mode);
                }
            });
        });
    }
    
    /**
     * Initialise le slider de contrôle centralisé
     */
    private initialiserSliderControle(): void {
        const slider = document.getElementById('control-slider') as HTMLInputElement;
        const sliderValue = document.getElementById('slider-value');
        const leftLabel = document.getElementById('left-label');
        const rightLabel = document.getElementById('right-label');
        
        if (!slider || !sliderValue) return;
        
        // Détecter quand l'utilisateur commence à manipuler le slider
        slider.addEventListener('mousedown', () => {
            this.sliderUtilisateurActif = true;
        });
        
        slider.addEventListener('touchstart', () => {
            this.sliderUtilisateurActif = true;
        });
        
        slider.addEventListener('input', () => {
            // Ne traiter que si c'est l'utilisateur qui manipule
            if (!this.sliderUtilisateurActif) return;
            
            const value = parseFloat(slider.value);
            const percent = Math.abs(value);
            
            // Mettre à jour l'affichage
            if (value < -2) {
                sliderValue.textContent = `← GAUCHE (${percent}%)`;
                leftLabel?.classList.add('active');
                rightLabel?.classList.remove('active');
            } else if (value > 2) {
                sliderValue.textContent = `DROITE → (${percent}%)`;
                rightLabel?.classList.add('active');
                leftLabel?.classList.remove('active');
            } else {
                sliderValue.textContent = 'NEUTRE (0%)';
                leftLabel?.classList.remove('active');
                rightLabel?.classList.remove('active');
            }
            
            // Convertir la valeur du slider (-50 à +50) en delta (-0.5 à +0.5)
            // Inversion : slider gauche (négatif) = delta positif (raccourcir gauche)
            const delta = -value / 100;
            this.onSliderControl(delta);
        });
        
        // Revenir au centre quand on relâche le slider
        const resetSlider = () => {
            this.sliderUtilisateurActif = false;
            slider.value = '0';
            if (sliderValue) sliderValue.textContent = 'NEUTRE (0%)';
            leftLabel?.classList.remove('active');
            rightLabel?.classList.remove('active');
            this.onSliderControl(0);
        };
        
        slider.addEventListener('mouseup', resetSlider);
        slider.addEventListener('mouseleave', resetSlider); // Aussi quand la souris sort
        
        // Également pour les appareils tactiles
        slider.addEventListener('touchend', resetSlider);
        slider.addEventListener('touchcancel', resetSlider); // Si le touch est annulé
    }
    
    /**
     * Met à jour l'affichage du bouton toggle de l'autopilote
     */
    public mettreAJourBoutonToggleAutoPilote(actif: boolean): void {
        const bouton = document.getElementById('autopilot-toggle');
        if (bouton) {
            bouton.textContent = actif ? '🟢 Autopilote: ON' : '⚪ Autopilote: OFF';
            bouton.classList.toggle('active', actif);
        }
        
        // Activer/désactiver les boutons de mode
        const boutonsModes = document.querySelectorAll('.autopilot-mode-btn');
        boutonsModes.forEach(btn => {
            (btn as HTMLButtonElement).disabled = !actif;
        });
    }
    
    /**
     * Met à jour les boutons de mode pour indiquer le mode actif
     */
    public mettreAJourBoutonsModes(modeActif: string): void {
        const boutonsModes = document.querySelectorAll('.autopilot-mode-btn');
        boutonsModes.forEach(btn => {
            const btnMode = (btn as HTMLElement).getAttribute('data-mode');
            btn.classList.toggle('active', btnMode === modeActif);
        });
        
        // Mettre à jour le texte d'information
        const infoMode = document.getElementById('autopilot-current-mode');
        if (infoMode) {
            const nomsModes: { [key: string]: string } = {
                'manuel': 'Manuel',
                'stabilisation': 'Stabilisation',
                'maintien_altitude': 'Maintien Altitude',
                'maintien_position': 'Maintien Position',
                'zenith': '☀️ Zénith',
                'trajectoire_circulaire': 'Trajectoire Circulaire',
                'acrobatique': 'Acrobatique'
            };
            infoMode.textContent = `Mode: ${nomsModes[modeActif] || modeActif}`;
        }
    }

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
            const deltaPercent = (deltaLongueur * 100).toFixed(0);
            const direction = deltaLongueur > 0.1 ? `GAUCHE ← (${deltaPercent}%)` : 
                            deltaLongueur < -0.1 ? `DROITE → (${Math.abs(parseFloat(deltaPercent))}%)` : 
                            'CENTRE';
            indicateur.textContent = `🎮 Pilotage: ${direction}`;
        } else {
            indicateur.classList.remove('active');
            indicateur.textContent = '🎮 Pilotage: Repos';
        }
    }
    
    /**
     * Met à jour visuellement le slider de contrôle pour refléter le delta actuel
     * (que ce soit du clavier, de l'autopilote ou du slider lui-même)
     */
    public mettreAJourSliderVisuel(delta: number): void {
        // Ne pas mettre à jour si l'utilisateur est en train de manipuler le slider
        if (this.sliderUtilisateurActif) return;
        
        const slider = document.getElementById('control-slider') as HTMLInputElement;
        const sliderValue = document.getElementById('slider-value');
        const leftLabel = document.getElementById('left-label');
        const rightLabel = document.getElementById('right-label');
        
        if (!slider || !sliderValue) return;
        
        // Convertir delta (-0.5 à +0.5) en valeur slider (-50 à +50)
        // Inversion : delta positif (gauche) → slider négatif (curseur à gauche)
        const valeurSlider = Math.round(-delta * 100);
        slider.value = valeurSlider.toString();
        
        const percent = Math.abs(valeurSlider);
        
        // Mettre à jour l'affichage
        if (valeurSlider < -2) {
            sliderValue.textContent = `← GAUCHE (${percent}%)`;
            leftLabel?.classList.add('active');
            rightLabel?.classList.remove('active');
        } else if (valeurSlider > 2) {
            sliderValue.textContent = `DROITE → (${percent}%)`;
            rightLabel?.classList.add('active');
            leftLabel?.classList.remove('active');
        } else {
            sliderValue.textContent = 'NEUTRE (0%)';
            leftLabel?.classList.remove('active');
            rightLabel?.classList.remove('active');
        }
    }
}