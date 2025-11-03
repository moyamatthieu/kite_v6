# 🪁 Simulateur de Cerf-Volant - Nouvelle Architecture

## 🎯 Vue d'ensemble

Cette nouvelle version du simulateur de cerf-volant utilise une **architecture propre et découplée** suivant les principes **SOLID** et les meilleures pratiques de développement logiciel.

## 🏗️ Architecture

### Structure en couches

```
src/
├── core/               # Noyau de l'application
│   ├── types/         # Types et événements
│   ├── NewSimulation.ts   # Orchestrateur principal
│   └── SimulationConfig.ts # Configuration centralisée
│
├── domain/            # Logique métier (pur)
│   ├── kite/          # Modèle du cerf-volant
│   └── physics/       # Moteur physique
│       ├── forces/    # Calculateurs de forces
│       └── integrators/ # Intégrateurs numériques
│
├── application/       # Cas d'usage
│   ├── control/       # Systèmes de contrôle
│   │   └── autopilot/ # Modes d'autopilotage
│   └── logging/       # Système de logging
│
├── infrastructure/    # Adaptateurs techniques
│   ├── rendering/     # Rendu Three.js
│   └── ui/            # Interface utilisateur
│
└── utils/            # Utilitaires transversaux
```

### Principes appliqués

#### 1. **Separation of Concerns** (Séparation des responsabilités)
Chaque couche a une responsabilité claire :
- **Domain** : Logique métier pure (pas de dépendances externes)
- **Application** : Orchestration des cas d'usage
- **Infrastructure** : Adaptateurs techniques (Three.js, DOM)

#### 2. **Dependency Injection** (Injection de dépendances)
```typescript
// ❌ Couplage fort (ancien code)
class PhysicsEngine {
    private integrator = new VerletIntegrator();
    private forces = new AerodynamicForce();
}

// ✅ Injection de dépendances (nouveau code)
class PhysicsEngine {
    constructor(
        private integrator: IIntegrator,
        private forceManager: ForceManager
    ) {}
}
```

#### 3. **EventBus Pattern** (Communication découplée)
```typescript
// Publier un événement
eventBus.publish({
    type: SimulationEventType.PHYSICS_UPDATE,
    data: simulationState
});

// S'abonner à un événement
eventBus.subscribe(SimulationEventType.PHYSICS_UPDATE, (event) => {
    console.log('État mis à jour:', event.data);
});
```

#### 4. **Strategy Pattern** (Modes d'autopilotage)
```typescript
interface IAutoPilotMode {
    calculate(state: KitePhysicsState, dt: number): number;
    reset(): void;
}

// Modes implémentant l'interface
class ManualMode implements IAutoPilotMode { ... }
class ZenithMode implements IAutoPilotMode { ... }
class StabilizationMode implements IAutoPilotMode { ... }
```

#### 5. **Factory Pattern** (Création d'objets)
```typescript
// Création standardisée
const kite = KiteFactory.createStandard(initialState);

// Création personnalisée
const customKite = KiteFactory.createCustom(geometry, properties, initialState);
```

## 🚀 Démarrage rapide

### Installation

```bash
npm install
```

### Lancement de la nouvelle architecture

```bash
# Démarrer le serveur de développement
npm run dev

# Ouvrir dans le navigateur
# http://localhost:3000/new-index.html
```

### Contrôles

| Touche | Action |
|--------|--------|
| **ESPACE** | Pause/Reprise |
| **R** | Reset simulation |
| **A** | Basculer autopilote |
| **5** | Mode Zenith |
| **←/→** ou **Q/D** | Contrôle manuel |

## 📦 Modules principaux

### 1. NewSimulation (Orchestrateur)

Point d'entrée principal qui coordonne tous les modules.

```typescript
const simulation = new NewSimulation(container, {
    physics: {
        gravity: 9.81,
        dampingFactor: 0.99,
    },
    wind: {
        speed: 5.56,
        turbulence: 0.1,
    },
});
```

**Responsabilités** :
- Instanciation des modules avec DI
- Boucle d'animation principale
- Gestion des événements système

### 2. PhysicsEngine (Moteur physique)

Calcule l'évolution physique du système.

```typescript
const physicsEngine = new PhysicsEngine(
    kite,           // Modèle du cerf-volant
    integrator,     // Intégrateur numérique
    forceManager,   // Gestionnaire de forces
    windState,      // État du vent
    physicsParams   // Paramètres physiques
);

// Mise à jour
const state = physicsEngine.update(deltaTime, controlDelta);
```

