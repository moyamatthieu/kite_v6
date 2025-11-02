# 🤖 Système d'Autopilotage du Cerf-Volant

## Vue d'ensemble

Le système d'autopilotage implémenté dans `AutoPilote.ts` fournit plusieurs modes de pilotage automatique avancés pour le cerf-volant. Il utilise des contrôleurs PID (Proportionnel-Intégral-Dérivé) pour assurer un contrôle précis et stable.

## Modes Disponibles

### 1. Manuel (Touche `1`)
Mode par défaut où l'utilisateur contrôle directement le cerf-volant avec les flèches ou Q/D.

### 2. Stabilisation (Touche `2`)
Maintient automatiquement le cerf-volant droit (angle de roulis proche de 0°).
- **Utilité** : Évite les rotations non désirées
- **Contrôleur** : PID sur l'angle de roulis
- **Paramètres** : Kp=2.0, Ki=0.1, Kd=0.5

### 3. Maintien d'Altitude (Touche `3`)
Maintient le cerf-volant à l'altitude actuelle au moment de l'activation.
- **Utilité** : Vol stationnaire à une hauteur constante
- **Contrôleur** : PID sur l'altitude + stabilisation (30%)
- **Paramètres** : Kp=0.8, Ki=0.05, Kd=0.3
- **Limites** : Altitude entre 3m et 15m

### 4. Maintien de Position (Touche `4`)
Maintient le cerf-volant à la position 3D actuelle (X, Y, Z).
- **Utilité** : Point stationnaire dans l'espace
- **Contrôleur** : PID combiné (altitude 40%, latéral 40%, stabilisation 20%)
- **Paramètres latéraux** : Kp=1.2, Ki=0.08, Kd=0.4
- **Limites** : Distance horizontale max 20m, altitude 3-15m

### 5. Position Zénith (Touche `5`) ☀️
Positionne automatiquement le cerf-volant au zénith, directement au-dessus de la station de contrôle.
- **Utilité** : Position la plus stable, exposition maximale au soleil, point de référence
- **Position cible** : (X=0, Y=15m, Z=0) - altitude maximale au centre
- **Contrôleur** : Identique au maintien de position 3D
- **Avantage** : Position optimale pour observer la physique sans dérive latérale

### 6. Trajectoire Circulaire (Touche `6`)
Fait voler le cerf-volant en cercle autour de sa position initiale.
- **Utilité** : Démonstration, figures automatiques
- **Paramètres** :
  - Rayon par défaut : 3 mètres
  - Vitesse angulaire : 0.5 rad/s (~30°/s)
- **Configuration** : `setRayonCirculaire(rayon)` pour modifier

### 7. Mode Acrobatique (Touche `7`)
Exécute des figures acrobatiques préprogrammées.
- **Séquences disponibles** :
  - `loop` : Looping avec oscillations sinusoïdales fortes
  - `eight` : Figure en 8 avec alternance gauche/droite
  - `wave` : Vague avec oscillations douces
- **Configuration** : `setSequenceAcrobatique(sequence)`
- **Durée** : Boucles de 10 secondes

## Activation et Utilisation

### Touches Clavier
- **A** : Active/désactive l'autopilote
- **1-7** : Change le mode (autopilote doit être actif)
- **Q/←** : Pilotage manuel gauche (désactive autopilote)
- **D/→** : Pilotage manuel droite (désactive autopilote)

### Workflow Typique
1. Appuyer sur **A** pour activer l'autopilote
2. Appuyer sur **2-7** pour sélectionner un mode
3. Observer le comportement dans l'indicateur de pilotage
4. Appuyer sur **A** pour reprendre le contrôle manuel

## Architecture Technique

### Contrôleurs PID

Le système utilise des contrôleurs PID pour chaque axe de contrôle :

