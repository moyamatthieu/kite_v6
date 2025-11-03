# Instructions Copilot - Simulateur de Cerf-Volant Physique

## Vue d'ensemble du projet

Ce projet est un **simulateur de cerf-volant acrobatique** avec physique avancée et autopilotage, construit avec **Three.js** et **TypeScript**. La simulation calcule les forces aérodynamiques, tensions des lignes, et permet un pilotage manuel ou automatique via 7 modes d'autopilotage avec contrôleurs PID.

**Points clés :**
- Simulation physique temps réel (60 FPS) avec intégration de Verlet
- Architecture modulaire : physique, contrôles, rendu 3D séparés
- Système de coordonnées : X+ = direction du vent, Y+ = altitude, Z+ = extrados du cerf-volant
- Tout le code et commentaires sont en **français**

## Architecture et flux de données

### Structure principale (orchestration)

1. **`Simulation.ts`** - Chef d'orchestre de tous les modules
   - Boucle d'animation principale (`boucleAnimation()`)
   - Séquence critique à chaque frame :
     1. Mise à jour des contrôles (utilisateur/autopilote)
     2. Calcul physique (`MoteurPhysique.mettreAJour()`)
     3. Application aux objets 3D (position, orientation)
     4. Mise à jour visuelle (lignes, trajectoire, UI)
   - Gère le logging périodique avec buffer circulaire (8 entrées max)

2. **`Scene.ts`** - Rendu Three.js
   - Caméra PerspectiveCamera positionnée pour vue optimale
   - Grille 20×20m pour référence spatiale

### Physique (`src/physique/`)

Le moteur physique calcule 3 forces principales **dans cet ordre** :

```typescript
// 1. Forces aérodynamiques (par panneau)
dernieresForcesAeroDetaillees = calculerForcesAeroDetaillees()
// 2. Force de gravité (distribuée par panneau)
forceGravite = masse × gravité
// 3. Forces des lignes (ressort-amortisseur bi-régime)
{ force: forceLignes, couple: coupleLignes } = systemeLignes.calculerForces()
```

**Fichiers critiques :**
- **`MoteurPhysique.ts`** : Intégration des forces → accélération → vitesse → position
  - Amortissement numérique : `PHYSIQUE.FACTEUR_AMORTISSEMENT = 0.99` après calcul d'accélération
  - Limites de sécurité : `PHYSIQUE.VITESSE_MAX = 30 m/s`, `VITESSE_ANGULAIRE_MAX = 8 rad/s`
  - Properties publiques pour logging : `derniereForceAero`, `derniereForceTotale`, etc.

- **`SystemeLignes.ts`** : Modèle bi-régime des lignes
  - **Régime 1** (distance < `longueurRepos`=99% longueur) : tension minimale 0.008N
  - **Régime 2** (distance ≥ repos) : `F = k×Δl + c×v` avec lissage temporel (α=0.45)
  - Paramètres par défaut : `raideur=10 N/m`, `amortissement=10 Ns/m`
  - **Important** : Appeler `reinitialiserTensionsLissees()` lors des resets

- **`CalculateurAerodynamique.ts`** : Forces par panneaux (4 panneaux)
  - Calcul d'angle d'attaque : `α = arcsin(|normale · vent_direction|)`
  - Portance : `L = 0.5 × ρ × v² × S × Cl(α)`
  - Traînée : `D = 0.5 × ρ × v² × S × Cd(α)`

### Géométrie (`src/cerfvolant/`)

- **`GeometrieCerfVolant.ts`** : Définit les points structurels du cerf-volant
  - Points clés : `NEZ`, `BORD_GAUCHE/DROIT`, `CTRL_GAUCHE/DROIT` (points de contrôle des brides)
  - Brides calculées par **trilatération 3D** (intersection de 3 sphères)
  - Paramètres de brides : `nez`, `inter`, `centre` (longueurs en mètres)
  - **Convention** : Panneaux définis dans le sens qui génère normales cohérentes (règle main droite)

