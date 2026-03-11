---
id: prd-mandatory-probe-enforcement
title: Mandatory Playwright Probe Enforcement — Remove All Skip Paths
status: complete
priority: critical
createdAt: 2026-03-06T22:00:00Z
---

# PRD: Mandatory Playwright Probe Enforcement — Remove All Skip Paths

## Problem Statement

Builder's Playwright analysis probe has a `skipped` status that allows the model to bypass the probe entirely. The intent was to allow skipping only for three specific conditions (dev server unreachable, no assertions generated, user opt-out via `agents.analysisProbe: false`), but in practice the model rationalizes novel skip reasons that don't match the approved list — and the gate check doesn't validate the reason.

### The Root Cause

The gate check in `builder.md` (line 89) accepts `probeStatus` values of `confirmed`, `partially-confirmed`, or `skipped`. When Builder sets `probeStatus: "skipped"` with any reason string, it passes the gate. The model has been observed generating reasons like:

- *"Skipped (Electron IPC behavior — browser Playwright cannot verify shell.openExternal vs window.location.href)"*
- *"Code analysis is clear, no probe needed"*
- *"UX flow restructuring, not element verification"*

None of these match the approved skip conditions, but the gate doesn't check — it just sees `"skipped"` and lets it through.

### Why all skip paths are wrong

| Skip Path | Why It's Not Valid |
|-----------|--------------------|
| **Dev server unreachable** | Builder has the `start-dev-server` skill — start it. If it's a desktop app, download and install it. There should always be a way to get the target running. |
| **No page assertions generated** | If analysis can't produce assertions, the analysis is incomplete. Go back and generate them. |
| **`agents.analysisProbe: false`** | This config option creates an opt-out path that the model can rationalize using. Remove it entirely — the probe is mandatory, no exceptions. |
| **`degraded-no-auth`** | Auth failure silently degrades the probe to public-only pages and passes the gate. The model can use this to avoid probing authenticated pages entirely. Instead: exhaust auth approaches → ask user for help → only skip with explicit user acceptance. |

### Observed Impact

When the probe is skipped or degraded, Builder proceeds with incomplete analysis that misses:
- Runtime state differences (CSS inheritance, feature flags, dynamic rendering)
- Route guards and redirects
- Actual DOM structure vs. assumed structure
- Authentication-gated content visibility

This leads to incorrect implementation plans, user rework, and eroded trust.

## Goals

1. **Eliminate `skipped` as a valid `probeStatus`** — remove it from all gate checks, enum definitions, dashboard displays, and handling logic across the toolkit
2. **Make the probe truly mandatory** — no skip conditions, no config opt-out, no rationalization escape hatches. The probe always runs.
3. **Remove `agents.analysisProbe` config option** — there is no way to disable the probe. It is not optional.
4. **Ensure prerequisites are resolved, not skipped** — dev server down → start it; no assertions → generate them; app not installed → install it; auth fails → ask user for help
5. **Replace `degraded-no-auth` with user-assisted auth resolution** — when autonomous auth fails, ask the user for help. The only way to skip the probe on authenticated pages is the user explicitly accepting a skip.
6. **Add a re-probe loop for `contradicted` results** — when probe contradicts analysis, Builder must fix the analysis AND re-probe to confirm the fix, not just revise and proceed

## Non-Goals

- Changing probe assertion generation logic (how assertions are created)
- Adding new probe capabilities (e.g., visual regression, performance)
- Changing the auth skill implementations themselves (supabase, nextauth, etc.)

## User Stories

### US-001: Remove `skipped` from builder.md gate check

**Description:** As the toolkit maintainer, I want to remove `skipped` as a valid `probeStatus` in the builder.md state checkpoint enforcement so that the gate physically cannot accept a skipped probe.

**Acceptance Criteria:**

- [ ] `builder.md` line 80: state checkpoint table lists `probeStatus` as requiring `confirmed` or `partially-confirmed` (not `skipped`, not `degraded-no-auth`)
- [ ] `builder.md` line 89: enforcement check accepts ONLY `confirmed`, `partially-confirmed`, or `user-skipped` (explicit user acceptance only)
- [ ] Gate behavior: if `probeStatus` is anything other than the accepted values (including `null`, `skipped`, `contradicted`, or `degraded-no-auth`), Builder MUST stop and resolve the issue

### US-002: Remove Electron-specific qualifier from never-skip prohibitions

**Description:** As the toolkit maintainer, I want to remove the Electron-specific framing from the probe prohibitions in builder.md so the rule is universal — the probe never skips, period.

**Acceptance Criteria:**

