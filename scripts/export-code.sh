#!/bin/bash

##
# Script shell alternatif pour exporter le code (si Node.js non disponible)
# Usage: ./scripts/export-code.sh [output-file]
##

OUTPUT_FILE="${1:-code-export.md}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMP_FILE="/tmp/code-export-$$.md"

echo "🚀 Début de l'export du code..."
echo "📂 Racine du projet: $PROJECT_ROOT"
echo "📄 Fichier de sortie: $OUTPUT_FILE"

# En-tête
cat > "$TEMP_FILE" <<EOF
# Export du code - Simulateur de Cerf-Volant

**Date d'export:** $(date '+%d/%m/%Y %H:%M:%S')  
**Projet:** kite_v6

---

# Code source

EOF

# Compteurs
total_files=0
total_lines=0

# Fonction pour obtenir le langage
get_language() {
    case "$1" in
        *.ts|*.tsx) echo "typescript" ;;
        *.js|*.jsx) echo "javascript" ;;
        *.html) echo "html" ;;
        *.css) echo "css" ;;
        *.json) echo "json" ;;
        *.md) echo "markdown" ;;
        *) echo "" ;;
    esac
}

# Fonction pour traiter un fichier
process_file() {
    local file="$1"
    local rel_path="${file#$PROJECT_ROOT/}"
    local lang=$(get_language "$file")
    local lines=$(wc -l < "$file")
    local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
    
    ((total_files++))
    ((total_lines+=lines))
    
    echo "  [$total_files] $rel_path"
    
    cat >> "$TEMP_FILE" <<EOF

## $rel_path

**Lignes:** $lines | **Taille:** $size octets

\`\`\`$lang
$(cat "$file")
\`\`\`

---

EOF
}

echo ""
echo "📦 Traitement des fichiers..."

# Fichiers TypeScript/JavaScript
find "$PROJECT_ROOT/src" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) 2>/dev/null | sort | while read file; do
    process_file "$file"
done

# Fichiers de configuration
for file in "$PROJECT_ROOT"/*.{json,ts,js,html,md} 2>/dev/null; do
    [ -f "$file" ] && [ "$(basename "$file")" != "package-lock.json" ] && process_file "$file"
done

# Fichiers CSS
find "$PROJECT_ROOT/src" -type f -name "*.css" 2>/dev/null | sort | while read file; do
    process_file "$file"
done

# Déplacement du fichier final
mv "$TEMP_FILE" "$PROJECT_ROOT/$OUTPUT_FILE"

echo ""
echo "✅ Export terminé avec succès!"
echo "📄 Fichier créé: $PROJECT_ROOT/$OUTPUT_FILE"
echo "📊 Fichiers traités: $total_files"
echo "📊 Lignes totales: $total_lines"
