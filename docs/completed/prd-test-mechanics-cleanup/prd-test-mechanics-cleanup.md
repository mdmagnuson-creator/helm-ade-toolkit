---
id: prd-test-mechanics-cleanup
title: Test Mechanics Cleanup — testVerifySettings as Sole Playwright Gate
status: ready
priority: high
createdAt: 2026-03-07T20:00:00Z
---

# PRD: Test Mechanics Cleanup — testVerifySettings as Sole Playwright Gate

## Introduction

The toolkit has accumulated multiple overlapping mechanisms for deciding when and how Playwright UI testing runs: `testIntensity` (per-story, set by Planner), `storyAssessment` (project-level policy for resolving intensity), `e2eRequired`/`e2eScope` (per-story Planner flags), `e2e: "immediate"|"deferred"|"skip"` (file-pattern analysis in `test-activity-rules.json`), `dependentSmoke`/`e2eAreas` (activity resolution outputs), `rigorProfile` (deprecated), and `testingRigor` (legacy runtime field). These create a confusing web of gates that overlap with `testVerifySettings` — the clean 6-boolean system that should be the **only** mechanism controlling Playwright.

This PRD removes all competing mechanisms so that:

1. **`testVerifySettings`** (6 booleans in `project.json`) is the sole gate for whether Playwright runs at each invocation point
2. **All non-Playwright tests** (unit, typecheck, lint, critics) run unconditionally on every story
3. **Planner has zero role** in testing decisions — no `testIntensity`, no `e2eRequired`, no test-related flags on stories

## Goals

- Eliminate all Playwright gate mechanisms except `testVerifySettings`
- Remove Planner from testing decisions entirely
- Remove file-change analysis (`e2e: "immediate"|"deferred"|"skip"`, `dependentSmoke`, `e2eAreas`) from Playwright gating — when Playwright runs (per `testVerifySettings`), the Playwright agent decides what to test based on changed files and story context
- Clean up all deprecated/vestigial testing config (`rigorProfile`, `testingRigor`, `storyAssessments`)
- Add the missing 6th setting (`adHocUIVerify_CompletionTest`) to `testVerifySettings`
- Make all 6 settings gate **automatic** Playwright execution — no user prompts, no `[E]` options
- Remove all `[E]` prompt options related to E2E/Playwright across the toolkit
- Replace capped retry limits with a 20-attempt fix loop (no premature escape hatches)

## Design Decisions

### Decision 1: testVerifySettings is the only Playwright gate

No file analysis, story flags, or intensity calculations determine whether Playwright runs. The 6 boolean settings in `project.json → testing.testVerifySettings` are the sole decision maker:

```json
{
  "testing": {
    "testVerifySettings": {
      "adHocUIVerify_Analysis": true,
      "adHocUIVerify_StoryTest": true,
      "adHocUIVerify_CompletionTest": true,
      "prdUIVerify_Analysis": true,
      "prdUIVerify_StoryTest": true,
      "prdUIVerify_PRDCompletionTest": true
    }
  }
}
```

If a setting is `true` (or absent — defaults to `true`), Playwright runs **automatically** at that invocation point — no user prompt, no `[E]` option. If `false`, it's skipped silently. No other factor is considered.

### Decision 2: Automatic execution with 20-attempt fix loop

When `testVerifySettings` says Playwright runs, it runs automatically. If tests fail, the fix loop continues automatically until tests pass, with a hard cap of 20 attempts per issue. No user escape hatches (`[S] Save as-is`, `[D] Discard`, `[F] Try more`). On exhaustion (20 failed attempts), stop and report the issue to the user.

### Decision 3: Planner has no testing role

Planner no longer assigns `testIntensity`, `testIntensityReason`, `e2eRequired`, or `e2eScope` to stories. These fields are removed from the prd-to-json schema. The Planner's "Flag Auto-Detection" table loses its `testIntensity` column. Existing completed PRD JSONs are left untouched (historical).

