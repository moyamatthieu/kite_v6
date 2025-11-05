# Instructions Copilot - Simulateur de Cerf-Volant Physique

## ⛔ RÈGLE ABSOLUE - NON NÉGOCIABLE

**NE JAMAIS DÉMARRER DE SERVEUR DE DÉVELOPPEMENT (`npm run dev`, `npm start`, etc.)**

Le serveur Vite est **TOUJOURS déjà en cours d'exécution** en arrière-plan avec hot reload automatique.
- ✅ Les modifications de code sont **automatiquement rechargées** dans le navigateur
- ❌ **INTERDICTION FORMELLE** de lancer `npm run dev` ou tout autre serveur
- ❌ **INTERDICTION FORMELLE** d'utiliser `run_in_terminal` pour démarrer un serveur
- Si l'utilisateur demande de tester : simplement confirmer que les changements sont automatiquement pris en compte

**En cas de doute** : demander à l'utilisateur plutôt que de lancer un serveur.

## Vue d'ensemble

**Simulateur de cerf-volant acrobatique** avec physique temps réel (60 FPS) et autopilotage, en **TypeScript + Three.js**.

**Architecture :**
- **Clean Architecture** 4 couches : Core (orchestration) → Domain (physique pure) → Application (autopilote/logs) → Infrastructure (rendu/UI)
- **Injection de dépendances** partout, principes SOLID
- **Point d'entrée** : `src/index.tsx` → `NewSimulation` (dans `Simulation.ts`)
- Code et commentaires en **français**

**Physique :**
- Forces : Aérodynamique (par panneau) + Gravité + Lignes (bi-régime)
- Intégration Verlet avec timestep fixe 1/60s
- **Système coordonnées** : X+ droite, Y+ altitude, Z+ origine vent (souffle vers Z-)
- **Cerf-volant** face au vent (intrados vers Z+), attaché par lignes à origine

## Architecture (4 Couches)

```
src/
├── core/               # Orchestration + Config
│   ├── Simulation.ts   # NewSimulation (boucle principale)
│   ├── SimulationConfig.ts  # SOURCE UNIQUE DE VÉRITÉ
│   └── types/          # Events, PhysicsState
│
├── domain/            # Logique métier pure
│   ├── kite/          # Kite, KiteGeometry
│   └── physics/       # PhysicsEngine, forces/, integrators/
│
├── application/       # Services métier
│   ├── logging/       # Logger (buffer circulaire)
│   └── control/autopilot/  # PIDController, 7 modes
│
└── infrastructure/    # Adaptateurs techniques
    ├── rendering/     # Renderer, Camera, visualizers/
    └── ui/           # UserInterface (HTML/CSS)
```

### Fichiers Critiques

**Core :**
- `SimulationConfig.ts` : **TOUTES les constantes** (PhysicsConfig, KiteConfig, LinesConfig, etc.). Jamais de valeurs en dur ailleurs.
- `Simulation.ts` : Boucle `animate()` → Commandes → `physicsEngine.update()` → Synchro visuelle → Rendu

**Domain/Physics :**
- `PhysicsEngine.ts` : Orchestration forces + intégration. **Ordre strict** : Aéro → Gravité → Lignes
- `forces/LineForce.ts` : **ZONE CRITIQUE** - Modèle bi-régime avec lissage temporel
- `integrators/VerletIntegrator.ts` : Intégration numérique stable

**Application :**
- `autopilot/modes/AutoPilotModes.ts` : 7 modes (Manual, Stabilization, AltitudeHold, PositionHold, Zenith, CircularTrajectory, Acrobatic)

**Infrastructure :**
- `rendering/Camera.ts` : 4 modes (ORBIT, FREE, FOLLOW, CINEMATIC)
- `ui/UserInterface.ts` : Panneau HTML + callbacks

## Conventions Essentielles

### ⚠️ Configuration Centralisée : `SimulationConfig.ts`

**SOURCE UNIQUE DE VÉRITÉ** - Jamais de constantes en dur ailleurs.

Interfaces : `PhysicsConfig`, `KiteConfig`, `LinesConfig`, `ControlConfig`, `WindConfig`, `RenderingConfig`, `UIConfig`, `LoggingConfig`

