# Correction Critique : Rigidité des Lignes

## Problème Identifié

**Symptôme** : Explosion numérique malgré valeurs physiques "correctes"
- Accélération : 85 450 m/s² (8700g)
- Forces totales : 25 635 N pour 0.25 kg
- Tensions lignes : 7 714 N (rupture théorique 200-400N)

## Cause Racine

**Lignes trop souples** : k = 500 N/m était 10× trop faible !

### Calcul Réel (Module de Young)

```
k = E × A / L

Où :
- E = 100 GPa (module Young Dyneema)
- A = 0.5 mm² (section ligne 80 lbs)
- L = 10 m

k_théorique = (100 × 10⁹ Pa) × (0.5 × 10⁻⁶ m²) / 10 m
            = 5000 N/m
```

### Conséquence k = 500 N/m (TROP FAIBLE)

Force aéro 60N → Allongement = 60/500 = **0.12m** (1.2%)
→ Cerf-volant s'éloigne continuellement
→ Tensions explosent pour tenter de le retenir
→ **Instabilité systémique**

## Solution Appliquée

### k = 2000 N/m (Compromis Réalisme/Numérique)

**Justification** :
- k=5000 nécessiterait dt < 5ms (200 FPS) pour stabilité
- k=2000 stable à dt=16.7ms (60 FPS) avec lissage 0.8
- Force 60N → Allongement 0.03m (0.3%) → **réaliste !**

### Paramètres Complets

```typescript
stiffness: 2000,              // N/m - 4× augmentation
damping: 10,                  // Ns/m - Amortissement ζ=0.22
smoothingCoefficient: 0.8,    // Lissage maximal
exponentialThreshold: 0.3,    // m - Protection dès 3%
exponentialStiffness: 500,    // N - Protection forte
```

## Validation Théorique

### Équilibre des Forces (Vent 10 m/s)

```
Forces aéro : ~60N (portance + traînée)
Allongement lignes : 0.03m (0.3%)
Tension équilibre : k × Δl = 2000 × 0.03 = 60N ✓
```

### Fréquence Propre Système

```
f = 1/(2π) × √(k/m)
  = 1/(2π) × √(2000/0.25)
  ≈ 14.2 Hz

Période T ≈ 70ms → Échantillonnage 60 FPS (16.7ms) OK
```

## Leçons Apprises

1. **Ne pas sous-estimer les contraintes géométriques**
   - Lignes quasi-rigides ≠ ressorts souples
   - Module de Young donne ordre de grandeur réel

2. **Compromis numérique/physique nécessaire**
   - Théorie : k=5000 N/m
   - Pratique : k=2000 N/m (stabilité 60 FPS)

3. **Lissage numérique essentiel**
   - smoothingCoefficient=0.8 compense rigidité
   - Protection exponentielle évite explosions

## Impact Attendu

Avec k×4 plus rigide :
- ✅ Cerf-volant contraint sur sphère rayon ≈ 10m
- ✅ Tensions réalistes (50-100N en vol normal)
- ✅ Pas d'évasion → pas d'explosion
- ⚠️ Oscillations possibles → compensées par smoothing 0.8

---

**Date** : 5 novembre 2025  
**Itération** : Correction critique rigidité lignes  
**Status** : Build OK - Prêt pour test
