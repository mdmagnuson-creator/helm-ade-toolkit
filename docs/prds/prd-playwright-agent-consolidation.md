---
id: prd-playwright-agent-consolidation
title: Playwright Agent Consolidation, E2E Routing Rationalization & UI Test Naming Convention
status: ready
priority: high
createdAt: 2026-03-07T20:00:00Z
---

# PRD: Playwright Agent Consolidation, E2E Routing Rationalization & UI Test Naming Convention

## Problem Statement

The toolkit has **two agents that write Playwright tests** — `playwright-dev.md` (673 lines) and `e2e-playwright.md` (1099 lines) — created at different times for different reasons, now carrying overlapping responsibilities and causing inconsistent behavior depending on which one gets called.

Additionally, the entire `e2e-*` naming convention is misleading. "E2E" is jargon, implies full end-to-end application testing, and doesn't describe what these agents/skills actually do — which is UI testing and verification using Playwright. The names should describe function and purpose, not a testing methodology acronym.

### How We Got Here

`playwright-dev` was created first as a general "write Playwright tests" agent with deep best-practices content (Page Object Model patterns, fixture extension, mutation stability testing, locator strategy hierarchy). Later, `e2e-playwright` was created with operational infrastructure (platform detection, verification modes, failure classification headers, manifest management, auth integration). Neither was designed to replace the other — they just grew in parallel.

### What Breaks

**1. QA findings on Electron apps get web-style tests.**
`qa-browser-tester` delegates to `@playwright-dev`, which has zero Electron awareness. When QA finds a bug in an Electron app, the generated test uses web Playwright patterns (no `_electron.launch()`, no IPC mocking, no BrowserWindow assertions). The test either fails to run or tests the wrong thing.

**2. Non-Electron tests miss verification infrastructure.**
`test-flow` routes to `@playwright-dev` for non-Electron E2E but `@e2e-playwright` for Electron. This means non-Electron tests miss:
- Documentation headers (`@prerequisites`, `@feature-assertions`) that enable failure classification
- Quality-beyond-correctness patterns (CLS stability, flicker detection)
- Manifest management (`e2e-areas.json`)

**3. Best practices are stranded in `playwright-dev`.**
POM patterns, fixture extension, mutation test stability (3-step: immediate → stable 2s → persist after reload), and the locator strategy hierarchy are only in `playwright-dev`. When `e2e-playwright` writes tests, it doesn't have access to these patterns and generates less robust tests.

**4. Callers have to know which agent to use — and often choose wrong.**
There are 10 active callers of `@playwright-dev` and 5 active callers of `@e2e-playwright`. The routing decision ("which Playwright agent?") is spread across 7 different files with inconsistent logic.

**5. No single settings-based gate for Playwright verification.**
Whether Playwright runs is determined by scattered heuristics: devPort null checks, UI file change detection, platform sniffing, `isUIProject()` gates. These heuristics create false economies (e.g., skipping E2E when a migration renames a column that breaks the UI) and make it impossible for users to control Playwright behavior from one place.

**6. The `e2e-*` naming convention is misleading.**
"E2E" is an acronym that implies full end-to-end application testing. But these agents and skills do UI testing, UI verification, UI area review, and UI test auditing — not exclusively end-to-end flows. The names should describe what they do, not use testing methodology jargon.

### The Routing Mess

There are **12 distinct Playwright invocation points** across the toolkit:

| # | Where | What it does | Mode | Current agent |
|---|-------|-------------|------|---------------|
| 1 | `adhoc-workflow` Step 0.1b | Analysis probe — looks at running app to validate code analysis | Ad-hoc | `@e2e-playwright` (mode: analysis-probe) |
| 2 | `test-flow` Step 3 | Per-change UI verification — confirms the change works | Both | `@e2e-playwright` (mode: verification) |
| 3 | `test-flow` Step 5 / completion prompt "E" | Write & run E2E test files | Both | `@playwright-dev` (web) or `@e2e-playwright` (Electron) |
| 4 | `prd-workflow` Ship Phase "G" option | Generate deferred E2E tests at PRD completion | PRD | `@playwright-dev` |
| 5 | `tester.md` Step 7 | Per-story E2E orchestration (reviewer → write tests) | PRD | `@e2e-reviewer` → `@e2e-playwright` |
| 6 | `tester.md` mutation routing | Write tests for data mutation stories | PRD | `@playwright-dev` |
| 7 | `developer.md` / `hammer.md` | Fix/update existing Playwright test files | Both | `@playwright-dev` |
| 8 | `qa-browser-tester` | Write tests from QA findings | User-invoked | `@playwright-dev` |
| 9 | `e2e-auditor` | Full-app E2E audit | User-invoked | `@e2e-playwright` (mode: audit) |
| 10 | `e2e-reviewer` | Navigate and screenshot UI areas (direct Playwright usage) | Both | Direct Playwright (not a sub-agent) |
| 11 | `builder-verification` / `test-verification-loop` | Fix invalid test files | Both | `@e2e-playwright` |
| 12 | `test-ui-verification` | Verification flow + analysis probe dispatch | Both | `@e2e-playwright` |

The fundamental question: **should callers need to choose between two Playwright agents?** The answer is no — there should be one agent that handles all Playwright test writing.

### The `tester.md` E2E Routing Question

`tester.md` sits between callers and E2E agents as an orchestration layer. For unit tests, this adds clear value — it routes to `@react-tester`, `@jest-tester`, or `@go-tester` based on file types and runs them in parallel. But for E2E, it's a single-destination hop:

**What `tester.md` does for E2E (step 7):**
1. Checks if E2E is possible (devPort null check)
2. Checks if story modified UI files
3. Runs `@e2e-reviewer` to identify UI areas and create manifest
4. Checks review results for critical issues
5. Runs `@e2e-playwright` to write tests
6. Commits E2E test files

Steps 1-3 could live in the caller or in `e2e-playwright` itself. Step 4 is useful but simple. Steps 5-6 are what you'd do without the intermediary. The question is whether this orchestration adds enough value to justify the extra agent hop (which costs tokens and adds latency).

## Goals

1. **One Playwright agent** — Merge `playwright-dev.md` best practices into a single agent and delete `playwright-dev.md`
2. **Unified routing** — All paths route to one agent, no conditional logic needed
3. **Preserve all capabilities** — POM patterns, fixture extension, mutation testing, Electron support, verification modes, failure headers, quality patterns — nothing is lost
4. **Simplify `tester.md` E2E routing** — Move pre-flight orchestration into the Playwright agent; `tester.md` delegates with a single call
5. **Update all callers** — All references to `@playwright-dev` and `@e2e-playwright` point to the new name
6. **Settings-based Playwright gate** — Introduce `testVerifySettings` in `project.json` as the single source of truth for whether Playwright verification and test writing happens
7. **Descriptive naming convention** — Rename all `e2e-*` agents, skills, schemas, and templates to `ui-*` names that describe function and purpose

## Non-Goals

- Changing what tests get written (test quality is a separate concern)
- Changing the UI reviewer agent's behavior or its manifest format (beyond renaming)
- Gating user-invoked workflows (`@qa`, `@ui-test-full-app-auditor`) behind `testVerifySettings` — these are explicit user requests
- Gating Playwright test file maintenance (`developer.md`, `hammer.md` fixing existing `.spec.ts` files) — this is code maintenance, not verification
- Changing the `test-ui-verification` skill beyond updating agent references
- Renaming `e2e-areas.json` in user projects (that would require a project migration)

## Design Decisions

### Decision 1: Merge Direction

**Decision: Merge `playwright-dev` into `e2e-playwright`** — `e2e-playwright` has the richer operational infrastructure (platform detection, verification modes, auth integration, manifest management). Adding best practices from `playwright-dev` is an additive operation. The merged agent is then renamed to its final name (see Decision 9).

### Decision 2: What Happens to `tester.md` E2E Routing

**Decision: Move E2E orchestration into the Playwright agent** — `tester.md` still calls the Playwright agent (so it remains the "run all tests" orchestrator), but the Playwright agent owns its own pre-flight checks and UI reviewer integration. This simplifies `tester.md` step 7 to a single delegation while keeping the orchestration contract intact. Callers who go directly to the Playwright agent (builder, test-flow) get the same pre-flight quality.

### Decision 3: Content Organization in Merged Agent

