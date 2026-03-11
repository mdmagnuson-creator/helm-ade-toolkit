# Testing Consolidation Verification

> **Purpose:** Permanent reference mapping each pre-consolidation quality check step to its post-consolidation location. Answers the question: "Where did X go?"
>
> Created as part of PRD `prd-adhoc-design-decisions` — US-013.

---

## Summary of Consolidation

**Before:** Quality check pipelines were duplicated across 4 locations:
1. `skills/test-quality-checks/SKILL.md` (355 lines) — shared quality check definitions
2. `skills/test-activity-resolution/SKILL.md` (316 lines) — activity resolution logic
3. `skills/adhoc-workflow/SKILL.md` — "Per-Task Quality Checks" section (~212 lines inline)
4. `skills/prd-workflow/SKILL.md` — "Per-Story Quality Checks" section + "UI Verification Enforcement" (~439 lines inline)
5. `agents/builder.md` — "Verification Pipeline Resolution" (7-step section, ~43 lines)

**After:** All consolidated into `skills/test-flow/SKILL.md` (~698 lines), organized as:
1. Skip Gate (Section 1)
2. Activity Resolution (Section 2)
3. Quality Check Pipeline (Section 3)
4. Failure Reporting (Section 4)
5. Completion Prompt (Section 5)
6. Tier 2 Skill Loading (Section 6)
7. Quality Checks — Optional (Section 7)
8. Full-Site Visual Audit Flow (Section 8)

**Deleted skills:**
- `skills/test-quality-checks/SKILL.md` — merged into test-flow Sections 3, 5
- `skills/test-activity-resolution/SKILL.md` — merged into test-flow Section 2

**Callers now reference test-flow:**
- `skills/adhoc-workflow/SKILL.md` — replaced inline pipeline with `📚 SKILL: test-flow` reference
- `skills/prd-workflow/SKILL.md` — replaced inline pipeline with `📚 SKILL: test-flow` reference
- `agents/builder.md` — replaced 7-step Verification Pipeline Resolution with single unconditional call to test-flow

---

## Pre-Consolidation → Post-Consolidation Mapping

### From: `skills/test-quality-checks/SKILL.md`

| Pre-Consolidation Step | Post-Consolidation Location | Notes |
|------------------------|----------------------------|-------|
| Activity Execution Order table | test-flow Section 3 → "Activity Execution Order" table | Identical steps: typecheck → lint → unit → rebuild/relaunch → critics → E2E → quality |
| Pipeline flow chart | test-flow Section 3 → "Pipeline Flow" diagram | Same decision tree, expanded to include rebuild/relaunch step (3.5) |
| Retry strategy (3 attempts ad-hoc) | test-flow Section 3 → "Retry Strategy" table | Preserved: ad-hoc = 3 attempts |
| Retry strategy (5 attempts PRD) | test-flow Section 3 → "Retry Strategy" table | Preserved: PRD = 5 attempts |
| Ops-only verification | test-flow Section 3 → "Ops-Only Task Verification" | Preserved with ops-with-runtime-impact distinction |
| Completion prompt | test-flow Section 5 → "Completion Prompt" | Identical format with [E]/[C]/[N] options |
| E2E sub-flow (user chooses E) | test-flow Section 5 → "E2E Sub-flow" | Preserved: generate → [R]un / [S]ave |
| Ad-hoc during PRD prompt | test-flow Section 5 → "Ad-hoc During PRD Completion Prompt" | Preserved: adds [R] Return to PRD option |
| Failure reporting dashboard | test-flow Section 4 → "Failure Reporting" | Identical format |
| Bypass restrictions table | test-flow Section 4 → "Bypass Restrictions" | Identical rules |
| E2E bypass rules | test-flow Section 4 → "E2E bypass rules" | Preserved: immediate = can't skip, deferred = can skip, neverSkip honored |
| Verification contract integration | test-flow Section 3 → "Verification Contract Integration" | Preserved: contract types (verifiable, advisory, skip) |
| Test execution mode (CI mode) | test-flow Section 2 → "Test Execution Mode (CRITICAL)" | Preserved: Vitest run, CI=true enforcement |

### From: `skills/test-activity-resolution/SKILL.md`

