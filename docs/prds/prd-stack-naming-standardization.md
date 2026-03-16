# PRD: Stack Naming Standardization

## Introduction

The helm-ade-toolkit has an inconsistency in how agent and skill files reference stack fields in `project.json`. Some files use `stack.languages` (plural array) and `stack.framework` (singular), while the canonical forms used in actual `project.json` files are `stack.language` (singular string) and `stack.frameworks` (plural array).

This causes no runtime errors today because agents read whatever the file contains, but it creates confusion for anyone reading the agent/skill source and risks future breakage if validation is added.

> **Context:** This PRD was extracted from `prd-project-settings-consolidation` in the helm-ade-macos project. That PRD consolidates all `project.json` settings into Supabase and generates the file at session start using only the canonical forms. Standardizing the toolkit ensures agents match the generated output.

## Goals

- Standardize all agent and skill files to use canonical `stack.language` (singular string) and `stack.frameworks` (plural array)
- Eliminate `stack.languages` (plural) and `stack.framework` (singular) references
- No functional behavior change — naming consistency only

## User Stories

### US-001: Standardize stack.languages → stack.language

**Description:** As a developer, I need all agent and skill files to use `stack.language` (singular string) instead of `stack.languages` (plural array) so the naming matches the canonical `project.json` schema.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] All references to `stack.languages` in agent `.md` and skill `SKILL.md` files updated to `stack.language`
- [ ] Search covers all files in `agents/` and `skills/`
- [ ] No functional behavior change

**Known affected files:**
- `agents/session-status.md`
- `skills/agent-audit/SKILL.md`
- `skills/agent-onboard/SKILL.md`
- `skills/prd-to-json/SKILL.md`
- `skills/prd/SKILL.md`
- `skills/project-bootstrap/SKILL.md`
- `skills/public-page/SKILL.md`

---

### US-002: Standardize stack.framework → stack.frameworks

**Description:** As a developer, I need all agent and skill files to use `stack.frameworks` (plural array) instead of `stack.framework` (singular string) so the naming matches the canonical `project.json` schema.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] All references to `stack.framework` (singular) in agent `.md` and skill `SKILL.md` files updated to `stack.frameworks` (plural array)
- [ ] Search covers all files in `agents/` and `skills/`
- [ ] No functional behavior change

**Known affected files:**
- `skills/agent-audit/SKILL.md`
- `skills/prd/SKILL.md`
- `skills/public-page/SKILL.md`

---

### US-003: Verify no remaining inconsistencies

**Description:** As a developer, I need a final grep across the entire repo to confirm zero remaining `stack.languages` or `stack.framework` (singular) references.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] `grep -r "stack\.languages" agents/ skills/` returns zero results
- [ ] `grep -r "stack\.framework[^s]" agents/ skills/` returns zero results (matching `stack.framework` but not `stack.frameworks`)
- [ ] Canonical forms confirmed: `stack.language` (string), `stack.frameworks` (array)

---

## Functional Requirements

- FR-1: All agent and skill files use `stack.language` (singular string)
- FR-2: All agent and skill files use `stack.frameworks` (plural array)
- FR-3: No other naming variants exist in the repo

## Non-Goals

- No changes to `project.json` schema itself (already uses canonical forms)
- No changes to how agents parse or consume these fields at runtime
- No changes to any project's `docs/project.json`

## Technical Considerations

- **Scope:** Text replacements in markdown files only — no code changes
- **Risk:** Extremely low — these are documentation/template references, not executable code
- **Related:** The helm-ade-macos project's `prd-project-settings-consolidation` generates `project.json` using only canonical forms. This PRD ensures the consuming agents match.

## Definition of Done

- Zero references to `stack.languages` (plural) in any agent or skill file
- Zero references to `stack.framework` (singular) in any agent or skill file
- All references use canonical `stack.language` (string) and `stack.frameworks` (array)