**Decision: Interleave content thematically** — Merge POM patterns into test generation section, fixtures into setup section, etc. `e2e-playwright` is currently 1099 lines; adding ~400 lines of unique content from `playwright-dev` brings it to ~1500 lines, which is at the upper bound of the agent size guideline. If it exceeds 1500, we can extract to a skill as a follow-up.

### Decision 4: Pre-flight Skip Detection

**Decision: Context-based detection** — The Playwright agent checks whether it received area/manifest info in its prompt. If the caller already passed areas or a manifest, skip the reviewer step. If not, run it. This requires zero changes to existing callers' prompt formats.

### Decision 5: Manifest Ownership

**Decision: The Playwright agent owns `e2e-areas.json`** — The agent writing the tests is the natural owner of the manifest. Having `tester.md` manage a manifest for an agent it delegates to is indirect ownership. This also means direct callers (builder, test-flow) get manifest updates automatically.

### Decision 6: `tester.md` UI File Gate

**Decision: Remove the UI file change heuristic** — `tester.md` always delegates to the Playwright agent for stories (subject to the `testVerifySettings` gate). Backend-only changes like database migrations and API handler changes can break the UI, so a file-type heuristic creates a false economy. The Playwright agent's pre-flight does the smarter analysis of whether testing is actually warranted. If it determines no testing is needed, it returns quickly.

### Decision 7: `testVerifySettings` as Universal Playwright Gate

**Decision: 5 boolean settings in `project.json`** — A single `testVerifySettings` object replaces all scattered heuristics (devPort checks, UI file detection, `isUIProject()` gates, platform sniffing) as the sole gate for whether Playwright runs:

```json
{
  "testVerifySettings": {
    "adHocUIVerify_Analysis": true,
    "adHocUIVerify_StoryTest": true,
    "prdUIVerify_Analysis": true,
    "prdUIVerify_StoryTest": true,
    "prdUIVerify_PRDCompletionTest": true
  }
}
```

| Setting | Controls | Default |
|---------|----------|---------|
| `adHocUIVerify_Analysis` | Playwright analysis probe in ad-hoc mode (Step 0.1b) | `true` |
| `adHocUIVerify_StoryTest` | UI test writing/running after ad-hoc implementation | `true` |
| `prdUIVerify_Analysis` | Per-story Playwright verification during PRD story processing | `true` |
| `prdUIVerify_StoryTest` | UI test writing/running during PRD story processing | `true` |
| `prdUIVerify_PRDCompletionTest` | Deferred UI test generation/running at PRD completion (Ship Phase "G" option) | `true` |

**Defaults:** All `true` if `testVerifySettings` doesn't exist. Every project gets full Playwright verification out-of-the-box. Users must explicitly opt out.

**What checks this gate:** Every automated Playwright invocation in ad-hoc and PRD workflows. If the setting is `true` (or absent), the agent runs. If the environment isn't set up to support it, it fails — and that failure is a signal to the user to fix their setup, not a reason for the agent to silently skip.

**What does NOT check this gate:**
- User-invoked workflows: `@qa`, `@ui-test-full-app-auditor` — explicit user requests bypass settings
- Playwright test file maintenance: `developer.md`, `hammer.md` fixing existing `.spec.ts` files — this is code maintenance, not verification
- `ui-test-area-reviewer` direct Playwright usage — follows the `_Analysis` setting for the current mode (ad-hoc or PRD)
- `builder-verification` / `test-verification-loop` fixing invalid tests — code maintenance

**After passing the settings gate**, the next step is to check the project settings for the test environment definition (web with localhost port, Electron app, etc.) which already exists in `project.json` under `apps[]`.

### Decision 8: `qa-browser-tester` and `ui-test-full-app-auditor` Settings Exemption

**Decision: Not gated by `testVerifySettings`** — QA and auditing are user-invoked workflows. If a user explicitly invokes `@qa` or `@ui-test-full-app-auditor`, they want the work done regardless of default settings. The settings control automatic Playwright behavior during ad-hoc and PRD workflows, not explicit user requests.

### Decision 9: Rename `e2e-*` Family to `ui-*` Naming Convention

**Decision: Rename all `e2e-*` agents, skills, schemas, and templates** — The `e2e-` prefix is jargon that doesn't describe function. New names follow the pattern `ui-{function}-{specifics}` for agents and `ui-test-{context}` for skills/schemas/templates.

