# Plan de Refactoring - Architecture Propre

## 🎯 Objectifs

1. **Architecture en couches** claire et découplée
2. **Séparation des responsabilités** stricte (SRP)
3. **Patterns modernes** : Factory, Observer, Strategy, Dependency Injection
4. **Testabilité** : Code facilement testable unitairement
5. **Maintenabilité** : Structure évolutive et documentée
6. **Performance** : Optimisations sans sacrifier la clarté

## 📐 Nouvelle Architecture

### Structure de dossiers proposée

```
src/
├── core/                          # Cœur de la simulation (invariants)
│   ├── Simulation.ts             # Orchestrateur principal (simplifié)
│   ├── SimulationConfig.ts       # Configuration centralisée (étendu)
│   └── types/                    # Types et interfaces partagés
│       ├── Vector3D.ts           # Type vector personnalisé (wrapper Three.js)
│       ├── PhysicsState.ts       # État physique normalisé
│       └── Events.ts             # Système d'événements
│
├── domain/                        # Logique métier (domaine)
│   ├── kite/                     # Entité cerf-volant
│   │   ├── Kite.ts               # Modèle métier (pas de Three.js ici)
│   │   ├── KiteGeometry.ts       # Géométrie pure (calculs mathématiques)
│   │   ├── KitePanels.ts         # Découpage en panneaux
│   │   └── KiteBridles.ts        # Système de brides
│   │
│   ├── physics/                  # Moteur physique
│   │   ├── PhysicsEngine.ts      # Orchestrateur physique
│   │   ├── forces/               # Calculs de forces (modulaire)
│   │   │   ├── AerodynamicForce.ts
│   │   │   ├── GravityForce.ts
│   │   │   ├── LineForce.ts
│   │   │   └── ForceCalculator.ts  # Interface commune
│   │   ├── constraints/          # Contraintes physiques
│   │   │   ├── LineConstraint.ts
│   │   │   └── ConstraintSolver.ts
│   │   └── integrators/          # Intégrateurs numériques
│   │       ├── VerletIntegrator.ts
│   │       └── RungeKuttaIntegrator.ts  # Alternative future
│   │
│   ├── wind/                     # Modèle de vent
│   │   ├── Wind.ts               # Classe de base
│   │   ├── ConstantWind.ts       # Vent constant
│   │   └── TurbulentWind.ts      # Vent turbulent (futur)
│   │
│   └── station/                  # Station de contrôle
│       ├── ControlStation.ts     # Modèle métier
│       └── Winch.ts              # Treuils individuels
│
├── application/                   # Services applicatifs
│   ├── control/                  # Système de contrôle
│   │   ├── ControlSystem.ts      # Orchestrateur de contrôle
│   │   ├── input/                # Entrées utilisateur
│   │   │   ├── KeyboardInput.ts
│   │   │   ├── MouseInput.ts
│   │   │   └── TouchInput.ts
│   │   └── autopilot/            # Autopilote
│   │       ├── AutoPilot.ts
│   │       ├── modes/            # Modes séparés (Strategy pattern)
│   │       │   ├── ManualMode.ts
│   │       │   ├── StabilizationMode.ts
│   │       │   ├── AltitudeHoldMode.ts
│   │       │   ├── PositionHoldMode.ts
│   │       │   ├── ZenithMode.ts
│   │       │   ├── CircularMode.ts
│   │       │   └── AcrobaticMode.ts
│   │       └── PIDController.ts  # Contrôleur PID réutilisable
│   │
│   ├── logging/                  # Système de logs
│   │   ├── Logger.ts             # Logger unifié
│   │   ├── LogFormatter.ts       # Formattage des logs
│   │   └── LogBuffer.ts          # Buffer circulaire
│   │
│   └── telemetry/                # Télémétrie et métriques
│       ├── TelemetryCollector.ts
│       └── PerformanceMonitor.ts
│
├── infrastructure/                # Couche technique
│   ├── rendering/                # Rendu 3D (Three.js isolé)
│   │   ├── Renderer.ts           # Wrapper Three.js
│   │   ├── Scene3D.ts            # Scène 3D
│   │   ├── Camera.ts             # Contrôle caméra
│   │   ├── visualizers/          # Visualiseurs (séparation de concerns)
│   │   │   ├── KiteVisualizer.ts
│   │   │   ├── LinesVisualizer.ts
│   │   │   ├── BridlesVisualizer.ts
│   │   │   ├── TrajectoryVisualizer.ts
│   │   │   ├── StationVisualizer.ts
│   │   │   └── DebugVisualizer.ts  # Vecteurs de forces
│   │   └── materials/            # Matériaux réutilisables
│   │       └── MaterialFactory.ts
│   │
│   ├── ui/                       # Interface utilisateur
│   │   ├── UIManager.ts          # Gestionnaire principal
│   │   ├── panels/               # Panneaux UI (composants)
│   │   │   ├── ControlPanel.ts
│   │   │   ├── DebugPanel.ts
│   │   │   ├── LogPanel.ts
│   │   │   └── SliderControl.ts
│   │   └── UIEvents.ts           # Gestionnaire d'événements UI
│   │
│   └── persistence/              # Sauvegarde/chargement (futur)
│       ├── StateSerializer.ts
│       └── ConfigLoader.ts
│
└── utils/                        # Utilitaires génériques
    ├── math/                     # Mathématiques
    │   ├── Vector3DUtils.ts
    │   ├── QuaternionUtils.ts
    │   └── Interpolation.ts
    ├── geometry/                 # Géométrie
    │   └── Trilateration.ts      # Calcul trilatération
    └── validation/               # Validation
        └── ConfigValidator.ts
```