### Decision 4: File-change analysis stays for non-Playwright activities only

`test-activity-rules.json` still resolves which **critics**, **unit testers**, and **quality checks** to run based on file patterns. But all E2E-related fields (`e2e`, `e2eScope`) are removed from the rules. The activity resolution function no longer outputs `e2eAreas` or `dependentSmoke` — Playwright scoping is the Playwright agent's job.

### Decision 5: No "deferred" E2E concept

The `e2e: "deferred"` timing concept (write tests now, run later at PRD completion) is removed. When `testVerifySettings` says Playwright runs, it runs immediately. The `pendingTests.e2e.deferredTo` tracking in `builder-state.json` is removed along with `awaiting_e2e` status in prd-workflow.

### Decision 6: Non-Playwright tests are unconditional

Unit tests, typecheck, lint, and critics always run on every story. There is no mechanism to skip them per-story. The only project-level controls are `testing.unit.enabled`, `testing.coverage.enabled`, `linting.enabled`, etc. — these are project-wide on/off, not per-story.

### Decision 7: No file-type-based Playwright skip rules

The "Skip Playwright for These File Types" list (`.d.ts`, `*.test.ts`, `*.md`, etc.) is removed. There are no file-type-based Playwright skip rules — `testVerifySettings` is the sole gate.

## Scope Considerations

- ai-tools: not relevant
- No external credentials required for this PRD.

## User Stories

### US-001: Add 6th testVerifySettings entry, make all 6 settings gate automatic execution, remove all `[E]` prompts

**Description:** As the toolkit, `testVerifySettings` (6 booleans) must be the sole, automatic gate for Playwright. When `true`, Playwright runs automatically — no prompt, no user choice. If tests fail, the fix loop continues until they pass (max 20 attempts per issue — then stop and report). All `[E]` prompt options related to E2E/Playwright across the toolkit are removed.

**Acceptance Criteria:**

**Schema changes:**
- [ ] `schemas/project.schema.json` → `testing.testVerifySettings` gets 6th property: `adHocUIVerify_CompletionTest` (`boolean`, default `true`, description: "Ad-hoc mode: automatically run holistic Playwright tests covering the full batch of changes at task spec completion")
- [ ] `schemas/project.schema.json` → `testVerifySettings` top-level description updated to: "Controls which automated Playwright invocation points are enabled. All default to true. When true, Playwright runs automatically — no user prompt. When false, that invocation point is skipped silently. Does NOT gate user-invoked workflows (@qa, @ui-test-full-app-auditor) or test file maintenance."
- [ ] `schemas/project.schema.json` → Update `prdUIVerify_PRDCompletionTest` description from referencing "Ship Phase 'G' option" to "automatically run holistic Playwright tests at PRD completion"
- [ ] All 5 existing setting descriptions updated to say "automatically run" (remove any references to prompts, options, or user choice)

**test-flow/SKILL.md changes (ad-hoc story completion):**
- [ ] Lines ~530-550: Remove `[E] Write E2E tests` from the ad-hoc story completion prompt. Playwright runs automatically before this prompt if `testVerifySettings.adHocUIVerify_StoryTest` is `true`. Prompt becomes `[C] Commit` / `[N] Next task` only.
- [ ] Lines ~593-617: Remove `[E] Write E2E tests (can defer to PRD completion)` from "ad-hoc during PRD" prompt. Playwright already ran automatically. Prompt becomes `[C] Commit` / `[N] Next task` / `[R] Return to PRD work` only.
- [ ] Lines ~561-591: Rewrite "E2E Sub-flow (When User Chooses 'E')" section. Rename to "Automatic E2E Execution". It is now triggered automatically (not by user choice) when the applicable `testVerifySettings` boolean is `true`. Remove the failure escape hatches (`[F] Try more fixes` / `[S] Save as-is` / `[D] Discard`).