- [ ] `builder.md` lines 53-56: prohibitions say "Never skip the Playwright probe" without qualifying with "see skip conditions" (there are no skip conditions)
- [ ] `builder.md` lines 64-66: negative examples remove Electron-specific framing — replace with universal "never skip" examples
- [ ] No reference to "valid skip conditions" remains anywhere in builder.md — there are no valid skip conditions
- [ ] Line 56 reference to `test-ui-verification` skill's skip conditions is removed

### US-003: Replace skip conditions section in test-ui-verification skill

**Description:** As the toolkit maintainer, I want to replace the "Skip Conditions" section in test-ui-verification/SKILL.md with mandatory enforcement rules so there is no documented path to skip the probe.

**Acceptance Criteria:**

- [ ] `test-ui-verification/SKILL.md` lines 592-614: "Skip Conditions" section replaced with "Mandatory Enforcement" section
- [ ] New section states: the probe always runs, there are no skip conditions, there is no config opt-out
- [ ] "Dev server unreachable" → replaced with: "Start the dev server using `start-dev-server` skill. If the target is a desktop app, download and install it. There must always be a way to get the target running."
- [ ] "No page assertions generated" → replaced with: "Generate assertions. If analysis cannot produce assertions, the analysis is incomplete — re-analyze."
- [ ] Line 602 ("skipping is NOT a failure") statement removed
- [ ] The "NOT valid skip conditions" table (lines 604-614) is preserved but reframed as "common rationalization attempts" that Builder must reject

### US-004: Remove `skipped` and `degraded-no-auth` from probe results tables

**Description:** As the toolkit maintainer, I want to remove the `skipped` row from the probe results tables in test-ui-verification/SKILL.md and replace `degraded-no-auth` with the new user-assisted resolution flow.

**Acceptance Criteria:**

- [ ] `test-ui-verification/SKILL.md` line 577: `skipped` row removed from "How Builder Uses Probe Results" table
- [ ] `degraded-no-auth` row replaced with `user-skipped` row: `Confidence: [original] ⚠️ User accepted skip` and note: `User explicitly accepted skipping probe on authenticated pages after Builder exhausted all auth approaches and asked for help`
- [ ] Only valid statuses remain in the table: `confirmed`, `partially-confirmed`, `contradicted`, `user-skipped`

### US-005: Rewrite NO-BYPASS RULE in adhoc-workflow

**Description:** As the toolkit maintainer, I want to rewrite the NO-BYPASS RULE section in adhoc-workflow/SKILL.md to be absolute — no skip conditions exist, no skip reasons are valid, no config can disable it, the probe always runs. The only skip path is explicit user acceptance after Builder has exhausted all resolution options.

**Acceptance Criteria:**

- [ ] `adhoc-workflow/SKILL.md` lines 364-382: NO-BYPASS RULE rewritten
- [ ] Invalid rationalization table preserved and expanded (keep all existing entries, add auth-related ones)
- [ ] Reference to "valid skip conditions" in `test-ui-verification` removed — replaced with: "There are no valid skip conditions. There is no config opt-out. The probe always runs."
- [ ] The three former "valid" conditions (dev server, no assertions, config opt-out) are now listed as invalid rationalizations with mandatory resolution steps
- [ ] New explicit instruction: "If the dev server is unreachable, start it using `start-dev-server` skill. If the app is not installed, install it. If auth fails, ask the user for help. There is always a way."
- [ ] Clearly states: "The ONLY way a probe can be skipped is if the user explicitly accepts a skip after Builder has exhausted all options and asked for assistance."

### US-006: Remove `skipped` from probe results processing table

**Description:** As the toolkit maintainer, I want to remove the `skipped` row from the probe results processing table in adhoc-workflow/SKILL.md and replace `degraded-no-auth` with user-assisted auth resolution.

**Acceptance Criteria:**

- [ ] `adhoc-workflow/SKILL.md` line 447: `skipped` row removed from probe results processing table
- [ ] `degraded-no-auth` row removed — auth failure no longer silently degrades; it triggers user assistance flow
- [ ] `user-skipped` row added with action: "Proceed to Step 0.2 with `⚠️ User accepted skip` badge — user explicitly chose to skip probe on authenticated pages"
- [ ] Only valid statuses remain: `confirmed`, `partially-confirmed`, `contradicted`, `user-skipped`

### US-007: Rewrite "probe was skipped" handling in dashboard rules

**Description:** As the toolkit maintainer, I want to remove the "if probe was skipped" handling in the adhoc-workflow dashboard section and replace it with mandatory probe enforcement.

**Acceptance Criteria:**

- [ ] `adhoc-workflow/SKILL.md` lines 852-855: "probe was skipped" block replaced with mandatory enforcement statement
- [ ] New text states: "The probe is mandatory. If the probe has not run, do not show the dashboard — go back and run the probe."
- [ ] No reference to "skip reason" or `[R] Retry probe` — the probe is not optional, so retry framing is wrong; it just must run
- [ ] Exception noted: if `probeStatus` is `user-skipped`, the dashboard may be shown (user already explicitly accepted the skip)

