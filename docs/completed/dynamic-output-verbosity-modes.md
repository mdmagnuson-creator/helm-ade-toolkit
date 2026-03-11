# PRD: Automatic Output Verbosity

**Status:** draft  
**Priority:** high  
**Effort:** medium  
**Impact:** high

## Introduction

Implement **fully automatic output verbosity selection** — the system determines output detail level per-operation based on operation type and failure signals. **No prompts, no mode selection, no user interaction required.**

This follows the same pattern as automatic test activity selection: analyze the operation → resolve verbosity → apply limits. The user never chooses "lean" or "debug" — the system decides based on what's happening.

## Key Principle: Zero User Interaction

**This system is fully automatic.** The user does not:
- Select a verbosity mode at session start
- Confirm output detail levels
- Choose between cost and diagnostics
- Approve truncation decisions

The system analyzes operation type, detects failure signals, and applies appropriate output limits — automatically. The user sees clean, appropriately-sized output without ever being asked about verbosity.

**Exception:** User can always say "show me more" or "debug this" to escalate — but this is recovery, not configuration.

## Problem Statement

1. **Output volume is inconsistent** — Same operations produce wildly different output sizes
2. **Happy paths waste tokens** — Successful builds/tests dump full logs nobody reads
3. **Failures need more detail** — But truncation is applied uniformly regardless of success/failure
4. **No automatic adaptation** — Agents don't adjust output based on what happened
5. **Manual mode selection is friction** — Any "choose verbosity" prompt interrupts flow

The goal is: **Show exactly the right amount of output for each operation — minimal on success, detailed on failure — without asking.**

## Goals

- **Zero prompts:** No verbosity selection, no confirmation, no "how much detail?" questions
- **Fully automatic:** Analyze operation → resolve verbosity → apply limits
- **Success = minimal:** Successful operations get one-line status
- **Failure = detailed:** Failed operations automatically get full diagnostic output
- **Test failures never truncated:** Test output is sacred — always show full failure details
- **Transparent:** User can see what limits were applied (if they ask), but never asked to choose

## Non-Goals

- Replacing tool infrastructure or output capture mechanisms
- Adding configuration options for verbosity (the whole point is no configuration)
- Changing how tools work internally
- Removing escape hatches (explicit "show full output" always works)

---

## Verbosity Resolution Rules

### Per-Operation Defaults

Every operation has a **default verbosity** based on type:

| Operation Type | Default | Output Limit |
|----------------|---------|--------------|
| `git status`, `git diff --stat`, `ls` | lean | Full output (small by nature) |
| `git log` | lean | 20 lines max |
| Dev server startup | lean | One status line: `running`, `startup failed`, or `timed out` |
| `npm run build` / `go build` | balanced | Exit code + last 10 lines on success |
| `npm run test` / `go test` | balanced | Summary line on success, full on failure |
| `npm run lint` / `npm run typecheck` | balanced | Clean = silent, errors = full output |
| File read (< 200 lines) | full | Entire file |
| File read (200-500 lines) | balanced | First 100 + last 50 + "... X lines omitted" |
| File read (> 500 lines) | lean | First 50 + summary + "use offset to read more" |
| Command output (< 30 lines) | full | Entire output |
| Command output (30-100 lines) | balanced | First 20 + last 10 |
| Command output (> 100 lines) | lean | Last 20 + "X lines truncated" |

### Automatic Escalation Triggers

When failure signals are detected, verbosity **automatically escalates to debug**:

| Signal | Detection | Escalation Behavior |
|--------|-----------|---------------------|
| Non-zero exit code | `$? != 0` | Show full stderr + last 50 lines stdout |
| Timeout | Command exceeds limit | Show everything captured before timeout |
| Test failure | Exit code or "FAIL" in output | **Full output — never truncate** |
| Build failure | Exit code or "error" patterns | Full error output + 20 lines context |
| Repeated failure | Same command fails twice in session | Full debug output on second attempt |
| Explicit request | User says "show more", "debug", "full output" | Switch to debug for that operation |

### Critical Rule: Test Failures Are Never Truncated

> **MANDATORY:** When any test command fails (unit, integration, E2E), show the **complete failure output**.
>
> This preserves the testing rigor from automatic test activity selection.
> Truncating test failures defeats the purpose of running tests.

Detection patterns for test commands:
- `npm run test`, `npm test`, `npx jest`, `npx vitest`
- `go test`
- `pytest`, `python -m pytest`
- `npx playwright test`
- Any command containing `test` in a testing context

---

## User Stories

### US-001: Implement per-operation verbosity resolution

**Description:** As a user, I want output automatically sized per-operation so I don't see walls of text on success or missing details on failure.

**Acceptance Criteria:**

- [ ] Create verbosity resolution function that takes: operation type, exit code, output size
- [ ] Apply default limits from the per-operation table above
- [ ] Return: truncated output + truncation metadata (lines omitted, full output location)
- [ ] Resolution happens automatically — no agent reasoning required

### US-002: Implement automatic failure escalation

**Description:** As a user, I want failures to automatically show more detail so I can diagnose issues without asking.

**Acceptance Criteria:**

- [ ] Detect failure signals: non-zero exit, timeout, error patterns
- [ ] On failure detection, bypass normal truncation limits
- [ ] Show full stderr always on failure
- [ ] Show contextual stdout (last 50 lines minimum)
- [ ] Include "full output saved to .tmp/last-command-output.txt" for very long failures