**test-flow/SKILL.md changes (retry strategy):**
- [ ] Lines ~424-433: Rewrite the Retry Strategy table. Playwright fix loops continue until tests pass, with a **hard cap of 20 attempts per issue**. Both PRD mode and ad-hoc mode behave identically: fix loop → re-run → repeat until green or 20 attempts exhausted. On exhaustion (20 failed attempts for the same issue), STOP and report:
  ```
  ⛔ PLAYWRIGHT FIX LOOP EXHAUSTED

  Attempted 20 fixes for the following issue without success:
    [issue description]

  Files affected: [list]
  Last error: [error summary]
  ```
  No `[S] Save as-is`, no `[D] Discard`, no `[F] Try more` — just stop and inform the user.

**adhoc-workflow/SKILL.md changes:**
- [ ] Line ~1704: Remove `[E] Write additional E2E tests` from task spec completion prompt. Playwright runs automatically before this prompt if `testVerifySettings.adHocUIVerify_CompletionTest` is `true`. Prompt becomes `[C] Commit and ship` only.
- [ ] Line ~2073: Remove `[E] Write E2E tests` from walkthrough example. Becomes `[C] Commit and ship` only.

**prd-workflow/SKILL.md changes:**
- [ ] Lines ~771-787: Remove the `[E]`/`[G]`/`[S]`/`[L]` prompt entirely from Ship Phase. Replace with automatic execution: if `testVerifySettings.prdUIVerify_PRDCompletionTest` is `true`, Playwright runs automatically at PRD completion. Fix loop continues until pass (max 20 attempts). If setting is `false`, skip silently. Remove the "Handle response" table for E/G/S/L. Remove the "Do NOT proceed to step 3 unless user chooses..." gate — proceed automatically after Playwright passes (or after skip if setting is `false`).

**ui-test-flow/SKILL.md changes:**
- [ ] Line ~87: Remove `[E] Write E2E` from flowchart. Update to `[C] Commit  [N] Next task`.

**builder-dashboard/SKILL.md changes:**
- [ ] Lines ~80-87: Remove entire "Awaiting E2E tests" section (no `awaiting_e2e` status exists after this PRD — covered by US-010).
- [ ] Line ~104: Remove `[E] Run E2E tests` from bottom options bar. Becomes `[P] PRD Mode    [A] Ad-hoc Mode    [S] Status`.
- [ ] Line ~113: Remove or update "Awaiting E2E tests" dashboard section description.

**Validation:**
- [ ] Zero `[E]` prompts related to E2E/Playwright remain in test-flow, adhoc-workflow, prd-workflow, ui-test-flow, builder-dashboard (note: `[E] Edit/Clarify` in adhoc-workflow is unrelated and stays)
- [ ] Validate scripts pass

### US-002: Remove testIntensity and testIntensityReason from prd-to-json

**Description:** As the Planner, I no longer assign per-story test intensity so that testing decisions are not split across agents.

**Acceptance Criteria:**

- [ ] `skills/prd-to-json/SKILL.md` — "Story Test Intensity Assessment" section removed entirely (lines ~269-280)
- [ ] `skills/prd-to-json/SKILL.md` — "Story Test Intensity Fields" section removed entirely (lines ~450-459)
- [ ] `skills/prd-to-json/SKILL.md` — Conversion rule #8 ("Per-story test planning: Set testIntensity for every story") removed (line ~607)
- [ ] `skills/prd-to-json/SKILL.md` — Checklist item ("Every story has testIntensity") removed (line ~660)
- [ ] `skills/prd-to-json/SKILL.md` — Review prompt summary line ("Story test intensity mix: ...") removed (line ~393)
- [ ] `skills/prd-to-json/SKILL.md` — Story Flag Review table (lines ~323-331): remove `Intensity` column from header, separator, and all story rows
- [ ] `skills/prd-to-json/SKILL.md` — Uncertain flag prompts (lines ~360-363): remove the test intensity confirmation prompt (`[L] low  [M] medium  [H] high  [C] critical`)
- [ ] Existing completed PRD JSONs in `docs/completed/` are NOT modified (historical)
- [ ] Validate scripts pass