**Calculateurs de forces intégrés** :
- `AerodynamicForceCalculator` : Portance et traînée par panneau
- `GravityForceCalculator` : Force de gravité
- `LineForceCalculator` : Tensions des lignes (bi-régime)

### 3. EventBus (Communication)

Système de publication/abonnement pour découpler les modules.

```typescript
// S'abonner
eventBus.subscribe(SimulationEventType.KITE_CRASH, (event) => {
    console.log('💥 Crash détecté !');
});

// Publier
eventBus.publish({
    type: SimulationEventType.KITE_CRASH,
    timestamp: Date.now(),
    data: { position, velocity }
});

// Une seule fois
eventBus.subscribeOnce(SimulationEventType.SIMULATION_START, handler);
```

### 4. AutoPilot Modes (Contrôle automatique)

Différents modes de pilotage automatique.

```typescript
// Mode Manuel (passthrough)
const manual = new ManualMode();

// Mode Zenith (position au-dessus)
const zenith = new ZenithMode(
    kpX: 0.5, kiX: 0.05, kdX: 0.2,
    kpY: 0.6, kiY: 0.05, kdY: 0.25
);

// Mode Stabilisation (maintien orientation)
const stabilization = new StabilizationMode(
    kp: 1.0, ki: 0.1, kd: 0.3
);

// Utilisation
const delta = mode.calculate(kiteState, deltaTime, lineLength);
```

### 5. Visualizers (Rendu)

Composants de visualisation 3D.

- **KiteVisualizer** : Géométrie du cerf-volant
- **LinesVisualizer** : Lignes de contrôle
- **TrajectoryVisualizer** : Trajectoire (buffer circulaire 2000 points)
- **DebugVisualizer** : Vecteurs de forces

```typescript
// Mise à jour des visualiseurs
kiteVisualizer.update();
linesVisualizer.update(leftAttachment, rightAttachment, kite);
trajectoryVisualizer.addPoint(position);
debugVisualizer.updateForceVectors(position, forces);
```

### 6. Logger (Journalisation)

Système de logging structuré avec buffer circulaire.

```typescript
const logger = new Logger(bufferSize: 32);

logger.debug('Message de debug');
logger.info('Information');
logger.warning('Avertissement');
logger.error('Erreur');

// Récupérer le buffer
const logs = logger.getBuffer();

// S'abonner aux nouveaux logs
logger.subscribe((entry) => {
    console.log(entry.message);
});
```

## ⚙️ Configuration

Toute la configuration est centralisée dans `SimulationConfig.ts` :

```typescript
const customConfig = {
    physics: {
        gravity: 9.81,
        dampingFactor: 0.99,
        maxVelocity: 30,
        maxAngularVelocity: 8,
    },
    kite: {
        mass: 0.3,
        wingspan: 2.5,
        liftCoefficient: 1.2,
        dragCoefficient: 0.15,
    },
    wind: {
        speed: 5.56,
        direction: new THREE.Vector3(1, 0, 0),
        turbulence: 0.1,
    },
    lines: {
        baseLength: 10,
        stiffness: 10,
        damping: 10,
        restLengthRatio: 0.99,
    },
    // ... autres configs
};
```

## 🧪 Tests et validation

### Mode Debug

Activer l'affichage des forces :

```typescript
const config = {
    rendering: {
        showDebug: true,
        showGrid: true,
    }
};
```

### Monitoring dans la console

La simulation expose un objet global pour le debug :

```javascript
// Dans la console du navigateur
window.simulation.kite.getState()           // État actuel
window.simulation.physicsEngine.getLastSimulationState()  // Dernier état
window.simulation.logger.getBuffer()        // Logs récents
```

### Événements à surveiller

```typescript
// Surveiller tous les événements
Object.values(SimulationEventType).forEach(type => {
    eventBus.subscribe(type, (event) => {
        console.log(`[${type}]`, event);
    });
});
```

## 🔧 Extension et personnalisation

### Ajouter un nouveau mode d'autopilotage

1. Créer une classe implémentant `IAutoPilotMode` :