### US-008: Remove `skipped` from dashboard display table

**Description:** As the toolkit maintainer, I want to remove the `skipped` row from the dashboard probe results display table in adhoc-workflow/SKILL.md and replace `degraded-no-auth` with `user-skipped`.

**Acceptance Criteria:**

- [ ] `adhoc-workflow/SKILL.md` line 864: `skipped` row removed from dashboard display table
- [ ] `degraded-no-auth` row removed from dashboard display table
- [ ] `user-skipped` row added with badge: `Confidence: [original] ⚠️ User accepted skip` and section: `🔍 PROBE: ⚠️ User accepted skip (auth pages unverified)`
- [ ] Only valid statuses remain in display table: `confirmed`, `partially-confirmed`, `contradicted`, `user-skipped`

### US-009: Add contradicted → re-probe loop

**Description:** As the toolkit maintainer, I want to add a mandatory re-probe step after contradiction resolution so that when the probe contradicts the analysis, Builder must revise the analysis AND re-probe to confirm the revision is correct — not just revise and proceed.

**Acceptance Criteria:**

- [ ] `adhoc-workflow/SKILL.md` contradiction handling (around lines 449-473): after revising analysis, Builder MUST re-run the probe with updated assertions
- [ ] Re-probe loop: revise analysis → generate new assertions from revised analysis → re-run probe → check result
- [ ] Loop limit: maximum 2 re-probe attempts. If still contradicted after 2 retries, lower confidence to LOW and force clarifying questions
- [ ] Each re-probe iteration is logged in the progress indicator (e.g., "⏳ Re-probing after analysis revision (attempt 2/2)")
- [ ] `contradicted` is a transient state during the re-probe loop — it can never be the final `probeStatus` when reaching the gate. The loop must resolve to `confirmed`, `partially-confirmed`, or `user-skipped`, or confidence must be lowered to LOW (which forces clarifying questions and restarts analysis)

### US-010: Add `contradicted` as gate-blocking status in builder.md

**Description:** As the toolkit maintainer, I want `contradicted` to explicitly block the gate in builder.md so that Builder cannot proceed to implementation with unresolved probe contradictions.

**Acceptance Criteria:**

- [ ] `builder.md` gate check (line 89): `contradicted` is explicitly listed as a gate-blocking status alongside `null`
- [ ] Comment or note explains: "`contradicted` means the re-probe loop did not resolve — analysis is unreliable, cannot proceed"
- [ ] Gate documentation clarifies the full state machine: `null` → (probe runs) → `confirmed` | `partially-confirmed` | `user-skipped` (pass gate) or `contradicted` (blocks gate, must re-analyze and re-probe)

### US-011: Remove `agents.analysisProbe` config option

**Description:** As the toolkit maintainer, I want to remove the `agents.analysisProbe` configuration option from all skills so there is no way to disable the probe via project configuration.

**Acceptance Criteria:**

- [ ] `test-ui-verification/SKILL.md` lines 616-632: remove `analysisProbe` from project configuration section (keep `analysisProbeTimeoutMs` — timeout is still useful)
- [ ] `adhoc-workflow/SKILL.md` line 380: remove `analysisProbe: false` from the NO-BYPASS RULE skip conditions list
- [ ] `adhoc-workflow/SKILL.md` lines 1866-1878: remove `analysisProbe` from the agent configuration JSON example and settings table (keep `analysisProbeTimeoutMs`)
- [ ] No reference to `agents.analysisProbe` remains in any behavior file (agents or skills)
- [ ] The probe step (Step 0.1b) has no config guard — it always executes

### US-012: Replace autonomous auth resolution with user-assisted escalation

**Description:** As the toolkit maintainer, I want to replace the current auth resolution flow that silently degrades to `degraded-no-auth` with an escalation that asks the user for help when autonomous approaches fail. The only way to skip probing authenticated pages is the user explicitly accepting a skip.

**Acceptance Criteria:**

- [ ] `adhoc-workflow/SKILL.md` lines 497-545: "Autonomous Auth Resolution" section rewritten with user-assisted escalation
- [ ] New escalation ladder:
  1. Check `project.json` → `authentication` and use matching auth skill (same as today)
  2. If not configured → run `setup-auth` skill to auto-detect (same as today)
  3. If `setup-auth` fails → **ask the user for help** with specific questions: "What auth provider does this project use?", "Can you provide test credentials?", "Are there env vars I should check?"
  4. If user provides info → try again with user-provided guidance
  5. If user cannot help or says "skip" → set `probeStatus: "user-skipped"` and proceed with public pages only