### US-003: Remove e2eRequired and e2eScope from prd-to-json

**Description:** As the Planner, I no longer flag which stories need E2E tests so that Playwright decisions are made solely by `testVerifySettings`.

**Acceptance Criteria:**

- [ ] `skills/prd-to-json/SKILL.md` — "E2E Detection" section removed (lines ~227-240)
- [ ] `skills/prd-to-json/SKILL.md` — "E2E Fields" section removed (lines ~440-448)
- [ ] `skills/prd-to-json/SKILL.md` — Checklist item ("UI stories with interactions have `e2eRequired: true`") removed (line ~659)
- [ ] `skills/prd-to-json/SKILL.md` — Example story JSON: remove `e2eRequired` and `e2eScope` fields (lines ~85-86)
- [ ] `skills/prd-to-json/SKILL.md` — Review prompt summary line: remove "E2E tests needed: 3 stories" (line ~390)
- [ ] `skills/prd-to-json/SKILL.md` — Story Flag Review table (lines ~323-331): remove `E2E` column from header, separator, and all story rows
- [ ] `skills/prd-to-json/SKILL.md` — Features line (line ~321): remove `✅ E2E` from `Features: ✅ Docs  ✅ E2E  ✅ Marketing  ✅ AI Tools`
- [ ] Existing completed PRD JSONs in `docs/completed/` are NOT modified (historical)
- [ ] Validate scripts pass

### US-004: Remove testIntensity column from Planner flag auto-detection

**Description:** As the Planner, the flag auto-detection table no longer includes `testIntensity` so there is no testing column for Planner to assess.

**Acceptance Criteria:**

- [ ] `agents/planner.md` — "Flag Auto-Detection" table (lines ~814-821) removes the `testIntensity` column entirely
- [ ] The table retains `supportArticleRequired` and `toolsRequired` columns
- [ ] The flag review example table (lines ~832-836) removes the "Test Intensity" column and any `testIntensity` examples
- [ ] Validate scripts pass

### US-005: Remove storyAssessment from project.json schema

**Description:** As the project schema, `testing.storyAssessment` is removed because intensity resolution no longer exists.

**Acceptance Criteria:**

- [ ] `schemas/project.schema.json` — `testing.storyAssessment` object removed entirely (lines ~525-541)
- [ ] No other schema file references `storyAssessment`
- [ ] Validate scripts pass

### US-006: Remove intensity resolution logic from prd-workflow

**Description:** As the Builder in PRD mode, I no longer resolve per-story test intensity or read it for E2E decisions.

**Acceptance Criteria:**

- [ ] `skills/prd-workflow/SKILL.md` — Step 1 item 2 (line ~351): remove `e2eRequired: true → Run e2e-write step`
- [ ] `skills/prd-workflow/SKILL.md` — Step 1 item 3 (lines ~355-364): remove entire "Resolve story test intensity" block (planner baseline, runtime risk, effective intensity, storyAssessment reads, persist to builder-state)
- [ ] `skills/prd-workflow/SKILL.md` — Step 2 (lines ~380-391): rewrite to remove intensity-driven logic. Remove: "Read effective story intensity" (line ~384), "E2E test generation based on story intensity" (line ~387), "E2E deferral to PRD completion (when intensity allows deferral)" (line ~388), "builder-state.json updates for queued tests" (line ~390). Retain: reference to `test-flow` as the canonical source for test behavior, but the test-flow invocation is now unconditional (no intensity input) — Playwright runs if `testVerifySettings` says so.
- [ ] Step 2 retains reference to `test-flow` for running the quality pipeline, but no intensity-driven logic remains
- [ ] Validate scripts pass

### US-007: Remove E2E fields from activity resolution in test-flow

**Description:** As the test-flow pipeline, activity resolution no longer outputs E2E-related fields because Playwright gating is handled entirely by `testVerifySettings`.

**Acceptance Criteria:**