### Contrôles (`src/controles/`)

- **`AutoPilote.ts`** : 7 modes avec contrôleurs PID
  ```typescript
  // Modes disponibles :
  MANUEL, STABILISATION, MAINTIEN_ALTITUDE, MAINTIEN_POSITION, 
  ZENITH, TRAJECTOIRE_CIRCULAIRE, ACROBATIQUE
  ```
  - Calcul PID : `commande = Kp×e + Ki×∫e·dt + Kd×de/dt`
  - **Anti-windup** : Limites sur termes intégraux depuis `AUTOPILOTE.LIMITE_INTEGRALE_*`
  - Mode ZENITH : Position cible `(0, longueurLignes, 0)` - au-dessus de la station

- **`ControleurUtilisateur.ts`** : Gestion clavier/souris
  - Bascule automatique manuel ↔ autopilote
  - Commande = `deltaLongueur` : plage [-0.5m, +0.5m] (amplitude totale 1m)

### UI (`src/ui/`)

- **`InterfaceUtilisateur.ts`** : Panneau de contrôle HTML/CSS
  - Callbacks connectés dans `Simulation.connecterUI()`
  - Mise à jour temps réel : debug, log, indicateur pilotage

## Conventions de développement

### Configuration centralisée

**⚠️ SOURCE UNIQUE DE VÉRITÉ : `src/Config.ts`**

Toutes les constantes du projet sont centralisées dans `Config.ts` :
- `PHYSIQUE` : Masse, gravité, amortissement, limites de vitesse
- `LIGNES` : Raideur, amortissement, tensions, lissage
- `CONTROLE` : Delta max, vitesses de pilotage
- `GEOMETRIE` : Dimensions du cerf-volant et brides
- `AUTOPILOTE` : Paramètres PID, limites de sécurité
- `VENT` : Vitesse et direction par défaut
- `UI` : Intervalles de log, taille des buffers
- `RENDU` : Grille, FPS cible
- `COORDONNEES` : Système de référence et orientation initiale

**Ne jamais définir de constantes en dur** - toujours importer depuis `Config.ts`.

### Système de coordonnées et orientation

```typescript
// Repère global :
// X+ : Direction du vent (souffle de X+ vers X-)
// Y+ : Altitude (vers le haut)
// Z+ : Extrados du cerf-volant (face exposée)
// Z- : Intrados (face qui reçoit le vent)

// Orientation initiale (voir Simulation.reinitialiser() et COORDONNEES dans Config.ts) :
const orientationInitiale = new THREE.Quaternion();
const axeRotation = new THREE.Vector3(
    COORDONNEES.ROTATION_INITIALE.AXE.x,
    COORDONNEES.ROTATION_INITIALE.AXE.y, 
    COORDONNEES.ROTATION_INITIALE.AXE.z
);
orientationInitiale.setFromAxisAngle(axeRotation, COORDONNEES.ROTATION_INITIALE.ANGLE);
// Rotation -90° sur Y : intrados (Z-) fait face au vent (X+)
```

### Gestion de la mémoire

- **Toujours** appeler `dispose()` sur les géométries/matériaux Three.js
- Voir `Simulation.dispose()` pour pattern de nettoyage complet
- Désactiver frustum culling pour lignes : `ligne.frustumCulled = false`

### Patterns de logging

```typescript
// Logging structuré avec buffer circulaire :
private logsBuffer: string[] = [];
private readonly MAX_LOG_ENTRIES = UI.MAX_LOG_ENTRIES; // depuis Config.ts

// Format : Timestamp + rapport multi-lignes
const timestamp = this.horloge.elapsedTime.toFixed(1);
this.logsBuffer.push(`━━━━━ T+${timestamp}s ━━━━━\n${log}`);
```

### Conventions de nommage

- Classes : `PascalCase` (ex: `MoteurPhysique`, `CerfVolant`)
- Méthodes : `camelCase` (ex: `mettreAJour`, `calculerForces`)
- Constantes : `UPPER_SNAKE_CASE` (ex: `ALTITUDE_MAX`, `DELTA_MAX`)
- Propriétés privées : préfixe `_` pour les backing fields (ex: `_longueurBaseLignes`)

