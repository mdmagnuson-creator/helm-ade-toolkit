#!/usr/bin/env bash
set -euo pipefail

# Generate project updates for projects matching an affinity rule
#
# Usage:
#   ./scripts/generate-project-updates.sh --rule <rule-id> --name <update-name> --template <template-file> [--dry-run]
#
# Example:
#   ./scripts/generate-project-updates.sh --rule desktop-apps --name add-executable-path --template templates/updates/add-executable-path.md

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse arguments
RULE_ID=""
UPDATE_NAME=""
TEMPLATE_FILE=""
DRY_RUN=false
PRIORITY="normal"
UPDATE_TYPE="schema"

while [[ $# -gt 0 ]]; do
  case $1 in
    --rule)
      RULE_ID="$2"
      shift 2
      ;;
    --name)
      UPDATE_NAME="$2"
      shift 2
      ;;
    --template)
      TEMPLATE_FILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --priority)
      PRIORITY="$2"
      shift 2
      ;;
    --type)
      UPDATE_TYPE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$RULE_ID" ]]; then
  echo "Error: --rule is required"
  exit 1
fi

if [[ -z "$UPDATE_NAME" ]]; then
  echo "Error: --name is required"
  exit 1
fi

# Get today's date
TODAY=$(date +%Y-%m-%d)
UPDATE_ID="${TODAY}-${UPDATE_NAME}"

# Find projects.json
PROJECTS_JSON="$HOME/.config/opencode/projects.json"
if [[ ! -f "$PROJECTS_JSON" ]]; then
  echo "Error: projects.json not found at $PROJECTS_JSON"
  exit 1
fi

# Find affinity rules
RULES_FILE="$TOOLKIT_ROOT/data/update-affinity-rules.json"
if [[ ! -f "$RULES_FILE" ]]; then
  echo "Error: update-affinity-rules.json not found at $RULES_FILE"
  exit 1
fi

# Run the Python script to match projects and generate updates
python3 - "$PROJECTS_JSON" "$RULES_FILE" "$RULE_ID" "$UPDATE_ID" "$TEMPLATE_FILE" "$DRY_RUN" "$PRIORITY" "$UPDATE_TYPE" <<'PY'
import json
import pathlib
import sys
from datetime import datetime

projects_json_path = pathlib.Path(sys.argv[1])
rules_file_path = pathlib.Path(sys.argv[2])
rule_id = sys.argv[3]
update_id = sys.argv[4]
template_file = sys.argv[5] if sys.argv[5] else None
dry_run = sys.argv[6].lower() == "true"
priority = sys.argv[7]
update_type = sys.argv[8]

# Load projects
with open(projects_json_path) as f:
    projects_data = json.load(f)

# Load affinity rules
with open(rules_file_path) as f:
    rules_data = json.load(f)

# Find the matching rule
rule = None
for r in rules_data.get("rules", []):
    if r["id"] == rule_id:
        rule = r
        break

if not rule:
    print(f"Error: Rule '{rule_id}' not found in {rules_file_path}")
    sys.exit(1)

def get_nested(obj, path):
    """Get nested value from object using dot notation."""
    parts = path.split(".")
    current = obj
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current

def matches_where(item, where_conditions):
    """Check if an item matches all where conditions."""
    for key, expected in where_conditions.items():
        actual = get_nested(item, key)
        if expected is None:
            # null means field should NOT exist
            if actual is not None:
                return False
        elif actual != expected:
            return False
    return True

