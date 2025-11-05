# Instructions Copilot - Simulateur de Cerf-Volant Physique

## Vue d'ensemble du projet

Ce projet est un **simulateur de cerf-volant acrobatique** avec physique avancée et autopilotage, construit avec **Three.js** et **TypeScript**. La simulation calcule les forces aérodynamiques, tensions des lignes, et permet un pilotage manuel ou automatique via 7 modes d'autopilotage avec contrôleurs PID.

**Points clés :**
- Simulation physique temps réel (60 FPS) avec intégration de Verlet
- **Clean Architecture** : 4 couches découplées (Core, Domain, Application, Infrastructure)
- Architecture modulaire avec **injection de dépendances** et **principes SOLID**
- Système de coordonnées : Z+ = direction du vent (vers Z-), Y+ = altitude, X+ = axe latéral
- Tout le code et commentaires sont en **français**

## Architecture Clean (4 Couches)

### Structure Générale

```
src/
├── core/               # Orchestration et configuration
│   ├── Simulation.ts
│   ├── SimulationConfig.ts
│   └── types/
│       ├── Events.ts
│       └── PhysicsState.ts
│
├── domain/            # Logique métier pure
│   ├── kite/
│   └── physics/
│
├── application/       # Cas d'usage et contrôle
│   ├── logging/
│   └── control/autopilot/
│
└── infrastructure/    # Détails techniques (rendu, UI)
    ├── rendering/
    └── ui/
```

### CORE - Orchestration (`src/core/`)

**Point d'entrée unique** : `src/index.tsx` → initialise `NewSimulation`

1. **`Simulation.ts`** - Chef d'orchestre avec injection de dépendances
   - Boucle d'animation principale (`animate()`)
   - Séquence critique à chaque frame :
     1. Calcul des commandes (utilisateur/autopilote)
     2. Mise à jour physique (`physicsEngine.update()`)
     3. Synchronisation visuelle (position, orientation)
     4. Rendu (`renderer.render()`)
   - Architecture événementielle avec `EventBus`
   - Gestion centralisée de tous les sous-systèmes

2. **`SimulationConfig.ts`** - Configuration centralisée typée
   - **SOURCE UNIQUE DE VÉRITÉ** pour toutes les constantes
   - Interfaces TypeScript strictes : `PhysicsConfig`, `KiteConfig`, `WindConfig`, etc.
   - Configuration par défaut : `DEFAULT_CONFIG`
   - **Toujours utiliser la config injectée**, jamais de constantes en dur

3. **`types/PhysicsState.ts`** - État normalisé
   - `KitePhysicsState` : Position, vitesse, orientation, vitesse angulaire
   - `WindState` : Vitesse et direction du vent
   - `Forces` : Aérodynamique, gravité, lignes, totale + couple
   - `SimulationState` : État complet du système

4. **`types/Events.ts`** - EventBus et événements
   - Pattern Observer pour communication découplée
   - Types d'événements : `StateChanged`, `ConfigUpdated`, `SimulationReset`

### DOMAIN - Logique Métier (`src/domain/`)

**Indépendant de toute infrastructure** - Logique métier pure

#### Cerf-Volant (`domain/kite/`)

- **`Kite.ts`** - Entité métier + Factory
  - Contient l'état physique (`KitePhysicsState`)
  - Fournit l'objet 3D via `getObject3D()`
  - Factory : `KiteFactory.createFromConfig()`
  
- **`KiteGeometry.ts`** - Géométrie pure du cerf-volant
  - Points structurels : NEZ, BORD_GAUCHE/DROIT, CTRL_GAUCHE/DROIT
  - 4 panneaux avec normales cohérentes (règle main droite)
  - Calcul des brides par **trilatération 3D**
  - Paramètres : envergure, hauteur, longueurs de brides

#### Physique (`domain/physics/`)

**Le moteur physique calcule 3 forces dans cet ordre** :

```typescript
// 1. Forces aérodynamiques (par panneau)
forcesAero = aerodynamicCalculator.calculate(state, wind, geometry)

// 2. Force de gravité
forceGravite = gravityCalculator.calculate(state, config)

// 3. Forces des lignes (ressort-amortisseur bi-régime)
{ force, torque } = lineForceCalculator.calculate(state, delta, baseLength)
```

**Fichiers critiques :**

- **`PhysicsEngine.ts`** - Orchestrateur de la physique
  - Coordonne `ForceManager` + `Integrator`
  - Appelle l'intégration (Verlet) avec les forces totales
  - Applique les limites de sécurité (vitesse max, vitesse angulaire max)
  - Cache les dernières forces pour debug (`lastForces`)
  - Méthode principale : `update(deltaTime, controlDelta): SimulationState`

