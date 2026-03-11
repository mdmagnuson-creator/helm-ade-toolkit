# PRD: Verifiable Task Completion

**Status:** Complete  
**Priority:** High  
**Source:** Intelligent AI Delegation paper (arXiv:2602.11865)

## Introduction

The paper advocates for "contract-first decomposition" — only delegate a task if you can verify its completion. The yo-go toolkit has robust post-implementation verification (test-flow, critics, E2E), but verification criteria aren't explicitly defined *before* delegation begins.

This creates three problems:
1. Specialists don't know upfront how success will be measured
2. Builder can't distinguish "verifiable" from "advisory" tasks
3. Dynamic Reassignment (future PRD) needs clear success/failure signals

This PRD adds pre-delegation verification contracts that integrate with the existing test-flow infrastructure.

## Problem Statement

1. **Implicit acceptance criteria** — What counts as "done" is determined after the fact
2. **No upfront contract** — Specialists discover verification requirements mid-task
3. **Unverifiable tasks delegated silently** — Exploratory/research tasks are treated the same as implementation tasks
4. **Reassignment blind spots** — Without explicit criteria, we can't tell if an alternative agent did better

### Example Scenarios

| Scenario | Current Behavior | Desired Behavior |
|----------|-----------------|------------------|
| "Add dark mode toggle" | Specialist implements, then tests run | Builder defines criteria upfront: unit test for toggle, E2E for theme switch |
| "Investigate slow API" | Same flow as implementation | Builder flags as "advisory" — no automated verification possible |
| "Update README" | Tests may run (and pass trivially) | Builder marks as "skip verification" — doc-only change |

## Goals

1. **Pre-delegation contracts** — Builder defines verification criteria before delegating
2. **Task classification** — Distinguish verifiable, advisory, and skip-verification tasks
3. **Specialist awareness** — Specialists know upfront how success is measured
4. **Reassignment integration** — Clear success/failure signals for Dynamic Reassignment PRD

## Non-Goals

- Replacing test-flow — we reuse existing verification infrastructure
- User prompts for every task — contracts are auto-generated from patterns
- Blocking all advisory tasks — user can approve unverifiable work

## Proposed Solution

### Verification Contract Schema

Add `verificationContract` to the task delegation format:

```json
{
  "taskId": "US-003",
  "description": "Add dark mode toggle to settings page",
  "verificationContract": {
    "type": "verifiable",
    "criteria": [
      {
        "activity": "unit-test",
        "description": "Toggle component renders and handles click",
        "pattern": "DarkModeToggle"
      },
      {
        "activity": "e2e",
        "description": "Settings page toggle changes theme",
        "timing": "immediate"
      },
      {
        "activity": "typecheck",
        "description": "No type errors introduced"
      }
    ],
    "generatedFrom": "auto",
    "generatedAt": "2026-02-28T10:00:00Z"
  }
}
```

### Contract Types

| Type | Meaning | Verification |
|------|---------|--------------|
| `verifiable` | Task has clear, automatable success criteria | Full test-flow runs |
| `advisory` | Task is exploratory/research with no clear success test | User reviews output |
| `skip` | Task is trivial (docs, config) and doesn't need verification | Lint/typecheck only |

### Contract Generation (Automatic)

Builder auto-generates contracts based on task description and expected file changes:

```
Task: "Add dark mode toggle to settings page"
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PATTERN MATCHING                                                    │
│                                                                     │
│ Keywords detected: "add", "toggle", "settings page"                │
│ Expected files: src/components/*.tsx, src/pages/settings.*         │
│                                                                     │
│ Match against test-activity-rules.json:                            │
│   *.tsx → unit-test: react-tester, critics: frontend-critic        │
│   pages/* → e2e: immediate                                         │
└─────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│ GENERATE CONTRACT                                                   │
│                                                                     │
│ type: verifiable                                                    │
│ criteria:                                                           │
│   - activity: unit-test, pattern: related to toggle                │
│   - activity: e2e, timing: immediate (page change)                 │
│   - activity: typecheck (always)                                   │
│   - activity: lint (always)                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Advisory Task Detection

Some tasks can't be verified automatically. Builder detects these patterns:

| Pattern | Example | Classification |
|---------|---------|----------------|
| "investigate", "research", "explore" | "Investigate why API is slow" | `advisory` |
| "document", "update README" | "Update installation docs" | `skip` |
| "refactor" (no behavior change) | "Refactor auth module" | `verifiable` (tests should still pass) |
| "discuss", "plan", "design" | "Design new onboarding flow" | `advisory` |

When advisory task is detected:

```
ℹ️ Advisory task detected: "Investigate why checkout API is slow"
   No automated verification — output will be logged for your review.
   Proceeding...