```typescript
interface ParametresPID {
    kp: number; // Terme proportionnel - réponse immédiate à l'erreur
    ki: number; // Terme intégral - corrige l'erreur accumulée
    kd: number; // Terme dérivé - anticipe les changements
}
```

#### Calcul de la Commande
```
commande = Kp × erreur + Ki × ∫erreur·dt + Kd × d(erreur)/dt
```

### Anti-windup
Pour éviter l'accumulation excessive de l'erreur intégrale, des limites sont appliquées :
- Erreur intégrale d'altitude : [-3, 3]
- Erreur intégrale latérale : [-3, 3]
- Erreur intégrale de roulis : [-2, 2]

### Limites de Sécurité
- **Altitude minimale** : 3m
- **Altitude maximale** : 15m
- **Distance horizontale maximale** : 20m
- **Delta de longueur max** : ±0.6m (correspond aux limites du contrôle manuel)

## Intégration avec les Autres Modules

### ControleurUtilisateur
Le `ControleurUtilisateur` intègre l'autopilote et bascule automatiquement entre :
- Contrôle manuel (touches Q/D)
- Contrôle automatique (autopilote actif)

### Simulation
La `Simulation` passe l'état physique à chaque frame au contrôleur, permettant à l'autopilote de calculer les commandes appropriées.

### InterfaceUtilisateur
L'UI affiche en temps réel :
- État de l'autopilote (actif/inactif)
- Mode actuel
- Informations spécifiques au mode (altitude cible, distance, etc.)

## Exemples d'Utilisation par Code

### Configuration d'un Vol Circulaire
```typescript
const autoPilote = new AutoPilote(vent);
autoPilote.setActif(true);
autoPilote.setMode(ModeAutoPilote.TRAJECTOIRE_CIRCULAIRE, etatPhysique);
autoPilote.setRayonCirculaire(5.0); // Rayon de 5m
```

### Configuration d'une Position Cible
```typescript
autoPilote.setActif(true);
autoPilote.setMode(ModeAutoPilote.MAINTIEN_POSITION, etatPhysique);
autoPilote.setPositionCible(new THREE.Vector3(5, 10, 2));
```

### Lancement d'une Séquence Acrobatique
```typescript
autoPilote.setActif(true);
autoPilote.setMode(ModeAutoPilote.ACROBATIQUE, etatPhysique);
autoPilote.setSequenceAcrobatique('loop');
```

## Amélioration Future

Voici quelques pistes d'amélioration possibles :

1. **Trajectoires personnalisées** : Permettre de définir des waypoints
2. **Apprentissage** : Ajuster automatiquement les paramètres PID
3. **Réaction au vent** : Compensation avancée des turbulences
4. **Évitement d'obstacles** : Détection et évitement automatique
5. **Vol en formation** : Coordination de plusieurs cerfs-volants
6. **Trajectoires paramétriques** : Courbes de Bézier, lemniscate, etc.

## Dépendances

- `THREE.Vector3` : Pour les calculs de position et direction
- `THREE.Quaternion` et `THREE.Euler` : Pour les rotations
- `EtatPhysique` : État du cerf-volant
- `Vent` : Informations sur le vent pour compensation

## Tests Recommandés

1. **Test de stabilisation** : Lancer avec du vent fort et activer la stabilisation
2. **Test d'altitude** : Changer le vent et vérifier le maintien d'altitude
3. **Test de position** : Perturber manuellement et observer le retour
4. **Test circulaire** : Varier le rayon et la vitesse du vent
5. **Test acrobatique** : Observer les différentes séquences

## Notes Techniques

- Le système calcule les commandes à chaque frame (60 FPS typiquement)
- Les transitions entre modes réinitialisent les accumulateurs PID
- Le mode manuel désactive automatiquement l'autopilote si des touches sont pressées
- L'état est préservé entre les activations/désactivations

---

**Créé le** : 2 novembre 2025
**Version** : 1.0
**Auteur** : Système d'autopilotage pour simulation de cerf-volant