- [ ] The "NEVER ask the user" prohibition (line 499-502) is removed — asking the user is now the correct escalation when autonomous approaches fail
- [ ] The "What to NEVER do" list (lines 540-545) is updated: remove prohibition on asking for credentials; keep prohibition on asking BEFORE trying autonomous approaches first
- [ ] `degraded-no-auth` status is removed entirely — replaced by `user-skipped` (user explicitly accepted) or resolved auth (probe runs fully)
- [ ] User skip acceptance prompt format:
  ```
  ⚠️ AUTH RESOLUTION FAILED — cannot authenticate for probe
  
  Attempted:
    1. project.json auth config → [result]
    2. setup-auth auto-detection → [result]
    3. Asked user for help → [result]
  
  Protected pages NOT probed: /dashboard, /settings
  
  [S] Skip probe on authenticated pages (proceed with public pages only)
  [H] Help me configure auth (provide credentials/guidance)
  [C] Cancel this request
  ```
- [ ] Only `[S]` from the user sets `probeStatus: "user-skipped"` — Builder cannot set this status autonomously

### US-013: Update test-ui-verification auth integration section

**Description:** As the toolkit maintainer, I want to update the auth integration section in test-ui-verification/SKILL.md to match the new user-assisted escalation flow.

**Acceptance Criteria:**

- [ ] `test-ui-verification/SKILL.md` lines 634-668: auth integration section updated
- [ ] Escalation ladder step 4 changed from "proceed with public pages only + degraded-no-auth" to "ask user for help"
- [ ] New step 5: "If user says skip → `user-skipped`; if user provides info → retry auth"
- [ ] `degraded-no-auth` references removed from this section
- [ ] "Skipping authenticated pages is a last resort" (line 638) reworded to: "Skipping authenticated pages requires explicit user acceptance after all auth approaches are exhausted"

## Functional Requirements

- FR-1: The `probeStatus` field accepts ONLY these values at runtime: `null` (initial), `confirmed`, `partially-confirmed`, `contradicted` (transient), `user-skipped` (explicit user acceptance only)
- FR-2: The values `skipped` and `degraded-no-auth` are not valid `probeStatus` values anywhere in the toolkit
- FR-3: The builder.md gate check accepts ONLY `confirmed`, `partially-confirmed`, or `user-skipped` to proceed
- FR-4: `null` and `contradicted` both block the gate — Builder must run or re-run the probe
- FR-5: `user-skipped` can ONLY be set after Builder presents the skip acceptance prompt and the user explicitly chooses `[S]` — Builder cannot set this status autonomously
- FR-6: When the probe status is `contradicted`, Builder must enter the re-probe loop (revise → re-probe, max 2 attempts)
- FR-7: If re-probe loop exhausts retries, confidence is lowered to LOW and clarifying questions are forced
- FR-8: When dev server is unreachable, Builder must start it using `start-dev-server` skill (not skip the probe)
- FR-9: When no assertions are generated, Builder must re-analyze to produce assertions (not skip the probe)
- FR-10: The `agents.analysisProbe` config option does not exist — there is no way to disable the probe
- FR-11: When auth fails after exhausting autonomous approaches, Builder must ask the user for help before degrading

## Non-Goals (Out of Scope)

- Changing how probe assertions are generated (assertion quality is a separate concern)
- Changing the auth skill implementations themselves (supabase, nextauth, etc.)
- Adding probe capabilities (visual regression, performance metrics, etc.)
- Modifying `builder-state.schema.json` (probeStatus is not defined there — it's markdown-only)
- Removing `analysisProbeTimeoutMs` (timeout per page is still useful configuration)

## Technical Considerations

- **No schema changes needed:** `probeStatus` is not defined in `builder-state.schema.json` — all changes are to markdown agent/skill files
- **Re-probe loop must be bounded:** Maximum 2 retries prevents infinite loops when analysis fundamentally misunderstands the page
- **`contradicted` is transient:** It exists as a state during the re-probe loop but can never be the final value at the gate. The loop resolves it to a passing status or forces LOW confidence (which restarts analysis via clarifying questions).
- **`user-skipped` requires user interaction:** This is the only `probeStatus` that requires a user prompt. Builder cannot autonomously set this value — it must present the skip acceptance prompt and receive `[S]` from the user.

## Success Metrics

- Builder never produces `probeStatus: "skipped"` or `probeStatus: "degraded-no-auth"` in any session
- No novel skip rationalizations appear in Builder session logs
- Probe runs on every ad-hoc task, every project, no exceptions
- Auth failures escalate to user assistance instead of silently degrading
- The only probe skips that occur have explicit `[S]` user acceptance in the session log
- Contradicted probes resolve via re-analysis + re-probe before reaching the dashboard
- No `agents.analysisProbe` config option exists in any project's `project.json`

## Open Questions

None — all design decisions resolved during analysis.

## Credential & Service Access Plan

No external credentials required for this PRD.