### US-003: Protect test failure output from truncation

**Description:** As a user, I want test failures to always show complete output so I can see exactly what failed.

**Acceptance Criteria:**

- [ ] Detect test commands by pattern matching (npm test, go test, pytest, playwright)
- [ ] When test command exits non-zero, show **complete output** regardless of length
- [ ] Never apply line limits to failed test output
- [ ] This rule takes precedence over all other truncation rules

### US-004: Add escape hatch for explicit debug requests

**Description:** As a user, I want to say "show me more" and get full output when automatic truncation was too aggressive.

**Acceptance Criteria:**

- [ ] Recognize phrases: "show more", "show full output", "debug this", "what was the full output"
- [ ] Re-run last command with debug verbosity (no truncation)
- [ ] Or retrieve from .tmp/last-command-output.txt if saved
- [ ] This is recovery, not configuration — user shouldn't need it often

### US-005: Update primary agents with verbosity rules

**Description:** As a user, I want consistent output behavior across Builder, Planner, and Toolkit.

**Acceptance Criteria:**

- [ ] Add "Output Verbosity Policy" section to `builder.md`, `planner.md`, `toolkit.md`
- [ ] Policy references the resolution rules (not duplicates them)
- [ ] Agents apply rules automatically without per-turn reasoning
- [ ] Consistent status vocabulary: `running`, `success`, `failed`, `timed out`

### US-006: Update testing agents to never truncate failures

**Description:** As a user, I want testing agents to always show full failure output.

**Acceptance Criteria:**

- [ ] Update `tester.md`, `jest-tester.md`, `react-tester.md`, `go-tester.md`, `e2e-playwright.md`
- [ ] Add explicit rule: "Test failure output is never truncated"
- [ ] Successful test runs can be summarized (e.g., "42 tests passed")
- [ ] Failed test runs show complete output

### US-007: Add verbosity rules schema (optional)

**Description:** As a toolkit maintainer, I want verbosity rules defined in a schema so they're auditable and consistent.

**Acceptance Criteria:**

- [ ] Create `schemas/verbosity-rules.schema.json` (optional — can be hardcoded initially)
- [ ] Schema defines: operation patterns, default limits, escalation triggers
- [ ] Agents reference the schema or embed equivalent rules
- [ ] This is optional for v1 — can hardcode rules and extract later

---

## Implementation Approach

### Option A: Embed in Agent Prompts (Recommended for v1)

Add a "Verbosity Policy" section to each agent with deterministic rules:

```markdown
## Output Verbosity Policy

Apply these rules automatically — no user interaction required.

**Success path (exit 0):**
- Build/test commands: one-line summary ("Build succeeded", "42 tests passed")
- File reads > 200 lines: first 100 + last 50 + omission notice
- Command output > 30 lines: last 20 lines + truncation notice

**Failure path (exit non-zero):**
- Show full stderr always
- Show last 50 lines stdout minimum
- Test failures: show complete output, never truncate
- Save full output to .tmp/last-command-output.txt for retrieval

**Escalation triggers:**
- Non-zero exit → full error output
- Timeout → show captured output
- Repeated failure → debug mode
- User says "show more" → retrieve full output
```

### Option B: Centralized Rules File (Future)

Create `data/verbosity-rules.yaml` with structured rules that agents reference. Better for auditing but more complex to implement.

**Recommendation:** Start with Option A, extract to Option B if rules need frequent tuning.

---

## Comparison with Test Activity Selection

| Aspect | Test Activity Selection | Verbosity Selection |
|--------|------------------------|---------------------|
| Trigger | Changed files | Operation execution |
| Resolution timing | Before running tests | During/after command |
| Input signals | File patterns, hotspots | Exit code, output size, operation type |
| Output | List of activities to run | Truncated/full output |
| User interaction | None | None |
| Escalation | Hotspot → more coverage | Failure → more detail |
| Sacred rule | Run all relevant tests | Never truncate test failures |

---

## Success Metrics

**Primary:**
- 30%+ reduction in average output tokens per session (measured via OpenCode stats)
- Zero increase in "I can't see the error" complaints
- Test failure diagnosis time unchanged or improved

**Secondary:**
- Faster perceived response time (less output to render)
- Reduced context window pressure in long sessions
- No user requests to "turn off verbosity limits"

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Over-truncation hides root cause | Automatic escalation on failure signals |
| Test failures truncated | Explicit "never truncate test failures" rule |
| User wants more but doesn't know how | "show more" escape hatch documented |
| Rules too rigid | Start conservative, tune based on feedback |

---

## Open Questions (Resolved)

1. ~~Should mode defaults be set globally?~~ **No modes — fully automatic**
2. ~~Should mode persist across sessions?~~ **No modes — per-operation resolution**
3. ~~Per-tool hard caps?~~ **Yes — defined in per-operation table**

---

## Definition of Done

- [ ] All user stories completed
- [ ] Primary agents (builder, planner, toolkit) have verbosity policy sections
- [ ] Testing agents have "never truncate test failures" rule
- [ ] Escape hatch ("show more") documented and working
- [ ] Baseline metrics captured before rollout
- [ ] Post-rollout metrics show improvement without quality loss
- [ ] PRD status updated to `complete`
