#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"

python3 - "$ROOT" <<'PY'
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(sys.argv[1]).resolve()
updates_root = root / "project-updates"
allowed_scope = {"planning", "implementation", "mixed"}
required_frontmatter = ["createdBy", "date", "priority", "type", "scope"]
required_sections = [
    "## What to do",
    "## Files affected",
    "## Why",
    "## Verification",
]

files = []
if updates_root.exists():
    # Validate changed update files by default (new policy applies to new/edited files).
    candidates = set()
    try:
        status = subprocess.check_output(["git", "status", "--porcelain"], cwd=root, text=True)
        for line in status.splitlines():
            if len(line) >= 4:
                candidates.add(line[3:])
    except Exception:
        pass

    if not candidates:
        try:
            recent = subprocess.check_output(["git", "diff", "--name-only", "HEAD^"], cwd=root, text=True)
            for line in recent.splitlines():
                if line.strip():
                    candidates.add(line.strip())
        except Exception:
            pass

    for rel in sorted(candidates):
        p = root / rel
        if (
            rel.startswith("project-updates/")
            and rel.endswith(".md")
            and rel != "project-updates/README.md"
            and p.exists()
        ):
            files.append(p)

    # Fallback: if no git context is available, validate all update files except README.
    if not candidates:
        files = [
            p
            for p in sorted(updates_root.rglob("*.md"))
            if p.relative_to(root).as_posix() != "project-updates/README.md"
        ]

issues = []

for path in files:
    text = path.read_text(encoding="utf-8")
    rel = path.relative_to(root)
    if not text.startswith("---\n"):
        issues.append(f"{rel}: missing frontmatter block")
        continue

    m = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not m:
        issues.append(f"{rel}: malformed frontmatter block")
        continue

    fm = m.group(1)
    body = text[m.end():]

    fields = {}
    for line in fm.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        k, v = line.split(":", 1)
        fields[k.strip()] = v.strip()

    for key in required_frontmatter:
        if key not in fields or not fields[key]:
            issues.append(f"{rel}: missing frontmatter field '{key}'")

    scope = fields.get("scope", "")
    if scope and scope not in allowed_scope:
        issues.append(
            f"{rel}: invalid scope '{scope}' (expected one of: planning, implementation, mixed)"
        )

    for section in required_sections:
        if section not in body:
            issues.append(f"{rel}: missing section '{section}'")

if not files:
    print("OK: no project-updates markdown files found")
    sys.exit(0)

if issues:
    print("FAIL: project-updates schema violations found")
    for issue in issues:
        print(f" - {issue}")
    sys.exit(1)

print(f"OK: validated {len(files)} project-updates file(s)")
PY
