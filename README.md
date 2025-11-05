# 🪁 Simulateur de Cerf-Volant Physique v2.0

Simulateur de cerf-volant acrobatique avec physique avancée et autopilotage, construit avec **Three.js** et **TypeScript** selon les principes de **Clean Architecture**.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![Three.js](https://img.shields.io/badge/Three.js-0.172-green)
![Architecture](https://img.shields.io/badge/Architecture-Clean-brightgreen)

---

## 🎯 Vue d'ensemble

Ce projet est un **simulateur physique réaliste** d'un cerf-volant acrobatique avec :
- Calcul des forces aérodynamiques en temps réel (portance, traînée)
- Système de lignes avec modèle bi-régime
- 7 modes d'autopilotage avec contrôleurs PID
- Visualisation 3D interactive avec Three.js
- Architecture propre et découplée (SOLID)

### Points Clés

- ⚡ **60 FPS** de simulation physique
- 🎮 **Pilotage manuel** ou **automatique**
- 📊 **Télémétrie en temps réel**
- 🎨 **Visualisation 3D** avec trajectoire et vecteurs de forces
- 🏗️ **Architecture modulaire** facile à étendre

---

## 🏗️ Architecture

### Structure en Couches (Clean Architecture)

```
src/
├── core/                   # Noyau de l'application
│   ├── NewSimulation.ts    # Orchestrateur principal
│   ├── SimulationConfig.ts # Configuration centralisée
│   └── types/              # Types partagés (Events, PhysicsState)
│
├── domain/                 # Logique métier pure (pas de dépendances externes)
│   ├── kite/               # Modèle du cerf-volant
│   │   ├── Kite.ts         # Entité + Factory
│   │   └── KiteGeometry.ts # Géométrie et calculs mathématiques
│   └── physics/            # Moteur physique
│       ├── PhysicsEngine.ts
│       ├── forces/         # Calculateurs de forces modulaires
│       └── integrators/    # Intégrateurs numériques (Verlet)
│
├── application/            # Cas d'usage et services
│   ├── control/autopilot/  # Système d'autopilotage (7 modes)
│   └── logging/            # Système de logs structurés
│
└── infrastructure/         # Adaptateurs techniques
    └── rendering/          # Rendu Three.js (visualiseurs, caméra, scène)
```

### Principes Appliqués

- ✅ **SOLID** : Chaque classe a une responsabilité unique
- ✅ **Dependency Injection** : Couplage faible, testabilité élevée
- ✅ **EventBus Pattern** : Communication découplée entre modules
- ✅ **Strategy Pattern** : Modes d'autopilotage interchangeables
- ✅ **Factory Pattern** : Création standardisée d'objets

---

## 🚀 Installation et Démarrage

### Prérequis

- **Node.js** >= 18.x
- **npm** >= 9.x

### Installation

```bash
# Cloner le dépôt
git clone https://github.com/moyamatthieu/kite_v6.git
cd kite_v6

# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev
```

Le simulateur sera accessible sur **http://localhost:3000**

### Build de Production

```bash
npm run build
npm run preview  # Prévisualiser le build
```

---

## 🎮 Utilisation

### Contrôles Manuels

| Touche | Action |
|--------|--------|
| **←** | Tirer ligne gauche |
| **→** | Tirer ligne droite |
| **Espace** | Pause/Reprendre |
| **R** | Réinitialiser simulation |
| **D** | Basculer mode debug |

### Interface Utilisateur

Le panneau de contrôle permet de :
- Basculer entre **7 modes d'autopilotage**
- Ajuster la vitesse du vent (5-40 km/h)
- Afficher/masquer les éléments de debug
- Visualiser la télémétrie en temps réel

### Modes d'Autopilotage

1. **Manuel** : Contrôle total par l'utilisateur
2. **Stabilisation** : Maintien de l'orientation
3. **Maintien d'altitude** : Vol à altitude constante
4. **Maintien de position** : Stabilisation XYZ
5. **Zénith** : Vol au-dessus de la station
6. **Trajectoire circulaire** : Vol en cercle
7. **Acrobatique** : Figures pré-programmées

---

## 📐 Physique

### Système de Coordonnées

```
X+ : Axe latéral (vers la droite du pilote)
Y+ : Altitude (vers le haut)
Z+ : Direction du vent (souffle de Z+ vers Z-)
```

### Forces Calculées

1. **Forces Aérodynamiques** (par panneau)
   - Portance : `L = 0.5 × ρ × v² × S × Cl(α)`
   - Traînée : `D = 0.5 × ρ × v² × S × Cd(α)`

2. **Force de Gravité**
   - Distribuée sur les panneaux du cerf-volant

3. **Forces des Lignes** (modèle bi-régime)
   - Tension minimale sous longueur de repos
   - Modèle ressort-amortisseur au-dessus

### Intégration Numérique

**Intégrateur de Verlet** avec :
- Timestep fixe : 1/60 secondes
- Amortissement numérique : 0.99
- Limites de vitesse pour stabilité

---

## 🔧 Configuration

La configuration centralisée se trouve dans `src/core/SimulationConfig.ts` :

```typescript
export const DEFAULT_CONFIG = {
  physics: {
    gravity: 9.81,
    airDensity: 1.225,
    timestep: 1/60
  },
  kite: {
    mass: 0.250,         // kg
    wingspan: 2.4,       // m
    surfaceArea: 1.5     // m²
  },
  lines: {
    length: 25,          // m
    stiffness: 10,       // N/m
    damping: 10          // Ns/m
  },
  wind: {
    speed: 20,           // km/h
    direction: { x: 1, y: 0, z: 0 }
  }
};
```

---

## 📊 Métriques du Projet

| Métrique | Valeur |
|----------|--------|
| **Lignes de code** | ~3200 |
| **Fichiers TypeScript** | 22 |
| **Couches d'architecture** | 4 |
| **Patterns appliqués** | 5 |
| **Modes d'autopilotage** | 7 |
| **Taux de couverture SOLID** | 100% |

---

## 🧪 Tests

_(Tests unitaires à venir)_

```bash
# Lancer les tests
npm test

# Tests avec couverture
npm run test:coverage
```

---

## 📚 Documentation Technique

- **[AUDIT_ARCHITECTURAL.md](./AUDIT_ARCHITECTURAL.md)** : Audit complet de l'architecture
- **[.github/copilot-instructions.md](./.github/copilot-instructions.md)** : Guide pour développeurs

### Fichiers Clés

| Fichier | Description |
|---------|-------------|
| `src/core/NewSimulation.ts` | Orchestrateur principal de la simulation |
| `src/domain/physics/PhysicsEngine.ts` | Moteur physique avec intégration des forces |
| `src/domain/kite/Kite.ts` | Modèle métier du cerf-volant |
| `src/application/control/autopilot/modes/AutoPilotModes.ts` | 7 modes d'autopilotage |
| `src/core/SimulationConfig.ts` | Configuration centralisée |

---

## 🛠️ Technologies

- **[Three.js](https://threejs.org/)** v0.172 - Rendu 3D
- **[TypeScript](https://www.typescriptlang.org/)** v5.7 - Typage statique
- **[Vite](https://vite.dev/)** v6.4 - Build tool ultra-rapide

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Pour contribuer :

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

### Guidelines

- Respecter les principes SOLID
- Écrire des tests unitaires
- Documenter les fonctions publiques (JSDoc)
- Suivre la structure en couches existante

---

## 📝 Changelog

### v2.0.0 (2025-11-04)

- ✅ **Migration complète vers Clean Architecture**
- ✅ Séparation en 4 couches (Core/Domain/Application/Infrastructure)
- ✅ Suppression de l'ancienne architecture monolithique
- ✅ Application des principes SOLID
- ✅ Patterns modernes : DI, EventBus, Strategy, Factory
- ✅ Documentation complète

### v1.0.0 (2024)

- ⚠️ Architecture monolithique (legacy)
- ✅ Moteur physique fonctionnel
- ✅ 7 modes d'autopilotage
- ✅ Visualisation 3D

---

## 📄 Licence

Ce projet est sous licence **MIT**. Voir le fichier `LICENSE` pour plus de détails.

---

## 👤 Auteur

**Matthieu Moya**

- GitHub: [@moyamatthieu](https://github.com/moyamatthieu)

---

## 🙏 Remerciements

- **Three.js** pour le moteur de rendu 3D
- **Vite** pour le tooling de développement
- Communauté TypeScript pour les meilleures pratiques

---

## 📧 Support

Pour toute question ou problème :
- Ouvrir une [issue](https://github.com/moyamatthieu/kite_v6/issues)
- Consulter la [documentation technique](./.github/copilot-instructions.md)

---

**Fait avec ❤️ et TypeScript**
