# Refactorisation Majeure : Système de Brides par Contraintes Géométriques

**Date :** 6 novembre 2025  
**Branche :** feat/lift-debug-mode  
**Impact :** 🔴 CRITIQUE - Changement architectural fondamental

---

## 🎯 Problème Identifié

### Erreur Conceptuelle Majeure

Le point de contrôle (jonction ligne-brides) était traité comme **solidaire de la structure** du cerf-volant, alors qu'il devrait être un **point flottant** déterminé par des contraintes géométriques.

### Impact Physique

Avec une rotation de 90° du kite :
- **Déplacement parasite** du point de contrôle : ~0.65m
- **Force parasite générée** : ~1300 N (avec k=2000 N/m)
- **Poids du kite** : 2.45 N

→ Les forces parasites étaient **500× plus grandes** que le poids du cerf-volant !

Cela expliquait :
- Instabilités majeures lors des rotations
- Oscillations incontrôlables des lignes
- Comportement non-physique du système

---

## 🔧 Solution Implémentée

### Nouveau Modèle : Résolution de Contraintes

Le point de contrôle est maintenant calculé dynamiquement pour satisfaire **4 contraintes simultanées** :

1. **Distance au treuil** = longueur ligne
2. **Distance au NEZ** = longueur bride 1
3. **Distance au TRAVERSE** = longueur bride 2
4. **Distance au CENTRE** = longueur bride 3

### Méthodes Implémentées

#### 1. `resolveControlPointPosition()` - Solveur de Contraintes

**Algorithme :** Newton-Raphson avec descent de gradient

```typescript
// Fonction d'erreur à minimiser :
E(P) = w_line × (|P - W| - L_line)² + 
       Σ(|P - A_i| - L_i)²

// Gradient :
∇E = 2 × Σ(error_i × direction_i)

// Mise à jour itérative :
P_new = P - α × ∇E
```

**Paramètres de configuration :**
- `maxIterations: 20` - Nombre max d'itérations
- `convergenceTolerance: 0.001m` - Tolérance 1mm
- `relaxationFactor: 0.7` - Facteur de stabilité
- `lineConstraintWeight: 2.0` - Priorité ligne vs brides

#### 2. `solveBridleTensions()` - Distribution des Forces

**Principe :** Résolution système linéaire 3×3 pour conservation de la force

```typescript
// Système à résoudre :
// T1 × dir1 + T2 × dir2 + T3 × dir3 = -F_ligne

// Forme matricielle :
// [dir1_x  dir2_x  dir3_x] [T1]   [-Fx]
// [dir1_y  dir2_y  dir3_y] [T2] = [-Fy]
// [dir1_z  dir2_z  dir3_z] [T3]   [-Fz]
```

**Méthode :** Inversion matrice 3×3 avec vérification du déterminant

---

## 📁 Fichiers Modifiés

### 1. `src/domain/physics/BridleSystem.ts` ⚠️ MAJEUR

**Nouvelles méthodes :**
- `resolveControlPointPosition()` - Solveur contraintes géométriques
- `solveBridleTensions()` - Résolution système linéaire 3×3
- `trilaterationEstimate()` - Estimation initiale (intersection 3 sphères)

**Méthode refactorisée :**
- `calculateBridleForces()` - Utilise nouvelle approche :
  1. Résoudre position P du point de contrôle
  2. Calculer tensions par système linéaire
  3. Appliquer forces et calculer couple

**Diagnostics ajoutés :**
- Comparaison position résolue vs position solidaire (ancienne)
- Vérification erreurs de contraintes géométriques
- Log conservation de force (erreur > 0.1 N)

### 2. `src/domain/physics/forces/LineForce.ts`

**Modifications :**
- `LineForceCalculator.calculate()` adapté pour nouvelle interface
- Passage position précédente du point de contrôle (warm start)
- Gestion état initial (pas de position précédente)

### 3. `src/core/SimulationConfig.ts`

**Interface `BridlesConfig` remplacée :**

```typescript
// ❌ ANCIEN (modèle ressort)
interface BridlesConfig {
    stiffness: number;    // N/m
    damping: number;      // Ns/m
    controlPointMass: number; // kg
}

// ✅ NOUVEAU (résolution contraintes)
interface BridlesConfig {
    maxIterations: number;        // Itérations solveur
    convergenceTolerance: number; // m - Tolérance
    relaxationFactor: number;     // 0-1 - Stabilité
    lineConstraintWeight: number; // Priorité ligne
}
```

**Configuration par défaut :**
```typescript
bridles: {
    maxIterations: 20,
    convergenceTolerance: 0.001,  // 1mm
    relaxationFactor: 0.7,
    lineConstraintWeight: 2.0
}
```

