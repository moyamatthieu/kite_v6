# Référence d'Orientation du Cerf-Volant

## ⚠️ Document de Référence Ultime

Ce document centralise **TOUTES** les informations critiques sur l'orientation du cerf-volant. En cas de doute ou de confusion, **revenir ici**.

---

## 1. Système de Coordonnées Global

```
       Y+ (altitude)
        ↑
        |
        |
        |
        +--------→ X+ (droite)
       /
      /
     ↙ Z+ ("sous le vent", derrière le pilote)
```

### Axes
- **X+ = droite** (vue du pilote)
- **Y+ = altitude** (vers le haut)
- **Z+ = "sous le vent"** (derrière le pilote, vers l'horizon)
- **Z- = "face au vent"** (vers le pilote)

### Positions Clés
- **Station de pilotage** : `(0, 0, 0)` - origine du repère
- **Treuils gauche/droit** : `(±0.5, 0, 0)`
- **Cerf-volant initial** : `(0, 8, 10)` - en altitude, "sous le vent"

---

## 2. Le Vent

### Direction
Le vent **souffle depuis Z- vers Z+** (du pilote vers l'horizon) :

```typescript
// Vecteur vélocité du vent
windVelocity = new THREE.Vector3(0, 0, -windSpeed);  // Négatif car souffle vers Z-

// Direction normalisée
windDirection = new THREE.Vector3(0, 0, -1);  // Pointe vers Z-
```

### Interaction avec le Cerf-Volant
- Le vent vient **de Z-** (devant le pilote)
- Le cerf-volant est positionné **en Z+** (derrière le pilote)
- L'**intrados** (face avant) du cerf-volant doit **regarder vers Z-** pour recevoir le vent de face

---

## 3. Orientation du Cerf-Volant

### Principe Fondamental
**Le cerf-volant doit REGARDER vers la station de contrôle (Z-)**

### Géométrie Locale
La géométrie du cerf-volant est définie dans son repère local :
- Avant rotation, le cerf-volant "regarde" naturellement vers Z+ (son repère local)
- Les normales des panneaux pointent vers Z- (intrados) dans le repère local

### Rotation d'Orientation (CRITIQUE)

Pour que le cerf-volant regarde vers Z- dans le repère monde, appliquer :

```typescript
// 1. Rotation de 180° sur l'axe Y (pivot horizontal)
//    Fait pivoter le kite pour qu'il regarde dans la direction opposée
const rotationY = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),  // Axe Y
    Math.PI                       // 180 degrés
);

// 2. Rotation de -15° sur l'axe X (inclinaison)
//    Incline le nez légèrement vers le bas pour angle d'attaque optimal
const rotationX = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),  // Axe X
    -15 * Math.PI / 180           // -15 degrés (négatif = nez vers le bas)
);

// 3. Composition (ORDRE CRITIQUE)
//    D'abord pivoter (Y), puis incliner (X)
const orientation = rotationY.multiply(rotationX);
```

### ⚠️ Ordre des Rotations

**L'ordre est CRUCIAL** : `rotationY.multiply(rotationX)`

- **Mauvais ordre** : Le cerf-volant s'incline dans la mauvaise direction
- **Bon ordre** : Pivot puis inclinaison = comportement attendu

---

## 4. Géométrie des Panneaux

### Ordre des Points
Les panneaux sont définis avec des points en ordre **HORAIRE** vu de face.

### Normales
Avec l'ordre horaire, les normales pointent vers **Z-** (intrados) dans le repère local.

```typescript
// Exemple : Panneau supérieur gauche
['NEZ', 'BAS_COLONNE', 'STAB_GAUCHE', 'TRAVERSE_GAUCHE']
// Ordre HORAIRE → normale vers Z- (intrados)
```

### Vérification
Utiliser le mode debug géométrie pour vérifier :
1. Les normales pointent vers la station
2. Le cerf-volant regarde vers Z-
3. L'intrados est face au vent

---

## 5. Transformations Locale → Globale

### Pour les Points
```typescript
pointGlobal = pointLocal.clone()
    .applyQuaternion(orientation)  // 1) Rotation
    .add(position);                 // 2) Translation
```

### Pour les Normales (vecteurs directionnels)
```typescript
normaleGlobale = normaleLocale.clone()
    .applyQuaternion(orientation)  // Rotation uniquement
    .normalize();                   // Garantir vecteur unitaire
```

### ⚠️ Ordre Obligatoire
1. **Rotation** (`applyQuaternion`)
2. **Translation** (`add` pour les points, pas pour les normales)

**Jamais l'inverse !**

---

## 6. Endroits Critiques dans le Code

### Fichier : `Simulation.ts`

Définition de l'orientation à **4 endroits** :

1. **Constructeur** (ligne ~118-125) : Initialisation
2. **update() - Mode géométrie** (ligne ~348-355) : Mode debug
3. **reset()** (ligne ~635-645) : Réinitialisation
4. **toggleGeometryDebug()** (ligne ~868-877) : Activation mode debug

**Tous doivent utiliser la MÊME rotation** :
```typescript
const rotationY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const rotationX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -15 * Math.PI / 180);
state.orientation.copy(rotationY.multiply(rotationX));
```

### Fichier : `VerletIntegrator.ts`

Intégration de l'orientation (ligne ~85-102) :
- Calcul de la rotation incrémentale depuis la vitesse angulaire
- Composition avec l'orientation actuelle : `orientation.multiply(deltaRotation)`
- **NORMALISATION OBLIGATOIRE** : `orientation.normalize()`

### Fichier : `Kite.ts`

Transformations locale → globale (ligne ~70-110) :
- `getGlobalPointPosition()` : rotation + translation
- `getGlobalPanelCentroid()` : rotation + translation
- `getGlobalPanelNormal()` : rotation uniquement + normalisation

### Fichier : `KiteGeometry.ts`

Définition des panneaux (ligne ~220-242) :
- Ordre **HORAIRE** des points
- Normales vers **Z-** (intrados)

### Fichier : `KiteVisualizer.ts`

Mise à jour visuelle (ligne ~156-161) :
- **Copie directe** de l'orientation depuis le state
- **Pas de rotation supplémentaire**

---

## 7. Tests de Vérification

### Mode Debug Géométrie
1. Activer le mode debug géométrie (touche `G` dans l'UI)
2. Vérifier que le cerf-volant regarde vers Z- (vers la station)
3. Les normales doivent pointer vers la station
4. Les points de contrôle doivent être visibles à l'avant

### Vol Normal
1. Le cerf-volant doit naturellement monter vers le zénith avec lignes égales
2. Les forces aérodynamiques doivent être cohérentes (portance vers le haut)
3. Pas d'oscillations ou de comportement erratique

---

## 8. Pièges à Éviter

### ❌ Ne PAS faire

1. **Ajouter des rotations supplémentaires** dans `KiteVisualizer.update()`
2. **Changer l'ordre de composition** des quaternions
3. **Oublier de normaliser** après multiplication de quaternions
4. **Inverser l'ordre** rotation/translation dans les transformations
5. **Modifier l'ordre des points** des panneaux sans recalculer les normales

### ✅ Toujours faire

1. **Utiliser la même orientation** dans tous les endroits critiques
2. **Normaliser les quaternions** après toute opération
3. **Respecter l'ordre** rotation puis translation
4. **Vérifier en mode debug** après toute modification
5. **Documenter** tout changement affectant l'orientation

---

## 9. Debugging

### Problème : Le cerf-volant regarde dans la mauvaise direction

**Vérifier** :
1. Les 4 endroits d'initialisation de l'orientation (chercher `rotationY.*multiply`)
2. Que `rotationY` = 180° sur Y et `rotationX` = -15° sur X
3. L'ordre de multiplication : `rotationY.multiply(rotationX)`

### Problème : Les forces aérodynamiques sont inversées

**Vérifier** :
1. L'ordre des points dans `definePanels()` (KiteGeometry.ts)
2. Que l'ordre est **HORAIRE** vu de face
3. Les normales avec `getPanelNormal()` en mode debug

### Problème : Le cerf-volant oscille ou explose

**Vérifier** :
1. Que les quaternions sont **normalisés** dans `VerletIntegrator.ts`
2. Qu'il n'y a **pas de rotation double** (simulation + visualiseur)
3. Les paramètres de lignes dans `SimulationConfig.ts`

---

## 10. Résumé Ultra-Court

```typescript
// ═══════════════════════════════════════════════════════════════════
// ORIENTATION DU CERF-VOLANT (à copier-coller)
// ═══════════════════════════════════════════════════════════════════
// Position : Z+ (derrière le pilote)
// Regarde : Z- (vers le pilote)
// Vent : vient de Z-, souffle vers Z+
// Intrados : fait face à Z- pour recevoir le vent

const rotationY = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0), Math.PI
);
const rotationX = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0), -15 * Math.PI / 180
);
orientation = rotationY.multiply(rotationX);  // ORDRE CRITIQUE
// ═══════════════════════════════════════════════════════════════════
```

---

**En cas de doute, revenir à ce document !**
