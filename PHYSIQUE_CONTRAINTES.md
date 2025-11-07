# Physique avec Contraintes - Cerf-Volant Pendule 3D

## Problème fondamental

Le cerf-volant est un **système couplé** où :
- Les **forces aérodynamiques** dépendent de la **position/orientation** des panneaux
- La **position/orientation** dépend des **forces** (intégration)
- Les **lignes** imposent des **contraintes géométriques** strictes

### Cercle vicieux classique

```
Position(t) → Forces aéro → Accélération → Position(t+dt) → Contraintes → Position corrigée
    ↑                                                                            ↓
    └────────────────────── Incohérence si contraintes fortes ──────────────────┘
```

**Conséquence** : Si on calcule les forces aéro sur une position **non contrainte**, la géométrie peut être impossible (panneaux au-delà de la longueur des lignes) → forces irréalistes → explosion numérique.

## Architecture du système

```
SYSTÈME PHYSIQUE COMPLET :
┌─────────────────────────────────────────────────────────────┐
│  TREUILS (fixes à l'origine)                                │
│    ├── Ligne gauche (longueur L_g)                          │
│    └── Ligne droite (longueur L_d)                          │
│                                                              │
│  POINTS DE CONTRÔLE (contraints par lignes)                 │
│    ├── Contrôle gauche (distance = L_g du treuil)           │
│    └── Contrôle droit (distance = L_d du treuil)            │
│                                                              │
│  SYSTÈME DE BRIDES (6 brides, longueurs fixes)              │
│    ├── 3 brides gauches : Nez, Traverse, Centre             │
│    └── 3 brides droites : Nez, Traverse, Centre             │
│                                                              │
│  STRUCTURE RIGIDE (cerf-volant)                             │
│    ├── Géométrie : 4 panneaux, barres rigides               │
│    ├── Masse : 0.25 kg                                      │
│    └── Inertie : Calculée dynamiquement                     │
│                                                              │
│  FORCES EXTERNES                                             │
│    ├── Aérodynamiques : Portance + Traînée (par panneau)    │
│    ├── Gravité : 9.81 m/s² vers le bas                      │
│    └── Lignes : Rappel élastique k=2000 N/m                 │
└─────────────────────────────────────────────────────────────┘
```

## Contraintes géométriques

### Type de contraintes

1. **Contraintes de distance (lignes)** : Égalité stricte
   - `distance(treuil_gauche, contrôle_gauche) = L_g`
   - `distance(treuil_droit, contrôle_droit) = L_d`

2. **Contraintes de distance (brides)** : Égalité stricte
   - `distance(contrôle_gauche, nez) = bride_nez`
   - `distance(contrôle_gauche, traverse) = bride_traverse`
   - `distance(contrôle_gauche, centre) = bride_centre`
   - Idem pour le côté droit

3. **Contraintes de rigidité (structure)** : Implicite
   - La géométrie du kite est rigide (barres incompressibles)
   - Représentée par position + orientation (quaternion)

## Solution : Position-Based Dynamics (PBD) Hybride

### Principe général

Au lieu de résoudre `F = ma` directement avec des contraintes fortes (instable), on :
1. Calcule les forces **sans contraintes** (approche variationnelle)
2. Intègre librement pour obtenir une position **candidate**
3. **Projette** cette position sur les contraintes géométriques
4. Déduit la vélocité finale de la correction de position

### Avantages pour le cerf-volant

- ✅ **Stabilité garantie** : Pas d'explosion même avec contraintes rigides
- ✅ **Cohérence géométrique** : Lignes toujours à la bonne longueur
- ✅ **Performance** : O(1) itérations au lieu de O(n) avec solveur implicite
- ✅ **Simplicité** : Pas de matrice jacobienne ou de dérivées

### Inconvénient acceptable

- ⚠️ Erreur O(dt²) sur les forces aéro (calculées sur position non contrainte)
- **MAIS** : À 240 Hz (dt = 4.17 ms), cette erreur est **négligeable**
- **ET** : L'alternative (itérations) coûte 10× plus cher pour gain minime

## Algorithme détaillé

### Étape 1 : Prédiction (forces sans contraintes)

```typescript
// Calculer forces sur position actuelle (libre)
const aeroForces = calculateAerodynamic(currentState, wind)
const gravityForces = calculateGravity(currentState)

// Intégration libre (Verlet)
predictedState.velocity = currentState.velocity + (aeroForces + gravityForces) / mass * dt
predictedState.position = currentState.position + predictedState.velocity * dt
predictedState.orientation = integrateRotation(currentState.orientation, currentState.angularVelocity, dt)
```

**État** : Position prédite **sans** contraintes de lignes

### Étape 2 : Projection sur contraintes (géométrique)

```typescript
// A. Résoudre position des points de contrôle (contraints par lignes + brides)
const leftControlPoint = solveControlPointPosition(
  winchLeft,
  predictedState,
  leftLineLength,
  bridleLengths
)

const rightControlPoint = solveControlPointPosition(
  winchRight,
  predictedState,
  rightLineLength,
  bridleLengths
)

// B. Corriger position du centre de masse pour respecter les brides
// Les brides relient les points de contrôle à la structure rigide
// → Le centre de masse doit être cohérent avec ces contraintes
const correction = calculatePositionCorrection(
  predictedState,
  leftControlPoint,
  rightControlPoint,
  bridleGeometry
)

constrainedState.position = predictedState.position + correction
```

