---
id: prd-adhoc-analysis-enforcement
title: Ad-hoc Mode Analysis Enforcement
status: complete
priority: high
createdAt: 2026-03-03T23:00:00Z
readyAt: 2026-03-03T23:30:00Z
completedAt: 2026-03-03T23:45:00Z
---

# PRD: Ad-hoc Mode Analysis Enforcement

## Problem Statement

Builder currently has an ad-hoc workflow skill (`adhoc-workflow`) that defines a proper analysis and approval process before implementation. However, the enforcement is not strict enough. In practice, Builder sometimes skips directly to implementation without:

1. Asking clarifying questions
2. Showing what it's going to do
3. Getting user approval before starting work

This happens both:
- When in ad-hoc mode and the user describes a task
- When in PRD mode and the user describes something outside the current PRD scope

**User expectation:** Builder should NEVER just start working. It should always go through a mini-PRD process:
1. Ask clarifying questions (if needed)
2. Report what it's going to do
3. Get explicit approval
4. Implement with full testing/verification
5. Produce a completion report

## Goals

1. **Strict enforcement:** Builder NEVER starts implementation without analysis and approval
2. **Out-of-scope detection:** When in PRD mode, detect and handle out-of-scope requests properly
3. **Full testing integration:** All ad-hoc work goes through the same UI verification process as PRD work
4. **Completion reporting:** Always produce a clear report of what was done and how it went

## Non-Goals

