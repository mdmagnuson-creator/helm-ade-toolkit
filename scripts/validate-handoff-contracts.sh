#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"

python3 - "$ROOT" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1]).resolve()
builder = (root / "agents" / "builder.md").read_text(encoding="utf-8")
planner = (root / "agents" / "planner.md").read_text(encoding="utf-8")
toolkit = (root / "agents" / "toolkit.md").read_text(encoding="utf-8")

issues = []

# Builder checks
if "\"pending updates\", \"project updates\", \"apply updates\"" not in builder:
    issues.append("agents/builder.md: missing pending/project updates intent row")
if "Handle in Builder" not in builder:
    issues.append("agents/builder.md: pending updates intent is not explicitly handled by Builder")
if "Process pending project updates from `project-updates/`" in builder:
    issues.append("agents/builder.md: contains legacy prohibition against project-updates processing")
# Builder should NOT redirect to planner - both can handle any update
# Check for positive redirect instructions (not "no need to redirect")
if "redirect to @planner" in builder.lower() and "no need" not in builder.lower():
    issues.append("agents/builder.md: contains legacy redirection to @planner for project updates")

# Planner checks
if "Process pending updates" not in planner:
    issues.append("agents/planner.md: missing pending updates U-flow guidance")
# Planner should NOT redirect to builder - both can handle any update
# Check for positive redirect instructions (not "no need to redirect")
if ("hand to @builder" in planner.lower() or "route to @builder" in planner.lower()) and "no need" not in planner.lower():
    issues.append("agents/planner.md: contains legacy redirection to @builder for project updates")

# Toolkit checks - both can handle any scope now
if "Updates for @builder and @planner" not in toolkit:
    issues.append("agents/toolkit.md: project-updates ownership line should mention both agents equally")

if issues:
    print("FAIL: handoff contract inconsistencies found")
    for issue in issues:
        print(f" - {issue}")
    sys.exit(1)

print("OK: handoff contracts are consistent across builder/planner/toolkit")
PY