```typescript
export class CircleMode implements IAutoPilotMode {
    private pidX: PIDController;
    private pidY: PIDController;
    private angle = 0;
    
    calculate(state: KitePhysicsState, dt: number, lineLength: number): number {
        this.angle += dt * 0.5; // 0.5 rad/s
        
        const target = new THREE.Vector3(
            Math.cos(this.angle) * 5,
            lineLength * 0.7,
            Math.sin(this.angle) * 5
        );
        
        const errorX = target.x - state.position.x;
        const errorY = target.y - state.position.y;
        
        const deltaX = this.pidX.update(errorX, dt);
        const deltaY = this.pidY.update(errorY, dt);
        
        return deltaX + deltaY;
    }
    
    reset(): void {
        this.angle = 0;
        this.pidX.reset();
        this.pidY.reset();
    }
}
```

2. L'utiliser dans la simulation :

```typescript
const circleMode = new CircleMode();
simulation.setAutoPilotMode(circleMode);
```

### Ajouter un calculateur de force

```typescript
export class CustomForceCalculator implements IForceCalculator {
    calculate(state: KitePhysicsState, wind: WindState): Vector3 {
        // Votre logique de calcul
        return new THREE.Vector3(fx, fy, fz);
    }
    
    reset(): void {
        // Réinitialisation
    }
}

// Ajouter au moteur
forceManager.addCalculator(new CustomForceCalculator());
```

## 📊 Performance

### Métriques cibles

- **FPS** : 60 (stable)
- **Frame time** : < 16.67ms
- **Physics step** : Fixed timestep recommandé
- **Memory** : Pas de fuites détectées (dispose() appelé)

### Optimisations appliquées

1. **Geometry reuse** : Géométries Three.js réutilisées
2. **Material caching** : MaterialFactory cache les matériaux
3. **Circular buffers** : Trajectoire et logs limitent l'allocation
4. **Object pooling** : Vector3 réutilisés dans les calculs
5. **Frustum culling** : Désactivé pour les lignes uniquement

## 🔄 Migration depuis l'ancien code

### Différences principales

| Ancien code | Nouveau code |
|-------------|--------------|
| Couplage fort | Dependency Injection |
| Callbacks directs | EventBus |
| Config éparpillée | SimulationConfig centralisée |
| Classes monolithiques | Modules découplés |
| Tests difficiles | Testable unitairement |

### Exemple de migration

**Ancien** :
```typescript
const simulation = new Simulation();
simulation.reinitialiser();
simulation.demarrer();
```

**Nouveau** :
```typescript
const simulation = new NewSimulation(container, config);
// Démarrage automatique dans le constructeur
```

## 📚 Références

### Design Patterns utilisés

- **Dependency Injection** : Inversion de contrôle
- **Observer** : EventBus
- **Strategy** : AutoPilot modes
- **Factory** : KiteFactory, MaterialFactory
- **Facade** : Renderer, Scene3D, Camera wrappers

### Principes SOLID

- **S**ingle Responsibility : Une classe = une responsabilité
- **O**pen/Closed : Extension par interfaces
- **L**iskov Substitution : Implémentations interchangeables
- **I**nterface Segregation : Interfaces ciblées
- **D**ependency Inversion : Dépendre d'abstractions

## 🐛 Debug et résolution de problèmes

### Le cerf-volant explose/oscille

1. Vérifier `config.lines.dampingFactor` (augmenter vers 15-20)
2. Réduire `config.lines.stiffness` (essayer 5-8)
3. Augmenter `config.lines.smoothingCoefficient` (0.5-0.6)

### Les forces semblent incorrectes

1. Activer `showDebug: true` pour voir les vecteurs
2. Consulter les logs : `simulation.logger.getBuffer()`
3. Vérifier les tensions : `simulation.physicsEngine.getLastSimulationState().lines`

### Performance dégradée

1. Désactiver debug : `showDebug: false`
2. Réduire la trajectoire : Modifier `TrajectoryVisualizer.maxPoints`
3. Augmenter `logInterval` dans la config UI

## 🎓 Pour aller plus loin

### Améliorations futures

- [ ] Système de sauvegarde/chargement d'états
- [ ] Mode replay avec timeline
- [ ] Tests unitaires automatisés
- [ ] Tests d'intégration E2E
- [ ] Simulation multi-cerf-volants
- [ ] Modèle de vent turbulent 3D (Perlin noise)
- [ ] Déformation de la voile (calcul éléments finis)
- [ ] VR/AR support

### Ressources

- [Three.js Documentation](https://threejs.org/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)

---

**Développé avec ❤️ et les principes du Clean Code**

*Architecture propre • Code testable • Maintenabilité garantie*