**État** : Position respectant les contraintes géométriques

### Étape 3 : Calcul des forces de rappel (lignes)

```typescript
// Calculer les forces de rappel élastique sur position contrainte
const lineForces = calculateLineForces(
  constrainedState,
  leftControlPoint,
  rightControlPoint,
  lineStiffness,
  lineDamping
)
```

**Raison** : Les lignes exercent une force de rappel (ressort) même quand la contrainte est satisfaite, due à la vélocité radiale.

### Étape 4 : Correction de vélocité (PBD)

```typescript
// Vélocité corrigée = déplacement réel / dt
// (inclut implicitement les impulsions des contraintes)
constrainedState.velocity = (constrainedState.position - currentState.position) / dt

// Ajouter impulsion des forces de lignes
constrainedState.velocity += lineForces / mass * dt

// Correction angulaire similaire
const deltaRotation = constrainedState.orientation * currentState.orientation.inverse()
constrainedState.angularVelocity = 2 * deltaRotation.axis * deltaRotation.angle / dt
constrainedState.angularVelocity += lineTorque / inertia * dt
```

**État final** : Vélocité cohérente avec position contrainte + forces de lignes

### Étape 5 : Contrainte de collision sol

```typescript
// Application triviale (pas de couplage avec lignes)
if (lowestPoint.y < 0) {
  constrainedState.position.y += penetrationDepth
  constrainedState.velocity.y *= -restitution
}
```

## Implémentation dans PhysicsEngine

### Structure de PhysicsEngine.update()

```typescript
update(deltaTime: number, controlDelta: number): SimulationState {
  const dt = this.fixedDeltaTime ?? deltaTime
  const currentState = this.kite.getState()

  // ════════════════════════════════════════════════════════════
  // PHASE 1 : PRÉDICTION LIBRE (sans contraintes)
  // ════════════════════════════════════════════════════════════
  
  // 1.1 Calculer forces sur position actuelle
  const aeroResult = this.calculateAerodynamicForces(currentState)
  const gravityForce = this.calculateGravityForce(currentState)
  
  // 1.2 Intégration libre (Verlet)
  const predictedState = this.integrator.integrate(
    currentState,
    aeroResult.total + gravityForce,
    aeroResult.torque + gravityTorque,
    dt,
    mass
  )

  // ════════════════════════════════════════════════════════════
  // PHASE 2 : PROJECTION SUR CONTRAINTES
  // ════════════════════════════════════════════════════════════
  
  // 2.1 Résoudre position des points de contrôle (lignes + brides)
  const controlPoints = this.resolveControlPointConstraints(
    predictedState,
    controlDelta
  )
  
  // 2.2 Corriger position centre de masse (cohérence brides)
  const constrainedState = this.projectOnBridleConstraints(
    predictedState,
    controlPoints
  )

  // ════════════════════════════════════════════════════════════
  // PHASE 3 : FORCES DE RAPPEL (sur position contrainte)
  // ════════════════════════════════════════════════════════════
  
  const lineResult = this.calculateLineForces(
    constrainedState,
    controlPoints
  )

  // ════════════════════════════════════════════════════════════
  // PHASE 4 : CORRECTION DE VÉLOCITÉ (PBD)
  // ════════════════════════════════════════════════════════════
  
  this.correctVelocity(
    constrainedState,
    currentState,
    lineResult,
    dt
  )

  // ════════════════════════════════════════════════════════════
  // PHASE 5 : CONTRAINTE SOL
  // ════════════════════════════════════════════════════════════
  
  this.applyGroundConstraint(constrainedState)

  // Mise à jour état
  this.kite.setState(constrainedState)
  
  return this.buildSimulationState(constrainedState, dt)
}
```

## Comparaison avec l'approche actuelle

### Actuellement (INSTABLE)

```
Calcul aéro(position_libre) → Calcul lignes(position_libre) → Intégration → Position finale
```

❌ Les forces aéro sont calculées sur une géométrie qui peut violer les contraintes
❌ La position finale peut être incohérente avec les forces calculées

### Avec PBD (STABLE)

```
Calcul aéro(position_actuelle) → Intégration libre → Projection contraintes → Correction vélocité
```

✅ Les forces aéro sont calculées sur la position réelle actuelle (cohérente)
✅ La position finale respecte toujours les contraintes géométriques
✅ La vélocité est corrigée pour refléter les impulsions des contraintes

## Paramètres de stabilité

### Critères de convergence (résolution contraintes)

- **Tolérance position** : 1 mm (0.001 m)
- **Itérations max** : 20 (Newton-Raphson)
- **Relaxation** : 0.85 (évite oscillations)

### Garde-fous numériques

- **Force max par panneau** : 200 N (saturation)
- **Tension max ligne** : 400 N (limite physique Dyneema)
- **Vitesse max** : 30 m/s (limite sécurité)
- **Vitesse angulaire max** : 10 rad/s (limite sécurité)

## Références

- **Position-Based Dynamics** : Müller et al. (2007) - "Position Based Dynamics"
- **Contraintes géométriques** : Jakobsen (2001) - "Advanced Character Physics"
- **Pendule sphérique** : Goldstein - "Classical Mechanics" (Chapitre 1)
