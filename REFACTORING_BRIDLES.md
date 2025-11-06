# Refactoring : Système de Brides - Pendule 3D

**Date** : 6 novembre 2025  
**Branche** : `feat/lift-debug-mode`  
**Objectif** : Modéliser la chaîne de transmission complète `Treuil → Ligne → Brides → Structure`

---

## 🎯 Problème identifié

### Architecture précédente (simplifiée)
```
Treuil → Ligne → Force appliquée directement au CoM
```

**Limitations** :
- ❌ Pas de modélisation de la chaîne de transmission réelle
- ❌ Les brides (3 points d'attache) n'étaient pas représentées physiquement
- ❌ Le couple des lignes était calculé sur les points de contrôle (abstrait)
- ❌ Ne respectait pas le modèle du "pendule 3D"

### Architecture cible (pendule 3D)
```
Treuil → Ligne → Point de contrôle → 3 Brides → 3 Points d'attache (Structure) → Force + Couple
```

**Avantages** :
- ✅ Chaîne de transmission physiquement réaliste
- ✅ Chaque bride a sa propre tension/force
- ✅ Le couple émerge naturellement de la géométrie des brides
- ✅ Modélisation correcte du pendule 3D

---

## 🏗️ Implémentation

### 1. Nouvelle classe `BridleSystem` (`src/domain/physics/BridleSystem.ts`)

**Responsabilité** : Calculer comment la force d'une ligne se répartit via 3 brides aux 3 points d'attache.

**Géométrie modélisée** :
```
Point de contrôle (extrémité ligne)
    ↓ Bride 1 (longueur L1)
    NEZ (point d'attache)
    ↓ Bride 2 (longueur L2)
    TRAVERSE_GAUCHE/DROITE (point d'attache)
    ↓ Bride 3 (longueur L3)
    CENTRE (point d'attache)
```

**Fonctionnalités** :
- `calculateBridleForces(lineForce, state)` : Répartition de la force de ligne selon géométrie
- Calcul des tensions individuelles dans chaque bride (modèle ressort-amortisseur)
- Calcul du couple total : `Σ(bras_de_levier × force)` pour chaque point d'attache
- Retourne `BridleForceResult` : force totale, couple, forces par attache, tensions

**Paramètres physiques** (dans `BridleSystemConfig`) :
- `bridleStiffness` : 5000 N/m (brides rigides, ratio longueur vs lignes)
- `bridleDamping` : 20 Ns/m (amortissement modéré)
- `controlPointMass` : 0.01 kg (10g, négligeable)

### 2. Refactorisation `LineForceCalculator` (`src/domain/physics/forces/LineForce.ts`)

**Modifications** :
- Import de `BridleSystem`
- Ajout de 2 instances : `leftBridleSystem`, `rightBridleSystem`
- Nouveau paramètre constructeur : `bridleConfig?: Partial<BridleSystemConfig>`
- Méthode `calculateWithDelta()` refactorisée :
  1. Calcule force de chaque ligne au point de contrôle (existant)
  2. **NOUVEAUTÉ** : Transmet via `BridleSystem.calculateBridleForces()`
  3. Force totale = somme des forces transmises par les brides
  4. Couple total = somme des couples des 2 systèmes de brides

**Code clé** :
```typescript
// 1. Force de ligne au point de contrôle (existant)
const leftLineForceData = this.calculateSingleLineForce(...);

// 2. NOUVEAUTÉ : Transmission via brides
const leftBridleResult = this.leftBridleSystem.calculateBridleForces(
    leftLineForceData.force,
    state
);

// 3. Résultat = forces/couples transmis
return {
    force: leftBridleResult.totalForce + rightBridleResult.totalForce,
    torque: leftBridleResult.torque + rightBridleResult.torque,
    ...
};
```

### 3. Configuration centralisée (`src/core/SimulationConfig.ts`)

**Nouvelle interface** : `BridlesConfig`
```typescript
export interface BridlesConfig {
    /** Raideur des brides (N/m) */
    stiffness: number;
    
    /** Amortissement des brides (Ns/m) */
    damping: number;
    
    /** Masse du point de contrôle (kg) */
    controlPointMass: number;
}
```

**Intégration dans `LinesConfig`** :
```typescript
export interface LinesConfig {
    // ... paramètres existants
    bridles: BridlesConfig;  // 🎯 NOUVEAUTÉ
}
```

**Valeurs par défaut** (dans `DEFAULT_CONFIG`) :
```typescript
bridles: {
    stiffness: 5000,  // N/m - Brides rigides
    damping: 20,      // Ns/m
    controlPointMass: 0.01,  // kg (~10g)
}
```

### 4. Intégration dans `Simulation.ts`

**Modification unique** : Passer la config des brides au constructeur de `LineForceCalculator`
```typescript
const lineCalculator = new LineForceCalculator(
    this.kite,
    winchPositions,
    {
        stiffness: this.config.lines.stiffness,
        // ... autres paramètres lignes
    },
    this.config.lines.bridles  // 🎯 NOUVEAUTÉ : Config brides
);
```

**Aucune modification dans `PhysicsEngine`** : La refactorisation est **transparente** grâce à l'interface `ILineForceCalculator`.

---

## 📊 Impact sur la physique

### Forces appliquées

**Avant** :
- Force ligne = `F_ligne` appliquée au CoM
- Couple = `(point_controle - CoM) × F_ligne`

**Après** :
- Force totale = `F_nez + F_traverse + F_centre` (répartie selon géométrie des brides)
- Couple total = `Σ[(point_attache - CoM) × F_attache]` pour 3 points

### Comportements émergents attendus

✅ **Couple plus réaliste** : La géométrie des 3 brides crée un couple naturel  
✅ **Effet de "levier"** : Les points d'attache éloignés du CoM génèrent plus de couple  
✅ **Stabilité différente** : Les brides rigides (k=5000 N/m) limitent les oscillations  
✅ **Tensions visibles** : On peut maintenant logger les tensions dans chaque bride

---

## 🧪 Tests et validation

### Checklist de tests visuels (hot reload actif)

**Vent faible (5 m/s)** :
- [ ] Vol stable sans oscillations
- [ ] Tensions brides cohérentes (0.5-5N par bride)
- [ ] Couple des lignes non nul mais faible

**Vent moyen (10 m/s)** :
- [ ] Réactivité aux commandes maintenue
- [ ] Tensions brides augmentent proportionnellement (5-20N)
- [ ] Couple suffisant pour rotations

**Vent fort (15 m/s)** :
- [ ] Pas d'explosion numérique (brides rigides)
- [ ] Tensions brides élevées mais contrôlées (<50N)
- [ ] Cerf-volant stable sur sphère de vol

**Autopilote ZENITH** :
- [ ] Convergence vers zénith maintenue
- [ ] Symétrie des tensions brides G/D
- [ ] Couple s'annule au zénith (équilibre)

**Commandes manuelles** :
- [ ] Delta gauche → tensions asymétriques → couple rotation
- [ ] Retour centre → symétrie restaurée
- [ ] Pas de vibrations induites par les brides

### Logs à surveiller

```typescript
// Dans la console navigateur :
- Tensions lignes G/D (existant)
- Tensions brides NEZ/TRAVERSE/CENTRE (nouveau)
- Couple total des lignes (doit être non nul)
- Forces aéro/gravité/lignes (vérifier cohérence)
```

### Métriques de stabilité

**Tensions normales** :
- Lignes : 0.5N (slack) à 20N (tendu)
- Brides : 0.5N à 15N par bride (rigides)

**Signes d'instabilité** :
- Variations > 50N/frame
- Tensions = 0 ou NaN
- Oscillations haute fréquence (>10 Hz)

---

## 🔍 Debug et visualisation

### Points de contrôle ajoutés

**Dans `BridleSystem`** :
- `BridleForceResult` contient forces/tensions détaillées
- Peut être exposé via `PhysicsEngine.getLastForces()` pour visualisation

**Future amélioration** (non implémentée) :
- Ajouter un visualiseur `BridleVisualizer` pour afficher :
  - Les 3 brides en 3D (lignes colorées)
  - Tensions affichées (épaisseur/couleur)
  - Vecteurs de force aux points d'attache

---

## 📁 Fichiers modifiés

**Nouveaux fichiers** :
- `src/domain/physics/BridleSystem.ts` (nouvelle classe)
- `REFACTORING_BRIDLES.md` (ce document)

**Fichiers modifiés** :
- `src/domain/physics/forces/LineForce.ts` (intégration `BridleSystem`)
- `src/core/SimulationConfig.ts` (ajout `BridlesConfig`)
- `src/core/Simulation.ts` (passage config brides)

**Fichiers inchangés** :
- `src/domain/physics/PhysicsEngine.ts` (interface respectée)
- `src/domain/kite/KiteGeometry.ts` (géométrie déjà définie)
- Tous les visualiseurs (changement transparent)

---

## 🎓 Principes appliqués

**Clean Architecture** : 
- `BridleSystem` dans `domain/physics` (logique métier pure)
- Configuration centralisée dans `core`
- Couplage via interfaces (`ILineForceCalculator`)

**SOLID** :
- **S** : `BridleSystem` a une seule responsabilité (transmission brides)
- **O** : Extensible sans modifier `PhysicsEngine`
- **D** : Injection de dépendances (`Kite` injecté dans `BridleSystem`)

**Réalisme physique** :
- Valeurs basées sur matériaux réels (kevlar/dyneema)
- Modèle ressort-amortisseur cohérent
- Pas de "magic numbers"

---

## 🚀 Prochaines étapes

**Court terme** (cette session) :
1. ✅ Refactoring complet (fait)
2. 🔄 Tests visuels avec hot reload
3. 📊 Analyse des tensions/couples dans les logs

**Moyen terme** :
1. Visualiseur de brides (`BridleVisualizer`)
2. Affichage tensions dans UI (panneau debug)
3. Mode debug "bridles only" (désactiver aéro/gravité pour isoler)

**Long terme** :
1. Élasticité des brides (modèle non-linéaire)
2. Masse répartie sur les brides (pas juste aux extrémités)
3. Simulation déformation toile (couplage brides-panneaux)

---

## 📚 Références

**Documentation interne** :
- `.github/copilot-instructions.md` : Principe du pendule 3D
- `VALEURS_PHYSIQUES.md` : Justification paramètres physiques
- `CORRECTION_LIGNES_RIGIDES.md` : Historique corrections lignes

**Physique des cerfs-volants** :
- Trilatération 3D (déjà implémentée dans `KiteGeometry`)
- Dynamique des corps rigides sous contraintes
- Modèle ressort-amortisseur (Hooke + friction)

---

**Status** : ✅ Refactoring complet terminé - Prêt pour tests