| Pre-Consolidation Step | Post-Consolidation Location | Notes |
|------------------------|----------------------------|-------|
| `resolveActivities()` algorithm | test-flow Section 2 → "Activity Resolution Algorithm" | Identical logic with isUIProject() gate removed |
| `inferUnitTester()` function | test-flow Section 2 → within algorithm listing | Preserved: .tsx/.jsx → react-tester, .go → go-tester, default → jest-tester |
| File pattern matching | test-flow Section 2 → Step 2 in flow chart | Preserved: rules loaded from `test-activity-rules.json` |
| Code pattern matching | test-flow Section 2 → within algorithm | Preserved: regex match against diff content |
| Cross-cutting rules | test-flow Section 2 → within algorithm | Preserved: multi-directory → oddball-critic, shared module → dx-critic |
| Hotspot escalation | test-flow Section 2 → within algorithm | Preserved: test-debt.json hotspots add critics and force E2E |
| Informational display (no prompt) | test-flow Section 2 → "Informational Activity Display" | Preserved: display-only, no confirmation required |
| `isUIProject()` function | **REMOVED** (US-012) | All projects get full Playwright verification. The gate is gone. |
| `skip-no-ui` outcome | **REMOVED** (US-012) | No longer a possible outcome. E2E is always "immediate". |
| UI/non-UI branching | **REMOVED** (US-012) | Replaced with unconditional `e2e: "immediate"` in activity defaults |

### From: `skills/adhoc-workflow/SKILL.md` inline quality checks

| Pre-Consolidation Section | Post-Consolidation Location | Notes |
|--------------------------|----------------------------|-------|
| "Per-Task Quality Checks" section (~212 lines) | test-flow reference: `📚 SKILL: test-flow` | Entire section replaced with skill reference |
| "Step 1.2a Post-Ops Verification" section | test-flow Section 3 → "Ops-Only Task Verification" | Logic preserved in canonical location |
| Activity resolution inline logic | test-flow Section 2 | No longer duplicated in adhoc-workflow |
| Skip gate logic | test-flow Section 1 | No longer duplicated in adhoc-workflow |
| Completion prompt | test-flow Section 5 | No longer duplicated in adhoc-workflow |

### From: `skills/prd-workflow/SKILL.md` inline quality checks

| Pre-Consolidation Section | Post-Consolidation Location | Notes |
|--------------------------|----------------------------|-------|
| "Per-Story Quality Checks" section | test-flow reference: `📚 SKILL: test-flow` | Entire section replaced with skill reference |
| "UI Verification Enforcement" section | test-flow Section 3 (E2E/Playwright step) + test-ui-verification skill | Logic preserved — always runs Playwright, no UI/non-UI gate |
| Story blocking on verification failure | test-flow Section 3 → "Retry Strategy" (PRD mode: 5 attempts, then skip with logged failure) | Preserved |
| E2E deferral to PRD completion | test-e2e-flow skill (unchanged) | Still managed by test-e2e-flow, referenced from test-flow Section 6 |

### From: `agents/builder.md` Verification Pipeline Resolution

| Pre-Consolidation Step | Post-Consolidation Location | Notes |
|------------------------|----------------------------|-------|
| Step 1: Check for postChangeWorkflow override | test-flow Section 3 → Playwright box → "Check for postChangeWorkflow override" | Preserved |
| Step 2: Auto-infer from apps[] configuration | test-flow Section 3 → Playwright box → "Auto-infer from apps[] configuration" | Preserved: desktop/bundled, desktop/remote, desktop/hybrid, web, no-apps variants |
| Step 3: Default verification (skip conditions check) | test-flow Section 1 → Skip Gate | Skip gate now runs FIRST (before any activities) |
| Step 4: Skip conditions | test-flow Section 1 → Skip Gate algorithm | Docs-only, config-only, test-only, CI/build, lockfiles, user-explicit |
| Step 5: Story-scoped Playwright | test-flow Section 3 → Playwright scoping | "Run scoped Playwright tests (changed files + 1-hop consumers)" |
| Step 6: Retry strategy | test-flow Section 3 → "Retry Strategy" | Preserved: PRD=5, ad-hoc=3 |
| Step 7: Ops-only verification | test-flow Section 3 → "Ops-Only Task Verification" | Preserved with ops-with-runtime-impact vs ops-only distinction |