## 🔧 Patterns à Implémenter

### 1. **Dependency Injection**
```typescript
// Injection des dépendances via constructeur
class PhysicsEngine {
  constructor(
    private forceCalculators: ForceCalculator[],
    private integrator: Integrator,
    private constraintSolver: ConstraintSolver
  ) {}
}
```

### 2. **Observer Pattern (Event System)**
```typescript
// Communication décou plée via événements
interface SimulationEvent {
  type: 'physics:update' | 'kite:crash' | 'wind:change';
  data: any;
}

class EventBus {
  private listeners = new Map<string, Set<(event: SimulationEvent) => void>>();
  
  subscribe(type: string, callback: (event: SimulationEvent) => void): void;
  publish(event: SimulationEvent): void;
}
```

### 3. **Strategy Pattern (Autopilot Modes)**
```typescript
interface AutoPilotMode {
  calculate(state: PhysicsState, deltaTime: number): number;
  getInfo(state: PhysicsState): string;
}

class ZenithMode implements AutoPilotMode {
  // Implémentation spécifique
}
```

### 4. **Factory Pattern (Création d'objets)**
```typescript
class KiteFactory {
  static createStandardKite(config: KiteConfig): Kite;
  static createCustomKite(geometry: KiteGeometry): Kite;
}
```

### 5. **Repository Pattern (État)**
```typescript
interface StateRepository {
  save(state: PhysicsState): void;
  load(): PhysicsState;
  reset(): void;
}
```

## 🎨 Principes SOLID

### Single Responsibility Principle
- **Avant** : `Simulation.ts` fait tout (rendu, physique, UI, logs)
- **Après** : Chaque classe a UNE responsabilité claire

### Open/Closed Principle
- Extension via nouveaux modes autopilote sans modifier code existant
- Nouvelles forces via implémentation de `ForceCalculator`

### Liskov Substitution
- Tous les `ForceCalculator` sont interchangeables
- Tous les `Integrator` sont interchangeables

### Interface Segregation
- Interfaces petites et spécifiques (pas de "god interface")

### Dependency Inversion
- Dépendances sur abstractions, pas sur implémentations concrètes

## 🚀 Migration Progressive

### Phase 1 : Fondations (Priorité HAUTE)
1. ✅ Créer structure de dossiers
2. ✅ Extraire `Config.ts` → `SimulationConfig.ts` (étendu)
3. ✅ Créer système d'événements (`EventBus`)
4. ✅ Définir types de base (`PhysicsState`, `Vector3D`)
5. ✅ Créer interfaces principales (`ForceCalculator`, `Integrator`)

### Phase 2 : Domaine (Priorité HAUTE)
1. ✅ Refactor `GeometrieCerfVolant` → `KiteGeometry` (pure math)
2. ✅ Créer `Kite` (modèle métier, pas de Three.js)
3. ✅ Séparer calculs de forces en modules
4. ✅ Extraire `PhysicsEngine` propre

### Phase 3 : Infrastructure (Priorité MOYENNE)
1. ✅ Isoler Three.js dans `rendering/`
2. ✅ Créer visualiseurs spécialisés
3. ✅ Refactor UI en composants
4. ✅ Système de logging structuré

### Phase 4 : Application (Priorité MOYENNE)
1. ✅ Modes autopilote séparés (Strategy)
2. ✅ Système de contrôle unifié
3. ✅ Télémétrie et métriques

### Phase 5 : Optimisation (Priorité BASSE)
1. 🔄 Tests unitaires
2. 🔄 Performance profiling
3. 🔄 Documentation API
4. 🔄 CI/CD

## 📝 Conventions de Code

