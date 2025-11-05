#!/usr/bin/env node

/**
 * Script d'export de tout le code du projet dans un seul fichier Markdown
 * Usage: node scripts/export-code.js [output-file]
 */

const fs = require('fs');
const path = require('path');

// Fichier de sortie par défaut
const DEFAULT_OUTPUT = 'code-export.md';

// Extensions de fichiers à inclure
const INCLUDE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx',
  '.html', '.css',
  '.json', '.md',
  '.config.ts', '.config.js'
];

// Dossiers à exclure
const EXCLUDE_DIRS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.vscode',
  'coverage'
];

// Fichiers à exclure
const EXCLUDE_FILES = [
  'package-lock.json',
  'code-export.md',
  'code-export.txt'
];

/**
 * Détermine si un chemin doit être ignoré
 */
function shouldIgnore(filePath, stats) {
  const basename = path.basename(filePath);
  
  if (stats.isDirectory()) {
    return EXCLUDE_DIRS.includes(basename);
  }
  
  if (EXCLUDE_FILES.includes(basename)) {
    return true;
  }
  
  const ext = path.extname(filePath);
  return !INCLUDE_EXTENSIONS.includes(ext);
}

/**
 * Récupère tous les fichiers du projet récursivement
 */
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    
    if (shouldIgnore(filePath, stats)) {
      return;
    }
    
    if (stats.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

/**
 * Détecte le langage pour la coloration syntaxique Markdown
 */
function getLanguage(filePath) {
  const ext = path.extname(filePath);
  const map = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.html': 'html',
    '.css': 'css',
    '.json': 'json',
    '.md': 'markdown'
  };
  return map[ext] || '';
}

/**
 * Crée le contenu Markdown pour un fichier
 */
function formatFileContent(filePath, rootDir) {
  const relativePath = path.relative(rootDir, filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const language = getLanguage(filePath);
  const stats = fs.statSync(filePath);
  const lines = content.split('\n').length;
  
  return `
## ${relativePath}

**Lignes:** ${lines} | **Taille:** ${stats.size} octets

\`\`\`${language}
${content}
\`\`\`

---

`;
}

/**
 * Génère les statistiques du projet
 */
function generateStats(files, rootDir) {
  const stats = {
    totalFiles: files.length,
    totalLines: 0,
    totalSize: 0,
    byExtension: {}
  };
  
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n').length;
    const size = fs.statSync(file).size;
    const ext = path.extname(file);
    
    stats.totalLines += lines;
    stats.totalSize += size;
    
    if (!stats.byExtension[ext]) {
      stats.byExtension[ext] = { files: 0, lines: 0, size: 0 };
    }
    stats.byExtension[ext].files++;
    stats.byExtension[ext].lines += lines;
    stats.byExtension[ext].size += size;
  });
  
  return stats;
}

/**
 * Formate les statistiques en Markdown
 */
function formatStats(stats) {
  let output = `# Statistiques du projet

**Fichiers totaux:** ${stats.totalFiles}  
**Lignes totales:** ${stats.totalLines.toLocaleString()}  
**Taille totale:** ${(stats.totalSize / 1024).toFixed(2)} Ko

## Par type de fichier

| Extension | Fichiers | Lignes | Taille |
|-----------|----------|--------|--------|
`;
  
  Object.entries(stats.byExtension)
    .sort((a, b) => b[1].lines - a[1].lines)
    .forEach(([ext, data]) => {
      output += `| ${ext} | ${data.files} | ${data.lines.toLocaleString()} | ${(data.size / 1024).toFixed(2)} Ko |\n`;
    });
  
  return output + '\n---\n\n';
}

/**
 * Génère la table des matières
 */
function generateTOC(files, rootDir) {
  let toc = '# Table des matières\n\n';
  
  files.forEach(file => {
    const relativePath = path.relative(rootDir, file);
    const anchor = relativePath.replace(/[^a-zA-Z0-9\-]/g, '-').toLowerCase();
    toc += `- [${relativePath}](#${anchor})\n`;
  });
  
  return toc + '\n---\n\n';
}

/**
 * Fonction principale
 */
function main() {
  const rootDir = path.resolve(__dirname, '..');
  const outputFile = process.argv[2] || DEFAULT_OUTPUT;
  const outputPath = path.resolve(rootDir, outputFile);
  
  console.log('🚀 Début de l\'export du code...');
  console.log(`📂 Racine du projet: ${rootDir}`);
  console.log(`📄 Fichier de sortie: ${outputPath}`);
  
  // Récupération de tous les fichiers
  console.log('\n📦 Récupération des fichiers...');
  const files = getAllFiles(rootDir).sort();
  console.log(`✅ ${files.length} fichiers trouvés`);
  
  // Génération des statistiques
  console.log('\n📊 Calcul des statistiques...');
  const stats = generateStats(files, rootDir);
  
  // Création du contenu
  console.log('\n✍️  Génération du fichier Markdown...');
  let output = `# Export du code - Simulateur de Cerf-Volant

**Date d'export:** ${new Date().toLocaleString('fr-FR')}  
**Projet:** kite_v6

---

`;
  
  output += formatStats(stats);
  output += generateTOC(files, rootDir);
  
  output += '# Code source\n\n';
  
  files.forEach((file, index) => {
    const relativePath = path.relative(rootDir, file);
    console.log(`  [${index + 1}/${files.length}] ${relativePath}`);
    output += formatFileContent(file, rootDir);
  });
  
  // Écriture du fichier
  console.log('\n💾 Écriture du fichier...');
  fs.writeFileSync(outputPath, output, 'utf-8');
  
  console.log('\n✅ Export terminé avec succès!');
  console.log(`📄 Fichier créé: ${outputPath}`);
  console.log(`📊 Taille: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} Mo`);
}

// Exécution
try {
  main();
} catch (error) {
  console.error('❌ Erreur lors de l\'export:', error.message);
  process.exit(1);
}