---

## Behavioral Differences (Intentional)

These are the only intentional behavioral changes introduced by consolidation:

| Change | Before | After | Rationale |
|--------|--------|-------|-----------|
| `isUIProject()` gate | Non-UI projects skipped Playwright | All projects get Playwright (skipped gracefully via "no page assertions" if no UI) | US-012: Eliminates false negatives where backend projects had undetected UI changes |
| `no-ui` mode in project.json | Valid option to opt out of Playwright | Removed from schema. All projects get `playwright-required` | US-012: Simplifies verification model |
| Skip gate position | Builder checked skip conditions at Step 4 (after some pipeline setup) | test-flow checks skip gate FIRST (Section 1) before any other work | More efficient — skips earlier |
| Pipeline caller pattern | Builder resolved pipeline, then called sub-steps | Builder calls test-flow unconditionally; test-flow owns the entire decision tree | Single ownership — test-flow decides everything |

---

## Retry Limits Preserved

| Mode | Pre-Consolidation | Post-Consolidation | Verified |
|------|-------------------|-------------------|----------|
| **PRD mode** | 5 attempts (in prd-workflow inline) | 5 attempts (test-flow Section 3 → Retry Strategy) | ✅ |
| **Ad-hoc mode** | 3 attempts (in adhoc-workflow inline) | 3 attempts (test-flow Section 3 → Retry Strategy) | ✅ |

---

## Mode-Specific Behaviors Preserved

### PRD Mode
- ✅ Story blocking on verification failure (skip with logged failure after max attempts)
- ✅ E2E deferral to PRD completion (via test-e2e-flow skill)
- ✅ 5-attempt retry limit
- ✅ Story assessment effective intensity drives test generation
- ✅ `activePrd.storyAssessments` updated with results

### Ad-hoc Mode
- ✅ Task Spec reference in quality checks
- ✅ Single-task scope (no story/PRD tracking)
- ✅ 3-attempt retry limit
- ✅ STOP and report to user on exhaustion (vs PRD's skip-and-continue)
- ✅ Completion prompt with [E]/[C]/[N] options

---

## Files Changed

| File | Change | Net Line Reduction |
|------|--------|-------------------|
| `skills/test-flow/SKILL.md` | Rewritten from 129 → 698 lines (consolidated content) | N/A (grew) |
| `skills/test-quality-checks/SKILL.md` | **DELETED** | -355 lines |
| `skills/test-activity-resolution/SKILL.md` | **DELETED** | -316 lines |
| `skills/adhoc-workflow/SKILL.md` | Inline pipeline → skill reference | -232 lines |
| `skills/prd-workflow/SKILL.md` | Inline pipeline → skill reference | -439 lines |
| `agents/builder.md` | 7-step pipeline → single test-flow call | -43 lines |
| `skills/test-ui-verification/SKILL.md` | Removed isUIProject gate, no-ui references | -15 lines (approx) |
| `skills/test-e2e-flow/SKILL.md` | Removed UI/non-UI branching | -5 lines (approx) |
| `skills/project-bootstrap/SKILL.md` | Removed no-ui mode option | ~0 (rewording) |
| `schemas/project.schema.json` | Removed no-ui enum value | ~0 (rewording) |
| **Total net reduction** | | **~-836 lines** |

---

## Tier 2 Skills (Unchanged)

These skills were NOT merged into test-flow and remain as separate, on-demand skills:

| Skill | Status |
|-------|--------|
| `test-verification-loop` | Unchanged — loaded for 3-pass stability checks |
| `test-prerequisite-detection` | Unchanged — loaded for failure classification |
| `test-e2e-flow` | Minor edits (removed UI/non-UI branching) — still loaded for E2E execution |
| `test-ui-verification` | Minor edits (removed isUIProject gate) — still loaded for Playwright verification |
| `test-failure-handling` | Unchanged — loaded for failure logging and manual fallback |
| `test-url-resolution` | Unchanged — canonical URL resolution |
| `test-user-cleanup` | Unchanged — test user cleanup |
| `test-doc-sync` | Unchanged — test documentation sync |