Accès : Toujours via `this.config` injecté ou `DEFAULT_CONFIG`.

### Injection de Dépendances (OBLIGATOIRE)

```typescript
// ✅ Correct
constructor(
    private integrator: IIntegrator,
    private forceManager: ForceManager
) { }

// ❌ Incorrect - Couplage fort
private integrator = new VerletIntegrator();
```

### Système de Coordonnées (CRITIQUE)

```typescript
// Repère : X+ droite, Y+ altitude, Z+ origine vent (souffle vers Z-)
// Pilote à (0,0,0) regarde Z+, cerf-volant en Z+ face au vent

// Vent : vient de Z+, souffle vers Z- (vers pilote)
windState.velocity = new THREE.Vector3(0, 0, -windSpeed);
windState.direction = new THREE.Vector3(0, 0, -1);

// Cerf-volant : position Z+ (ex: 0, 8, 8), face au vent
// Orientation initiale : -15° sur X (nez bas), PAS de rotation 180° sur Y
const orientationInitiale = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -15 * Math.PI / 180);
```

**⚠️ Intrados (face avant) DOIT recevoir le vent pour portance** (voir `CORRECTION_ORIENTATION.md`)

### EventBus Pattern

```typescript
// Émettre
this.eventBus.emit(SimulationEventType.StateChanged, { state, timestamp });

// Écouter
this.eventBus.on(SimulationEventType.ConfigUpdated, (data) => {...});
```

### Nommage

- Classes : `PascalCase` (ex: `PhysicsEngine`)
- Méthodes : `camelCase` (ex: `update`, `calculate`)
- Constantes : `UPPER_SNAKE_CASE` (ex: `DEFAULT_CONFIG`)
- Interfaces : Préfixe `I` (ex: `IIntegrator`)

### Gestion Mémoire Three.js

```typescript
dispose(): void {
    this.kiteVisualizer.dispose();  // Géométries/matériaux
    this.renderer.dispose();
    this.eventBus.clear();
}
```

## Workflows de développement

### Commandes essentielles

```bash
npm run dev    # Démarre Vite sur http://localhost:3000 (hot reload automatique)
npm run build  # Build de production
npm run preview # Prévisualise le build
```

**Note** : Le serveur Vite reste actif avec hot reload - pas besoin de redémarrer entre les modifications.

### Debugger la physique (workflow hot reload)

**Pas de tests automatisés** - développement itératif avec observation visuelle :

1. Activer mode debug : `kite.toggleDebug(true)` (activé par défaut dans `NewSimulation`)
2. Observer en temps réel dans le navigateur (Vite hot reload automatique)
3. Consulter forces dans `PhysicsEngine.getLastForces()` pour debug
4. **Surveiller tensions lignes** : via `DebugVisualizer` ou logs
   - Tensions normales : 0.5N à 20N selon vent
   - Variations brusques (>50N/frame) = instabilité imminente
   - Tension = 0 ou NaN = problème critique
5. Analyser logs périodiques : voir `Logger.getLogs()`
6. Modifier code → auto-reload → observer effet immédiat

**Scénarios de test typiques** :
- Vent faible (5 m/s) : Vol stable, tensions faibles
- Vent moyen (10 m/s) : Vol dynamique, cerf-volant réactif
- Vent fort (15+ m/s) : Limite de stabilité, tensions élevées
- Autopilote ZENITH : Test de convergence vers position cible

### Ajouter un nouveau mode d'autopilotage

1. Créer nouvelle classe implémentant `IAutoPilotMode` dans `AutoPilotModes.ts`
   ```typescript
   export class MyNewMode implements IAutoPilotMode {
       public readonly name = 'MY_MODE';
       private pid: PIDController;
       
       constructor() {
           this.pid = new PIDController({ ... });
       }
       
       calculate(state: KitePhysicsState, deltaTime: number, lineLength: number): number {
           // Logique de calcul
           return command;
       }
       
       getInfo(state: KitePhysicsState): string {
           return `Mode MY_MODE | Info: ...`;
       }
       
       reset(): void {
           this.pid.reset();
       }
   }
   ```