def evaluate_rule(project_json, match_config):
    """Evaluate if a project matches the rule."""
    path = match_config["path"]
    condition = match_config["condition"]
    
    if condition == "always":
        return True
    
    value = get_nested(project_json, path)
    
    if condition == "equals":
        return value == match_config.get("value")
    
    if condition == "contains":
        if isinstance(value, list):
            return match_config.get("value") in value
        return False
    
    if condition == "exists":
        return value is not None
    
    if condition == "notExists":
        return value is None
    
    if condition == "hasValueWhere":
        if isinstance(value, dict):
            # Check each value in the dict (e.g., apps.web, apps.desktop)
            where = match_config.get("where", {})
            for item in value.values():
                if isinstance(item, dict) and matches_where(item, where):
                    return True
        elif isinstance(value, list):
            where = match_config.get("where", {})
            for item in value:
                if isinstance(item, dict) and matches_where(item, where):
                    return True
        return False
    
    return False

def is_already_applied(project_path, update_id):
    """Check if update was already applied."""
    applied_file = project_path / "docs" / "applied-updates.json"
    if not applied_file.exists():
        return False
    try:
        with open(applied_file) as f:
            data = json.load(f)
        for entry in data.get("applied", []):
            if entry.get("id") == update_id:
                return True
    except Exception:
        pass
    return False

def has_pending_update(project_path, update_id):
    """Check if update is already pending."""
    pending_dir = project_path / "docs" / "pending-updates"
    pending_file = pending_dir / f"{update_id}.md"
    return pending_file.exists()

# Load template if provided
template_content = ""
if template_file and pathlib.Path(template_file).exists():
    template_content = pathlib.Path(template_file).read_text()

# Generate frontmatter
today = datetime.now().strftime("%Y-%m-%d")
frontmatter = f"""---
createdBy: toolkit
date: {today}
priority: {priority}
updateType: {update_type}
affinityRule: {rule_id}
---
"""

# Process each project
matched = []
skipped = []
already_applied = []
already_pending = []

for project in projects_data.get("projects", []):
    if not project.get("hasAgentSystem", False):
        skipped.append((project["id"], "no agent system"))
        continue
    
    project_path = pathlib.Path(project["path"])
    project_json_path = project_path / "docs" / "project.json"
    
    if not project_json_path.exists():
        skipped.append((project["id"], "no project.json"))
        continue
    
    try:
        with open(project_json_path) as f:
            project_json = json.load(f)
    except Exception as e:
        skipped.append((project["id"], f"invalid project.json: {e}"))
        continue
    
    # Check if already applied
    if is_already_applied(project_path, update_id):
        already_applied.append(project["id"])
        continue
    
    # Check if already pending
    if has_pending_update(project_path, update_id):
        already_pending.append(project["id"])
        continue
    
    # Evaluate rule
    if evaluate_rule(project_json, rule["match"]):
        matched.append(project)
    else:
        skipped.append((project["id"], "rule not matched"))

# Generate updates
if dry_run:
    print(f"DRY RUN - Would generate updates for {len(matched)} project(s):")
    for p in matched:
        print(f"  - {p['id']}: {p['path']}/docs/pending-updates/{update_id}.md")
else:
    for p in matched:
        project_path = pathlib.Path(p["path"])
        pending_dir = project_path / "docs" / "pending-updates"
        pending_dir.mkdir(parents=True, exist_ok=True)
        
        update_file = pending_dir / f"{update_id}.md"
        
        if template_content:
            content = frontmatter + "\n" + template_content
        else:
            content = frontmatter + f"""
# {update_id.replace('-', ' ').title()}

## What to do

<!-- Describe the steps to apply this update -->

## Files affected

- `docs/project.json`

## Why

<!-- Explain why this update is needed -->

## Verification

<!-- How to verify the update was applied correctly -->
"""
        
        update_file.write_text(content)
        print(f"Created: {update_file}")

# Summary
print()
print(f"Summary for rule '{rule_id}':")
print(f"  Matched: {len(matched)}")
print(f"  Already applied: {len(already_applied)}")
print(f"  Already pending: {len(already_pending)}")
print(f"  Skipped: {len(skipped)}")

if skipped and not dry_run:
    print()
    print("Skipped projects:")
    for pid, reason in skipped:
        print(f"  - {pid}: {reason}")
PY
