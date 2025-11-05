# Scripts d'export du code

Ce dossier contient des scripts pour exporter tout le code du projet dans un seul fichier Markdown.

## Scripts disponibles

### 1. Script Node.js (recommandé)

**Fichier:** `export-code.cjs`

**Utilisation:**
```bash
# Export avec nom par défaut (code-export.md)
npm run export

# Ou directement
node scripts/export-code.cjs

# Export avec nom personnalisé
node scripts/export-code.cjs mon-export.md
```

**Avantages:**
- Statistiques détaillées (nombre de lignes, taille par type de fichier)
- Table des matières générée automatiquement
- Formatage Markdown propre avec coloration syntaxique

### 2. Script Bash (alternatif)

**Fichier:** `export-code.sh`

**Utilisation:**
```bash
# Export avec nom par défaut (code-export.md)
npm run export:bash

# Ou directement
./scripts/export-code.sh

# Export avec nom personnalisé
./scripts/export-code.sh mon-export.md
```

**Avantages:**
- Fonctionne sans Node.js installé
- Plus simple et rapide pour un export basique

## Contenu exporté

Les scripts exportent automatiquement :

### Fichiers inclus
- 📄 Fichiers TypeScript/JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`)
- 🎨 Fichiers de style (`.css`)
- 📋 Fichiers HTML (`.html`)
- 📝 Fichiers de configuration (`.json`, `.config.ts`, `.config.js`)
- 📖 Documentation (`.md`)

### Fichiers exclus
- ❌ `node_modules/`
- ❌ `dist/`, `build/`
- ❌ `.git/`, `.vscode/`
- ❌ `package-lock.json`
- ❌ Fichiers d'export précédents

## Format du fichier généré

Le fichier Markdown généré contient :

1. **En-tête** avec date d'export
2. **Statistiques** du projet (version Node.js uniquement)
   - Nombre total de fichiers
   - Nombre total de lignes de code
   - Répartition par type de fichier
3. **Table des matières** avec liens (version Node.js uniquement)
4. **Code source** complet
   - Chaque fichier dans sa propre section
   - Avec chemin relatif
   - Coloration syntaxique appropriée
   - Métadonnées (nombre de lignes, taille)

## Exemple de sortie

```markdown
# Export du code - Simulateur de Cerf-Volant

**Date d'export:** 05/11/2025 14:30:00  
**Projet:** kite_v6

---

# Statistiques du projet

**Fichiers totaux:** 28  
**Lignes totales:** 3,245  
**Taille totale:** 125.34 Ko

## Par type de fichier

| Extension | Fichiers | Lignes | Taille |
|-----------|----------|--------|--------|
| .ts | 20 | 2,850 | 95.23 Ko |
| .tsx | 2 | 125 | 4.56 Ko |
...

---

# Table des matières

- [src/index.tsx](#srcindextsx)
- [src/core/Simulation.ts](#srccoressimulationts)
...

---

# Code source

## src/index.tsx

**Lignes:** 45 | **Taille:** 1234 octets

\`\`\`typescript
import { NewSimulation } from './core/Simulation';
...
\`\`\`

---
```

## Utilisation du fichier exporté

Le fichier généré peut être utilisé pour :

- 📤 **Partage** du code complet avec des collaborateurs
- 🤖 **Analyse** par des LLM (ChatGPT, Claude, etc.)
- 📚 **Archivage** de versions du projet
- 🔍 **Revue de code** complète
- 📖 **Documentation** technique

## Personnalisation

Pour modifier les types de fichiers inclus/exclus, éditez les constantes au début de `export-code.cjs` :

```javascript
const INCLUDE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', ...];
const EXCLUDE_DIRS = ['node_modules', 'dist', ...];
const EXCLUDE_FILES = ['package-lock.json', ...];
```