### Nommage
- **Classes** : `PascalCase` (ex: `PhysicsEngine`)
- **Interfaces** : Préfixe `I` (ex: `IForceCalculator`) OU suffixe descriptif (ex: `ForceCalculator`)
- **Méthodes** : `camelCase` (ex: `calculateForce`)
- **Constantes** : `UPPER_SNAKE_CASE` (ex: `MAX_VELOCITY`)
- **Privés** : Préfixe `_` optionnel (ex: `_internalState`)

### Commentaires
```typescript
/**
 * Calcule la force aérodynamique sur un panneau.
 * 
 * @param panel - Panneau à analyser
 * @param wind - Vecteur vent apparent
 * @returns Force résultante en Newtons
 * 
 * @remarks
 * Utilise le modèle simplifié Lift/Drag avec coefficients constants.
 * 
 * @see CalculateurAerodynamique (ancienne implémentation)
 */
calculateAerodynamicForce(panel: Panel, wind: Vector3D): Vector3D;
```

### Organisation des imports
```typescript
// 1. Bibliothèques externes
import * as THREE from 'three';

// 2. Core
import { SimulationConfig } from '@/core/SimulationConfig';

// 3. Domain
import { Kite } from '@/domain/kite/Kite';

// 4. Application
import { Logger } from '@/application/logging/Logger';

// 5. Infrastructure
import { Renderer } from '@/infrastructure/rendering/Renderer';

// 6. Utils
import { Vector3DUtils } from '@/utils/math/Vector3DUtils';
```

## 🧪 Testabilité

### Exemple de test unitaire
```typescript
describe('AerodynamicForce', () => {
  it('should calculate lift correctly for 10° angle of attack', () => {
    const calculator = new AerodynamicForce();
    const panel = createMockPanel();
    const wind = new Vector3D(10, 0, 0);
    
    const force = calculator.calculate(panel, wind);
    
    expect(force.magnitude()).toBeCloseTo(expectedLift, 2);
  });
});
```

### Injection de dépendances pour tests
```typescript
// Production
const engine = new PhysicsEngine(
  [new AerodynamicForce(), new GravityForce()],
  new VerletIntegrator(),
  new LineConstraintSolver()
);

// Test
const engine = new PhysicsEngine(
  [new MockForce()],
  new MockIntegrator(),
  new MockSolver()
);
```

## 📊 Métriques de Qualité

### Objectifs
- **Couplage** : < 5 dépendances par classe
- **Cohésion** : > 80% méthodes utilisent les mêmes attributs
- **Complexité cyclomatique** : < 10 par méthode
- **Couverture de tests** : > 80% (objectif futur)
- **Taille des fichiers** : < 300 lignes par fichier

### Outils
- ESLint pour qualité code
- TypeScript strict mode
- Prettier pour formatage
- Jest pour tests (futur)

## 🔄 État Actuel vs Futur

### Avant (Actuel)
```typescript
// Simulation.ts : 500+ lignes, fait TOUT
class Simulation {
  // Rendu 3D
  private scene: Scene;
  private cerfVolant: CerfVolant;
  
  // Physique
  private moteurPhysique: MoteurPhysique;
  
  // UI
  private interfaceUtilisateur: InterfaceUtilisateur;
  
  // Logging
  private logsBuffer: string[];
  
  // ... mélange de responsabilités
  boucleAnimation() {
    // Fait tout ici
  }
}
```

### Après (Futur)
```typescript
// Simulation.ts : 150 lignes, ORCHESTRE seulement
class Simulation {
  constructor(
    private physicsEngine: PhysicsEngine,
    private renderer: Renderer,
    private controlSystem: ControlSystem,
    private logger: Logger,
    private eventBus: EventBus
  ) {
    this.setupEventListeners();
  }
  
  update(deltaTime: number): void {
    // Orchestration simple
    const controlInput = this.controlSystem.getInput();
    const newState = this.physicsEngine.update(controlInput, deltaTime);
    this.renderer.render(newState);
    this.eventBus.publish({ type: 'physics:update', data: newState });
  }
}
```

## 🎯 Priorités Immédiates

1. **Créer structure de dossiers** ✅
2. **Extraire Config étendu** ✅
3. **Créer EventBus** ✅
4. **Séparer KiteGeometry (pure math)** ✅
5. **Créer interfaces ForceCalculator** ✅

Ensuite, migration progressive module par module avec tests de non-régression visuels.

## 📌 Notes

- Garder l'ancienne version fonctionnelle en parallèle pendant la migration
- Migration progressive : un module à la fois
- Tests de non-régression visuels après chaque migration
- Documentation au fur et à mesure
- Commit fréquents avec messages clairs

---

**Auteur** : Refactoring architectural complet  
**Date** : 2025-11-03  
**Branche** : `refactor/clean-architecture`