## Workflows de développement

### Commandes essentielles

```bash
npm run dev    # Démarre Vite sur http://localhost:3000 (hot reload automatique)
npm run build  # Build de production
npm run preview # Prévisualise le build
```

**Note** : Le serveur Vite reste actif avec hot reload - pas besoin de redémarrer entre les modifications.

### Debugger la physique (workflow hot reload)

**Pas de tests automatisés** - développement itératif avec observation visuelle :

1. Activer mode debug : `cerfVolant.basculerDebug(true)` (activé par défaut)
2. Observer en temps réel dans le navigateur (Vite hot reload automatique)
3. Consulter forces dans `MoteurPhysique.derniereForceAero`, `derniereForceTotale`, etc.
4. **Surveiller tensions lignes** : `systemeLignes.derniereTensionGauche/Droite`
   - Tensions normales : 0.5N à 20N selon vent
   - Variations brusques (>50N/frame) = instabilité imminente
   - Tension = 0 ou NaN = problème critique
5. Analyser log périodique : voir `Simulation.genererRapportLog()`
6. Modifier code → auto-reload → observer effet immédiat

**Scénarios de test typiques** :
- Vent faible (5 km/h) : Vol stable, tensions faibles
- Vent moyen (20 km/h) : Vol dynamique, cerf-volant réactif
- Vent fort (40 km/h) : Limite de stabilité, tensions élevées
- Autopilote ZENITH : Test de convergence vers position cible

### Ajouter un nouveau mode d'autopilotage

1. Ajouter enum dans `ModeAutoPilote` (`AutoPilote.ts`)
2. Créer méthode `private calculer<NouveauMode>()` 
3. Ajouter case dans `switch` de `calculerCommande()`
4. Implémenter `getInfosEtat()` pour affichage UI
5. Connecter bouton dans `InterfaceUtilisateur.ts`

### Modifier les paramètres physiques

**⚠️ ZONE CRITIQUE : Contrainte des lignes**

Le système de lignes est le **point sensible majeur** du projet - équilibre délicat entre :
- **Effet ressort excessif** → oscillations/vibrations incontrôlables
- **Explosion numérique** → forces infinies, crash de la simulation

**Paramètres interdépendants** dans `Config.ts > LIGNES` :
- `RAIDEUR` (k) et `AMORTISSEMENT` (c) : Respecter c ≈ 2√(k×m) pour amortissement critique
- `COEFFICIENT_LISSAGE` (0.3-0.5) : Plus bas = plus stable mais moins réactif
- `RATIO_LONGUEUR_REPOS` (0.99) : Définit la pré-tension, ne pas toucher sans tests approfondis
- `PHYSIQUE.FACTEUR_AMORTISSEMENT` (0.99) : Ne pas descendre sous 0.95

**Méthodologie de modification** :
1. **Modifier uniquement dans `Config.ts`** - source unique de vérité
2. Ne changer qu'**un seul paramètre** à la fois
3. Tester avec vent faible (5 km/h) puis augmenter progressivement
4. Observer les logs de tension : variations > 50N/frame = signe d'instabilité
5. Si explosion : réduire raideur OU augmenter amortissement OU augmenter lissage
6. Si trop mou : inverse, mais par petits incréments (±10%)

Toutes les constantes physiques sont documentées dans `Config.ts`.

## Points d'attention

### Pièges courants