- [ ] `skills/test-flow/SKILL.md` — `resolveActivities()` function (lines ~131-140): remove `e2e`, `e2eAreas`, and `dependentSmoke` from the `activities` object initialization
- [ ] `skills/test-flow/SKILL.md` — File-pattern loop (lines ~156-163): remove `rule.e2e === "skip"` check, `activities.e2eAreas.add(file)`, `rule.e2eScope === "dependents"` check, `activities.dependentSmoke.add(file)`
- [ ] `skills/test-flow/SKILL.md` — Code-pattern loop (lines ~175-176): remove `rule.e2e === "immediate"` check, `activities.e2eAreas.add("code-pattern-match")`
- [ ] `skills/test-flow/SKILL.md` — Step 2 flowchart box (line ~90): remove "Check e2eScope for dependent testing" line
- [ ] `skills/test-flow/SKILL.md` — Step 4 execution list (line ~118): remove "E2E / Playwright: always included (see Section 3)" — Playwright is not an activity resolution output; it's handled by `testVerifySettings` at execution time
- [ ] `skills/test-flow/SKILL.md` — "Skip Playwright for These File Types" section (lines ~205-214): remove entirely. There are no file-type-based Playwright skip rules — `testVerifySettings` is the sole gate.
- [ ] Activity resolution continues to resolve critics, unit testers, quality checks, hotspots, and cross-cutting rules — only E2E fields removed
- [ ] Validate scripts pass

### US-008: Remove E2E fields from test-activity-rules.json and schema

**Description:** As the test activity rules data, E2E-related fields are removed from every file pattern because Playwright decisions are no longer made by file-pattern analysis.

**Acceptance Criteria:**

- [ ] `data/test-activity-rules.json` — Every `filePatterns` entry: remove `"e2e"` field and `"e2eScope"` field (71 entries with `e2e`, 6 with `e2eScope`)
- [ ] `data/test-activity-rules.json` — The `defaults` object: remove `"e2e"` field
- [ ] `schemas/test-activity-rules.schema.json` — Remove `e2e` and `e2eScope` from `$defs/activityRule` properties (lines ~92-101)
- [ ] `schemas/test-activity-rules.schema.json` — Remove `e2e` from `defaults` properties (lines ~18-22) and from `defaults.required` array (line ~28)
- [ ] Every pattern entry retains its `critics`, `unit`, `quality`, and `reason` fields — only E2E fields removed
- [ ] `data/test-activity-rules.json` — `codePatterns` entries: remove `"e2e"` field if present (3 entries)
- [ ] Validate scripts pass

### US-009: Remove e2e-write conditional step from workflow-defaults

**Description:** As the workflow defaults, the `e2e-write` conditional step that checks `story.e2eRequired` is removed because `e2eRequired` no longer exists.

**Acceptance Criteria:**

- [ ] `data/workflow-defaults.json` — Remove the `"e2e-write"` entry from `conditionalSteps` (lines ~38-42)
- [ ] Other conditional steps (`support-article`, `tools`, `marketing`) remain unchanged
- [ ] Validate scripts pass

### US-010: Remove E2E deferral, awaiting_e2e status, and all deferred E2E tracking

**Description:** As the Builder, the `awaiting_e2e` status, deferred E2E tracking, and all related references are removed because there is no deferral concept — Playwright runs immediately when `testVerifySettings` allows it.

**Acceptance Criteria:**

