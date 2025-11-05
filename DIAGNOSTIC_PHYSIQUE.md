# Diagnostic Physique - Simulation Cerf-Volant

## 🔴 Problème Observé

**Symptômes:**
- Accélération : **12000-18000 m/s²** (1200-1800G) ❌
- Force aérodynamique totale : **5000N** ❌
- Vitesse du kite : **15 m/s** (atteint limite max instantanément) ❌
- Tensions lignes : **31-60N** ✓ (ordre de grandeur correct)

**Paramètres:**
- Masse kite : 0.3kg
- Vent : 3 m/s
- Surface totale : ~1.07m² (envergure 1.65m × hauteur 0.65m)

## 🎯 Ordres de Grandeur Réalistes

Pour un cerf-volant acrobatique de 0.3kg avec vent de 3 m/s :

| Paramètre | Valeur Actuelle | Valeur Attendue | Facteur d'Erreur |
|-----------|----------------|-----------------|------------------|
| Force aéro | **5000N** | 5-30N | **×200** |
| Accélération | **16000 m/s²** | 10-50 m/s² | **×300** |
| Vitesse kite | **15 m/s** | 0-8 m/s | **×2** |

## 🐛 Bugs Identifiés

### 1. **Calcul Aérodynamique (CRITIQUE)**

**Fichier:** `src/domain/physics/forces/AerodynamicForce.ts:159`

```typescript
// ❌ PROBLÈME: Cumul des surfaces au lieu de répartition
const pressure = 0.5 * this.config.airDensity * windSpeed * windSpeed * panelArea;
```

**Analyse:**
- Le code calcule la force pour **chaque panneau** avec sa surface propre
- Les 4 panneaux ont chacun ~0.27m² (total = 1.07m²)
- En sommant les forces de tous les panneaux, on **compte la surface plusieurs fois**
- Avec vent de 3 m/s et Cl=0.3, Cd=0.15 :
  - Force par panneau : 0.5 × 1.225 × 9 × 0.27 × 0.45 ≈ 0.67N ✓
  - Force totale (4 panneaux) : 4 × 0.67 = 2.7N ✓ **COHÉRENT !**

**Mais pourquoi 5000N alors ?**

Le problème vient de la **vitesse apparente du vent** :
```typescript
// Ligne 67: Calcul du vent apparent
const apparentWind = wind.velocity.clone().sub(state.velocity);
```

Si `state.velocity = (0, 1.8, 14.9)` et `wind.velocity = (0, 0, 3)` :
- `apparentWind = (0, 0, 3) - (0, 1.8, 14.9) = (0, -1.8, -11.9)`
- `windSpeed = |apparentWind| = √(1.8² + 11.9²) = 12.03 m/s`

Avec vitesse de **12 m/s au lieu de 3 m/s** :
- Force = 0.5 × 1.225 × 12² × 1.07 × 0.45 ≈ **42N** (plus cohérent)

**Mais on a toujours 5000N observé !** Il y a un autre problème...

### 2. **Coefficients Aérodynamiques**

Les coefficients de référence dans `SimulationConfig.ts` :
```typescript
liftCoefficient: 0.3,   // Réduit de 1.2 → 0.3
dragCoefficient: 0.15,  // Réduit de 0.5 → 0.15
```

Mais dans `AerodynamicForceCalculator.ts`, les **valeurs par défaut** sont :
```typescript
referenceLiftCoefficient: config?.referenceLiftCoefficient ?? 1.2,  // ❌ Défaut = 1.2
referenceDragCoefficient: config?.referenceDragCoefficient ?? 0.5,  // ❌ Défaut = 0.5
```

**Vérifier que la config est bien passée !**

### 3. **Boucle de Rétroaction Positive**

1. Forces élevées → Accélération énorme
2. Vitesse augmente → Vitesse apparente augmente
3. Vitesse apparente élevée → Forces encore plus élevées
4. Plafonnement à `maxVelocity=15m/s`
5. À 15 m/s, forces deviennent gigantesques