- **`forces/ForceCalculator.ts`** - Interfaces et Manager
  - `IForceCalculator` : Interface de base
  - `IAerodynamicForceCalculator`, `IGravityForceCalculator`, `ILineForceCalculator`
  - `ForceManager` : Agrège tous les calculateurs de forces
  - Pattern Composite pour combiner les forces

- **`forces/AerodynamicForce.ts`** - Calculs aérodynamiques par panneau
  - Angle d'attaque : `α = arcsin(|normale · vent_direction|)`
  - Portance : `L = 0.5 × ρ × v² × S × Cl(α)`
  - Traînée : `D = 0.5 × ρ × v² × S × Cd(α)`
  - Calcul pour chaque panneau + agrégation

- **`forces/GravityForce.ts`** - Force de gravité simple
  - `F = m × g × (0, -1, 0)`

- **`forces/LineForce.ts`** - **ZONE CRITIQUE** Forces des lignes
  - Modèle bi-régime :
    - **Régime 1** (distance < repos) : tension minimale
    - **Régime 2** (distance ≥ repos) : `F = k×Δl + c×v` avec lissage
  - Lissage temporel : `tension_lissée = α × tension_nouvelle + (1-α) × tension_ancienne`
  - Calcul du couple (torque) pour rotation
  - **Important** : Appeler `resetSmoothedTensions()` lors des resets

- **`integrators/Integrator.ts`** - Interface pour intégrateurs
  - `IIntegrator.integrate(state, totalForce, totalTorque, deltaTime)`

- **`integrators/VerletIntegrator.ts`** - Intégration de Verlet
  - Intégration numérique stable pour physique temps réel
  - Amortissement configurable via `dampingFactor`
  - Limites de vitesse et vitesse angulaire

### APPLICATION - Cas d'Usage (`src/application/`)

#### Logging (`application/logging/`)

- **`Logger.ts`** - Système de logs avec buffer circulaire
  - Buffer de taille configurable (défaut 8 entrées)
  - Format structuré : timestamp + rapport multi-lignes
  - Niveaux : DEBUG, INFO, WARN, ERROR

#### Autopilote (`application/control/autopilot/`)

- **`PIDController.ts`** - Contrôleur PID générique
  - Calcul : `commande = Kp×e + Ki×∫e·dt + Kd×de/dt`
  - Anti-windup : limites sur terme intégral
  - Configuration : `{ Kp, Ki, Kd, integralLimit, outputLimit }`
  - Méthodes : `calculate(error, timestamp)`, `reset()`

- **`modes/AutoPilotModes.ts`** - 7 modes d'autopilotage (Strategy pattern)
  - Interface `IAutoPilotMode` : `calculate()`, `getInfo()`, `reset()`, `name`
  - **Modes implémentés** :
    1. `ManualMode` - Contrôle manuel pur
    2. `StabilizationMode` - Stabilise orientation
    3. `AltitudeHoldMode` - Maintient altitude
    4. `PositionHoldMode` - Maintient position 3D
    5. `ZenithMode` - Monte au zénith (position cible au-dessus station)
    6. `CircularTrajectoryMode` - Trajectoire circulaire
    7. `AcrobaticMode` - Figures acrobatiques (à implémenter)
  - Extension : Créer nouvelle classe implémentant `IAutoPilotMode`

### INFRASTRUCTURE - Détails Techniques (`src/infrastructure/`)

#### Rendu 3D (`infrastructure/rendering/`)

- **`Renderer.ts`** - Wrapper Three.js
  - Initialise WebGLRenderer avec config
  - Gestion du redimensionnement automatique
  - Méthode principale : `render(scene, camera)`
  - Nettoyage : `dispose()`

- **`Scene3D.ts`** - Scène 3D avec éléments de base
  - Crée THREE.Scene
  - Ajoute grille de référence (configurable)
  - Éclairage : ambient + directionnel
  - Méthode : `getScene()`, `add()`, `remove()`

- **`Camera.ts`** - Caméra avancée avec 4 modes
  - **Modes** : `ORBIT`, `FREE`, `FOLLOW`, `CINEMATIC`
  - Contrôles souris : rotation, zoom, pan
  - Contrôles clavier : déplacement libre
  - Configuration : position, lookAt, FOV, distances min/max
  - **ORBIT** (défaut) : Rotation autour d'un point cible
  - **FOLLOW** : Suit le cerf-volant avec offset configurable
  - **FREE** : Déplacement libre dans l'espace
  - **CINEMATIC** : Interpolation fluide de points de vue
  - Méthodes : `update(deltaTime, target?)`, `setMode()`, `getCamera()`

- **`materials/MaterialFactory.ts`** - Factory de matériaux Three.js
  - Matériaux prédéfinis : cerf-volant, lignes, debug, grille
  - Pattern Factory pour centraliser création
  - Facilite modification visuelle globale

