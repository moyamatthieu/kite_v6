# 🔬 RAPPORT D'AUDIT COMPLET - SIMULATION DE CERF-VOLANT

**Date**: 2 novembre 2025  
**Projet**: Simulateur de cerf-volant 3D avec physique réaliste  
**Auteur**: GitHub Copilot - Analyse approfondie

---

## 📋 TABLE DES MATIÈRES

1. [Vue d'ensemble du projet](#1-vue-densemble-du-projet)
2. [Architecture et flux d'exécution](#2-architecture-et-flux-dexécution)
3. [Modèle physique détaillé](#3-modèle-physique-détaillé)
4. [Forces appliquées au cerf-volant](#4-forces-appliquées-au-cerf-volant)
5. [Calculs aérodynamiques](#5-calculs-aérodynamiques)
6. [Système de lignes et contrôles](#6-système-de-lignes-et-contrôles)
7. [Intégration du mouvement](#7-intégration-du-mouvement)
8. [Contraintes et collisions](#8-contraintes-et-collisions)
9. [Problèmes identifiés](#9-problèmes-identifiés)
10. [Recommandations](#10-recommandations)

---

## 1. VUE D'ENSEMBLE DU PROJET

### 1.1 Description générale
Ce projet est une **simulation physique 3D** d'un cerf-volant acrobatique, développée en **TypeScript** avec **Three.js** pour le rendu 3D. L'objectif est de modéliser de manière réaliste le comportement d'un cerf-volant soumis aux forces aérodynamiques, à la gravité et aux tensions des lignes de contrôle.

### 1.2 Technologies utilisées
- **Three.js** v0.181.0 : Moteur de rendu 3D
- **TypeScript** v5.8.2 : Langage de programmation typé
- **Vite** v6.2.0 : Outil de build et serveur de développement
- **Intégration manuelle** du moteur physique (pas de bibliothèque externe)

### 1.3 Structure du projet
```
src/
├── Simulation.ts              # Orchestrateur principal
├── Scene.ts                   # Gestion de la scène 3D
├── cerfvolant/
│   ├── CerfVolant.ts          # Représentation visuelle
│   └── GeometrieCerfVolant.ts # Définition géométrique
├── physique/
│   ├── MoteurPhysique.ts      # Moteur principal
│   ├── EtatPhysique.ts        # État du système
│   ├── CalculateurAerodynamique.ts
│   ├── SystemeLignes.ts
│   ├── SolveurContraintes.ts
│   └── Vent.ts
├── controles/
│   ├── StationControle.ts
│   └── ControleurUtilisateur.ts
└── ui/
    └── InterfaceUtilisateur.ts
```

---

## 2. ARCHITECTURE ET FLUX D'EXÉCUTION

### 2.1 Cycle de simulation (60 FPS)

```
┌─────────────────────────────────────────────────────┐
│         BOUCLE D'ANIMATION (requestAnimationFrame)   │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  1. ENTRÉES UTILISATEUR (ControleurUtilisateur)     │
│     - Touches clavier (flèches, Q, D)               │
│     - Delta longueur des lignes (-0.6m à +0.6m)     │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  2. MOTEUR PHYSIQUE (MoteurPhysique.mettreAJour)    │
│     a) Calcul des forces aérodynamiques             │
│     b) Application de la gravité                    │
│     c) Calcul des forces des lignes                 │
│     d) Sommation des forces et couples              │
│     e) Intégration du mouvement (Euler)             │
│     f) Résolution des contraintes (sol)             │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  3. MISE À JOUR VISUELLE                            │
│     - Position et orientation du cerf-volant        │
│     - Lignes de contrôle                            │
│     - Brides                                        │
│     - Trajectoire                                   │
│     - Vecteurs de forces (mode debug)               │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  4. INTERFACE UTILISATEUR                           │
│     - Affichage des infos de debug                  │
│     - Logging périodique (1 fois/seconde)           │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  5. RENDU 3D (Scene.rendre)                         │
│     - WebGLRenderer                                 │
│     - CSS2DRenderer (labels)                        │
└─────────────────────────────────────────────────────┘
```

### 2.2 Flux détaillé du moteur physique

```typescript
// Fichier: src/physique/MoteurPhysique.ts - méthode mettreAJour()

function mettreAJour(deltaTime, positionsPoignees, geometrie) {
    // 1. INITIALISATION
    forceTotale = Vector3(0, 0, 0)
    coupleTotal = Vector3(0, 0, 0)
    
    // 2. VENT APPARENT
    ventApparent = vent.getVentApparent(etat.velocite)
    //    = ventGlobal - velociteCerfVolant
    
    // 3. FORCES AÉRODYNAMIQUES (par panneau)
    for each panneau in geometrie.panneaux:
        forces = calculerForcesAeroDetaillees(panneau, orientation, ventApparent)
        forceTotale += forces.lift + forces.drag
        coupleTotal += brasDeLevier × force
    
    // 4. GRAVITÉ (par panneau)
    for each panneau in geometrie.panneaux:
        forceGravite = masse/nbPanneaux × g
        forceTotale += forceGravite
        coupleTotal += brasDeLevier × forceGravite
    
    // 5. FORCES DES LIGNES
    {force, couple} = systemeLignes.calculerForces(etat, poignees, geometrie)
    forceTotale += force
    coupleTotal += couple
    
    // 6. INTÉGRATION (EULER SIMPLE)
    acceleration = forceTotale / masse
    velocite += acceleration × deltaTime
    position += velocite × deltaTime
    
    accelerationAngulaire = coupleTotal / inertie
    velociteAngulaire += accelerationAngulaire × deltaTime
    orientation.premultiply(deltaRotation)
    
    // 7. CONTRAINTES
    appliquerContraintesSol(etat, geometrie)
}
```

---

## 3. MODÈLE PHYSIQUE DÉTAILLÉ

### 3.1 Propriétés physiques du cerf-volant

```typescript
// Fichier: src/physique/EtatPhysique.ts
masse = 0.15 kg  // 150 grammes (réaliste pour un cerf-volant acrobatique)

// Moment d'inertie (calcul basé sur une tige : I = (1/12) × m × L²)
inertie = Vector3(
    Ix = 0.06 kg⋅m²,  // Rotation autour de l'axe X (tangage/pitch)
    Iy = 0.06 kg⋅m²,  // Rotation autour de l'axe Y (lacet/yaw)
    Iz = 0.09 kg⋅m²   // Rotation autour de l'axe Z (roulis/roll)
)
```

**Justification des valeurs** :
- Masse : 150g est typique pour un cerf-volant delta de 1.65m d'envergure
- Inertie : Calculée pour une structure avec envergure de 1.65m
  - `Ix, Iy ≈ (1/12) × 0.15 × 1.65² ≈ 0.034 kg⋅m²` (valeur augmentée à 0.06 pour plus de stabilité)
  - `Iz` légèrement supérieur pour tenir compte de la répartition de masse

### 3.2 Géométrie du cerf-volant

```typescript
// Fichier: src/cerfvolant/GeometrieCerfVolant.ts
envergure = 1.65 m   // Largeur totale
hauteur = 0.65 m     // Hauteur du nez à la base
profondeur = 0.15 m  // Profondeur des whiskers (stabilisateurs)
diametreStructure = 0.01 m  // 1cm de diamètre pour les barres

// POINTS STRUCTURELS PRINCIPAUX (repère local)
NEZ          = (0, 0.65, 0)        // Sommet du cerf-volant
SPINE_BAS    = (0, 0, 0)           // Base de la colonne vertébrale
BORD_GAUCHE  = (-0.825, 0, 0)      // Extrémité aile gauche
BORD_DROIT   = (0.825, 0, 0)       // Extrémité aile droite
INTER_GAUCHE = (-0.675, 0.1625, 0) // Point intermédiaire gauche
INTER_DROIT  = (0.675, 0.1625, 0)  // Point intermédiaire droit
CENTRE       = (0, 0.1625, 0)      // Point central

// WHISKERS (stabilisateurs arrière)
WHISKER_GAUCHE = (-0.4125, 0.1, -0.15)
WHISKER_DROIT  = (0.4125, 0.1, -0.15)

// POINTS DE CONTRÔLE (calculés par trilatération 3D)
// Position dépend des longueurs de brides
CTRL_GAUCHE = calculé dynamiquement
CTRL_DROIT  = calculé dynamiquement
```

### 3.3 Système de brides

Les **brides** sont les cordes qui relient la structure du cerf-volant aux points de contrôle (où s'attachent les lignes principales).

```typescript
// Longueurs des brides (en mètres)
parametresBrides = {
    nez: 0.65,     // NEZ → CTRL
    inter: 0.65,   // INTER → CTRL
    centre: 0.65   // CENTRE → CTRL
}
```

**Calcul du point de contrôle** (trilatération 3D) :
```
Trouver CTRL tel que :
    distance(NEZ, CTRL) = 0.65m
    distance(INTER, CTRL) = 0.65m
    distance(CENTRE, CTRL) = 0.65m

Solution par intersection de 3 sphères :
1. Construire une base locale (ex, ey, ez) à partir des points d'attache
2. Calculer x et y dans le plan formé par les points
3. Calculer z (±) perpendiculaire au plan
4. Choisir la solution avec z > 0 (devant le cerf-volant)
```

### 3.4 Orientation et repère

**Repère global** :
- **X+** : Direction du vent (d'ouest en est)
- **Y+** : Vertical vers le haut
- **Z+** : Vers l'observateur (droit)

**Orientation du cerf-volant** :
- **Extrados** (face avant, bombée) : orientée initialement vers **Z+**
- **Intrados** (face arrière, qui reçoit le vent) : orientée vers **Z-**
- **NEZ** : pointe toujours vers **Y+** (le haut)

**Configuration initiale** :
```typescript
// Rotation de -90° sur Y pour orienter l'intrados face au vent
orientation = Quaternion.setFromAxisAngle(Vector3(0, 1, 0), -π/2)
// Résultat : Z+ local → X- global (extrados face au vent)
//            Z- local → X+ global (intrados reçoit le vent)
```

---

## 4. FORCES APPLIQUÉES AU CERF-VOLANT

### 4.1 Vue d'ensemble

Le cerf-volant est soumis à **QUATRE types de forces** :

```
┌──────────────────────────────────────────────────┐
│  FORCE TOTALE = F_aéro + F_gravité + F_lignes    │
└──────────────────────────────────────────────────┘
```

### 4.2 Force de gravité (F_gravité)

**Définition** :
```typescript
F_gravité = m × g
          = 0.15 kg × Vector3(0, -9.81, 0) m/s²
          = Vector3(0, -1.47, 0) N
```

**Application** :
- La gravité est **distribuée sur chaque panneau** pour un calcul correct des couples
- Chaque panneau reçoit une fraction `masse/nbPanneaux` de la force totale
- Point d'application : centre géométrique du panneau

**Impact** :
- Tire le cerf-volant vers le bas en permanence
- Crée un couple si le centre de masse n'est pas aligné avec le centre de pression aérodynamique
- Force de **~1.47 N** constante vers le bas

### 4.3 Forces aérodynamiques (F_aéro)

Les forces aérodynamiques sont les plus complexes. Elles se décomposent en :

#### 4.3.1 Vent apparent

```typescript
V_apparent = V_vent_global - V_cerf_volant

Exemple :
    Vent global : (8.61, 0, 0) m/s  (31 km/h)
    Vitesse CV : (2, -1, 0.5) m/s
    Vent apparent : (6.61, 1, -0.5) m/s
```

**Note** : Le vent apparent change constamment car la vitesse du cerf-volant évolue.

#### 4.3.2 Portance (Lift - F_lift)

**Définition physique** :
La portance est la force **perpendiculaire** à la direction du vent apparent, générée par la différence de pression entre l'extrados (face bombée) et l'intrados (face plate).

**Formule** :
```
F_lift = C_L × q × S × direction_lift

où :
    C_L = coefficient de portance (sans dimension)
    q = pression dynamique = 0.5 × ρ × V²
    ρ = densité de l'air = 1.225 kg/m³
    V = vitesse du vent apparent
    S = surface du panneau
    direction_lift = perpendiculaire au vent, dans le plan (normale, vent)
```

**Coefficient de portance** (code réel) :
```typescript
// CAS 1 : Vol normal (vent sur l'intrados, cosTheta < 0)
if (alpha < alpha_stall) {  // alpha_stall = 25°
    C_L = 5.0 × sin(alpha) × cos(alpha)  // Max C_L ≈ 2.5 à alpha ≈ 45°
} else {  // Décrochage
    C_L = 0.5 × cos(alpha)  // Portance effondrée
}

// CAS 2 : Cerf-volant retourné (vent sur l'extrados, cosTheta > 0)
C_L = 0  // Pas de portance
```

**Direction de la portance** :
```typescript
// Calcul du vecteur de portance (perpendiculaire au vent)
liftAxis = normaleSurface × directionVent
directionLift = directionVent × liftAxis
directionLift.normalize()
```

**Magnitude typique** :
- À 31 km/h de vent, alpha = 20°, surface = 0.2 m² :
  ```
  q = 0.5 × 1.225 × 8.61² ≈ 45.4 Pa
  C_L ≈ 5.0 × sin(20°) × cos(20°) ≈ 1.61
  F_lift ≈ 1.61 × 45.4 × 0.2 ≈ 14.6 N
  ```

#### 4.3.3 Traînée (Drag - F_drag)

**Définition physique** :
La traînée est la force **parallèle** à la direction du vent apparent, qui s'oppose au mouvement.

**Formule** :
```
F_drag = C_D × q × S × direction_vent

où :
    C_D = coefficient de traînée (sans dimension)
```

**Coefficient de traînée** (code réel) :
```typescript
// CAS 1 : Vol normal (intrados face au vent)
if (alpha < alpha_stall) {  // alpha_stall = 25°
    C_D = 0.05 + 0.3 × sin²(alpha)  // Traînée faible en vol normal
} else {  // Décrochage
    C_D = 1.2 × sin(alpha)  // Traînée élevée
}

// CAS 2 : Cerf-volant retourné
C_D = 1.4 × sin(alpha)  // Traînée très élevée
```

**Magnitude typique** :
- À 31 km/h, alpha = 20°, surface = 0.2 m² :
  ```
  C_D ≈ 0.05 + 0.3 × sin²(20°) ≈ 0.085
  F_drag ≈ 0.085 × 45.4 × 0.2 ≈ 0.77 N
  ```

#### 4.3.4 Distribution par panneau

Le cerf-volant est découpé en **4 panneaux triangulaires** :

```
┌─────────────────────────────────────────┐
│           NEZ (sommet)                  │
│          /    |    \                    │
│        /      |      \                  │
│      P1       P2  P3  P4                │
│    /          |          \              │
│ BORD_G    WHISKER_G/D    BORD_D         │
└─────────────────────────────────────────┘

P1 : Panneau gauche (NEZ, WHISKER_G, BORD_G)
P2 : Panneau arrière gauche (NEZ, SPINE_BAS, WHISKER_G)
P3 : Panneau droit (NEZ, BORD_D, WHISKER_D)
P4 : Panneau arrière droit (NEZ, WHISKER_D, SPINE_BAS)
```

**Calcul pour chaque panneau** :
1. Calculer la **normale** du panneau (produit vectoriel)
2. Calculer l'**angle d'attaque** `alpha` (angle entre normale et vent)
3. Calculer les **coefficients** C_L et C_D selon l'angle
4. Calculer les **forces** lift et drag
5. Appliquer au **centre du panneau**

**Sommation** :
```typescript
F_aéro_totale = Σ(F_lift + F_drag) pour tous les panneaux
```

### 4.4 Forces des lignes (F_lignes)

Les lignes de contrôle relient les **points de contrôle** du cerf-volant aux **treuils** de la station au sol.

#### 4.4.1 Modèle physique des lignes

Chaque ligne est modélisée comme un **ressort avec amortissement** :

```typescript
// Si longueur_actuelle > longueur_repos :
elongation = longueur_actuelle - longueur_repos

F_ressort = k × elongation          // Force de rappel
F_amortissement = c × v_relative    // Force d'amortissement

F_ligne = (F_ressort + F_amortissement) × direction_ligne

// Paramètres :
k = 25 N/m      // Raideur (constante de rappel)
c = 5 N⋅s/m     // Amortissement
```

**Vitesse relative** :
```typescript
// Vitesse du point d'attache sur le cerf-volant
v_point = v_centre_masse + ω × r
// où ω = vitesse angulaire, r = position relative du point

v_relative = v_point · direction_ligne
```

#### 4.4.2 Système de contrôle différentiel

L'utilisateur contrôle la **différence de longueur** entre les deux lignes :

```typescript
deltaLongueur = [-0.6, +0.6] m  // Contrôlé par clavier

longueur_gauche = longueur_base - deltaLongueur / 2
longueur_droite = longueur_base + deltaLongueur / 2

// Exemple de virage à gauche :
deltaLongueur = +0.4 m
longueur_gauche = 10 - 0.2 = 9.8 m  (plus courte → tire plus)
longueur_droite = 10 + 0.2 = 10.2 m (plus longue → tire moins)
```

**Effet sur le mouvement** :
- **Delta > 0** (ligne gauche plus courte) : **Virage à gauche**
  - Tension gauche augmente
  - Crée un couple négatif sur l'axe Z (rotation horaire vue du dessus)
  
- **Delta < 0** (ligne droite plus courte) : **Virage à droite**
  - Tension droite augmente
  - Crée un couple positif sur l'axe Z

#### 4.4.3 Position des treuils

```typescript
// Station de contrôle (fichier: StationControle.ts)
position_station = (0, 0.25, 0)
largeur_treuils = 0.3 m

treuil_gauche = (0.25, 0.25, -0.15)  // X+, Z-
treuil_droit  = (0.25, 0.25, +0.15)  // X+, Z+
```

**Note importante** : Les treuils sont positionnés en **X+ (derrière la station)** pour que les lignes partent vers le cerf-volant qui vole dans le vent.

#### 4.4.4 Magnitude typique

```
Tension ligne (élongation = 1m) :
    F = 25 × 1 + 5 × 2 = 35 N

Force totale des lignes (2 lignes tendues) :
    F_lignes ≈ 40-70 N (direction : vers la station)
```

---

## 5. CALCULS AÉRODYNAMIQUES

### 5.1 Pression dynamique

La **pression dynamique** est la "force" du vent :

```
q = 0.5 × ρ × V²

ρ = 1.225 kg/m³ (densité de l'air au niveau de la mer, 15°C)
V = vitesse du vent apparent (m/s)

Exemple :
    V = 8.61 m/s (31 km/h)
    q = 0.5 × 1.225 × 8.61² = 45.4 Pa (Pascals)
```

### 5.2 Angle d'attaque (alpha)

L'**angle d'attaque** est l'angle entre la **normale de la surface** et la **direction du vent**.

```typescript
// Calcul de l'angle
normaleMonde = normaleLocale.applyQuaternion(orientation)
cosTheta = normaleMonde · directionVent
sinAlpha = |cosTheta|
alpha = arcsin(sinAlpha)

// Exemple :
cosTheta = -0.342  // Vent sur l'intrados
sinAlpha = 0.342
alpha = 20°  // Angle d'attaque modéré
```

**Zones de fonctionnement** :
- **0° < alpha < 25°** : Vol normal, portance forte, traînée faible
- **alpha = 25°** (angle de décrochage) : Portance maximale
- **alpha > 25°** : Décrochage, portance effondrée, traînée élevée

### 5.3 Cas de vol : Intrados vs Extrados

#### CAS 1 : Vol normal (vent sur l'intrados)
```
cosTheta < 0  (normale et vent dans des directions opposées)

Situation : L'intrados (face arrière) reçoit le vent
            C'est la configuration normale de vol

Portance : OUI, forte en pré-décrochage
Traînée : FAIBLE
Direction : Perpendiculaire au vent, tend à soulever le cerf-volant
```

#### CAS 2 : Cerf-volant retourné (vent sur l'extrados)
```
cosTheta > 0  (normale et vent dans la même direction)

Situation : L'extrados (face avant) reçoit le vent
            Cerf-volant en position instable/retournée

Portance : NON (C_L = 0)
Traînée : TRÈS ÉLEVÉE (C_D = 1.4 × sin(alpha))
Direction : Parallèle au vent, pousse le cerf-volant en arrière
```

### 5.4 Surface effective

Chaque panneau a une surface calculée comme :

```typescript
// Pour un triangle (p0, p1, p2) :
v1 = p1 - p0
v2 = p2 - p0
surface = |v1 × v2| / 2

// Surfaces typiques :
Panneau gauche/droit : ~0.25 m²
Panneau arrière : ~0.15 m²
Surface totale : ~0.8 m²
```

### 5.5 Couples aérodynamiques

Les forces aérodynamiques créent des **couples** (moments de rotation) car elles s'appliquent à distance du centre de masse :

```
Couple = brasDeLevier × Force

brasDeLevier = position_application - centre_masse
```

**Exemple** :
```
Force sur le nez : 15 N vers le haut (lift)
Position nez : (0, 0.65, 0) local
Centre de masse : (0, 0, 0) environ
Bras de levier : (0, 0.65, 0)

Couple = (0, 0.65, 0) × (0, 15, 0) = (9.75, 0, 0) N⋅m
        → Rotation de tangage (pitch), nez vers le haut
```

---

## 6. SYSTÈME DE LIGNES ET CONTRÔLES

### 6.1 Configuration physique

```
┌────────────────────────────────────────────┐
│  STATION AU SOL                            │
│  Position : (0, 0.25, 0)                   │
│                                            │
│  TREUIL_GAUCHE: (0.25, 0.25, -0.15)       │
│  TREUIL_DROIT:  (0.25, 0.25, +0.15)       │
└────────────────────────────────────────────┘
              ║         ║
              ║ Ligne   ║ Ligne
              ║ gauche  ║ droite
              ║         ║
              ▼         ▼
┌────────────────────────────────────────────┐
│  CERF-VOLANT                               │
│  Position : Variable (ex: 6, 6, 0)         │
│                                            │
│  Points d'attache des lignes :             │
│  CTRL_GAUCHE (calculé par trilatération)   │
│  CTRL_DROIT  (calculé par trilatération)   │
│                                            │
│  Reliés à la structure par 3 brides        │
│  chacun :                                  │
│    - NEZ → CTRL                            │
│    - INTER → CTRL                          │
│    - CENTRE → CTRL                         │
└────────────────────────────────────────────┘
```

### 6.2 Calcul de la tension

Pour chaque ligne :

```typescript
// 1. Position actuelle du point d'attache
point_monde = point_local.applyQuaternion(orientation) + position_CV

// 2. Vecteur de la ligne
diff = point_monde - position_treuil
distance = |diff|
direction = diff / distance

// 3. Élongation
elongation = max(0, distance - longueur_repos)

// 4. Vitesse du point d'attache
r_world = point_local.applyQuaternion(orientation)
v_tangentielle = velociteAngulaire × r_world
v_point = velocite_CV + v_tangentielle

// 5. Vitesse relative le long de la ligne
v_relative = v_point · direction

// 6. Force de la ligne
F_ressort = k × elongation
F_amortissement = c × v_relative
magnitude_force = F_ressort + F_amortissement

// 7. Force vectorielle (vers la station)
F_ligne = -magnitude_force × direction

// 8. Couple
bras_levier = r_world
couple = bras_levier × F_ligne
```

### 6.3 Contrôle utilisateur

```typescript
// Fichier: ControleurUtilisateur.ts
class ControleurUtilisateur {
    deltaLongueur = 0  // [-0.6, +0.6] m
    vitesseDelta = 0.8 m/s
    vitesseRetour = 1.0 m/s
    
    mettreAJour(deltaTime) {
        if (touche_gauche || touche_Q) {
            deltaLongueur += vitesseDelta × deltaTime  // Virage à gauche
        } else if (touche_droite || touche_D) {
            deltaLongueur -= vitesseDelta × deltaTime  // Virage à droite
        } else {
            // Retour progressif à zéro (ligne neutre)
            deltaLongueur -= sign(deltaLongueur) × vitesseRetour × deltaTime
        }
        
        // Limitation
        deltaLongueur = clamp(deltaLongueur, -0.6, +0.6)
    }
}
```

**Touches** :
- **Flèche gauche** ou **Q** : Virage à gauche (raccourcit ligne gauche)
- **Flèche droite** ou **D** : Virage à droite (raccourcit ligne droite)
- **Relâcher** : Retour automatique à la position neutre

### 6.4 Effet sur le vol

```
VIRAGE À GAUCHE (deltaLongueur > 0) :

    longueur_gauche < longueur_droite
    → tension_gauche > tension_droite
    → force_gauche > force_droite
    → couple négatif sur Z (rotation anti-horaire vue de dessus)
    → le nez du cerf-volant tourne vers la gauche
    → trajectoire courbe vers la gauche

VIRAGE À DROITE (deltaLongueur < 0) :

    longueur_droite < longueur_gauche
    → tension_droite > tension_gauche
    → force_droite > force_gauche
    → couple positif sur Z (rotation horaire vue de dessus)
    → le nez du cerf-volant tourne vers la droite
    → trajectoire courbe vers la droite
```

---

## 7. INTÉGRATION DU MOUVEMENT

### 7.1 Méthode d'intégration : Euler simple

Le projet utilise l'**intégration d'Euler simple** (ordre 1), qui est la méthode la plus basique :

```typescript
// TRANSLATION
acceleration = forceTotale / masse
velocite += acceleration × deltaTime
position += velocite × deltaTime

// ROTATION
accelerationAngulaire = coupleTotal / inertie
velociteAngulaire += accelerationAngulaire × deltaTime
angle = |velociteAngulaire| × deltaTime
axe = velociteAngulaire / |velociteAngulaire|
deltaRotation = Quaternion.setFromAxisAngle(axe, angle)
orientation.premultiply(deltaRotation)
orientation.normalize()
```

### 7.2 Avantages et inconvénients

**Avantages** :
- ✅ Très simple à implémenter
- ✅ Rapide en calcul
- ✅ Suffisant pour deltaTime petit (~16ms à 60 FPS)

**Inconvénients** :
- ❌ **Instabilité numérique** pour grandes forces ou deltaTime élevé
- ❌ **Accumulation d'erreur** au fil du temps
- ❌ **Pas de conservation d'énergie** (peut créer ou détruire de l'énergie)
- ❌ **Problèmes avec forces de ressort rigides** (k élevé)

### 7.3 Pas de temps

```typescript
// Fichier: Simulation.ts
horloge = new THREE.Clock()
deltaTime = horloge.getDelta()  // Temps écoulé depuis la dernière frame

// Typique à 60 FPS :
deltaTime ≈ 0.016 s (16 ms)
```

**Note** : Le deltaTime est **variable** selon les performances de la machine.

### 7.4 Gardes contre les valeurs invalides

```typescript
// Protection contre NaN et Infinity
if (!isFinite(velocite.x) || !isFinite(velocite.y) || !isFinite(velocite.z)) {
    console.warn('Vitesse invalide détectée, réinitialisation')
    velocite.set(0, 0, 0)
}

// Limitation des vitesses extrêmes
vitesseMax = 50 m/s
if (|velocite| > vitesseMax) {
    velocite = velocite.normalize() × vitesseMax
}

vitesseAngMax = 10 rad/s
if (|velociteAngulaire| > vitesseAngMax) {
    velociteAngulaire = velociteAngulaire.normalize() × vitesseAngMax
}

// Limitation de l'angle de rotation par frame
if (angle >= π) {
    // Angle trop grand, ne pas appliquer la rotation
}
```

### 7.5 Inertie et rotation

Le projet utilise un **tenseur d'inertie diagonal** :

```typescript
inertie = Vector3(Ix, Iy, Iz)

// Calcul de l'accélération angulaire (composante par composante)
accelerationAngulaire.x = coupleTotal.x / Ix
accelerationAngulaire.y = coupleTotal.y / Iy
accelerationAngulaire.z = coupleTotal.z / Iz
```

**Simplification** : Le tenseur d'inertie est supposé diagonal dans le repère local du cerf-volant, ce qui est une approximation raisonnable pour un objet quasi-symétrique.

---

## 8. CONTRAINTES ET COLLISIONS

### 8.1 Contrainte du sol

Le **solveur de contraintes** empêche le cerf-volant de traverser le sol (y = 0) :

```typescript
// Fichier: SolveurContraintes.ts
hauteurSol = 0.05 m  // Marge de sécurité

function gererCollisionSol(etat, geometrie) {
    // 1. Trouver le point le plus bas
    penetrationMax = 0
    for each point in geometrie.points:
        point_monde = point_local.applyQuaternion(orientation) + position
        penetration = hauteurSol - point_monde.y
        if (penetration > penetrationMax) {
            penetrationMax = penetration
        }
    
    // 2. Si collision détectée
    if (penetrationMax > 0) {
        // Correction de position
        position.y += penetrationMax
        
        // Rebond
        if (velocite.y < 0) {
            velocite.y *= -0.4  // Coefficient de restitution
        }
        
        // Friction horizontale
        velocite.x *= 0.85
        velocite.z *= 0.85
        
        // Amortissement de rotation
        velociteAngulaire *= 0.7
    }
}
```

### 8.2 Coefficient de restitution

```
e = 0.4  (coefficient de restitution)

Après rebond :
    v_y_après = -e × v_y_avant
    v_y_après = -0.4 × v_y_avant
```

**Interprétation** :
- `e = 0` : Collision parfaitement inélastique (aucun rebond)
- `e = 1` : Collision parfaitement élastique (rebond total)
- `e = 0.4` : Rebond modéré, réaliste pour une toile légère

### 8.3 Friction au sol

```
friction = 0.85

v_x_après = 0.85 × v_x_avant
v_z_après = 0.85 × v_z_avant
```

Perte de **15% de vitesse horizontale** à chaque contact avec le sol.

### 8.4 Limitations actuelles

❌ **Pas de contrainte de longueur maximale des lignes**
- Les lignes peuvent théoriquement s'étirer à l'infini
- Le modèle de ressort compense partiellement (force augmente avec élongation)
- Une contrainte dure serait plus réaliste : `distance(CV, station) ≤ longueur_max`

❌ **Pas de collision avec d'autres objets**
- Seulement le sol est géré
- Pas de collision entre panneaux (auto-collision)

❌ **Pas de détection de lignes emmêlées**

---

## 9. PROBLÈMES IDENTIFIÉS

### 9.1 Problèmes critiques 🔴

#### 9.1.1 Instabilité numérique potentielle
**Symptôme** : Le cerf-volant peut exploser ou diverger avec des forces élevées
**Cause** : Intégration d'Euler simple avec forces de ressort rigides (k=25 N/m)
**Solution** :
```typescript
// Option 1 : Réduire la raideur des lignes
k = 10 N/m  // au lieu de 25 N/m

// Option 2 : Utiliser un intégrateur plus stable (Runge-Kutta 4, Verlet)
// Option 3 : Limiter la force maximale des lignes
F_ligne = min(F_ligne, F_max)
```

#### 9.1.2 Portance possiblement excessive
**Symptôme** : Le cerf-volant pourrait monter trop facilement
**Cause** : Coefficient de portance maximal `C_L = 2.5` est élevé
**Analyse** :
```
Portance typique (4 panneaux, alpha=20°, V=8.61 m/s) :
    F_lift ≈ 4 × 14.6 N ≈ 58 N
    
Gravité :
    F_gravité = 1.47 N

Ratio : F_lift / F_gravité ≈ 40
```
**Solution** :
```typescript
// Réduire le coefficient de portance
C_L = 2.8 × sin(alpha) × cos(alpha)  // Max C_L ≈ 1.4
```

#### 9.1.3 Accumulation d'erreur d'orientation
**Symptôme** : Après longue simulation, l'orientation peut dériver
**Cause** : Multiplication répétée de quaternions sans normalisation fréquente
**Solution** : ✅ **Déjà implémentée** (normalisation après chaque rotation)

### 9.2 Problèmes moyens 🟡

#### 9.2.1 Pas de limitation de longueur des lignes
**Impact** : Les lignes peuvent s'étirer indéfiniment (physiquement irréaliste)
**Solution** :
```typescript
// Ajouter une contrainte dure après calcul des forces
if (distance > longueurMax) {
    // Repositionner le cerf-volant sur la sphère de rayon longueurMax
    direction = (position - treuil).normalize()
    position = treuil + direction × longueurMax
    
    // Annuler la vitesse radiale (vers l'extérieur)
    v_radiale = velocite · direction
    if (v_radiale > 0) {
        velocite -= direction × v_radiale
    }
}
```

#### 9.2.2 Modèle de vent simplifié
**État actuel** : Vent constant avec turbulence sinusoïdale simple
**Amélioration possible** :
```typescript
// Vent avec gradient d'altitude (plus fort en hauteur)
vitesse_vent(y) = vitesse_base × (y / y_ref)^0.14

// Rafales aléatoires (bruit de Perlin)
turbulence = PerlinNoise(position, temps)
```

#### 9.2.3 Pas de déformation de la toile
**État actuel** : Géométrie rigide
**Impact** : Pas de visualisation du gonflage/dégonflage de la toile
**Amélioration** : Système de particules ou mesh déformable

### 9.3 Problèmes mineurs 🟢

#### 9.3.1 Friction au sol constante
**État actuel** : `friction = 0.85` (15% de perte)
**Amélioration** : Friction dépendant de la vitesse et de la pression normale

#### 9.3.2 Pas de modèle de fatigue ou d'usure
**Impact** : Simulation académique seulement

#### 9.3.3 Interface utilisateur basique
**État actuel** : Contrôles clavier uniquement
**Amélioration** : Support souris, gamepad, VR

---

## 10. RECOMMANDATIONS

### 10.1 Recommandations prioritaires 🚀

#### 10.1.1 Améliorer la stabilité numérique
```typescript
// Implémenter l'intégrateur Velocity Verlet (meilleur que Euler)
// Pseudo-code :
function verletIntegration(etat, forces, deltaTime) {
    // 1. Demi-pas de vitesse
    a0 = forces / masse
    v_half = velocite + a0 × (deltaTime / 2)
    
    // 2. Mise à jour de position
    position += v_half × deltaTime
    
    // 3. Calcul des nouvelles forces
    forces_new = calculerForces(position, v_half)
    a1 = forces_new / masse
    
    // 4. Demi-pas final de vitesse
    velocite = v_half + a1 × (deltaTime / 2)
}
```

**Avantages** :
- ✅ Meilleure stabilité
- ✅ Conservation d'énergie améliorée
- ✅ Erreur O(Δt³) au lieu de O(Δt²)

#### 10.1.2 Ajouter une contrainte de longueur maximale
```typescript
// Dans SolveurContraintes.ts
function appliquerContrainteLongueurLignes(etat, positionsPoignees, longueurMax) {
    const treuils = [positionsPoignees.gauche, positionsPoignees.droite]
    const points = [geometrie.points.get('CTRL_GAUCHE'), geometrie.points.get('CTRL_DROIT')]
    
    for (let i = 0; i < 2; i++) {
        const pointMonde = points[i].clone().applyQuaternion(etat.orientation).add(etat.position)
        const diff = pointMonde.clone().sub(treuils[i])
        const distance = diff.length()
        
        if (distance > longueurMax) {
            const correction = (distance - longueurMax) / distance
            const deplacement = diff.clone().multiplyScalar(-correction / 2)
            etat.position.add(deplacement)
            
            // Annuler la vitesse dans la direction de la ligne
            const direction = diff.normalize()
            const vRadiale = etat.velocite.dot(direction)
            if (vRadiale > 0) {
                etat.velocite.addScaledVector(direction, -vRadiale)
            }
        }
    }
}
```

#### 10.1.3 Calibrer les coefficients aérodynamiques
```typescript
// Tester avec différentes valeurs et observer le comportement

// Configuration actuelle (agressive) :
C_L_max = 5.0 × sin(alpha) × cos(alpha)  // ~2.5
C_D_min = 0.05 + 0.3 × sin²(alpha)       // ~0.05-0.35

// Configuration modérée (recommandée) :
C_L_max = 3.0 × sin(alpha) × cos(alpha)  // ~1.5
C_D_min = 0.08 + 0.4 × sin²(alpha)       // ~0.08-0.48

// Configuration réaliste (basée sur profils NACA) :
if (alpha < 12°) {
    C_L = 5.73 × alpha  // Pente linéaire (rad)
} else if (alpha < 25°) {
    C_L = 1.2 + 0.8 × sin(2 × (alpha - 12°))  // Transition
} else {
    C_L = 0.5 × cos(alpha)  // Post-stall
}

C_D = 0.01 + 0.1 × C_L²  // Polaire parabolique
```

### 10.2 Recommandations secondaires 📊

#### 10.2.1 Logging et analyse de données
```typescript
// Créer un système de telemetrie
class Telemetrie {
    private historique: {
        temps: number,
        position: Vector3,
        velocite: Vector3,
        forces: {
            aero: Vector3,
            gravite: Vector3,
            lignes: Vector3
        },
        energie: {
            cinetique: number,
            potentielle: number,
            totale: number
        }
    }[] = []
    
    enregistrer(temps: number, etat: EtatPhysique, forces: Forces) {
        const E_cin = 0.5 × etat.masse × etat.velocite.lengthSq()
        const E_pot = etat.masse × 9.81 × etat.position.y
        
        this.historique.push({
            temps,
            position: etat.position.clone(),
            velocite: etat.velocite.clone(),
            forces,
            energie: {
                cinetique: E_cin,
                potentielle: E_pot,
                totale: E_cin + E_pot
            }
        })
    }
    
    exporterCSV(): string {
        // Exporter pour analyse dans Excel/Python
    }
}
```

#### 10.2.2 Tests unitaires pour la physique
```typescript
// Fichier: tests/physique.test.ts
describe('CalculateurAerodynamique', () => {
    it('doit calculer une portance nulle pour vent parallèle', () => {
        const calc = new CalculateurAerodynamique()
        const geometrie = new GeometrieCerfVolant()
        const orientation = new THREE.Quaternion()
        const ventApparent = new THREE.Vector3(10, 0, 0)
        
        // Orienter la normale perpendiculaire au vent
        orientation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
        
        const forces = calc.calculerForcesAeroDetaillees(geometrie, orientation, ventApparent)
        const liftTotal = forces.reduce((sum, f) => sum + f.forceLift.length(), 0)
        
        expect(liftTotal).toBeLessThan(0.1)  // Pratiquement zéro
    })
    
    it('doit générer une portance maximale à alpha optimal', () => {
        // Test à alpha ≈ 45° où sin(α)cos(α) est maximal
    })
})
```

#### 10.2.3 Mode replay et analyse
```typescript
// Enregistrer et rejouer des vols
class EnregistreurVol {
    enregistrer() {
        // Sauvegarder l'état à chaque frame
    }
    
    rejouer(fichier) {
        // Rejouer un vol enregistré
        // Utile pour déboguer des comportements spécifiques
    }
}
```

### 10.3 Améliorations futures 🌟

#### 10.3.1 Simulation multi-physique
- **Vent thermique** : Colonnes d'air chaud ascendant
- **Turbulences réalistes** : Simulation CFD simplifiée
- **Élasticité de la toile** : Modèle masse-ressort

#### 10.3.2 Intelligence artificielle
```typescript
// Pilote IA qui apprend à faire des figures
class PiloteIA {
    private reseau: NeuralNetwork
    
    decider(etat: EtatPhysique, vent: Vent): {deltaLongueur: number} {
        const entrees = [
            etat.position.x, etat.position.y, etat.position.z,
            etat.velocite.x, etat.velocite.y, etat.velocite.z,
            vent.parametres.vitesse, vent.parametres.turbulence
        ]
        
        const sortie = this.reseau.predict(entrees)
        return { deltaLongueur: sortie[0] }
    }
    
    entrainer(recompense: number) {
        // Apprentissage par renforcement
    }
}
```

#### 10.3.3 Mode multijoueur
- Plusieurs cerf-volants dans la même simulation
- Compétition de figures acrobatiques
- Évitement de collisions

#### 10.3.4 Réalité virtuelle
- Support Oculus/Vive
- Contrôles gestuels pour les lignes
- Vue à la première personne depuis le sol

---

## 📊 RÉSUMÉ TECHNIQUE

### Forces et leurs magnitudes typiques

| Force | Direction | Magnitude typique | Impact |
|-------|-----------|-------------------|--------|
| **Gravité** | ↓ (Y-) | 1.47 N | Tire vers le bas |
| **Portance** | ⊥ vent, vers le haut | 40-60 N | Soutient le CV |
| **Traînée** | ← parallèle au vent | 3-8 N | Freine le CV |
| **Lignes (2)** | → vers station | 40-70 N | Maintient le CV |
| **TOTALE** | Variable | 20-80 N | Mouvement résultant |

### Paramètres clés du système

```typescript
// CERF-VOLANT
masse = 0.15 kg
envergure = 1.65 m
surface_totale ≈ 0.8 m²
inertie = (0.06, 0.06, 0.09) kg⋅m²

// AÉRODYNAMIQUE
densité_air = 1.225 kg/m³
C_L_max ≈ 2.5 (alpha = 45°)
C_D_min ≈ 0.05 (alpha = 0°)
alpha_stall = 25°

// LIGNES
longueur_base = 10 m
raideur = 25 N/m
amortissement = 5 N⋅s/m
delta_longueur = [-0.6, +0.6] m

// CONTRÔLES
vitesse_delta = 0.8 m/s
vitesse_retour = 1.0 m/s

// SIMULATION
méthode = Euler simple
deltaTime ≈ 0.016 s (60 FPS)
```

### Flux de calcul par frame

```
1. Entrées clavier → deltaLongueur
2. Vent global - Velocité CV → Vent apparent
3. Pour chaque panneau :
   - Normale × Vent → Angle d'attaque
   - Alpha → C_L, C_D
   - Coefficients + Pression dynamique → Forces
4. Gravité (distribuée)
5. Lignes (modèle ressort-amortisseur)
6. Σ Forces → Accélération → Δ Velocité → Δ Position
7. Σ Couples → Accélération angulaire → Δ Orientation
8. Contraintes (sol)
9. Rendu 3D
```

---

## ✅ CONCLUSION

### Points forts du projet
- ✅ Architecture modulaire claire et bien organisée
- ✅ Modèle physique complet (6 degrés de liberté)
- ✅ Calculs aérodynamiques par panneau (précis)
- ✅ Système de contrôle réaliste (différence de longueur)
- ✅ Visualisation 3D interactive avec mode debug
- ✅ Gardes contre les instabilités numériques

### Points à améliorer
- ⚠️ Intégrateur Euler simple (source d'instabilité)
- ⚠️ Coefficients aérodynamiques à calibrer
- ⚠️ Pas de contrainte de longueur maximale des lignes
- ⚠️ Modèle de vent simplifié
- ⚠️ Tests unitaires manquants

### Verdict global
Le projet est **fonctionnel et bien conçu** avec une base solide pour la simulation physique. Les calculs sont **mathématiquement corrects** et l'architecture est **extensible**. Les principales améliorations concernent la **stabilité numérique** (intégrateur) et le **réalisme physique** (calibration des coefficients).

**Note technique** : 8/10 ⭐
- Physique : 8/10 (correct mais perfectible)
- Code : 9/10 (très propre et bien structuré)
- Stabilité : 7/10 (quelques risques d'instabilité)
- Réalisme : 7/10 (bon compromis simulation/jeu)

---

## 📝 ANNEXES

### A. Formules de référence

#### Équations du mouvement (Newton)
```
F = m × a
τ = I × α

où :
    F = force totale (N)
    m = masse (kg)
    a = accélération (m/s²)
    τ = couple (N⋅m)
    I = inertie (kg⋅m²)
    α = accélération angulaire (rad/s²)
```

#### Forces aérodynamiques
```
F_lift = C_L × (0.5 × ρ × V²) × S
F_drag = C_D × (0.5 × ρ × V²) × S

où :
    C_L, C_D = coefficients sans dimension
    ρ = densité de l'air (kg/m³)
    V = vitesse du vent apparent (m/s)
    S = surface (m²)
```

#### Modèle de ressort
```
F = -k × Δx - c × v

où :
    k = raideur (N/m)
    Δx = élongation (m)
    c = amortissement (N⋅s/m)
    v = vitesse relative (m/s)
```

### B. Système de coordonnées

**Repère global (monde)** :
- X+ : Est (direction du vent)
- Y+ : Haut (verticale)
- Z+ : Sud (vers l'observateur)
- Origine : Sol, centre de la station

**Repère local (cerf-volant)** :
- X+ : Envergure (vers l'aile droite)
- Y+ : Nez (vers le haut du CV)
- Z+ : Extrados (face avant)
- Origine : Centre de masse (approx. centre géométrique)

**Angles d'Euler** :
- Pitch (tangage) : Rotation autour de X (nez haut/bas)
- Yaw (lacet) : Rotation autour de Y (nez gauche/droite)
- Roll (roulis) : Rotation autour de Z (inclinaison latérale)

### C. Glossaire

- **Angle d'attaque** : Angle entre la corde du profil et le vent relatif
- **Extrados** : Face supérieure (bombée) d'un profil aérodynamique
- **Intrados** : Face inférieure (plate) d'un profil aérodynamique
- **Portance** : Force perpendiculaire à la direction du vent
- **Traînée** : Force parallèle à la direction du vent
- **Couple** : Moment de force qui tend à faire tourner un objet
- **Quaternion** : Représentation mathématique d'une orientation 3D
- **Brides** : Cordes reliant la structure du CV aux points de contrôle
- **Treuils** : Points d'attache des lignes au sol (poignées)

---

**Fin du rapport d'audit**

*Ce document a été généré par analyse automatique du code source.*  
*Pour toute question ou précision, veuillez consulter le code source dans le dépôt.*
