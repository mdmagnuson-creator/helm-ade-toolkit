#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"

python3 - "$ROOT" <<'PY'
import json
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(sys.argv[1]).resolve()
issues = []
warnings = []

structure_path = root / "toolkit-structure.json"
readme_path = root / "README.md"
local_overrides_path = root / ".local" / "toolkit-overrides.json"
resolved_website_project_id = ""


def resolve_website_mode() -> str:
    global resolved_website_project_id
    mode = "disabled"
    if local_overrides_path.exists():
        try:
            overrides = json.loads(local_overrides_path.read_text(encoding="utf-8"))
        except Exception as exc:
            issues.append(f"{local_overrides_path}: invalid JSON ({exc})")
            return mode
        mode = overrides.get("websiteSync", {}).get("mode", mode)
        resolved_website_project_id = overrides.get("websiteSync", {}).get("projectId", "")

    if mode not in {"disabled", "owner-managed", "queue-file"}:
        issues.append(
            f"{local_overrides_path}: websiteSync.mode must be one of disabled|owner-managed|queue-file"
        )
        return "disabled"
    return mode

if not structure_path.exists():
    print("FAIL: toolkit-structure.json is missing")
    sys.exit(1)

data = json.loads(structure_path.read_text(encoding="utf-8"))
generated_at = data.get("generatedAt", "")
if not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$", generated_at):
    issues.append("toolkit-structure.json: generatedAt is missing or not ISO-8601 UTC format")

agent_count_actual = len(list((root / "agents").glob("*.md")))
skill_count_actual = len(list((root / "skills").rglob("SKILL.md")))

agent_count_manifest = int(data.get("agents", {}).get("total", -1))
skill_count_manifest = int(data.get("skills", {}).get("total", -1))

if agent_count_actual != agent_count_manifest:
    issues.append(
        f"toolkit-structure.json: agents.total={agent_count_manifest}, actual={agent_count_actual}"
    )
if skill_count_actual != skill_count_manifest:
    issues.append(
        f"toolkit-structure.json: skills.total={skill_count_manifest}, actual={skill_count_actual}"
    )

if not readme_path.exists():
    issues.append("README.md is missing")
else:
    readme = readme_path.read_text(encoding="utf-8")
    m_agents = re.search(r"\| \[`agents/`\]\(#agents\) \| (\d+) autonomous agents", readme)
    m_skills = re.search(r"\| \[`skills/`\]\(#skills\) \| (\d+) reusable skills", readme)
    if not m_agents:
        issues.append("README.md: could not find agents count row")
    else:
        readme_agents = int(m_agents.group(1))
        if readme_agents != agent_count_actual:
            issues.append(f"README.md: agents count={readme_agents}, actual={agent_count_actual}")
    if not m_skills:
        issues.append("README.md: could not find skills count row")
    else:
        readme_skills = int(m_skills.group(1))
        if readme_skills != skill_count_actual:
            issues.append(f"README.md: skills count={readme_skills}, actual={skill_count_actual}")

try:
    status = subprocess.check_output(["git", "status", "--porcelain"], cwd=root, text=True)
    changed = []
    for line in status.splitlines():
        if len(line) >= 4:
            changed.append(line[3:])

    structural_changed = any(
        p.startswith("agents/")
        or p.startswith("skills/")
        or p.startswith("schemas/")
        or p in {"README.md", "toolkit-structure.json"}
        for p in changed
    )

    if structural_changed:
        website_mode = resolve_website_mode()
        if website_mode == "queue-file":
            if not resolved_website_project_id:
                issues.append(
                    "websiteSync.mode=queue-file requires websiteSync.projectId in .local/toolkit-overrides.json"
                )
                website_updates = []
            else:
                website_updates = list((root / "project-updates" / resolved_website_project_id).glob("*.md"))
            if not website_updates:
                issues.append(
                    "websiteSync.mode=queue-file but no toolkit website sync update found in project-updates/<websiteSync.projectId>/"
                )
except Exception:
    warnings.append("git status unavailable; skipped website sync heuristic")

if issues:
    print("FAIL: toolkit post-change validation failed")
    for issue in issues:
        print(f" - {issue}")
    if warnings:
        print("WARNINGS:")
        for warning in warnings:
            print(f" - {warning}")
    sys.exit(1)

if warnings:
    print("OK WITH WARNINGS: toolkit post-change checks passed")
    for warning in warnings:
        print(f" - {warning}")
    sys.exit(0)

print("OK: toolkit post-change checks passed")
PY