1. **C'est un cerf-volant, pas un avion** ⚠️
   
   **Différence fondamentale** : Un cerf-volant est un **système contraint** par des lignes, contrairement à un avion libre.
   
   - Le cerf-volant est **attaché par des lignes** : il ne peut pas voler librement dans l'espace
   - La portance ne sert **pas à vaincre la gravité** comme un avion - elle crée une **composante de force**
   - Les forces aérodynamiques créent une **tension dans les lignes** qui ne tire pas mais retienne le cerf-volant a une distance fixé par la longeur des lignes a la station de pilotage
   - Le pilotage se fait par **différence de position des ctrl** ce qui crée entre lignes gauche/droite (asymétrie des forces)
   
   **Géométrie des forces critiques** :
   ```typescript
   // ❌ Pensée incorrecte : "Plus de portance = le cerf-volant monte"
   // ✅ Réalité : La portance génère une force dans la direction de la normale du cerf-volant
   
   // Exemple : Cerf-volant nez vers le bas (plongée)
   // - Portance pointe vers le bas (direction de la normale)
   // - Accélération résultante : vers le bas (plongée accélérée)
   // - Le cerf-volant ne "remonte" pas automatiquement
   
   // L'équilibre dépend de la géométrie complète :
   // Force_resultante = Force_aero + Force_gravite + Force_lignes
   ```
   
   **Cas typiques à comprendre** :
   - **Vol horizontal** : Portance perpendiculaire au vent, équilibre gravité via tension des lignes
   - **Montée** : Cerf-volant orienté nez vers le haut, portance aide à tirer vers la station
   - **Plongée** : Cerf-volant nez vers le bas, portance accélère la descente (pas l'inverse !)
   - **Virage** : Asymétrie des tensions → couple de rotation → changement d'orientation
   
   **Implication pour le code** : Ne jamais implémenter de logique "portance = sustentation". 
   Toujours calculer l'équilibre des 3 forces dans leur géométrie réelle.

2. **Oublier `applyQuaternion()`** : Les points locaux doivent être transformés en monde
   ```typescript
   // ✅ Correct
   const pointMonde = pointLocal.clone().applyQuaternion(etat.orientation).add(etat.position);
   // ❌ Incorrect
   const pointMonde = pointLocal.clone().add(etat.position);
   ```

3. **Modifier l'ordre des forces** : L'ordre dans `MoteurPhysique.mettreAJour()` est critique
   - Aéro → Gravité → Lignes (toujours dans cet ordre)

4. **Ne pas normaliser les quaternions** : Après rotations, toujours `orientation.normalize()`

5. **Accès à l'objet 3D du cerf-volant** :
   ```typescript
   // ✅ Correct (CerfVolant est un conteneur)
   this.cerfVolant.objet3D.position.copy(...)
   // ❌ Incorrect
   this.cerfVolant.position.copy(...)
   ```

### Documentation de référence

- **AUTOPILOTE.md** : Guide complet des 7 modes d'autopilotage
- **README.md** : Architecture, installation, utilisation
- **CORRECTIONS_CALCULS_VECTEURS.md** : (vide, historique)

## Intégrations externes

- **Three.js** : Rendu 3D, calculs vectoriels (Vector3, Quaternion, Euler)
- **Vite** : Build tool, serveur dev sur port 3000 avec hot reload
- **TypeScript** : Strict mode activé (`tsconfig.json`)

## Priorités de développement actuelles

**Objectif principal** : **Consolider la stabilité physique**, pas ajouter de fonctionnalités

1. **Comportement des lignes** : Éliminer oscillations/explosions numériques
   - Affiner les paramètres du modèle bi-régime
   - Améliorer la robustesse aux conditions extrêmes (vent fort, manœuvres brusques)
   
2. **Comportement du cerf-volant en vol** : Réalisme et prévisibilité
   - Réponse cohérente aux commandes de pilotage
   - Transitions fluides entre états (montée/descente, virages)
   - Stabilité en vol stationnaire

**Approche** : Modifications incrémentales + tests visuels (pas de régression de fonctionnalités)

## Notes finales

- Ce projet privilégie le **réalisme physique** sur la performance
- Les calculs aérodynamiques sont **simplifiés mais cohérents** (pas de CFD)
- L'autopilotage utilise des **PID classiques** (pas de ML/AI)
- Toutes les unités sont **SI** : mètres, kg, secondes, Newtons
- **Développement itératif** : Hot reload Vite + observation visuelle (pas de tests auto)
