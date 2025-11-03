# 🔍 Guide de Vérification - Quelle Architecture ?

## 🎯 Comment identifier l'architecture chargée

### Option 1 : Par l'URL

| URL | Architecture | Version | Entry Point |
|-----|--------------|---------|-------------|
| `http://localhost:3001/index.html` | ❌ **Ancienne** (Legacy) | v1.0 | `/index.tsx` → `Simulation.ts` |
| `http://localhost:3001/new-index.html` | ✅ **Nouvelle** (Clean) | v2.0 | `/src/newIndex.tsx` → `NewSimulation.ts` |

### Option 2 : Par la console du navigateur

Ouvrez la console (F12) et recherchez :

**Nouvelle Architecture :**
```
✅✅✅ NOUVELLE ARCHITECTURE CHARGÉE ✅✅✅
📦 Architecture: Core/Domain/Application/Infrastructure
🎯 SOLID Principles appliqués
🔌 Dependency Injection active
```

**Ancienne Architecture :**
```
(Pas de message spécifique - logs standards de la simulation)
```

### Option 3 : Par l'interface visuelle

**Nouvelle Architecture :**
- Titre : `🪁 NOUVELLE SIMULATION`
- Sous-titre : `v2.0.0 | Clean Architecture ✅`
- Panneau sur fond noir avec border vert fluo
- Message initial : "✅ Nouvelle architecture chargée !"

**Ancienne Architecture :**
- Titre : `🎮 Contrôles de Simulation`
- Panneaux multiples (contrôle, debug, log)
- Slider centralisé en bas
- UI plus complexe avec plus d'options

### Option 4 : Par window.__ARCHITECTURE__

Dans la console :

```javascript
window.__ARCHITECTURE__
// Nouvelle : { version: '2.0.0', type: 'clean', entryPoint: 'newIndex.tsx' }
// Ancienne : { version: '1.0.0', type: 'legacy', entryPoint: 'index.tsx' }
```

### Option 5 : Par window.simulation

**Nouvelle Architecture :**
```javascript
window.simulation
// -> NewSimulation { eventBus, logger, physicsEngine, kite, ... }

window.simulation.constructor.name
// -> "NewSimulation"
```

**Ancienne Architecture :**
```javascript
window.simulation
// -> Simulation { scene, cerfVolant, moteurPhysique, ... }

window.simulation.constructor.name
// -> "Simulation"
```

## 📊 Comparaison des fichiers

### Structure de fichiers

**Nouvelle Architecture (refactor/clean-architecture):**
```
src/
├── core/
│   ├── NewSimulation.ts ✨
│   ├── SimulationConfig.ts ✨
│   └── types/
│       ├── Events.ts ✨
│       └── PhysicsState.ts ✨
├── domain/
│   ├── kite/
│   │   ├── Kite.ts ✨
│   │   └── KiteGeometry.ts ✨
│   └── physics/
│       ├── PhysicsEngine.ts ✨
│       ├── forces/ ✨
│       └── integrators/ ✨
├── application/
│   ├── control/autopilot/ ✨
│   └── logging/Logger.ts ✨
└── infrastructure/
    └── rendering/ ✨
```

**Ancienne Architecture (master):**
```
src/
├── Simulation.ts
├── Scene.ts
├── Config.ts
├── cerfvolant/
│   ├── CerfVolant.ts
│   └── GeometrieCerfVolant.ts
├── physique/
│   ├── MoteurPhysique.ts
│   └── SystemeLignes.ts
└── controles/
    └── AutoPilote.ts
```

## 🧪 Tests de vérification

### Test 1 : Vérifier le chargement

1. Ouvrir `http://localhost:3001/new-index.html`
2. Ouvrir la console (F12)
3. Vérifier le message en vert : `✅✅✅ NOUVELLE ARCHITECTURE CHARGÉE ✅✅✅`

### Test 2 : Vérifier les modules

```javascript
// Dans la console
window.simulation.physicsEngine.constructor.name
// Doit retourner: "PhysicsEngine" (nouvelle) ou "MoteurPhysique" (ancienne)

window.simulation.eventBus
// Doit exister dans la nouvelle architecture, undefined dans l'ancienne
```

### Test 3 : Vérifier EventBus

```javascript
// Nouvelle architecture uniquement
window.simulation.eventBus.subscribe('PHYSICS_UPDATE', (event) => {
    console.log('📊 Physics update:', event.data);
});
```

### Test 4 : Vérifier Logger

```javascript
// Nouvelle architecture
window.simulation.logger.getBuffer()
// -> Array of log entries avec timestamps

// Ancienne architecture
// Pas de logger structuré accessible
```

## 🔧 Changement d'architecture

### Pour tester la NOUVELLE architecture :
```bash
# Dans le navigateur
http://localhost:3001/new-index.html
```

### Pour tester l'ANCIENNE architecture :
```bash
# Dans le navigateur
http://localhost:3001/index.html
```

### Pour revenir définitivement à l'ancienne :
```bash
git checkout master
npm run dev
# Ouvrir http://localhost:3001/index.html
```

### Pour continuer avec la nouvelle :
```bash
# Vous êtes déjà sur la bonne branche
git branch
# -> * refactor/clean-architecture
```

## ⚡ Différences fonctionnelles

### Événements

| Feature | Ancienne | Nouvelle |
|---------|----------|----------|
| Communication | Callbacks directs | EventBus (pub/sub) |
| Couplage | Fort | Découplé |
| Testabilité | Difficile | Facile |

### Dépendances

| Feature | Ancienne | Nouvelle |
|---------|----------|----------|
| Injection | Hardcodée | Constructor DI |
| Remplacement | Impossible | Facile |
| Mocking | Difficile | Simple |

### Configuration

| Feature | Ancienne | Nouvelle |
|---------|----------|----------|
| Location | `Config.ts` | `SimulationConfig.ts` |
| Structure | Flat constants | Nested interfaces |
| Type Safety | Partielle | Complète |

### Logging

| Feature | Ancienne | Nouvelle |
|---------|----------|----------|
| Système | Console.log | Logger structuré |
| Buffer | Non | Oui (circulaire) |
| Filtrage | Non | Par niveau |
| Export | Non | Oui |

## 📚 Documentation

- **Nouvelle Architecture** : `NEW_ARCHITECTURE.md` (625 lignes)
- **Plan de refactoring** : `REFACTOR_PLAN.md` (402 lignes)
- **Instructions Copilot** : `.github/copilot-instructions.md`
- **Ancienne documentation** : `README.md`, `AUTOPILOTE.md`

## 🎯 Recommandation

Pour **développement futur** : Utiliser la **nouvelle architecture** (`new-index.html`)

**Raisons** :
- ✅ Code testable
- ✅ Modules découplés
- ✅ SOLID principles
- ✅ Facile à étendre
- ✅ Documentation complète
- ✅ Design patterns modernes

L'ancienne architecture reste disponible pour **référence** et **migration progressive**.
