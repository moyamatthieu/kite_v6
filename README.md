# 🪁 Simulateur de Cerf-Volant Physique

Une simulation interactive et réaliste de cerf-volant acrobatique avec physique avancée et système d'autopilotage.

## ✨ Fonctionnalités

### 🎮 Simulation Physique Réaliste
- **Moteur physique complet** : Forces aérodynamiques (portance, traînée), gravité, tension des lignes
- **Système de lignes bi-régime** : Modélisation réaliste des lignes avec élasticité et amortissement
- **Calculs par panneaux** : Aérodynamique distribuée sur 5 panneaux (nez, ailes, centre)
- **Intégration numérique** : Méthode de Verlet avec contraintes et stabilisation

### 🤖 Système d'Autopilotage
7 modes de pilotage automatique avec contrôleurs PID :
1. **Manuel** - Contrôle utilisateur direct
2. **Stabilisation** - Maintien automatique du roulis à 0°
3. **Maintien d'Altitude** - Vol stationnaire à hauteur constante
4. **Maintien de Position** - Point fixe 3D dans l'espace
5. **☀️ Zénith** - Position au-dessus de la station (altitude max)
6. **Trajectoire Circulaire** - Vol en cercle paramétrable
7. **Mode Acrobatique** - Figures préprogrammées (loop, eight, wave)

### 🎨 Interface Graphique
- **Panneau de contrôle complet** : Boutons cliquables pour l'autopilote
- **Paramètres ajustables** : Vent, longueur des lignes, configuration des brides
- **Mode Debug** : Visualisation des forces, vecteurs, trajectoire
- **Affichage en temps réel** : Position, vitesse, orientation, état du pilote

### 🎹 Contrôles
- **Interface Clavier** : A (toggle autopilote), 1-7 (modes), Q/D ou ←/→ (pilotage)
- **Interface Souris** : Boutons cliquables pour tous les contrôles
- **Double contrôle** : Clavier et souris fonctionnent ensemble

## 🚀 Installation et Lancement

### Prérequis
- Node.js (v14 ou supérieur)
- npm

### Installation
```bash
npm install
```

### Lancement
```bash
npm run dev
```

L'application sera accessible sur `http://localhost:3000` (ou le port suivant si occupé).

## 📚 Documentation

- **[AUTOPILOTE.md](AUTOPILOTE.md)** - Guide complet du système d'autopilotage
- **[RAPPORT_AUDIT_PHYSIQUE.md](RAPPORT_AUDIT_PHYSIQUE.md)** - Audit détaillé du moteur physique
- **[CORRECTIONS_CALCULS_VECTEURS.md](CORRECTIONS_CALCULS_VECTEURS.md)** - Corrections des calculs vectoriels

## 🏗️ Architecture

```
src/
├── Scene.ts                    # Gestion de la scène 3D (Three.js)
├── Simulation.ts               # Orchestration principale
├── cerfvolant/
│   ├── CerfVolant.ts          # Objet 3D du cerf-volant
│   └── GeometrieCerfVolant.ts # Géométrie et dimensions
├── controles/
│   ├── AutoPilote.ts          # Système d'autopilotage (PID)
│   ├── ControleurUtilisateur.ts # Gestion des entrées
│   └── StationControle.ts     # Station au sol
├── physique/
│   ├── MoteurPhysique.ts      # Moteur de simulation
│   ├── CalculateurAerodynamique.ts # Forces aérodynamiques
│   ├── SystemeLignes.ts       # Physique des lignes
│   ├── SolveurContraintes.ts  # Contraintes et collisions
│   ├── EtatPhysique.ts        # État du système
│   ├── Vent.ts                # Simulation du vent
│   └── PhysicsConstants.ts    # Constantes physiques
└── ui/
    └── InterfaceUtilisateur.ts # Interface graphique
```

## 🔬 Physique et Paramètres

### Constantes Physiques
- **Masse du cerf-volant** : 150g
- **Envergure** : 1.65m
- **Surface** : ~0.8m²
- **Raideur des lignes** : 150 N/m
- **Amortissement** : Sur-critique (34 Ns/m)

### Contrôleurs PID (Autopilote)
- **Stabilisation** : Kp=2.0, Ki=0.1, Kd=0.5
- **Altitude** : Kp=0.8, Ki=0.05, Kd=0.3
- **Latéral** : Kp=1.2, Ki=0.08, Kd=0.4

## 🎯 Utilisation

1. **Lancer la simulation** avec `npm run dev`
2. **Ajuster le vent** avec le slider (0-50 km/h)
3. **Activer l'autopilote** : Bouton ou touche A
4. **Sélectionner un mode** : Boutons 1-7 ou touches clavier
5. **Observer** : Indicateurs en temps réel et trajectoire
6. **Débugger** : Activer le mode Debug pour voir les forces

## 🛠️ Technologies

- **Three.js** - Rendu 3D et visualisation
- **TypeScript** - Typage statique et développement
- **Vite** - Build tool et serveur de développement
- **CSS3** - Interface utilisateur responsive

## 📈 Évolutions Futures

- Trajectoires personnalisées par waypoints
- Apprentissage automatique des paramètres PID
- Mode multi-cerf-volant avec coordination
- Physique des turbulences avancée
- Support VR pour immersion

## 📝 License

Ce projet est une simulation éducative et de démonstration.

## 👤 Auteur

Simulation créée avec assistance IA - Novembre 2025

---

**Note** : Cette simulation est optimisée pour les navigateurs modernes supportant WebGL.