2. Instancier le mode dans `NewSimulation.ts` selon besoin
3. Connecter bouton dans `UserInterface.ts` si nécessaire

### Modifier les paramètres physiques

**⚠️ ZONE CRITIQUE : Contrainte des lignes**

Le système de lignes est le **point sensible majeur** du projet - équilibre délicat entre :
- **Effet ressort excessif** → oscillations/vibrations incontrôlables
- **Explosion numérique** → forces infinies, crash de la simulation

**Paramètres interdépendants** dans `SimulationConfig.ts > LinesConfig` :
- `stiffness` (k) et `damping` (c) : Respecter c ≈ 2√(k×m) pour amortissement critique
- `smoothingCoefficient` (0.3-0.5) : Plus bas = plus stable mais moins réactif
- `restLengthRatio` (0.99) : Définit la pré-tension, ne pas toucher sans tests approfondis
- `PhysicsConfig.dampingFactor` (0.9999) : Quasi-1.0, pas d'amortissement artificiel global

**Valeurs actuelles validées** (voir `CORRECTION_LIGNES_RIGIDES.md`) :
- `stiffness: 2000 N/m` - Compromis réalisme/stabilité (théorique 5000 N/m nécessiterait 200+ FPS)
- `damping: 10 Ns/m` - Amortissement ζ=0.22 (sous-amorti)
- `smoothingCoefficient: 0.8` - Lissage maximal pour stabilité
- `exponentialThreshold: 0.3 m` - Protection dès 3% d'allongement
- `exponentialStiffness: 500 N` - Protection forte contre explosion

**Méthodologie de modification** :
1. **Modifier uniquement dans `SimulationConfig.ts`** - source unique de vérité
2. Ne changer qu'**un seul paramètre** à la fois
3. Tester avec vent faible (5 m/s) puis augmenter progressivement
4. Observer les logs de tension : variations > 50N/frame = signe d'instabilité
5. Si explosion : réduire raideur OU augmenter amortissement OU augmenter lissage
6. Si trop mou : inverse, mais par petits incréments (±10%)

Toutes les constantes physiques sont documentées dans `SimulationConfig.ts`.

## Points d'attention

### Pièges courants

1. **C'est un cerf-volant, pas un avion** ⚠️
   
   **Différence fondamentale** : Un cerf-volant est un **système contraint** par des lignes, contrairement à un avion libre.
   
   **Principes physiques du cerf-volant :**
   - Le cerf-volant est **attaché par des lignes** à la station de pilotage (origine)
   - Il **regarde toujours vers le vent** : la face avant (intrados, où sont les points de contrôle) fait face à Z+
   - Il vole **"face au vent"** = dans l'hémisphère Z+ (le vent vient de Z+ et souffle vers Z-)
   - Il est **contraint sur une sphère** de rayon = longueur des lignes + brides
   - La **portance est créée par l'angle des surfaces** vis-à-vis du vent apparent
   - Le pilotage se fait par **différence de longueur** entre lignes gauche/droite (asymétrie des forces)
   
   **Comportements émergents** (résultant de la physique, pas à implémenter directement) :
   - **Équilibre au zénith** : Avec lignes égales, le cerf-volant tend naturellement vers le zénith (Z=0, Y=max)
   - **Structure tangente à la sphère** : La barre de structure (nez → spine_bas) devient tangente à la sphère de vol
   
   **Géométrie des forces critiques** :
   ```typescript
   // L'équilibre dépend de la géométrie complète :
   // Force_resultante = Force_aero + Force_gravite + Force_lignes
   
   // La portance n'est PAS une force de sustentation comme pour un avion
   // Elle est générée par l'angle des surfaces par rapport au vent apparent
   // Elle contribue à la tension dans les lignes qui contraignent le cerf-volant
   
   // Exemple : Cerf-volant nez vers le bas (plongée)
   // - Portance générée selon l'angle des surfaces avec le vent apparent
   // - Force de gravité vers le bas
   // - Force des lignes vers la station de pilotage
   // - Résultante : mouvement sur la sphère de contrainte
   ```
   
   **Cas typiques à comprendre** :
   - **Vol stable** : Équilibre des 3 forces, cerf-volant maintenu sur sphère de vol
   - **Montée vers zénith** : Lignes égales, forces symétriques, le cerf-volant monte naturellement
   - **Virage** : Asymétrie des tensions → couple de rotation → changement d'orientation
   - **Plongée/remontée** : Le cerf-volant se déplace le long de la sphère de contrainte
   
   **Implication pour le code** : 
   - Calculer les 3 forces dans leur géométrie réelle (aéro + gravité + lignes)
   - Ne pas ajouter de logique artificielle pour "maintenir en l'air" ou "monter au zénith"
   - Les comportements corrects émergent naturellement de la physique
   - Le cerf-volant doit toujours regarder vers la station (face avant vers Z-)