### 4. `src/core/Simulation.ts`

**Corrections mineures :**
- Ajout propriétés manquantes : `geometryDebugPosition`, `liftDebugPosition`

---

## 🔍 Diagnostics Implémentés

### 1. Correction Position Contrôle

```javascript
console.log('[BridleSystem] Correction position contrôle:', {
    differenceMeters: 0.650,  // Différence significative !
    resolved: { x: 0.123, y: 7.456, z: 9.789 },
    solidary: { x: -0.527, y: 7.456, z: 9.789 }
});
```

### 2. Erreurs de Contraintes

```javascript
console.warn('[BridleSystem] Erreur contraintes élevée:', {
    maxError: 0.0025,
    details: {
        line: 0.0010,
        nose: 0.0025,
        intermediate: 0.0015,
        center: 0.0008
    }
});
```

### 3. Conservation de Force

```javascript
console.warn('[BridleSystem] Erreur conservation force:', 0.15, 'N');
// Force totale brides ≠ -Force ligne
```

---

## 📊 Résultats Attendus

### Amélioration de Stabilité

- **Élimination forces parasites** : Pas de tension liée à la rotation du kite
- **Comportement physique réaliste** : Point de contrôle suit contraintes géométriques
- **Réponse cohérente** : Tensions calculées par équilibre statique

### Métriques de Validation

À observer dans les logs après implémentation :

1. **Différence position** :
   - Avant rotation : < 0.01m (acceptable)
   - Pendant rotation 90° : ~0.65m (correction massive !)

2. **Erreurs contraintes** :
   - Cible : < 0.001m (tolérance)
   - Acceptable : < 0.002m

3. **Conservation force** :
   - Idéal : < 0.01 N
   - Acceptable : < 0.1 N

4. **Tensions brides** :
   - Toutes positives (pas de compression)
   - Somme vectorielle = -Force ligne (conservation)

---

## 🚀 Test et Validation

### Procédure

1. **Hot Reload actif** : Le serveur Vite recharge automatiquement
2. **Observer console browser** : Logs diagnostics visibles
3. **Tester scénarios critiques** :
   - Vol stable (lignes égales)
   - Virage serré (asymétrie forte)
   - Rotation 90° (test stress)
   - Montée vers zénith

### Signaux de Succès

✅ **Position contrôle corrigée** : Différence significative en rotation  
✅ **Contraintes satisfaites** : Erreur < tolérance  
✅ **Force conservée** : Erreur < 0.1 N  
✅ **Stabilité améliorée** : Moins d'oscillations parasites  

### Signaux d'Échec

❌ **Non-convergence** : Erreur contraintes > tolérance  
❌ **Tensions négatives** : Brides en compression (non-physique)  
❌ **Force non-conservée** : Erreur > 1 N  
❌ **Déterminant nul** : Système linéaire singulier  

---

## 📝 Notes Techniques

### Choix de Newton-Raphson

- **Convergence rapide** : Quadratique près de la solution
- **Robuste** : Fonctionne même si guess initial imparfait
- **Relaxation** : Évite divergence (α=0.7)

### Trilatération comme Warm Start

- **Estimation analytique** : Intersection 3 sphères (brides)
- **Bon point départ** : Proche de la solution finale
- **Fallback** : Si pas de position précédente

### Gestion Cas Singuliers

1. **Déterminant proche de 0** : Directions colinéaires
   - Solution : Vérifier `|det| > 1e-6`
   - Fallback : Retourner null, forcer distribution égale

2. **Tensions négatives** : Non-physique (compression)
   - Solution : Logger warning, saturer à 0
   - Investigation : Géométrie ou forces incohérentes

3. **Non-convergence solveur** : Max itérations atteint
   - Solution : Logger warning, retourner dernière position
   - Investigation : Augmenter maxIterations ou relaxation

---

## 🔄 Prochaines Étapes

1. **Tester en conditions réelles** → Observation browser avec hot reload
2. **Affiner paramètres solveur** → Si convergence lente ou instable
3. **Optimiser performance** → Si calculs trop coûteux (peu probable)
4. **Documenter comportements** → Créer guide validation physique

---

## 📚 Références

- **Newton-Raphson** : Méthode optimisation non-linéaire
- **Trilatération** : Géométrie analytique (GPS, etc.)
- **Systèmes linéaires** : Algèbre matricielle (Cramer, Gauss)
- **Contraintes géométriques** : Simulations rigged bodies

---

**Conclusion :** Cette refactorisation corrige une erreur conceptuelle fondamentale qui causait des forces parasites 500× plus grandes que le poids du cerf-volant. Le nouveau modèle par contraintes géométriques est physiquement correct et devrait éliminer les instabilités majeures observées.