## ✅ Solution Globale

### Phase 1 : Vérifier l'Injection de Config

Vérifier dans `Simulation.ts` que les coefficients sont bien passés au calculateur :

```typescript
// À vérifier
const aerodynamicCalculator = new AerodynamicForceCalculator(this.kite, {
    airDensity: this.config.physics.airDensity,
    referenceLiftCoefficient: this.config.kite.liftCoefficient,  // ← Doit être présent !
    referenceDragCoefficient: this.config.kite.dragCoefficient,  // ← Doit être présent !
});
```

### Phase 2 : Simplifier le Modèle Aérodynamique

**Option A : Correction par Panneau (actuel amélioré)**
- Garder le calcul par panneau
- Vérifier que les surfaces ne sont pas dupliquées
- S'assurer que la somme des surfaces = surface totale

**Option B : Modèle Simplifié Global (recommandé)**
- Utiliser **une seule normale** (orientation globale du kite)
- Utiliser la **surface totale** directement
- Calcul simple et robuste :
```typescript
const totalArea = kite.getTotalArea();
const kiteFrontNormal = kite.getGlobalOrientation(); // Normale avant du kite
const apparentWind = wind.velocity.clone().sub(state.velocity);
const windSpeed = apparentWind.length();
const windDir = apparentWind.clone().normalize();

const alpha = Math.asin(Math.abs(kiteFrontNormal.dot(windDir)));
const Cl = getLiftCoefficient(alpha);
const Cd = getDragCoefficient(alpha);

const pressure = 0.5 * airDensity * windSpeed² * totalArea;
const lift = kiteFrontNormal × (pressure × Cl);
const drag = -windDir × (pressure × Cd);
const totalForce = lift + drag;
```

### Phase 3 : Calibration des Paramètres

**Objectifs réalistes:**
- Vent 3 m/s → Forces 5-15N
- Vent 7 m/s → Forces 20-80N
- Accélérations < 100 m/s²
- Vitesses kite < 10 m/s

**Paramètres recommandés:**
```typescript
kite: {
    mass: 0.3,              // ✓ Correct
    liftCoefficient: 0.6,   // Augmenter (0.3 → 0.6) pour force suffisante
    dragCoefficient: 0.3,   // Augmenter (0.15 → 0.3)
}

physics: {
    dampingFactor: 0.98,    // Réduire (0.995 → 0.98) pour dissipation
    maxVelocity: 20,        // Augmenter (15 → 20) mais ne devrait pas atteindre
}

lines: {
    stiffness: 50,          // Augmenter (1 → 50) une fois aéro corrigé
    damping: 30,            // Réduire (50 → 30)
}
```

## 📋 Plan d'Action

1. ✅ **Diagnostiquer** : Vérifier injection des coefficients dans Simulation.ts
2. 🔧 **Corriger** : Soit bug injection, soit simplifier modèle aéro
3. 🎯 **Calibrer** : Ajuster paramètres pour ordres de grandeur réalistes
4. ✓ **Valider** : Vérifier avec vent 3 m/s → forces 10-20N, accélérations < 50 m/s²

## 🧮 Calculs de Référence

**Formule de base:**
```
F_aero = 0.5 × ρ × v_apparent² × S × (Cl + Cd)
```

**Exemple vent 3 m/s, kite stationnaire:**
- ρ = 1.225 kg/m³
- v = 3 m/s
- S = 1.07 m²
- Cl + Cd = 0.9
- F = 0.5 × 1.225 × 9 × 1.07 × 0.9 = **5.3N** ✓

**Exemple vent 7 m/s:**
- F = 0.5 × 1.225 × 49 × 1.07 × 0.9 = **28.8N** ✓

**Accélération résultante (vent 7 m/s):**
- a = F/m = 28.8 / 0.3 = **96 m/s²** ≈ 10G (limite haute acceptable)
