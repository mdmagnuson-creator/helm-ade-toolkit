#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"

python3 - "$ROOT" <<'PY'
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(sys.argv[1]).resolve()

targets = []
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
    if not p.exists():
        continue
    if rel.startswith("agents/") and rel.endswith(".md"):
        targets.append(p)
    if rel.startswith("skills/") and rel.endswith("SKILL.md"):
        targets.append(p)

# Fallback if git context unavailable.
if not targets and not candidates:
    targets = list((root / "agents").glob("*.md")) + list((root / "skills").rglob("SKILL.md"))

hard_rule = re.compile(r"\b(MUST|CRITICAL|NEVER)\b")
trigger_markers = ["if ", "when ", "before ", "after ", "during "]
evidence_markers = ["check", "verify", "validate", "report", "file", "output", "status"]
failure_markers = ["fail", "stop", "block", "redirect", "warn", "error", "do not"]

issues = []

for path in targets:
    rel = path.relative_to(root)
    lines = path.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        if i < 8:
            # Skip frontmatter to avoid false positives in metadata descriptions.
            continue
        if not hard_rule.search(line):
            continue

        window = " ".join(lines[i : min(len(lines), i + 7)]).lower()
        has_trigger = any(token in window for token in trigger_markers)
        has_evidence = any(token in window for token in evidence_markers)
        has_failure = any(token in window for token in failure_markers)

        missing = []
        if not has_trigger:
            missing.append("trigger")
        if not has_evidence:
            missing.append("evidence")
        if not has_failure:
            missing.append("failure behavior")

        if missing:
            snippet = line.strip()
            issues.append(
                f"{rel}:{i+1}: hard rule may be non-testable (missing {', '.join(missing)}): {snippet}"
            )

if issues:
    print("FAIL: potential non-testable hard rules found")
    for issue in issues:
        print(f" - {issue}")
    sys.exit(1)

print(f"OK: no non-testable hard rules found across {len(targets)} prompt files")
PY
