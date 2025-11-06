# 🧪 Liste de vérification - Tests de simulation

## 📋 Tests à effectuer

### ✅ 1. Démarrage
- [ ] La console affiche le banner de configuration
- [ ] Pas d'erreurs dans la console au démarrage
- [ ] Message `✅ ACTIFS (mode détaillé par panneau)` dans le banner

### ✅ 2. Affichage des vecteurs de forces
**Attendu** : Voir les forces dès le démarrage

- [ ] **4 flèches BLEUES** (portance par panneau) visibles
- [ ] **4 flèches ROUGES** (traînée par panneau) visibles  
- [ ] **1 flèche JAUNE** (gravité au centre de masse) visible
- [ ] **1 sphère ORANGE** (centre de masse) visible

**Si non visible** :
- Appuyer sur **F** pour toggler l'affichage
- Vérifier dans la console : `🔍 Vecteurs de forces: ACTIVÉS ✅`

### ✅ 3. Auto-reset au crash
**Test** : Faire crasher le kite

1. Tirer les commandes à fond pour faire tomber le kite
2. Observer dans la console :
   ```
   ⏱️ Kite au sol stable: 0.5s / 2.0s
   ⏱️ Kite au sol stable: 1.0s / 2.0s
   ⏱️ Kite au sol stable: 1.5s / 2.0s
   ⏱️ Kite au sol stable: 2.0s / 2.0s
   🔄 AUTO-RESET déclenché après 2.0s au sol
   ```
3. Le kite doit retourner à sa position initiale automatiquement

**Si le reset ne se déclenche pas** :
- Vérifier les messages `⏱️` dans la console
- Si pas de messages : le kite n'est peut-être pas assez stable (vitesse > 0.1 m/s)

### ✅ 4. Mode debug portance (touche L)
- [ ] Appuyer sur **L**
- [ ] Le kite se fige à 45° d'inclinaison
- [ ] Les forces par panneau restent visibles
- [ ] Le kite ne bouge plus (physique figée)

### ✅ 5. Performance
- [ ] FPS stable (>30)
- [ ] Pas de lag visible
- [ ] Console sans erreurs répétées

## 🐛 Problèmes connus et solutions

### Vecteurs non visibles
**Cause possible** : `showDebug: false` dans la config  
**Solution** : Vérifier `SimulationConfig.ts` ligne 222

### Auto-reset ne se déclenche pas
**Cause possible 1** : Le kite rebondit (vitesse > 0.1 m/s)  
**Cause possible 2** : Le kite est au-dessus de 0.5m d'altitude  
**Solution** : Observer les logs `⏱️` pour diagnostiquer

### Console saturée de logs
**Cause** : Logs de debug à chaque frame  
**Solution** : Vérifier que tous les `console.log` dans la boucle animate sont supprimés

## 📊 Logs attendus (résumé)

**Au démarrage** :
```
═══════════════════════════════════════════════════════
🪁 SIMULATION KITE v6 - Configuration
═══════════════════════════════════════════════════════
📊 Vecteurs forces: ✅ ACTIFS (mode détaillé par panneau)
🔄 Auto-reset: ✅ Actif (2.0s au sol)
⚙️  Timestep physique: 4.17ms
💨 Vent: 10.0 m/s
⚖️  Masse kite: 0.25 kg
═══════════════════════════════════════════════════════
```

**Pendant le crash** :
```
⏱️ Kite au sol stable: 0.5s / 2.0s
⏱️ Kite au sol stable: 1.0s / 2.0s
⏱️ Kite au sol stable: 1.5s / 2.0s
⏱️ Kite au sol stable: 2.0s / 2.0s
🔄 AUTO-RESET déclenché après 2.0s au sol
```

**Après reset** :
```
✅ Kite décollé ou en mouvement - Timer réinitialisé (était à 0.Xs)
```
