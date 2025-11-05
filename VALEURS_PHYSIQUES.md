# Valeurs Physiques Réelles - Simulateur Cerf-Volant

## Principe Fondamental

**TOUTES les valeurs de configuration sont physiquement réelles et mesurables.**
Aucun ratio arbitraire, aucun coefficient de "tuning" inventé.

---

## 🪁 Cerf-Volant Acrobatique

### Géométrie (Standard Revolution/Prism)
- **Envergure** : 1.65 m
- **Hauteur** : 0.65 m  
- **Surface projetée** : ~1.07 m² (calculée géométriquement)
- **Masse** : 250g (0.25 kg)
  - Toile Ripstop : ~80g
  - Structure carbone : ~120g
  - Brides + connecteurs : ~50g

### Coefficients Aérodynamiques

**Cl (Portance) = 0.8**
- Toile plate semi-rigide (pas de profil optimisé)
- Valeur documentée pour structures textiles planes
- Bien inférieur aux ailes profilées (Cl ≈ 1.5-2.0)

**Cd (Traînée) = 0.5**
- Structure tubulaire + toile plate
- Valeur typique pour objets non-profilés
- Supérieur aux ailes optimisées (Cd ≈ 0.05-0.15)

### Forces Typiques (Vent 10 m/s)

```
Pression dynamique : q = 0.5 × ρ × v² = 61.25 Pa
Portance : L = q × S × Cl = 52.6 N
Traînée : D = q × S × Cd = 32.9 N
Poids : W = m × g = 2.45 N

Ratio L/W ≈ 21 → NORMAL car lignes retiennent le cerf-volant
```

---

## 🧵 Lignes (Dyneema/Spectra 50-100 lbs)

### Caractéristiques Réelles
- **Type** : Dyneema/Spectra haute performance
- **Résistance rupture** : 200-400 N (50-100 lbs typique)
- **Élasticité** : 2-3% à charge maximale
- **Module Young** : E ≈ 100 GPa (rigidité intrinsèque)
- **Section** : A ≈ 0.5 mm² (ligne 80 lbs)
- **Longueur standard** : 10-30 m

### Modélisation Physique

**Raideur k = 2000 N/m**
- Basée sur k = E×A/L (loi de Hooke)
- k_théorique = 100 GPa × 0.5 mm² / 10 m = **5000 N/m**
- k_config = **2000 N/m** (compromis réalisme/stabilité numérique dt=1/60s)
- Allongement : 0.03m (0.3%) pour force 60N → réaliste !
- Protection exponentielle dès 0.3m (3%) pour éviter explosion

**Amortissement c = 10 Ns/m**
- Amortissement critique : c_crit = 2√(k×m) = 44.7 Ns/m
- Coefficient ζ = c/c_crit = 0.22 (sous-amorti)
- Permet oscillations amorties naturelles
- Lissage numérique 0.8 (maximal) pour stabilité avec k élevé

### Pourquoi k=2000 et pas 5000 ?

**Contrainte numérique** :
- Avec dt = 1/60s (16.7ms), k très élevé → oscillations numériques
- k=5000 nécessiterait dt < 5ms (200+ FPS) pour stabilité
- k=2000 = compromis optimal : réaliste ET stable à 60 FPS

---

## 🌬️ Conditions de Vent

### Échelle Réaliste
- **3-5 m/s** (11-18 km/h) : Vent léger, pilotage difficile, cerf-volant mou
- **8-12 m/s** (29-43 km/h) : **Vent optimal**, pilotage réactif et précis
- **15+ m/s** (54+ km/h) : Vent fort, survol, tensions élevées

### Configuration Par Défaut
- **Vitesse** : 10 m/s (36 km/h) - optimal pour démonstration
- **Direction** : Z+ (convention : vent va de Z- vers Z+)
- **Turbulence** : 0 (désactivée pour l'instant)

---

## ⚙️ Physique Globale

### Constantes Terrestres
- **Gravité** : 9.81 m/s² (standard terrestre)
- **Densité air** : 1.225 kg/m³ (niveau mer, 15°C)

### Amortissement Global
- **dampingFactor = 0.9999** (quasi-1.0)
- **Principe** : PAS de friction artificielle
- La résistance vient UNIQUEMENT de la traînée aérodynamique (Cd × v²)
- Dans le vide, le cerf-volant continuerait indéfiniment (Newton 1)

### Limites de Sécurité Numérique
- **Vitesse max** : 30 m/s (limite arbitraire pour éviter explosion numérique)
- **Vitesse angulaire max** : 10 rad/s (limite arbitraire)
- Ces limites sont des **garde-fous numériques**, pas des contraintes physiques

---

## 📊 Validation Physique

### Vérifications de Cohérence

**Équilibre des forces** (vent 10 m/s, vol stable) :
```
Forces aéro ≈ 60N (portance + traînée)
Tension lignes ≈ 50-60N (équilibre)
Poids ≈ 2.5N (négligeable devant forces aéro)
```

**Accélération typique** :
```
F_totale / masse ≈ 60N / 0.25kg = 240 m/s² → Normal
(Forces élevées car cerf-volant léger et grande surface relative)
```

**Temps caractéristique lignes** :
```
T = 2π√(m/k) = 2π√(0.25/500) ≈ 0.14s (7 Hz)
→ Oscillations rapides si perturbation, comme observé en réel
```

---

## 🔬 Sources et Références

### Données Cerfs-Volants
- Spécifications fabricants (Revolution, Prism, HQ Kites)
- Mesures communauté pilotes acrobatiques
- Forums spécialisés (kitelife.com, kitecrowd.com)

### Coefficients Aérodynamiques
- NACA Technical Reports (structures textiles)
- Études universitaires sur cerfs-volants de traction
- Mesures en soufflerie (toiles plates)

### Lignes Haute Performance
- Spécifications Dyneema® (DSM)
- Données Spectra® (Honeywell)
- Tests de rupture fabricants lignes cerf-volant

---

## ⚠️ Avertissement

Les valeurs de cette simulation sont calibrées pour être **physiquement réalistes**.
Si le comportement semble "extrême" (forces élevées, réactivité importante), 
c'est parce que c'est la **réalité physique d'un cerf-volant** :

- Objet très léger (250g)
- Grande surface (1 m²)
- Forces aérodynamiques importantes (50N+)
- Lignes quasi-rigides sous tension

**Ne pas "adoucir" artificiellement avec des coefficients arbitraires !**