- [ ] `skills/prd-workflow/SKILL.md` — Ship Phase (lines ~734-787): remove entire "Check for pending E2E tests" block (step 2 items 1-2), including `awaiting_e2e` registry update, deferred E2E prompt, and handle response table. Replace with automatic Playwright execution gated by `testVerifySettings.prdUIVerify_PRDCompletionTest` (covered by US-001).
- [ ] `skills/prd-workflow/SKILL.md` — Status table (line ~113): remove `awaiting_e2e` row
- [ ] `skills/prd-workflow/SKILL.md` — State diagram (line ~100): remove `awaiting_e2e` from `│ pr_open │ ──▶ │ awaiting_e2e │ ──▶ │ completed │`. Becomes `│ pr_open │ ──▶ │ completed │`
- [ ] `skills/prd-workflow/SKILL.md` — State migration (line ~121): remove `merged` → `awaiting_e2e` migration rule. `merged` should migrate to `completed` (PRD completion test runs automatically).
- [ ] `skills/builder-state/SKILL.md` — Remove "Defer E2E tests" event row (line ~56) and `pendingTests.e2e.deferredTo` references
- [ ] `skills/builder-state/SKILL.md` — Example state blocks: remove `pendingTests.e2e` sections showing `deferredTo: "prd-completion"` (lines ~280-284, ~420-424, ~450-455)
- [ ] `schemas/builder-state.schema.json` — Remove `deferredTo` from `pendingTests.e2e` properties (lines ~339-343). Also remove `"deferred"` from the `status` enum (line ~336).
- [ ] `skills/ui-test-flow/SKILL.md` — Line ~336: remove `awaiting_e2e` reference in example (`Source: prd-recurring-events (awaiting_e2e)`)
- [ ] `skills/test-failure-handling/SKILL.md` — Line ~267: remove `awaiting_e2e` reference (`PRD remains in awaiting_e2e status.`)
- [ ] Validate scripts pass

### US-011: Remove rigorProfile and testingRigor vestiges

**Description:** As the toolkit, all remaining references to the deprecated `rigorProfile` and legacy `testingRigor` are removed.

**Acceptance Criteria:**

- [ ] `schemas/project.schema.json` — `testing.rigorProfile` removed entirely (lines ~508-513). It was already deprecated and ignored.
- [ ] `skills/builder-state/SKILL.md` — "Claim PRD" event row: remove `including testingRigor` (line ~43)
- [ ] `skills/builder-state/SKILL.md` — Example state: remove `"testingRigor": "standard"` (line ~268)
- [ ] `skills/test-flow/SKILL.md` — "Legacy Rigor Profiles (DEPRECATED)" section removed entirely (lines ~734-739)
- [ ] Grep confirms zero remaining references to `rigorProfile` or `testingRigor` in agents/, skills/, schemas/, data/ (excluding docs/completed/ which are historical)
- [ ] Validate scripts pass

### US-012: Remove e2eRequired from Ship Phase and verification-contracts

**Description:** As the toolkit, all remaining references to `e2eRequired` in ship phase checks, verification contracts, and test-flow contract integration are removed.

**Acceptance Criteria:**

- [ ] `skills/prd-workflow/SKILL.md` — Line ~351: remove `e2eRequired: true → Run e2e-write step` (also covered by US-006, but US-012 ensures the grep confirms it)
- [ ] `skills/prd-workflow/SKILL.md` — Lines ~743-766: remove `e2eRequired: true` check in Ship Phase and the "E2E tests were expected but not tracked" handling (also covered by US-010, but US-012 ensures the grep confirms it)
- [ ] `skills/verification-contracts/SKILL.md` — Flowchart (line ~45): remove `{ "activity": "e2e", "timing": "immediate" }` from contract output example
- [ ] `skills/verification-contracts/SKILL.md` — Contract generation (lines ~97-98): remove the file-pattern check that adds `{ activity: "e2e", timing: "immediate" }` for `app/*` or `pages/*` files
- [ ] `skills/verification-contracts/SKILL.md` — Verification results example (line ~169): remove `{ "activity": "e2e", "status": "pass", "attempts": 1 }` from results
- [ ] `skills/test-flow/SKILL.md` — Verification Contract Integration table (line ~454): remove `| activity: "e2e" | E2E test generation + run | @ui-tester-playwright |` row
- [ ] `data/workflow-defaults.json` — if `"e2e"` section in step definitions references `e2eRequired`, remove (already covered by US-009 removing `e2e-write`)
- [ ] Grep confirms zero remaining references to `e2eRequired` or `e2eScope` in agents/, skills/, schemas/, data/ (excluding docs/completed/ and docs/prds/)
- [ ] Validate scripts pass

