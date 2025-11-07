# Correction Critique : Inversion de Portance en Altitude

## Date : 7 Novembre 2025

## Symptôme observé

- ✅ Comportement stable **au sol** (basses altitudes, faibles vitesses)
- ❌ **Explosion numérique** dès que le cerf-volant **monte en altitude**
- Comportement progressif : plus il monte, plus les forces deviennent instables

## Cause racine identifiée

### Problème physique

Un **panneau de cerf-volant** génère de la portance différemment selon **quelle face reçoit le vent** :

```
INTRADOS (face avant) reçoit le vent :
┌─────────────────┐
│   ╱╱╱  VENT →  │  Normale →
│                 │  
└─────────────────┘
normalWindComponent = normale·vent > 0
→ Portance NORMALE (pousse le kite vers le haut/avant)
```

```
EXTRADOS (face arrière) reçoit le vent :
┌─────────────────┐
│  ← Normale      │  ← VENT  ╱╱╱
│                 │  
└─────────────────┘
normalWindComponent = normale·vent < 0
→ Portance INVERSÉE (pousse le kite vers le bas/arrière) ⚠️
```

### Boucle d'instabilité en altitude

1. **Phase initiale** : Cerf-volant monte normalement, vitesse augmente
2. **Perturbation** : Petite rotation du cerf-volant (normale, due au pilotage/turbulence)
3. **Point critique** : Un ou plusieurs panneaux se retrouvent "à l'envers" (extrados face au vent)
4. **Inversion de portance** : Ces panneaux génèrent une force **opposée** à celle attendue
5. **Couple déstabilisant** : Forces asymétriques → rotation excessive
6. **Emballement** : Plus il tourne, plus les panneaux sont mal orientés → explosion

### Erreur de code

**Avant correction** :

```typescript
const normalWindComponent = panelNormal.dot(windDirection);
const alpha = Math.asin(Math.min(1, Math.abs(normalWindComponent)));
// ❌ abs() perd le SIGNE → on ne sait pas si panneau est à l'envers !

const Cl = this.getLiftCoefficient(alpha); // ❌ Portance calculée même si à l'envers
```

**Conséquence** : Un panneau à l'envers générait la même portance qu'un panneau correctement orienté, mais dans la **mauvaise direction** !

## Solution implémentée

### Facteur d'orientation

Ajout d'un **facteur d'orientation** qui module la portance selon l'alignement du panneau avec le vent :

```typescript
const normalWindComponent = panelNormal.dot(windDirection);

// Facteur d'orientation : 
// - 1.0 si normale parallèle au vent (face au vent)
// - 0.0 si normale perpendiculaire ou opposée (à l'envers)
const orientationFactor = Math.max(0, normalWindComponent);

// Angle d'attaque géométrique (toujours positif)
const alpha = Math.asin(Math.min(1, Math.abs(normalWindComponent)));

// Portance modulée par orientation
const Cl = this.getLiftCoefficient(alpha) * orientationFactor; // ✅

// Traînée non modulée (toujours présente)
const Cd = this.getDragCoefficient(alpha);
```

### Comportement physique résultant

| Orientation panneau | normalWindComponent | orientationFactor | Portance |
|---------------------|---------------------|-------------------|----------|
| Face au vent (90°)  | +1.0                | 1.0               | 100%     |
| Incliné (45°)       | +0.707              | 0.707             | 70%      |
| Parallèle (0°)      | 0.0                 | 0.0               | 0%       |
| À l'envers (-45°)   | -0.707              | 0.0               | **0%** ✅ |
| À l'envers (-90°)   | -1.0                | 0.0               | **0%** ✅ |

**Résultat** : Un panneau mal orienté (extrados face au vent) génère **portance nulle** au lieu d'une portance inversée → pas de déstabilisation explosive.

## Physique justifiant la correction

### Réalisme aérodynamique

En réalité, un profil aérodynamique **décroche** (stall) si l'angle d'attaque devient trop négatif :

- **α > 0** (intrados face au vent) : Portance croissante jusqu'à α_max ≈ 15-20°
- **α ≈ 0** : Pas de portance (flux tangent)
- **α < 0** (extrados face au vent) : **Décrochage** → portance faible/nulle, vortex turbulents