**Agent renames:**

| Current | New | Rationale |
|---------|-----|-----------|
| `e2e-playwright.md` (merge target) | `ui-tester-playwright.md` | Writes/runs Playwright UI tests |
| `e2e-reviewer.md` | `ui-test-area-reviewer.md` | Reviews UI areas to identify test targets |
| `e2e-auditor.md` | `ui-test-full-app-auditor.md` | Orchestrates full-app UI test audits |

**Skill renames:**

| Current | New | Rationale |
|---------|-----|-----------|
| `skills/e2e-electron/` | `skills/ui-test-electron/` | Playwright patterns for Electron UI testing |
| `skills/e2e-quality/` | `skills/ui-test-ux-quality/` | Tests UX quality — visual stability, CLS, performance |
| `skills/e2e-full-audit/` | `skills/ui-test-full-app-audit/` | Full-app audit workflow |
| `skills/test-e2e-flow/` | `skills/ui-test-flow/` | Orchestration flow for running UI tests |

**Schema renames:**

| Current | New |
|---------|-----|
| `schemas/e2e-audit-manifest.schema.json` | `schemas/ui-test-full-app-audit-manifest.schema.json` |

**Template renames:**

| Current | New |
|---------|-----|
| `templates/e2e-quality-helpers.ts` | `templates/ui-test-ux-quality-helpers.ts` |

**Naming convention for future additions:** `ui-tester-{tool}` for test-writing agents (e.g., `ui-tester-cypress` if ever needed), `ui-test-{context}` for skills/schemas/templates.

**What is NOT renamed:** `e2e-areas.json` — this file lives in user projects and renaming it would require a project migration, which is out of scope.

## User Stories

### US-001: Merge `playwright-dev` best practices into `e2e-playwright`

**Description:** As the toolkit maintainer, I want to merge `playwright-dev.md`'s unique content into `e2e-playwright.md` so there is a single comprehensive Playwright test-writing agent.

**Acceptance Criteria:**

- [ ] `e2e-playwright.md` contains POM patterns (Page Object Model class structure, naming conventions, page vs component objects)
- [ ] `e2e-playwright.md` contains fixture extension patterns (`base.extend<Fixtures>`, custom fixture lifecycle)
- [ ] `e2e-playwright.md` contains mutation test stability patterns (3-step: immediate assertion → stable 2s → persist after reload)
- [ ] `e2e-playwright.md` contains locator strategy priority hierarchy (getByRole → getByLabel → getByPlaceholder → getByText → getByTestId → CSS)
- [ ] `e2e-playwright.md` contains visual regression testing patterns
- [ ] `e2e-playwright.md` contains network interception/mocking patterns
- [ ] Content is interleaved thematically (not appended as a block)
- [ ] No duplicate content — where both agents covered the same topic, the richer version is kept
- [ ] `e2e-playwright.md` frontmatter `description` is updated to reflect expanded scope

**Note:** This story merges into `e2e-playwright.md`. The rename to `ui-tester-playwright.md` happens in US-011.

### US-002: Add UI area reviewer integration to `e2e-playwright`

**Description:** As the toolkit maintainer, I want `e2e-playwright` to own its pre-flight checks and UI area reviewer integration so callers don't need to orchestrate this externally.

**Acceptance Criteria:**

- [ ] `e2e-playwright.md` has a "Pre-flight Checks" section that runs before test writing: UI area reviewer invocation for area identification, manifest update
- [ ] Pre-flight checks use context-based detection: if the caller already passed area/manifest info in the prompt, skip the reviewer step; if not, run it
- [ ] `e2e-playwright.md` documents when pre-flight checks run vs. when they're skipped
- [ ] Manifest update (`e2e-areas.json`) happens within the Playwright agent pipeline, not externally
- [ ] The Playwright agent owns `e2e-areas.json` — it reads, writes, and maintains the manifest

**Note:** References to `@e2e-reviewer` in this file will be updated to `@ui-test-area-reviewer` in US-012.

### US-003: Simplify `tester.md` E2E step

**Description:** As the toolkit maintainer, I want to simplify `tester.md` step 7 (E2E phase) to a single delegation to the Playwright agent since the pre-flight orchestration now lives in the E2E agent.

