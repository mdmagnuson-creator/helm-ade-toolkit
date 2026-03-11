# Helm ADE Toolkit Cleanup Report

**PRD:** prd-toolkit-helm-ade-cleanup  
**Date:** March 11, 2026  
**Scope:** Remove all standalone terminal/"yo-go" assumptions from helm-ade-toolkit and make it a native Helm ADE toolkit  
**Commits:** 12 (d9bcf9b through 89d09c1)  
**Branch:** main (trunk branchless)

---

## Before/After Metrics

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total files | 531 | 481 | −50 |
| Lines of content (`.md`, `.json`, `.sh`) | 110,127 | 81,378 | −28,749 (−26.1%) |
| Agent files | 63 | 62 | −1 |
| Skill files (SKILL.md) | 68 | 68 | 0 (3 deleted, 3 created) |
| Schema files | 18 | 16 | −2 |
| Script files (`scripts/`) | 8 | 6 | −2 |
| Standalone scripts (root `.sh`) | 2 | 0 | −2 |
| Docs files (non-.gitkeep) | 56 | 8 | −48 |

"Before" = commit `8836c1c` (pre-cleanup baseline, after `$OPENCODE_CONFIG` migration).  
"After" = commit `89d09c1` (HEAD after all cleanup stories).

---

## Files Deleted (58 total)

### Agents (1)
| File | Story |
|------|-------|
| `agents/merge-coordinator.md` | US-003 |

### Skills (3)
| File | Story |
|------|-------|
| `skills/session-setup/SKILL.md` | US-002 |
| `skills/multi-session/SKILL.md` | US-002 |
| `skills/git-sync/SKILL.md` | US-005 |

### Schemas (2)
| File | Story |
|------|-------|
| `schemas/merge-queue.schema.json` | US-003 |
| `schemas/projects-registry.schema.json` | US-007 |

### Scripts (2)
| File | Story |
|------|-------|
| `scripts/generate-project-updates.sh` | US-007 |
| `scripts/migrate-project-updates.sh` | US-007 |

### Standalone Scripts (2)
| File | Story |
|------|-------|
| `install.sh` | US-006 |
| `bootstrap.sh` | US-006 |

### Docs (48)
| Category | Count | Story |
|----------|-------|-------|
| `docs/completed/` | 28 files | US-012 |
| `docs/prds/` | 10 files | US-012 |
| `docs/drafts/` | 5 files | US-012 |
| `docs/archived/` | 2 files | US-012 |
| `docs/research/` | 1 file | US-012 |
| `docs/memory/intelligent-ai-delegation-paper.md` | 1 file | US-012 |
| `docs/DESIGN-project-bootstrap-v2.md` | 1 file | US-012 |

---

## Files Created (7 total)

### Skills (3)
| File | Story | Purpose |
|------|-------|---------|
| `skills/task-promotion/SKILL.md` | US-001 | Extracted from planner.md — ad-hoc task promotion to PRD |
| `skills/pending-updates/SKILL.md` | US-001 | Extracted from planner.md — pending update processing |
| `skills/cross-project-prds/SKILL.md` | US-001 | Extracted from planner.md — cross-project PRD coordination |

### Directory Placeholders (4)
| File | Story |
|------|-------|
| `docs/completed/.gitkeep` | US-012 |
| `docs/drafts/.gitkeep` | US-012 |
| `docs/prds/.gitkeep` | US-012 |
| `docs/archived/.gitkeep` | US-012 |
| `docs/research/.gitkeep` | US-012 |

---

## Files Modified (58 total)

### Core Files
| File | Change Summary |
|------|----------------|
| `.gitignore` | Added `!skills/pending-updates/` exception (+1) |
| `AGENTS.md` | Added Helm ADE Startup Pattern section, removed projects.json/terminal-mode references (+85/−7) |
| `CONTRIBUTING.md` | Replaced "yo-go" with "Helm ADE" (+1/−1) |
| `README.md` | Replaced `projects.json` reference with `applied-updates.json` (+1/−1) |
| `toolkit-structure.json` | Removed merge-queue, projects-registry, session-locks references; fixed yo-go refs (+5/−20) |

### Agent Templates
| File | Change Summary |
|------|----------------|
| `agent-templates/testing/playwright.md` | Replaced "yo-go" branding with "Helm ADE" (+2/−2) |