```

The task proceeds automatically without user intervention. The output is logged and available for review after completion. This avoids interrupting the workflow while still providing visibility.

**When to still prompt the user:**
- Task description is ambiguous (could be advisory OR verifiable)
- User has `"promptForAdvisory": true` in project.json
- Task is part of a PRD (advisory tasks in PRDs may indicate unclear requirements)

### Delegation Flow Change

```
Current:
  Builder → Delegate → Specialist works → test-flow verifies

Proposed:
  Builder → Generate contract → Delegate with contract → Specialist works → Verify against contract
              │
              ├─── verifiable → Full verification
              ├─── advisory → User review
              └─── skip → Minimal checks (lint/typecheck only)
```

### Contract in Specialist Prompt

When delegating, Builder includes the contract in the specialist's prompt:

```markdown
## Task

Add dark mode toggle to settings page

## Verification Contract

Your work will be verified by:
1. **Unit tests** — Toggle component must have passing tests
2. **E2E test** — Settings page toggle must change theme (runs immediately)
3. **Typecheck** — No type errors
4. **Lint** — No lint errors

Write your implementation knowing these criteria will be checked.
```

This gives specialists clear targets and helps them write testable code.

### Integration with Existing test-flow

The contract doesn't replace test-flow — it front-loads the criteria:

1. **Contract generation** uses same rules as test-flow (`test-activity-rules.json`)
2. **Contract criteria** map to test-flow activities
3. **Verification execution** still handled by test-flow skill
4. **Results** inform Dynamic Reassignment (future PRD)

## User Stories

### US-001: Auto-generate verification contracts

**Description:** As Builder, I automatically generate a verification contract before delegating any task, so specialists know upfront how success is measured.

**Acceptance Criteria:**
- [ ] Before delegation, Builder generates `verificationContract` object
- [ ] Contract includes criteria derived from task description and expected files
- [ ] Contract is stored in `builder-state.json` under current task
- [ ] Contract type is `verifiable`, `advisory`, or `skip`
- [ ] Generation uses patterns from `test-activity-rules.json`

**Technical Notes:**
- Parse task description for keywords (see Advisory Task Detection)
- Predict file patterns from task context
- Match patterns against activity rules
- Default to `verifiable` if patterns match test rules

### US-002: Include contract in specialist prompt

**Description:** As a specialist agent, I receive the verification contract in my task prompt, so I know exactly how my work will be evaluated.

**Acceptance Criteria:**
- [ ] Specialist prompt includes "Verification Contract" section
- [ ] Contract lists each criterion with activity type and description
- [ ] Specialist can see what tests/checks will run
- [ ] Contract is human-readable (not raw JSON)

**Technical Notes:**
- Add contract rendering to specialist prompt template
- Format criteria as numbered list
- Include timing info for E2E (immediate vs deferred)

### US-003: Auto-proceed for advisory tasks with logging

**Description:** As a user, I want advisory tasks to proceed automatically with logging, so my workflow isn't interrupted while I still have visibility into unverifiable work.

**Acceptance Criteria:**
- [ ] When task matches advisory patterns, log one-line notification and proceed
- [ ] Task is delegated with `type: advisory`
- [ ] Advisory tasks skip automated verification
- [ ] Output is logged for user review (in builder-state or session log)
- [ ] User can review advisory task outputs after completion
- [ ] Optional: `"promptForAdvisory": true` in project.json restores interactive prompt

**Technical Notes:**
- Advisory patterns: "investigate", "research", "explore", "discuss", "plan", "design"
- Skip patterns: "document", "update README", "update docs", "add comments"
- Log advisory task outcomes to `builder-state.json → advisoryTasks[]` for review
- PRD stories flagged as advisory should still prompt (unclear requirements)

### US-004: Verify against contract on completion

**Description:** As Builder, I verify specialist output against the contract criteria, so I know definitively if the task succeeded.

**Acceptance Criteria:**
- [ ] After specialist reports done, Builder runs verification per contract
- [ ] Each criterion is checked and marked pass/fail
- [ ] All criteria must pass for task success
- [ ] Failure triggers fix loop (existing test-flow behavior)
- [ ] Results stored in builder-state.json with timestamp

**Technical Notes:**
- Contract criteria map to test-flow activities
- Reuse existing test-flow verification logic
- Add `verificationResults` to builder-state task record

### US-005: Store contract results for reassignment

**Description:** As a future Dynamic Reassignment system, I can read contract verification results to decide if an alternative agent should be tried.

**Acceptance Criteria:**
- [ ] Contract and results stored in `builder-state.json`
- [ ] Results include per-criterion pass/fail and error details
- [ ] Results include attempt count and timestamps
- [ ] Failed criteria are clearly identified for handoff

**Technical Notes:**
- This enables Dynamic Reassignment PRD to:
  - Know exactly which criteria failed
  - Pass failure context to alternative agent
  - Track if alternative agent does better

## Technical Design

### Schema Addition: verificationContract

Add to `builder-state.schema.json`:

```json
{
  "verificationContract": {
    "type": "object",
    "properties": {
      "type": {
        "type": "string",
        "enum": ["verifiable", "advisory", "skip"]
      },
      "criteria": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "activity": { "type": "string" },
            "description": { "type": "string" },
            "pattern": { "type": "string" },
            "timing": { "type": "string", "enum": ["immediate", "deferred"] }
          },
          "required": ["activity", "description"]
        }
      },
      "generatedFrom": {
        "type": "string",
        "enum": ["auto", "user", "prd"]
      },
      "generatedAt": { "type": "string", "format": "date-time" }
    },
    "required": ["type", "criteria"]
  },
  "verificationResults": {
    "type": "object",
    "properties": {
      "overall": { "type": "string", "enum": ["pass", "fail", "pending"] },
      "criteria": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "activity": { "type": "string" },
            "status": { "type": "string", "enum": ["pass", "fail", "skipped"] },
            "error": { "type": "string" },
            "attempts": { "type": "integer" }
          }
        }
      },
      "completedAt": { "type": "string", "format": "date-time" }
    }
  }
}
```

### Contract Generation Algorithm

```
function generateContract(taskDescription, expectedFiles, project):
  # Check for advisory patterns
  advisoryPatterns = ["investigate", "research", "explore", "discuss", "plan", "design", "audit", "review", "analyze"]
  skipPatterns = ["document", "readme", "docs", "comment", "typo", "spelling"]
  
  lowerDesc = taskDescription.toLowerCase()
  
  for pattern in skipPatterns:
    if pattern in lowerDesc:
      return { type: "skip", criteria: [typecheck, lint] }
  
  for pattern in advisoryPatterns:
    if pattern in lowerDesc:
      return { type: "advisory", criteria: [] }
  
  # Generate verifiable contract
  criteria = [
    { activity: "typecheck", description: "No type errors" },
    { activity: "lint", description: "No lint errors" }
  ]
  
  rules = loadTestActivityRules()
  
  for file in expectedFiles:
    for pattern, rule in rules.filePatterns:
      if globMatch(file, pattern):
        if rule.unit:
          criteria.push({
            activity: "unit-test",
            description: "Tests for " + basename(file),
            pattern: inferTestPattern(file)
          })
        if rule.e2e:
          criteria.push({
            activity: "e2e",
            description: "E2E coverage for " + basename(file),
            timing: rule.e2e
          })
        for critic in rule.critics:
          criteria.push({
            activity: "critic",
            description: critic + " review"
          })
  
  return {
    type: "verifiable",
    criteria: deduplicate(criteria),
    generatedFrom: "auto",
    generatedAt: now()
  }
