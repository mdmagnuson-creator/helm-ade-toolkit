#!/usr/bin/env bash
set -euo pipefail

# Migrate project updates from legacy toolkit location to project repos
#
# Usage:
#   ./scripts/migrate-project-updates.sh [--dry-run] [--no-commit]
#
# This script:
# 1. Finds all update files in ~/.config/opencode/project-updates/
# 2. Copies them to each project's docs/pending-updates/
# 3. Adds 'updateType: schema' to frontmatter if missing
# 4. Commits the changes in each project
# 5. Deletes the original files from the legacy location

DRY_RUN=false
NO_COMMIT=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --no-commit)
      NO_COMMIT=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Find legacy updates directory
LEGACY_DIR="$HOME/.config/opencode/project-updates"

if [[ ! -d "$LEGACY_DIR" ]]; then
  echo "No legacy project-updates directory found at $LEGACY_DIR"
  echo "Nothing to migrate."
  exit 0
fi

# Find projects.json
PROJECTS_JSON="$HOME/.config/opencode/projects.json"
if [[ ! -f "$PROJECTS_JSON" ]]; then
  echo "Error: projects.json not found at $PROJECTS_JSON"
  exit 1
fi

python3 - "$LEGACY_DIR" "$PROJECTS_JSON" "$DRY_RUN" "$NO_COMMIT" <<'PY'
import json
import pathlib
import re
import subprocess
import sys

legacy_dir = pathlib.Path(sys.argv[1])
projects_json_path = pathlib.Path(sys.argv[2])
dry_run = sys.argv[3].lower() == "true"
no_commit = sys.argv[4].lower() == "true"

# Load projects
with open(projects_json_path) as f:
    projects_data = json.load(f)

# Build project lookup
projects_by_id = {}
for p in projects_data.get("projects", []):
    projects_by_id[p["id"]] = pathlib.Path(p["path"])

def ensure_updatetype_in_frontmatter(content):
    """Add updateType: schema to frontmatter if missing."""
    if not content.startswith("---\n"):
        return content
    
    match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if not match:
        return content
    
    fm = match.group(1)
    if "updateType:" in fm:
        return content  # Already has updateType
    
    # Add updateType before the closing ---
    new_fm = fm.rstrip() + "\nupdateType: schema"
    return f"---\n{new_fm}\n---\n" + content[match.end():]

# Find all project directories in legacy location
migrated = []
skipped = []
errors = []

for project_dir in sorted(legacy_dir.iterdir()):
    if not project_dir.is_dir():
        continue
    
    project_id = project_dir.name
    
    if project_id not in projects_by_id:
        skipped.append((project_id, "project not in projects.json"))
        continue
    
    project_path = projects_by_id[project_id]
    
    if not project_path.exists():
        skipped.append((project_id, "project path does not exist"))
        continue
    
    # Find update files
    update_files = list(project_dir.glob("*.md"))
    if not update_files:
        continue
    
    target_dir = project_path / "docs" / "pending-updates"
    
    for update_file in update_files:
        if update_file.name == "README.md":
            continue
        
        try:
            content = update_file.read_text()
            new_content = ensure_updatetype_in_frontmatter(content)
            target_file = target_dir / update_file.name
            
            if dry_run:
                print(f"DRY RUN: Would copy {update_file} -> {target_file}")
            else:
                target_dir.mkdir(parents=True, exist_ok=True)
                target_file.write_text(new_content)
                print(f"Copied: {update_file.name} -> {target_file}")
                
                # Stage the file
                if not no_commit:
                    subprocess.run(
                        ["git", "add", str(target_file.relative_to(project_path))],
                        cwd=project_path,
                        check=True,
                        capture_output=True
                    )
                
                migrated.append((project_id, update_file.name, target_file))
        except Exception as e:
            errors.append((project_id, update_file.name, str(e)))

# Commit changes in each project
if not dry_run and not no_commit and migrated:
    # Group by project
    by_project = {}
    for pid, fname, target in migrated:
        if pid not in by_project:
            by_project[pid] = []
        by_project[pid].append(fname)
    
    for pid, files in by_project.items():
        project_path = projects_by_id[pid]
        try:
            # Check if there are staged changes
            result = subprocess.run(
                ["git", "diff", "--cached", "--name-only"],
                cwd=project_path,
                capture_output=True,
                text=True
            )
            if result.stdout.strip():
                subprocess.run(
                    ["git", "commit", "-m", f"chore: migrate {len(files)} pending update(s) from legacy location"],
                    cwd=project_path,
                    check=True,
                    capture_output=True
                )
                print(f"Committed {len(files)} update(s) in {pid}")
        except Exception as e:
            errors.append((pid, "commit", str(e)))

# Delete original files after successful migration
if not dry_run and migrated:
    for pid, fname, target in migrated:
        if target.exists():
            original = legacy_dir / pid / fname
            if original.exists():
                original.unlink()
                print(f"Deleted original: {original}")
    
    # Clean up empty directories
    for project_dir in legacy_dir.iterdir():
        if project_dir.is_dir() and not list(project_dir.glob("*")):
            project_dir.rmdir()
            print(f"Removed empty directory: {project_dir}")

# Summary
print()
print("Migration Summary:")
print(f"  Migrated: {len(migrated)} file(s)")
print(f"  Skipped projects: {len(skipped)}")
print(f"  Errors: {len(errors)}")

if skipped:
    print()
    print("Skipped:")
    for pid, reason in skipped:
        print(f"  - {pid}: {reason}")

if errors:
    print()
    print("Errors:")
    for pid, fname, err in errors:
        print(f"  - {pid}/{fname}: {err}")
    sys.exit(1)
PY