**Acceptance Criteria:**

- [ ] `tester.md` step 7 always delegates to `@ui-tester-playwright` with story context (no UI file change heuristic gate)
- [ ] `tester.md` no longer separately invokes the UI area reviewer (that's now internal to the Playwright agent)
- [ ] `tester.md` no longer does devPort null checking for E2E (replaced by `testVerifySettings` gate)
- [ ] `tester.md` no longer checks if story modified UI files as a gate for E2E (backend changes like migrations can break UI)
- [ ] `tester.md` mutation routing references `@ui-tester-playwright` (not `@playwright-dev`)
- [ ] `tester.md` checks `testVerifySettings.prdUIVerify_StoryTest` before delegating (if `false`, skip E2E entirely)
- [ ] Net reduction in `tester.md` E2E step from ~40 lines to ~10 lines
- [ ] `tester.md` still commits E2E test files after all test agents finish (single commit for unit + E2E)

### US-004: Update `qa-browser-tester` delegation

**Description:** As the toolkit maintainer, I want to update all `@playwright-dev` references in `qa-browser-tester.md` to `@ui-tester-playwright` so QA-driven test writing gets Electron awareness and verification infrastructure.

**Acceptance Criteria:**

- [ ] All references to `@playwright-dev` in `qa-browser-tester.md` replaced with `@ui-tester-playwright`
- [ ] `qa-browser-tester.md` delegation prompts updated to include platform context (Electron vs web)
- [ ] `qa-browser-tester` does NOT check `testVerifySettings` — QA is user-invoked and always runs
- [ ] No behavioral regression — `qa-browser-tester` still generates the same test structure for web apps

### US-005: Update remaining agent callers

**Description:** As the toolkit maintainer, I want to update all remaining agent references from `@playwright-dev` to `@ui-tester-playwright`.

**Acceptance Criteria:**

- [ ] `developer.md` routing table: `@playwright-dev` → `@ui-tester-playwright`
- [ ] `hammer.md` routing table: `@playwright-dev` → `@ui-tester-playwright`
- [ ] `builder.md` delegation table: `@playwright-dev` → `@ui-tester-playwright`
- [ ] No agent file contains `@playwright-dev` after this story

### US-006: Update remaining callers (skills and data)

**Description:** As the toolkit maintainer, I want to update all skill and data file references from `@playwright-dev` to `@ui-tester-playwright`.

**Acceptance Criteria:**

- [ ] `skills/test-flow/SKILL.md`: UI test sub-flow routes to `@ui-tester-playwright` unconditionally (remove web/Electron fork)
- [ ] `skills/prd-workflow/SKILL.md`: "G" option routes to `@ui-tester-playwright`
- [ ] `skills/builder-delegation/SKILL.md`: delegation table updated
- [ ] `skills/agent-audit/SKILL.md`: framework mapping updated (2 references)
- [ ] `data/fallback-chains.yaml`: `playwright-dev` replaced with `ui-tester-playwright`
- [ ] No skill or data file contains `playwright-dev` as an agent reference after this story

### US-007: Delete `playwright-dev.md`

**Description:** As the toolkit maintainer, I want to delete `agents/playwright-dev.md` since all its content has been merged and all references have been updated.

**Acceptance Criteria:**

- [ ] `agents/playwright-dev.md` is deleted
- [ ] `toolkit-structure.json` agent entry for `playwright-dev` removed
- [ ] No file in the repository references `playwright-dev` as an active agent (docs/completed references are OK)
- [ ] `opencode.json` agent entry for `playwright-dev` removed (if present)

### US-008: Update `test-flow` UI test routing to remove web/Electron fork

**Description:** As the toolkit maintainer, I want `test-flow`'s UI test routing to always go to `@ui-tester-playwright` without needing to check platform type, since the Playwright agent handles platform detection internally.

**Acceptance Criteria:**

- [ ] `skills/test-flow/SKILL.md`: UI test routing section no longer checks `playwrightConfig.platform` to choose between agents
- [ ] `skills/test-flow/SKILL.md`: Always delegates UI testing to `@ui-tester-playwright`
- [ ] Platform detection responsibility is documented as being in `ui-tester-playwright` (which loads `ui-test-electron` skill when needed)
- [ ] Net simplification: conditional agent selection replaced with single delegation

### US-009: Add `testVerifySettings` to `project.json` schema and gate logic

**Description:** As the toolkit maintainer, I want to add `testVerifySettings` to the `project.json` schema and implement the settings-based gate across all automated Playwright invocation points, replacing scattered heuristics (devPort checks, UI file detection, `isUIProject()` gates).

**Acceptance Criteria:**

- [ ] `schemas/project.schema.json` updated with `testVerifySettings` object definition (5 boolean properties, all defaulting to `true`)
- [ ] `adhoc-workflow/SKILL.md` Step 0.1b: checks `testVerifySettings.adHocUIVerify_Analysis` before running the analysis probe
- [ ] `test-flow/SKILL.md` Step 5 (ad-hoc mode): checks `testVerifySettings.adHocUIVerify_StoryTest` before UI test writing
- [ ] `test-flow/SKILL.md` Step 3 (PRD mode): checks `testVerifySettings.prdUIVerify_Analysis` before per-story Playwright verification
- [ ] `test-flow/SKILL.md` Step 5 (PRD mode): checks `testVerifySettings.prdUIVerify_StoryTest` before per-story UI test writing
- [ ] `prd-workflow/SKILL.md` Ship Phase "G" option: checks `testVerifySettings.prdUIVerify_PRDCompletionTest` before deferred UI test generation
- [ ] `tester.md` Step 7: checks `testVerifySettings.prdUIVerify_StoryTest` before delegating to `@ui-tester-playwright`
- [ ] `ui-test-area-reviewer` direct Playwright usage: follows the `_Analysis` setting for the current mode
- [ ] All existing heuristic gates removed: devPort null checks, UI file change detection, `isUIProject()` gates, platform-based skip logic
- [ ] When `testVerifySettings` is absent from `project.json`, all 5 settings default to `true`
- [ ] When a setting is `false`, the Playwright step is cleanly skipped (not errored) with a log message noting the setting
- [ ] Exemptions documented: `@qa`, `@ui-test-full-app-auditor`, `developer.md`/`hammer.md` test file maintenance, `builder-verification`/`test-verification-loop` test fixes — none of these check `testVerifySettings`

### US-010: Verification — grep for orphaned references

**Description:** As the toolkit maintainer, I want to verify that no orphaned references to old names remain in the toolkit and that all renames and `testVerifySettings` are consistently implemented.

**Acceptance Criteria:**

- [ ] `grep -r "playwright-dev" agents/ skills/ data/ templates/ scaffolds/ scripts/` returns zero results
- [ ] `grep -r "@playwright-dev" .` returns zero results (except in docs/completed/ and docs/archived/)
- [ ] `grep -r "e2e-playwright" agents/ skills/ data/ templates/ scaffolds/ scripts/` returns zero results
- [ ] `grep -r "e2e-reviewer" agents/ skills/ data/ templates/ scaffolds/ scripts/` returns zero results
- [ ] `grep -r "e2e-auditor" agents/ skills/ data/ templates/ scaffolds/ scripts/` returns zero results
- [ ] `grep -r "e2e-electron" agents/ skills/ data/ templates/ scaffolds/ scripts/` returns zero results (except inside `ui-test-electron` skill content that references the Electron framework itself)
- [ ] `grep -r "e2e-quality" agents/ skills/ data/ templates/ scaffolds/ scripts/` returns zero results
- [ ] `grep -r "e2e-full-audit" agents/ skills/ data/ templates/ scaffolds/ scripts/` returns zero results
- [ ] `grep -r "test-e2e-flow" agents/ skills/ data/ templates/ scaffolds/ scripts/` returns zero results
- [ ] `toolkit-structure.json` has no entry for any old `e2e-*` or `playwright-dev` name
- [ ] `opencode.json` has no entry for any old `e2e-*` or `playwright-dev` name
- [ ] `grep -r "devPort.*null\|isUIProject\|UI file.*check\|modified UI files" agents/ skills/` returns zero results for E2E gating logic (old heuristics removed)
- [ ] `grep -r "testVerifySettings" agents/ skills/` confirms the settings gate exists in all expected locations (adhoc-workflow, test-flow, prd-workflow, tester.md)

### US-011: Rename `e2e-playwright` to `ui-tester-playwright`

**Description:** As the toolkit maintainer, I want to rename the merged Playwright agent from `e2e-playwright.md` to `ui-tester-playwright.md` and update all references across the toolkit, establishing the `ui-tester-{tool}` naming convention for UI test-writing agents.

**Acceptance Criteria:**

- [ ] `agents/e2e-playwright.md` renamed to `agents/ui-tester-playwright.md`
- [ ] Agent frontmatter updated: name, description reflect new identity
- [ ] All internal references within the agent updated (self-references, skill loading references)
- [ ] All 25+ files that reference `@e2e-playwright` or `e2e-playwright` updated to `@ui-tester-playwright` or `ui-tester-playwright`:
  - Agents: `tester.md`, `toolkit.md`, and any others from US-003/004/005
  - Skills: `adhoc-workflow`, `test-flow`, `test-ui-verification`, `builder-verification`, `test-verification-loop`, `test-prerequisite-detection`, `ui-test-full-app-audit` (formerly `e2e-full-audit`), `ui-test-electron` (formerly `e2e-electron`), `ui-test-flow` (formerly `test-e2e-flow`), `auth-*` skills, `agent-audit`, `test-user-cleanup`
  - Data: `workflow-defaults.json`, `skill-mapping.json`, `fallback-chains.yaml`
  - Schemas: `project.schema.json`
- [ ] `toolkit-structure.json` agent entry updated
- [ ] `toolkit.md` Post-Change Workflow category logic updated — hardcoded testing agent list must include `ui-tester-playwright` and `ui-test-area-reviewer` (or pattern matching updated to recognize `ui-tester-*` / `ui-test-*` names)
- [ ] `opencode.json` agent entry updated (if present)

**Note:** This story can be combined with US-003/004/005/006 during implementation — when those stories swap `@playwright-dev` references, they swap directly to `@ui-tester-playwright` (not to `@e2e-playwright` as an intermediate step).

### US-012: Rename `e2e-reviewer` and `e2e-auditor` agents

**Description:** As the toolkit maintainer, I want to rename the UI area reviewer and full-app auditor agents to descriptive names that match the new `ui-*` naming convention.

**Acceptance Criteria:**

- [ ] `agents/e2e-reviewer.md` renamed to `agents/ui-test-area-reviewer.md`
- [ ] `agents/e2e-auditor.md` renamed to `agents/ui-test-full-app-auditor.md`
- [ ] Agent frontmatter updated for both: name, description reflect new identity
- [ ] All references to `@e2e-reviewer` updated to `@ui-test-area-reviewer`:
  - `agents/tester.md`
  - `agents/ui-tester-playwright.md` (the merged agent)
  - `agents/toolkit.md`
  - `project-templates/CONVENTIONS.md`
- [ ] All references to `@e2e-auditor` updated to `@ui-test-full-app-auditor`:
  - `agents/ui-tester-playwright.md`
  - `skills/ui-test-full-app-audit/SKILL.md` (formerly `e2e-full-audit`)
  - `skills/ui-test-flow/SKILL.md` (formerly `test-e2e-flow`)
- [ ] `toolkit-structure.json` agent entries updated for both
- [ ] `opencode.json` agent entries updated for both (if present)

### US-013: Rename `e2e-*` skills, schemas, and templates

**Description:** As the toolkit maintainer, I want to rename all `e2e-*` skills, schemas, and templates to the new `ui-test-*` naming convention so that every artifact's name describes its function.

**Acceptance Criteria:**

**Skill directory renames:**
- [ ] `skills/e2e-electron/` renamed to `skills/ui-test-electron/`
- [ ] `skills/e2e-quality/` renamed to `skills/ui-test-ux-quality/`
- [ ] `skills/e2e-full-audit/` renamed to `skills/ui-test-full-app-audit/`
- [ ] `skills/test-e2e-flow/` renamed to `skills/ui-test-flow/`
- [ ] Each skill's `SKILL.md` frontmatter updated (name, description, triggers)

**Schema renames:**
- [ ] `schemas/e2e-audit-manifest.schema.json` renamed to `schemas/ui-test-full-app-audit-manifest.schema.json`

**Template renames:**
- [ ] `templates/e2e-quality-helpers.ts` renamed to `templates/ui-test-ux-quality-helpers.ts`

**Reference updates (all files that reference the old skill/schema/template names):**
- [ ] All references to `e2e-electron` skill updated to `ui-test-electron` (~11 files)
- [ ] All references to `e2e-quality` skill updated to `ui-test-ux-quality` (~7 files)
- [ ] All references to `e2e-full-audit` skill updated to `ui-test-full-app-audit` (~2 files)
- [ ] All references to `test-e2e-flow` skill updated to `ui-test-flow` (~4 files)
- [ ] All references to `e2e-audit-manifest` schema updated to `ui-test-full-app-audit-manifest`
- [ ] All references to `e2e-quality-helpers` template updated to `ui-test-ux-quality-helpers`
- [ ] `agent-templates/testing/playwright.md` — update 7 references from `e2e-quality-helpers` to `ui-test-ux-quality-helpers`
- [ ] `agents/planner.md` reference to `e2e-electron` skill updated to `ui-test-electron`
- [ ] `templates/coding-playwright.md` reference to `e2e-quality-helpers.ts` updated to `ui-test-ux-quality-helpers.ts`
- [ ] `data/skill-mapping.json` updated with new skill names
- [ ] `toolkit-structure.json` skill and schema entries updated
- [ ] `toolkit.md` skill references updated (if any)
- [ ] `opencode.json` updated (if skill entries exist)

## Implementation Order

Stories should be implemented in this order to avoid broken references:

```
US-001 (merge content into e2e-playwright)
    ↓
US-002 (add reviewer integration)
    ↓
US-011 (rename e2e-playwright → ui-tester-playwright) ──┐
US-012 (rename e2e-reviewer, e2e-auditor)              ──┤── rename agents first
US-013 (rename e2e-* skills, schemas, templates)       ──┘
    ↓
US-009 (testVerifySettings schema + gate) ──┐
US-003 (simplify tester.md)               ──┤
US-004 (qa-browser-tester)                ──┤── can be parallel
US-005 (agent callers)                    ──┤   (all use new names)
US-006 (skill/data callers)               ──┤
US-008 (test-flow routing)                ──┘
    ↓
US-007 (delete playwright-dev.md)
    ↓
US-010 (verification grep — covers old e2e-* names too)
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Merged agent exceeds 1500 line guideline | Medium | Low | Extract to `playwright-patterns` skill as follow-up if needed |
| `qa-browser-tester` prompts assume `playwright-dev` behavior | Low | Medium | Review all 16 delegation prompts during US-004 |
| UI area reviewer integration in Playwright agent creates circular dependency | Low | High | Verify `ui-test-area-reviewer` doesn't call `ui-tester-playwright` |
| Missing a reference during rename | Medium | Medium | US-010 verification grep catches any misses for all old names |
| `testVerifySettings` defaults cause behavior change in existing projects | None | N/A | All defaults are `true` — identical to current behavior where Playwright always runs |
| Old heuristic gates missed during removal | Low | Medium | US-010 grep for old patterns (devPort null, isUIProject, UI file check) |
| Skill trigger strings in `opencode.json` reference old names | Medium | Low | US-013 explicitly checks and updates `opencode.json` |
| `e2e-areas.json` references in user projects become confusing with new naming | Low | Low | Non-goal — documented as out of scope, can be a follow-up migration |

## Estimated Effort

| Story | Complexity | Estimated Time |
|-------|-----------|----------------|
| US-001 | High — careful content merge | 20 min |
| US-002 | Medium — new section design | 10 min |
| US-003 | Low — deletion/simplification | 5 min |
| US-004 | Medium — 16 references to review | 10 min |
| US-005 | Low — mechanical replacement | 5 min |
| US-006 | Low — mechanical replacement | 5 min |
| US-007 | Low — deletion + manifest | 3 min |
| US-008 | Low — simplification | 5 min |
| US-009 | High — schema + multi-file gate implementation | 25 min |
| US-010 | Low — verification only | 5 min |
| US-011 | Medium — rename agent + update 25+ references | 15 min |
| US-012 | Medium — rename 2 agents + update references | 10 min |
| US-013 | High — rename 4 skills, 1 schema, 1 template + all references | 20 min |
| **Total** | | **~138 min** |