Notre correction (`orientationFactor = max(0, normalWindComponent)`) simule ce décrochage de manière conservative :
- ✅ Évite portance inversée non physique
- ✅ Force transition douce vers portance nulle
- ✅ Traînée reste présente (correcte physiquement)

### Comportement émergent attendu

Avec cette correction, un cerf-volant qui se retourne progressivement :

1. **Perd de la portance** graduellement (orientationFactor → 0)
2. **Conserve la traînée** (résistance au vent)
3. **Subit la gravité** (force vers le bas)
4. **Est rappelé par les lignes** (contrainte géométrique)

→ **Résultante** : Le cerf-volant **redescend** et **se stabilise** au lieu d'exploser.

## Tests de validation

### Test 1 : Stabilité en montée

```bash
# Conditions : Vent 10 m/s, lignes égales, mode autopilote ZENITH
# Attendu : Montée progressive vers zénith sans explosion
# Métriques :
# - Altitude max atteinte > 8m (OK si > limite basse)
# - Tensions lignes < 200 N (pas d'explosion)
# - Orientation stable (pas de flip/rotation excessive)
```

### Test 2 : Récupération après perturbation

```bash
# Conditions : Vent 10 m/s, donner coup de commande brutal puis relâcher
# Attendu : Cerf-volant oscille puis revient à équilibre
# Métriques :
# - Pas de divergence (amplitude oscillations décroît)
# - Retour à orientation normale après < 5s
# - Tensions ne dépassent jamais 300 N
```

### Test 3 : Vent fort

```bash
# Conditions : Vent 15 m/s (forte charge aérodynamique)
# Attendu : Vol stable sans explosion, tensions élevées mais contrôlées
# Métriques :
# - Tensions 150-350 N (élevées mais < maxTension = 400 N)
# - Pas de NaN/Inf
# - Orientation reste cohérente (pas de flip)
```

## Impact sur performances

### Coût computationnel

**Négligeable** : 
- +2 opérations par panneau (dot product déjà calculé, +1 max())
- Pas de branchement conditionnel (max() vectorisable)

### Précision physique

**Amélioration** :
- ✅ Évite portance non physique sur extrados
- ✅ Simule décrochage aérodynamique de manière conservative
- ⚠️ Simplifie transition (réalité : portance négative faible puis nulle)

**Compromis acceptable** : Précision suffisante pour simulation temps réel, évite complexité d'un modèle complet de décrochage.

## Fichiers modifiés

- **`src/domain/physics/forces/AerodynamicForce.ts`**
  - Ligne ~298 : Ajout calcul `orientationFactor`
  - Ligne ~315 : Modulation `Cl` par `orientationFactor`

## Références

- **Aérodynamique des profils** : Anderson, "Fundamentals of Aerodynamics", Ch. 4 (Stall mechanics)
- **Cerf-volant acrobatique** : Portance inversée observée en pratique lors de "backflip" = manœuvre volontaire d'inversion
- **Position-Based Dynamics** : Müller et al. (2007) - Contraintes géométriques préviennent divergence extrême

## Notes additionnelles

### Pourquoi le problème n'apparaissait pas au sol ?

**Basses altitudes** :
- Vitesses faibles (< 3 m/s)
- Forces aérodynamiques faibles (proportionnelles à v²)
- Même si portance inversée, magnitude trop faible pour causer instabilité

**Hautes altitudes** :
- Vitesses élevées (> 8 m/s en montée)
- Forces aérodynamiques **x4 à x9** (v² : 3²=9 vs 9²=81)
- Portance inversée devient **dominante** → explosion

### Relation avec corrections précédentes

Cette correction est **complémentaire** aux précédentes :

1. **Position-Based Dynamics** : Empêche explosion par contraintes géométriques
2. **Normalisation quaternion** : Évite dérive numérique d'orientation
3. **Copie profonde états** : Évite partage de références
4. **Facteur d'orientation** : Évite portance inversée physiquement incorrecte

**Ensemble**, ces corrections forment un système robuste contre les instabilités numériques.