```

### Files Changed

| File | Change |
|------|--------|
| `schemas/builder-state.schema.json` | Add `verificationContract` and `verificationResults` |
| `agents/builder.md` | Add contract generation before delegation |
| `agents/developer.md` | Receive and display contract in task prompt |
| `skills/prd-workflow/SKILL.md` | Generate contracts for PRD stories |
| `skills/adhoc-workflow/SKILL.md` | Generate contracts for ad-hoc tasks |
| `skills/test-flow/SKILL.md` | Map contract criteria to verification steps |

## Dependencies

- **test-activity-rules.json** — Provides patterns for contract generation
- **test-flow skill** — Executes verification (no changes needed)
- **Dynamic Reassignment PRD** — Will consume contract results (future)
- **Checkpoint Serialization PRD** — Will include contract in checkpoints (future)

## Success Metrics

- 100% of delegated tasks have verification contracts
- Specialists report clearer understanding of success criteria
- Advisory task detection catches >80% of unverifiable tasks
- Contract generation adds <2 seconds overhead per delegation
- Dynamic Reassignment (future) can use contracts to decide retry vs escalate

## Rollout Plan

1. **Phase 1:** Schema and contract generation in Builder
2. **Phase 2:** Include contracts in specialist prompts
3. **Phase 3:** Advisory task detection and user prompts
4. **Phase 4:** Store results for future Dynamic Reassignment

## Credential & Service Access Plan

No external credentials required for this PRD.