### US-013: Final verification grep (toolkit files)

**Description:** As the toolkit, a comprehensive grep confirms all removed concepts have zero remaining references in active toolkit files.

**Acceptance Criteria:**

- [ ] `grep -r "testIntensity" agents/ skills/ schemas/ data/ templates/ agent-templates/ project-templates/` returns zero matches
- [ ] `grep -r "testIntensityReason" agents/ skills/ schemas/ data/ templates/ agent-templates/ project-templates/` returns zero matches
- [ ] `grep -r "storyAssessment" agents/ skills/ schemas/ data/ templates/ agent-templates/ project-templates/` returns zero matches
- [ ] `grep -r "e2eRequired" agents/ skills/ schemas/ data/ templates/ agent-templates/ project-templates/` returns zero matches
- [ ] `grep -r "e2eScope" agents/ skills/ schemas/ data/ templates/ agent-templates/ project-templates/` returns zero matches
- [ ] `grep -r "rigorProfile" agents/ skills/ schemas/ data/ templates/ agent-templates/ project-templates/` returns zero matches
- [ ] `grep -r "testingRigor" agents/ skills/ schemas/ data/ templates/ agent-templates/ project-templates/` returns zero matches
- [ ] `grep -r "dependentSmoke" agents/ skills/ schemas/ data/ templates/ agent-templates/ project-templates/` returns zero matches
- [ ] `grep -r "e2eAreas" agents/ skills/ schemas/ data/ templates/ agent-templates/ project-templates/` returns zero matches
- [ ] `grep -r "awaiting_e2e" agents/ skills/ schemas/ data/ templates/ agent-templates/ project-templates/` returns zero matches
- [ ] References in `docs/completed/`, `docs/prds/`, `docs/archived/`, `docs/drafts/` are acceptable (historical)
- [ ] References in `templates/updates/configure-test-verify-settings.md` are acceptable (this template describes deprecated fields for cleanup, it doesn't use them)
- [ ] Validate scripts pass

### US-014: Queue global project update for testVerifySettings configuration

**Description:** As the toolkit, I create a central registry update that prompts every project's Builder to walk the user through configuring the 6 `testVerifySettings` values on their next session.

**Acceptance Criteria:**

- [ ] New update template created at `templates/updates/configure-test-verify-settings.md` with:
  - **Phase 1 (autonomous analysis):** Read `docs/project.json` → `testing.testVerifySettings` to check which settings are already configured. Also read `testing.e2e` to check if Playwright is even set up for this project.
  - **Phase 2 (present findings):** Show a dashboard with all 6 settings, their current values (or "not set — defaults to true"), and a brief description of what each one controls. If the project has no `testing.e2e` configured, note that all settings are effectively moot until Playwright is set up.
  - **Phase 3 (user confirmation):** Ask the user to confirm or adjust each of the 6 values. Accept "all defaults" as a shortcut. Write the confirmed values to `docs/project.json` → `testing.testVerifySettings`.
  - Also: if the project's `project.json` still has `testing.storyAssessment` or `testing.rigorProfile`, note they are deprecated and offer to remove them.
  - `interactive: true` flag set in registry entry
- [ ] New entry added to `data/update-registry.json`:
  ```json
  {
    "id": "2026-03-07-configure-test-verify-settings",
    "description": "Configure testVerifySettings — the 6 Playwright gate settings that control automated UI testing",
    "affinityRule": "all-projects",
    "priority": "high",
    "updateType": "schema",
    "interactive": true,
    "createdAt": "2026-03-07",
    "templatePath": "templates/updates/configure-test-verify-settings.md"
  }
  ```
- [ ] Validate scripts pass

## Functional Requirements

- FR-1: `testVerifySettings` with 6 boolean gates is the sole mechanism controlling whether Playwright runs at any invocation point
- FR-2: When a `testVerifySettings` boolean is `true`, Playwright runs automatically — no user prompt, no `[E]` option
- FR-3: Playwright fix loops continue until tests pass (max 20 attempts per issue), with no user escape hatches
- FR-4: All non-Playwright tests (unit, typecheck, lint, critics) run unconditionally on every story — no per-story gating
- FR-5: Planner assigns zero test-related fields to stories — `testIntensity`, `testIntensityReason`, `e2eRequired`, `e2eScope` are removed from the prd-to-json schema
- FR-6: Activity resolution (`test-activity-rules.json` + `test-flow`) resolves critics, unit testers, and quality checks from file patterns — no E2E fields in the resolution output
- FR-7: When Playwright runs (per `testVerifySettings`), the Playwright agent decides what to test based on changed files and story context — no pre-analysis tells it what scope to cover
- FR-8: There is no "deferred E2E" concept — Playwright either runs now or doesn't, controlled by `testVerifySettings`
- FR-9: No file-type-based Playwright skip rules — `testVerifySettings` is the sole gate
- FR-10: Existing completed PRD JSONs are not modified (historical records)
- FR-11: A global project update (central registry, `all-projects` affinity) prompts every project's next Builder session to interactively configure `testVerifySettings` and clean up deprecated fields

## Non-Goals

- **User project files** (`docs/project.json` in user projects): Not directly modified by this PRD. US-014 queues an interactive update that Builder will apply on the user's next session — the user confirms all changes.
- **Existing completed PRD JSONs**: Left untouched. They contain `testIntensity`, `e2eRequired`, etc. as historical data.
- **Non-Playwright test gating**: Unit tests, typecheck, lint, and critics are not gated by `testVerifySettings`. They run unconditionally. Project-level `testing.unit.enabled`, `linting.enabled` etc. remain as-is.
- **`test-activity-rules.json` non-E2E fields**: Critics, unit tester inference, quality checks, hotspot escalation, cross-cutting rules all remain unchanged.
- **Renaming `e2e` in `builder-state.schema.json`**: The `pendingTests.e2e` tracking object in builder-state is a runtime artifact, not a Playwright gate. Its existence is a separate concern (tracked by `prd-adhoc-design-decisions`).
- **Changes to `opencode.json`**: No changes needed.
- **Changes to `scaffolds/` or `scripts/`**: No changes needed.

## Technical Considerations

- **Dependency order**: US-007 and US-008 (activity resolution cleanup) should come before US-013 (final grep) since they produce the bulk of E2E field removals
- **US-001 is the largest story**: It touches 6 files and introduces the automatic execution pattern + 20-attempt fix loop. Consider implementing it first since it establishes the behavioral foundation.
- **`test-activity-rules.json` is large** (~500 lines, 71 E2E field entries + 6 e2eScope + 3 codePattern e2e): US-008 requires removing `"e2e"` and `"e2eScope"` from every entry. Use bulk find-replace carefully.
- **`prd-to-json/SKILL.md` has multiple sections to remove**: US-002 and US-003 each remove distinct sections. Apply US-002 first since it targets earlier line numbers.
- **`verification-contracts/SKILL.md`** has E2E references in examples and generation logic — US-012 cleans these.
- **Overlapping coverage between stories**: US-006, US-010, and US-012 all touch `prd-workflow/SKILL.md`. The overlap is intentional — earlier stories do the removal, US-012 confirms via grep that nothing was missed.

## Success Metrics

- Zero references to removed concepts in active toolkit files (verified by US-013 grep)
- `testVerifySettings` is the only string that appears when grepping for Playwright gating logic
- Planner produces PRD JSONs with no test-related story fields
- Builder runs Playwright based solely on `testVerifySettings` — no intensity resolution, no `e2eRequired` checks, no file-pattern E2E analysis, no `[E]` prompts
- Playwright fix loops run to completion (up to 20 attempts) without user intervention

## Open Questions

- None — all decisions resolved during PRD creation.