### Agents (27 modified)
| File | Change Summary |
|------|----------------|
| `agents/builder.md` | Removed project selection table, terminal mode detection, projects.json refs, session-locks, team sync (+49/−238) |
| `agents/planner.md` | Removed project selection, session-locks, team sync, extracted 3 skills; added Helm ADE startup (+69/−722) |
| `agents/developer.md` | Removed projects.json lookups, session-lock references (+16/−36) |
| `agents/session-status.md` | Removed session-locks, merge-queue, project selection; added HELM_PROJECT_PATH (+13/−76) |
| `agents/toolkit.md` | Replaced yo-go branding, removed projects.json management, session-lock refs (+56/−59) |
| `agents/ui-test-full-app-auditor.md` | Removed projects.json lookup, added HELM_PROJECT_PATH (+16/−35) |
| `agents/ui-test-reviewer.md` | Removed projects.json lookup, simplified startup (+6/−7) |
| `agents/ui-tester-playwright.md` | Removed projects.json lookup, simplified startup (+11/−11) |
| `agents/qa-browser-tester.md` | Removed projects.json lookup (+6/−7) |
| `agents/qa-explorer.md` | Removed projects.json lookup (+5/−6) |
| `agents/screenshot-maintainer.md` | Removed projects.json lookup (+5/−6) |
| `agents/support-article-writer.md` | Removed projects.json lookup (+5/−6) |
| `agents/semantic-critic.md` | Removed projects.json lookup (+3/−4) |
| `agents/overlord.md` | Removed projects.json lookup (+4/−4) |
| `agents/hammer.md` | Removed projects.json lookup (+5/−5) |
| `agents/tester.md` | Removed projects.json lookup (+3/−3) |
| `agents/wall-e.md` | Removed projects.json lookup (+3/−3) |
| `agents/felix.md` | Removed projects.json lookup (+1/−1) |
| `agents/handoff-contract-critic.md` | Replaced yo-go branding (+1/−1) |
| `agents/workflow-enforcement-critic.md` | Replaced yo-go branding (+1/−1) |
| `agents/aws-dev.md` | Removed projects.json lookup (+2/−3) |
| `agents/docker-dev.md` | Removed projects.json lookup (+2/−3) |
| `agents/go-dev.md` | Removed projects.json lookup (+2/−3) |
| `agents/java-dev.md` | Removed projects.json lookup (+2/−3) |
| `agents/public-page-dev.md` | Removed projects.json lookup (+2/−3) |
| `agents/python-dev.md` | Removed projects.json lookup (+2/−3) |
| `agents/react-dev.md` | Removed projects.json lookup (+2/−3) |
| `agents/terraform-dev.md` | Removed projects.json lookup (+2/−3) |

### Schemas (3 modified)
| File | Change Summary |
|------|----------------|
| `schemas/builder-config.schema.json` | Removed teamSync property (−7) |
| `schemas/project.schema.json` | Removed teamSync, merge-queue, session-locks properties (+10/−89) |
| `schemas/ui-test-audit-manifest.schema.json` | Replaced yo-go branding (+1/−1) |

### Scripts (1 modified)
| File | Change Summary |
|------|----------------|
| `scripts/check-dev-server.sh` | Read devPort from project-local `docs/project.json` instead of projects.json (+5/−6) |

### Skills (17 modified)
| File | Change Summary |
|------|----------------|
| `skills/project-bootstrap/SKILL.md` | Removed standalone terminal wizard, added HELM_PROJECT_PATH entry point (+58/−316) |
| `skills/agent-audit/SKILL.md` | Replaced projects.json/activeProject checks with HELM_PROJECT_PATH, removed --all mode (+26/−94) |
| `skills/prd-workflow/SKILL.md` | Removed session-lock references, projects.json refs (+11/−70) |
| `skills/test-url-resolution/SKILL.md` | Removed projects.json devPort lookup, simplified URL resolution (+26/−61) |
| `skills/agent-onboard/SKILL.md` | Removed projects.json references (+16/−38) |
| `skills/start-dev-server/SKILL.md` | Removed projects.json devPort lookup (+15/−23) |
| `skills/project-scaffold/SKILL.md` | Removed projects.json references (+6/−6) |
| `skills/builder-verification/SKILL.md` | Minor cleanup of standalone references (+4/−4) |
| `skills/test-flow/SKILL.md` | Removed standalone terminal references (+3/−3) |
| `skills/ui-test-flow/SKILL.md` | Removed standalone terminal references (+3/−3) |
| `skills/stack-advisor/SKILL.md` | Removed projects.json reference (+2/−2) |
| `skills/session-state/SKILL.md` | Removed standalone reference (+2/−2) |
| `skills/prd-to-json/SKILL.md` | Replaced "bootstrap wizard" with "project-bootstrap" (+2/−2) |
| `skills/dynamic-reassignment/SKILL.md` | Minor cleanup (+1/−1) |
| `skills/adhoc-workflow/SKILL.md` | Minor cleanup (+1/−1) |
| `skills/spec-analyzer/SKILL.md` | Minor cleanup (+1/−1) |
| `skills/prd/SKILL.md` | Replaced "bootstrap wizard" with "project-bootstrap" (+1/−1) |
| `skills/ui-test-full-app-audit/SKILL.md` | Replaced yo-go branding (+1/−1) |