- **`visualizers/KiteVisualizer.ts`** - Visualisation du cerf-volant
  - Crée géométrie 3D du cerf-volant (4 panneaux)
  - Applique matériaux et textures
  - Met à jour position/orientation depuis état physique
  - Mode debug : affiche normales des panneaux

- **`visualizers/VisualizersBundle.ts`** - Autres visualiseurs
  - `LinesVisualizer` : Lignes gauche/droite avec `LineBasicMaterial`
  - `TrajectoryVisualizer` : Trace trajectoire (buffer circulaire de points)
  - `DebugVisualizer` : Vecteurs de force (aéro, gravité, lignes)
  - `ControlStationVisualizer` : Points de contrôle gauche/droite au sol
  - Tous implémentent : `update(state)`, `show()`, `hide()`, `dispose()`

#### Interface Utilisateur (`infrastructure/ui/`)

- **`UserInterface.ts`** - Panneau de contrôle HTML/CSS
  - Panneaux : debug, contrôles, logs
  - Callbacks pour actions utilisateur (pause, reset, changement de mode)
  - Mise à jour temps réel : position, vitesse, forces, mode autopilote
  - Indicateurs visuels : mode pilotage, état simulation
  - Styled avec `UserInterface.css`

## Conventions de développement

### ⚠️ RÈGLE CRITIQUE : Éviter les doublons et duplication de code

**Avant d'implémenter une nouvelle fonctionnalité, TOUJOURS :**

1. **Vérifier si elle existe déjà** dans le projet
   - Utiliser la recherche de code (grep, semantic search)
   - Consulter l'architecture documentée ci-dessus
   - Vérifier les fichiers de configuration existants

2. **Évaluer l'existant avant de créer du nouveau**
   - Si la fonctionnalité existe → L'utiliser directement
   - Si elle existe mais est incomplète → L'améliorer sur place
   - Si elle existe mais est mal implémentée → La refactoriser, ne pas dupliquer

3. **Une seule approche par fonctionnalité**
   - Pas de doublons de configuration (ex: styles inline + CSS externe)
   - Pas de classes dupliquées avec des noms différents
   - Pas de logique métier répartie en plusieurs endroits

4. **En cas de conflit entre deux implémentations**
   - Identifier la source unique de vérité (généralement la plus récente ou la mieux architecturée)
   - Supprimer ou migrer vers l'implémentation choisie
   - Documenter le choix dans un commentaire si nécessaire

**Exemple de vérification** :
```typescript
// ❌ AVANT de créer un nouveau système de log
// VÉRIFIER d'abord : Existe-t-il déjà un Logger ?
// → Oui : application/logging/Logger.ts

// ❌ AVANT de créer un nouveau panneau UI
// VÉRIFIER d'abord : Le panneau existe-t-il dans UserInterface.ts ?
// → Si oui : modifier l'existant, ne pas dupliquer

// ❌ AVANT d'ajouter des styles inline
// VÉRIFIER d'abord : Existe-t-il un fichier CSS dédié ?
// → Oui : UserInterface.css → utiliser celui-ci
```