- Changing the existing analysis/approval UI in adhoc-workflow (it's already good)
- Modifying the Task Spec format (already exists)
- Changing how PRD mode works internally

---

## Alignment with Current Mechanics

### Current Architecture

The ad-hoc workflow already has **three phases** defined in `adhoc-workflow` skill:

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  PHASE 0: ANALYSIS  │ ──► │  PHASE 1: EXECUTE   │ ──► │   PHASE 2: SHIP     │
│                     │     │                     │     │                     │
│ Analyze request,    │     │ Implement stories,  │     │ Commit, merge,      │
│ generate Task Spec, │     │ auto quality        │     │ push to main        │
│ confirm with user   │     │ checks per task     │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

**Phase 0 (Analysis)** already exists and includes:
- Time-boxed analysis (10 seconds)
- "ANALYZING REQUEST" progress indicator
- "ANALYSIS COMPLETE" dashboard with:
  - Understanding summary + confidence level
  - Scope estimate
  - Affected files
  - Consequences
  - Alternatives
  - Story preview (TSK-001, TSK-002, etc.)
- Options: `[G] Go ahead`, `[E] Edit/Clarify`, `[P] Promote to PRD`, `[C] Cancel`
- Clarifying questions for MEDIUM/LOW confidence

**The skill even has a guardrail:**
```
> ⛔ **MANDATORY: Every ad-hoc request goes through analysis.**
>
> Failure behavior: If proceeding to implementation without showing 
> analysis output, STOP and run analysis first.
```

### The Gap: Enforcement in Builder

The problem is that **Builder doesn't have a hard enforcement rule** that explicitly blocks implementation. The skill defines the workflow, but Builder can still:

1. **Skip loading the skill** — Just delegate to @developer directly
2. **Ignore the skill's instructions** — LLMs can drift
3. **Not detect out-of-scope requests** — During PRD mode, there's no "is this in the PRD?" check

### What This PRD Adds

| What Exists | What's Missing | This PRD Adds |
|-------------|----------------|---------------|
| `adhoc-workflow` skill with Phase 0 | No hard enforcement in builder.md | **US-001:** Critical guardrail in builder.md itself |
| Analysis dashboard format | Builder can skip it | **US-003:** State checkpoint (`analysisCompleted: boolean`) |
| Clarifying questions for MEDIUM/LOW | Not enforced | **US-005:** Mandatory questions, [G] blocked until HIGH |
| Task Spec completion | No completion report format | **US-004:** Mandatory completion report template |
| Ad-hoc mode entry | No out-of-scope detection in PRD mode | **US-002:** Out-of-scope request detection |
| "Don't start without analysis" concept | No explicit "never auto-start" examples | **US-006:** Explicit anti-patterns |

### How It Works Together

```
User says something
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ BUILDER.MD GUARDRAIL (US-001, US-006)                     │
│                                                           │
│ "Am I about to write code or delegate to @developer?"    │
│  • YES → "Did I show ANALYSIS COMPLETE and get [G]?"      │
│          • NO  → STOP, run Phase 0 first                  │
│          • YES → Proceed                                  │
│  • NO  → Continue                                         │
└───────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ STATE CHECKPOINT (US-003)                                 │
│                                                           │
│ Check: analysisCompleted === true in builder-state.json   │
│  • FALSE → STOP, show analysis dashboard                  │
│  • TRUE  → Proceed to @developer delegation               │
└───────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ ADHOC-WORKFLOW SKILL (existing)                           │
│                                                           │
│ Phase 0: Analysis → Phase 1: Execute → Phase 2: Ship      │
│                                                           │
│ + NEW: Completion Report (US-004)                         │
└───────────────────────────────────────────────────────────┘
```

### Out-of-Scope Detection Flow (US-002)

This is **new functionality** that doesn't exist today:

```
During PRD Mode (e.g., working on prd-user-settings):
        │
        ▼
User says: "Also fix the footer alignment"
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ OUT-OF-SCOPE DETECTION (US-002)                           │
│                                                           │
│ Check: Does "fix footer alignment" match any story in     │
│        the active PRD?                                    │
│  • YES → Continue PRD work                                │
│  • NO  → Show OUT OF SCOPE banner:                        │
│                                                           │
│    ═══════════════════════════════════════════════════    │
│              ⚠️ OUT OF SCOPE REQUEST                      │
│    ═══════════════════════════════════════════════════    │
│                                                           │
│    Current PRD: prd-user-settings                         │
│    Your request: "fix the footer alignment"               │
│                                                           │
│    This doesn't match any story in the active PRD.        │
│                                                           │
│    [A] Analyze as ad-hoc task (separate from PRD)         │
│    [I] Inject into current PRD (add as new story)         │
│    [S] Skip and continue PRD work                         │
│    ═══════════════════════════════════════════════════    │
└───────────────────────────────────────────────────────────┘
```

### Summary of Changes

| Aspect | Current State | After This PRD |
|--------|---------------|----------------|
| Analysis workflow | ✅ Defined in skill | ✅ Same workflow |
| Enforcement | ⚠️ Soft (skill instruction) | ✅ Hard (builder.md guardrail + state checkpoint) |
| Out-of-scope detection | ❌ None | ✅ Added |
| Clarifying questions | ⚠️ Suggested | ✅ Mandatory for MEDIUM/LOW |
| Completion report | ⚠️ Exists but not standardized | ✅ Mandatory template |
| Anti-patterns | ❌ None | ✅ Explicit examples |

---

## User Stories

### US-001: Hard Enforcement Rule in Builder

**Description:** Add a critical guardrail to Builder that explicitly blocks implementation without prior analysis and approval.

**Acceptance Criteria:**

- [ ] Add a prominent "NEVER START IMPLEMENTATION WITHOUT ANALYSIS AND APPROVAL" guardrail section in builder.md
- [ ] The guardrail must be near the top of the file (after Identity Lock, before Skills Reference)
- [ ] It must specify: "Before writing ANY code, editing ANY file, or delegating to @developer, Builder MUST have shown the Analysis Complete dashboard and received explicit user approval ([G] Go ahead)"
- [ ] Include failure behavior: "If you find yourself about to write code without having shown the analysis dashboard — STOP"
- [ ] Reference the `adhoc-workflow` skill for the actual analysis flow

### US-002: Out-of-Scope Request Detection in PRD Mode

**Description:** When in active PRD mode, detect when user input is outside the current PRD scope and handle it properly.

**Acceptance Criteria:**

- [ ] Add a section in builder.md for "Out-of-Scope Request Detection During PRD Mode"
- [ ] Define trigger: "User message does not match any story in the active PRD"
- [ ] Define detection method: Compare user request against story titles and descriptions in active PRD
- [ ] Show an "OUT OF SCOPE" banner making it clear this is not part of the PRD
- [ ] Offer options: [A] Analyze as ad-hoc task, [I] Inject into current PRD, [S] Skip and continue PRD
- [ ] If user chooses [A], run full ad-hoc analysis flow (load skill, show dashboard, get [G]) before any implementation
- [ ] If user chooses [I], create a TSK-### story and inject it into the PRD (existing functionality)

### US-003: Analysis Phase Enforcement Checkpoint

**Description:** Add explicit state tracking to ensure analysis was completed before implementation.

**Acceptance Criteria:**

- [ ] Add `analysisCompleted: boolean` field to `activeTask` in builder-state.json schema
- [ ] Set `analysisCompleted: false` when entering ad-hoc mode
- [ ] Set `analysisCompleted: true` only after user responds with [G] Go ahead
- [ ] Before any @developer delegation in ad-hoc mode, verify `analysisCompleted === true`
- [ ] If not true, STOP and show the analysis dashboard first
- [ ] Document this checkpoint in builder.md

### US-004: Completion Report Template

**Description:** After all ad-hoc work is complete, always show a comprehensive completion report.

**Acceptance Criteria:**

- [ ] Update the "Task Spec Completion" section in adhoc-workflow skill with mandatory report format
- [ ] Report must include:
  - Original request (what the user asked for)
  - Understanding summary (how Builder interpreted it)
  - Stories completed (TSK-001, TSK-002, etc. with titles)
  - Files modified (list of files changed)
  - Tests run (unit tests count, verification tests count)
  - Verification status (verified/skipped/not-required per story)
  - Screenshots captured (paths if any)
  - Commits made (commit hashes with messages)
  - Time taken (approximate, from task start to completion)
- [ ] This report must appear BEFORE offering to commit/push
- [ ] Add explicit rule: "User cannot proceed to commit without seeing this report"

### US-005: Clarifying Questions Enforcement

**Description:** Ensure clarifying questions are asked when confidence is not HIGH.

**Acceptance Criteria:**

- [ ] Update adhoc-workflow skill Step 0.3 to make questions mandatory for MEDIUM/LOW
- [ ] Do not show the [G] Go ahead option in the dashboard when confidence is MEDIUM or LOW
- [ ] Instead show: [Q] Answer clarifying questions, [J] Just do it (proceed with best interpretation), [P] Promote, [C] Cancel
- [ ] After user answers questions OR chooses [J], show updated analysis dashboard with [G] option
- [ ] Document this enforcement in builder.md guardrail section

### US-006: Never Auto-Start Behavior

**Description:** Explicitly document that Builder never auto-starts implementation even for "obvious" tasks.

**Acceptance Criteria:**

- [ ] Add to builder.md guardrail: "Even if the task seems simple or obvious, ALWAYS show analysis and get approval"
- [ ] Add to guardrail: "Never say 'Let me implement that for you' and start coding"
- [ ] Add to guardrail: "Never delegate to @developer without showing what you're about to do"
- [ ] Add anti-pattern examples:
  - ❌ "I'll add that button for you" [starts coding]
  - ❌ "That's a quick fix, let me just..." [edits file]
  - ❌ "Sure, implementing now..." [delegates to @developer]
  - ✅ "Let me analyze this request..." [shows ANALYZING, then dashboard, waits for [G]]

---

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Builder.md updated with enforcement guardrails (US-001, US-002, US-003, US-006)
- [ ] adhoc-workflow skill updated with completion report template (US-004) and question enforcement (US-005)
- [ ] builder-state schema updated with `analysisCompleted` field (US-003)
- [ ] Manual testing: Give Builder 3 ad-hoc requests and verify it always analyzes first
- [ ] Manual testing: During PRD mode, give out-of-scope request and verify detection
- [ ] E2E tests not applicable (behavior change in agent prompts)

---

## Decisions

1. **Disable option?** No. Enforcement is universal. Users can say "just do it" after seeing analysis, or choose [J] to proceed with best interpretation.

2. **What's "out of scope"?** Any request that doesn't match an existing story in the active PRD. Even if related to the PRD's domain, if it's not an existing story, it's out of scope.

3. **Save completion report?** No, just shown in the UI. The Task Spec in `docs/tasks/` serves as the persistent record.
