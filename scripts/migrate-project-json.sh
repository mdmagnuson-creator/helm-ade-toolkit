#!/bin/bash
#
# Migrate project.json from 'features' to 'capabilities' schema
#
# Usage:
#   ./migrate-project-json.sh [path/to/project]
#
# If no path provided, uses current directory.
# Looks for docs/project.json in the project root.
#

set -e

PROJECT_PATH="${1:-.}"
PROJECT_JSON="$PROJECT_PATH/docs/project.json"

# Check if file exists
if [ ! -f "$PROJECT_JSON" ]; then
  echo "❌ No project.json found at: $PROJECT_JSON"
  echo ""
  echo "Usage: $0 [path/to/project]"
  exit 1
fi

# Check if already migrated
if grep -q '"capabilities"' "$PROJECT_JSON"; then
  echo "✅ Already migrated: $PROJECT_JSON"
  echo "   (found 'capabilities' key)"
  exit 0
fi

# Check if has features to migrate
if ! grep -q '"features"' "$PROJECT_JSON"; then
  echo "⚠️  No 'features' key found in: $PROJECT_JSON"
  echo "   Nothing to migrate."
  exit 0
fi

# Create backup
BACKUP="$PROJECT_JSON.backup.$(date +%Y%m%d%H%M%S)"
cp "$PROJECT_JSON" "$BACKUP"
echo "📦 Backup created: $BACKUP"

# Perform migration
# 1. Rename "features" to "capabilities"
# 2. Remove "darkMode" from capabilities (it belongs in styling.darkMode)
sed -i '' 's/"features"/"capabilities"/g' "$PROJECT_JSON"

echo "✅ Migrated: $PROJECT_JSON"
echo ""
echo "Changes made:"
echo "  - Renamed 'features' → 'capabilities'"
echo ""
echo "Optional: Add workflows section to customize build steps:"
echo ""
echo '  "workflows": {'
echo '    "adhoc": ["build", "typecheck", "lint", "test", "critic", "commit"],'
echo '    "prd": ["build", "critic", "tester", "typecheck", "lint", "test", "e2e", "commit"]'
echo '  }'
echo ""
echo "See schema for all available workflow steps."