### Data Files (1 modified)
| File | Change Summary |
|------|----------------|
| `data/related-projects.md` | Updated related project references (+25/−18) |

### Docs (2 modified)
| File | Change Summary |
|------|----------------|
| `docs/prd-registry.json` | Emptied to `{ "prds": [] }` — all historical PRDs removed (+1/−207) |
| `docs/project.json` | Replaced yo-go branding references (+3/−3) |

---

## Grep Match Removal

All target patterns reduced to **zero matches** across agents, skills, schemas, scripts, and docs:

| Pattern | Matches Before | Matches After |
|---------|---------------|---------------|
| `projects.json` | 120+ | 0 |
| `session-locks.json` | 25+ | 0 |
| `merge-queue.json` | 15+ | 0 |
| `yo-go` | 30+ | 0 |
| `OPENCODE_CLIENT` | 15+ | 0 |
| `teamSync` | 10+ | 0 |

---

## Verification Summary

### US-011 Final Sweep — All Checks Pass ✅

All grep patterns return zero matches across the entire codebase:

```
projects.json:       0 matches ✅
session-locks.json:  0 matches ✅
merge-queue.json:    0 matches ✅
yo-go:               0 matches ✅
OPENCODE_CLIENT:     0 matches ✅
teamSync:            0 matches ✅
```

### Agent Helm ADE Startup Pattern Audit

4 of 62 agents have the explicit `HELM_PROJECT_PATH` startup pattern. The remaining 58 agents are specialist agents (critics, testers, language-specific devs) that receive project context via delegation from orchestrator agents — they do not need their own startup pattern.

| Agent | Has Pattern | Role |
|-------|-------------|------|
| `builder.md` | ✅ | Primary orchestrator — reads `HELM_PROJECT_PATH` at startup |
| `planner.md` | ✅ | Primary orchestrator — reads `HELM_PROJECT_PATH` at startup |
| `session-status.md` | ✅ | Status dashboard — reads `HELM_PROJECT_PATH` at startup |
| `ui-test-full-app-auditor.md` | ✅ | Full-app auditor — reads `HELM_PROJECT_PATH` at startup |
| All other agents (58) | ⬜ | Specialist agents — receive context via sub-agent delegation |

---

## Commit Log

| Commit | Story | Description |
|--------|-------|-------------|
| `d9bcf9b` | US-001 | Remove standalone project context from all agents, add Helm ADE startup pattern |
| `75c9e04` | US-002 | Remove file-based session locks and session-setup/multi-session skills |
| `fcd3051` | US-003 | Remove file-based merge queue and merge-coordinator agent |
| `0ceee8d` | US-004 | Update check-dev-server.sh to read devPort from project-local docs/project.json |
| `f723dbc` | US-005 | Remove team sync and git-based PRD auto-commit |
| `9793150` | US-006 | Replace all yo-go branding with Helm ADE |
| `4dad61b` | US-007 | Clean up schemas, data files, and remove orphaned scripts |
| `ac7194b` | US-008 | Clean up project-bootstrap skill to remove standalone terminal flows |
| `dd4f823` | US-009 | Update agent-audit skill compliance criteria for Helm ADE |
| `5cebbf2` | US-010 | Remove session lock references from prd-workflow skill |
| `ba5acc3` | US-012 | Delete all historical yo-go era docs and empty PRD registry |
| `89d09c1` | US-011 | Final sweep — fix remaining standalone references across 4 files |