2. **Oublier `applyQuaternion()`** : Les points locaux doivent être transformés en monde
   ```typescript
   // ✅ Correct
   const pointMonde = pointLocal.clone().applyQuaternion(etat.orientation).add(etat.position);
   // ❌ Incorrect
   const pointMonde = pointLocal.clone().add(etat.position);
   ```

3. **Modifier l'ordre des forces** : L'ordre dans `PhysicsEngine.update()` est critique
   - Aéro → Gravité → Lignes (toujours dans cet ordre)

4. **Ne pas normaliser les quaternions** : Après rotations, toujours `orientation.normalize()`

5. **Accès à l'objet 3D du cerf-volant** :
   ```typescript
   // ✅ Correct (via getObject3D())
   const kiteObject = this.kite.getObject3D();
   kiteObject.position.copy(state.position);
   // ❌ Incorrect
   this.kite.position.copy(state.position);
   ```

6. **Injection de dépendances** : Ne pas créer d'instances directement
   ```typescript
   // ✅ Correct - Injection via constructeur
   constructor(private integrator: IIntegrator) { }
   
   // ❌ Incorrect - Couplage fort
   private integrator = new VerletIntegrator();
   ```

### Documentation de référence

- **README.md** : Architecture, installation, utilisation
- **STATUS.md** : Statut actuel du projet et commandes rapides
- **DIAGNOSTIC_PHYSIQUE.md** : Diagnostic des problèmes physiques et ordres de grandeur
- **CORRECTION_LIGNES_RIGIDES.md** : Correction critique de la raideur des lignes (k=2000 N/m)
- **CORRECTION_ORIENTATION.md** : Correction de l'orientation du cerf-volant (face au vent)
- **VALEURS_PHYSIQUES.md** : Toutes les valeurs physiques réelles et leur justification
- **.github/copilot-instructions.md** : Ce fichier - Guide pour développeurs

## Intégrations externes

- **Three.js** : Rendu 3D, calculs vectoriels (Vector3, Quaternion, Euler)
- **Vite** : Build tool, serveur dev sur port 3000 avec hot reload
- **TypeScript** : Strict mode activé (`tsconfig.json`)

## Priorités de développement actuelles

**Objectif principal** : **Consolider la stabilité physique**, pas ajouter de fonctionnalités

1. **Comportement des lignes** : Éliminer oscillations/explosions numériques
   - Affiner les paramètres du modèle bi-régime
   - Améliorer la robustesse aux conditions extrêmes (vent fort, manœuvres brusques)
   
2. **Comportement du cerf-volant en vol** : Réalisme et prévisibilité
   - Réponse cohérente aux commandes de pilotage
   - Transitions fluides entre états (montée/descente, virages)
   - Stabilité en vol stationnaire

**Approche** : Modifications incrémentales + tests visuels (pas de régression de fonctionnalités)

## Notes finales

- Ce projet privilégie le **réalisme physique** sur la performance
- Les calculs aérodynamiques sont **simplifiés mais cohérents** (pas de CFD)
- L'autopilotage utilise des **PID classiques** (pas de ML/AI)
- Toutes les unités sont **SI** : mètres, kg, secondes, Newtons
- **Développement itératif** : Hot reload Vite + observation visuelle (pas de tests auto)