**Principe** : **DRY (Don't Repeat Yourself)** - Une seule source de vérité pour chaque concept.

### Configuration centralisée

**⚠️ SOURCE UNIQUE DE VÉRITÉ : `src/core/SimulationConfig.ts`**

Toutes les constantes du projet sont centralisées dans `SimulationConfig.ts` :
- `PhysicsConfig` : Masse, gravité, amortissement, limites de vitesse
- `LinesConfig` : Raideur, amortissement, tensions, lissage
- `ControlConfig` : Delta max, vitesses de pilotage
- `KiteConfig` : Géométrie et propriétés aérodynamiques du cerf-volant
- `WindConfig` : Vitesse et direction par défaut
- `UIConfig` : Intervalles de log, taille des buffers
- `RenderingConfig` : Paramètres de rendu 3D (FOV, near/far, clearColor)
- `LoggingConfig` : Configuration du système de logging

La configuration utilise des **interfaces TypeScript** pour garantir le typage strict et l'injection de dépendances.
La configuration par défaut est définie dans `DEFAULT_CONFIG`.

**Ne jamais définir de constantes en dur** - toujours utiliser la configuration injectée ou `DEFAULT_CONFIG`.

### Injection de dépendances

**Pattern central** : Toutes les dépendances sont injectées via constructeur

```typescript
// ✅ Correct - Injection de dépendances
export class PhysicsEngine {
    constructor(
        private kite: Kite,
        private integrator: IIntegrator,
        private forceManager: ForceManager,
        private windState: WindState,
        config?: Partial<PhysicsEngineConfig>
    ) { ... }
}

// ❌ Incorrect - Instanciation directe
export class PhysicsEngine {
    private integrator = new VerletIntegrator(); // Couplage fort !
}
```

**Avantages** :
- Testabilité maximale (injection de mocks)
- Découplage complet entre couches
- Inversion de contrôle (IoC)

### Système de coordonnées et orientation

```typescript
// Repère global :
// X+ : Axe latéral (vers la droite du pilote)
// Y+ : Altitude (vers le haut)
// Z+ : Direction où va le vent (le vent souffle de Z- vers Z+)
// Z- : Direction d'où vient le vent (origine du vent)

// Convention du cerf-volant :
// - Le pilote est à l'origine (0, 0, 0) et regarde vers Z+ (direction du vent)
// - Le cerf-volant vole "sous le vent" = en Z+ (hémisphère Z+ par rapport au pilote)
// - Le cerf-volant REGARDE TOUJOURS VERS LE PILOTE (face avant vers Z-)
// - LEFT (gauche) = X négatif (X-)
// - RIGHT (droite) = X positif (X+)
// - Extrados : face supérieure du cerf-volant
// - Intrados : face inférieure (face avant qui reçoit le vent)

// Vecteur vent dans le code :
// windState.velocity = new THREE.Vector3(0, 0, windSpeed) // Vent va vers Z+
// windState.direction = new THREE.Vector3(0, 0, 1) // Direction normalisée vers Z+

// Orientation initiale (voir Simulation.reset()) :
const orientationInitiale = new THREE.Quaternion();
const axeRotation = new THREE.Vector3(0, 1, 0); // Rotation autour de Y
orientationInitiale.setFromAxisAngle(axeRotation, Math.PI); // 180°
// Rotation 180° sur Y : le cerf-volant fait face vers Z- (vers la station de pilotage)
// L'intrados (face avant) reçoit le vent venant de Z-

// Position initiale :
initialState.position.set(0, 2, 10); // 10m sous le vent (en Z+), à 2m d'altitude
// Le cerf-volant est dans l'hémisphère Z+ (sous le vent), attaché par des lignes au pilote
```

### EventBus - Communication découplée

```typescript
// Publication d'événement
this.eventBus.emit(SimulationEventType.StateChanged, { 
    state: newState,
    timestamp: Date.now() 
});

// Écoute d'événement
this.eventBus.on(SimulationEventType.ConfigUpdated, (data) => {
    this.handleConfigChange(data.config);
});

// Types d'événements disponibles :
// - StateChanged : État physique mis à jour
// - ConfigUpdated : Configuration modifiée
// - SimulationReset : Simulation réinitialisée
// - PauseToggled : Pause activée/désactivée
```

### Gestion de la mémoire

- **Toujours** appeler `dispose()` sur les géométries/matériaux Three.js
- Voir `NewSimulation.dispose()` pour pattern de nettoyage complet
- Pattern de nettoyage : Visualiseurs → Renderer → EventBus
- Désactiver frustum culling pour lignes : `ligne.frustumCulled = false`

```typescript
// Pattern de dispose complet
dispose(): void {
    // 1. Nettoyer visualiseurs
    this.kiteVisualizer.dispose();
    this.linesVisualizer.dispose();
    // ... autres visualiseurs
    
    // 2. Nettoyer renderer
    this.renderer.dispose();
    
    // 3. Nettoyer eventBus
    this.eventBus.clear();
}
```

### Patterns de logging

```typescript
// Logging avec Logger (couche Application)
const logger = new Logger(bufferSize);

logger.log('INFO', 'Simulation démarrée');
logger.log('DEBUG', `Position: ${position.x}, ${position.y}, ${position.z}`);

// Récupération des logs
const allLogs = logger.getLogs();
const lastN = logger.getLogs(5); // 5 derniers logs
```

### Conventions de nommage

- Classes : `PascalCase` (ex: `PhysicsEngine`, `Kite`, `NewSimulation`)
- Méthodes : `camelCase` (ex: `update`, `calculate`, `getState`)
- Constantes : `UPPER_SNAKE_CASE` (ex: `MAX_VELOCITY`, `DEFAULT_CONFIG`)
- Interfaces : Préfixe `I` pour les contrats (ex: `IIntegrator`, `IAutoPilotMode`)
- Types : `PascalCase` sans préfixe (ex: `SimulationState`, `Forces`)

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
2. Observer en temps réel dans le navigateur (Vite hot reload automatique sur `npm run dev`)
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
- `PhysicsConfig.dampingFactor` (0.99) : Ne pas descendre sous 0.95

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
   - Il **regarde toujours vers le pilote** : la face avant (où sont les points de contrôle) fait face à la station
   - Il vole **"sous le vent"** = dans l'hémisphère Z+ (le vent va de Z- vers Z+)
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
- **MIGRATION_COMPLETE.md** : Historique de migration vers Clean Architecture
- **AUDIT_ARCHITECTURAL.md** : Rapport d'audit détaillé de l'architecture
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
