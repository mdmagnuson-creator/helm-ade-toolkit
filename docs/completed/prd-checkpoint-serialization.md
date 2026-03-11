# PRD: Checkpoint & State Serialization

**Status:** Complete  
**Priority:** High  
**Source:** Intelligent AI Delegation paper (arXiv:2602.11865)  
**Dependencies:** prd-verifiable-completion (provides result contracts for verification.criteria)

## Introduction

The paper emphasizes "checkpoint artifacts" that serialize partial work so another agent can resume mid-task. This enables dynamic reassignment, crash recovery, and context overflow handling. The yo-go toolkit has `builder-state.json` for session state, but it tracks *status* (what story is active) rather than *work artifacts* (what was actually done and decided).

This PRD extends the builder-state infrastructure with structured checkpoints that capture enough context for a different agent to resume mid-task without starting over.

## Problem Statement

1. **State tracks status, not work** — We know "US-003 is in progress" but not "component created, styling done, wiring pending"
2. **No handoff protocol** — Switching agents (due to failure, reassignment, or context overflow) means starting over
3. **Context overflow loses progress** — When context limits are reached, partial work disappears with the session
4. **No resume point** — After interruption, unclear where to resume and what decisions were already made
5. **Decisions aren't captured** — "We chose CSS variables for theming" is lost when session ends

### Example Scenarios

| Scenario | Current Behavior | Desired Behavior |
|----------|-----------------|------------------|
| React-dev hits context limit mid-story | Session ends, progress lost | Checkpoint created, new session resumes from checkpoint |
| Jest-tester fails after 3 retries | Story fails, Builder tries different agent | Checkpoint passed to go-tester with completed steps |
| User closes session mid-PRD | Picks up from "current story" only | Picks up from exact step within story, with decisions preserved |
| Rate limit during complex refactor | State saved but details lost | Full checkpoint with files changed, decisions made, pending steps |

## Goals

1. **Structured checkpoints** — Capture work artifacts, not just status
2. **Agent-agnostic format** — Any agent can read and resume from a checkpoint
3. **Lightweight by default** — Don't bloat state with redundant data
4. **Integration with verification** — Link checkpoints to result contracts from prd-verifiable-completion
5. **Clear resume protocol** — Resuming agent knows exactly where to start

## Non-Goals

- **File content diffs** — We record file paths, not full diffs (resuming agent reads files directly)
- **Replacing builder-state** — Checkpoints extend builder-state, don't replace it
- **Non-file work recovery** — Deployments, API calls, etc. can't be "resumed" (just re-run)
- **Automatic reassignment** — That's prd-dynamic-reassignment; this PRD provides the checkpoint data it needs

## Design Decisions

### Decision 1: Checkpoint Location

**Choice:** Checkpoints live inline in `builder-state.json` under a `checkpoint` field within `activePrd` or `adhocQueue[].checkpoint`.

**Rationale:**
- Single source of truth for session state
- Atomic updates (one file write)
- Existing builder-state skill already handles read/write
- No orphaned checkpoint files to clean up

**Rejected alternatives:**
- Separate `checkpoint.json` files per task — adds complexity, sync issues
- Embedded in `prd.json` — mixes planning and execution state

### Decision 2: Checkpoint Verbosity

**Choice:** Medium verbosity — enough to resume without reading full conversation history.

Include:
- Completed steps (what, not how)
- Files created/modified (paths, not content)
- Key decisions with rationale
- Current step in progress (if any)
- Pending steps from the plan

Exclude:
- Full file diffs (read files directly)
- Agent conversation history
- Debug output or intermediate errors

**Rationale:** Balance between resume quality and state file size. Target: <2KB per checkpoint.

### Decision 3: Checkpoint Triggers

**Choice:** Checkpoints update on significant state transitions, not on every action.

| Trigger | When | Checkpoint Fields Updated |
|---------|------|--------------------------|
| Step completion | After a logical step (component done, test written) | `completedSteps`, `pendingSteps` |
| Decision made | When agent makes a design choice | `decisions` |
| Reassignment | Before switching to alternative agent | Full checkpoint + `reason: "reassignment"` |
| Context warning | When context usage exceeds 75% | Full checkpoint + `reason: "context_limit"` |
| Failure | Before reporting failure | Full checkpoint + `reason: "failure"` + `error` |
| Rate limit | On rate limit detection | Full checkpoint + `reason: "rate_limit"` |

**Rationale:** More frequent updates would slow execution. These triggers capture the moments where resume would be needed.

### Decision 4: Stale Checkpoint Detection

**Choice:** Compare checkpoint timestamp with file modification times.

```
checkpoint.lastUpdatedAt: 2026-02-28T10:00:00Z
src/components/Toggle.tsx mtime: 2026-02-28T10:30:00Z  ← NEWER = stale checkpoint
```

If any file in `filesModified` or `filesCreated` has a newer mtime than the checkpoint:
1. Warn: "Checkpoint may be stale — files modified since checkpoint"
2. Read affected files to understand current state
3. Reconcile before proceeding

**Rationale:** Simple, no external dependencies, works with any file system.

## Proposed Solution

### Checkpoint Schema Addition

Add to `builder-state.schema.json`:

```json
{
  "checkpoint": {
    "type": ["object", "null"],
    "description": "Structured checkpoint for task resumption",
    "properties": {
      "phase": {
        "type": "string",
        "enum": ["planning", "implementation", "verification", "documentation"],
        "description": "Current task phase"
      },
      "completedSteps": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "step": { "type": "string", "description": "What was done" },
            "filesCreated": { "type": "array", "items": { "type": "string" } },
            "filesModified": { "type": "array", "items": { "type": "string" } },
            "timestamp": { "type": "string", "format": "date-time" }
          },
          "required": ["step", "timestamp"]
        }
      },
      "pendingSteps": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Steps remaining to complete the task"
      },
      "currentStep": {
        "type": ["object", "null"],
        "description": "Step currently in progress",
        "properties": {
          "description": { "type": "string" },
          "startedAt": { "type": "string", "format": "date-time" },
          "partialWork": { "type": "string", "description": "Brief note on partial progress" }
        }
      },
      "decisions": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "decision": { "type": "string" },
            "rationale": { "type": "string" },
            "timestamp": { "type": "string", "format": "date-time" }
          },
          "required": ["decision", "timestamp"]
        }
      },
      "blockers": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Known blockers preventing progress"
      },
      "verification": {
        "type": ["object", "null"],
        "description": "Link to verification contract and results",
        "properties": {
          "contractRef": { "type": "string", "description": "Reference to verificationContract (from prd-verifiable-completion)" },
          "results": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "activity": { "type": "string" },
                "status": { "type": "string", "enum": ["pending", "passed", "failed", "skipped"] },
                "runAt": { "type": "string", "format": "date-time" }
              }
            }
          }
        }
      },
      "metadata": {
        "type": "object",
        "properties": {
          "createdBy": { "type": "string", "description": "Agent that created checkpoint" },
          "lastUpdatedAt": { "type": "string", "format": "date-time" },
          "reason": {
            "type": "string",
            "enum": ["periodic", "context_limit", "failure", "reassignment", "rate_limit", "manual"],
            "description": "Why checkpoint was created/updated"
          },
          "previousAgents": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Chain of agents that have worked on this task"
          }
        }
      }
    }
  }
}
```

### Resume Prompt Template

When an agent receives a task with a checkpoint:

```markdown
# Resuming Task: [taskId]

You are continuing work that was partially completed by [previousAgents].

## Task Description
[description from task]

## Current Phase
[checkpoint.phase]

## Completed Steps
[formatted list from checkpoint.completedSteps]

## Decisions Already Made
[formatted list from checkpoint.decisions]

## Pending Steps
[formatted list from checkpoint.pendingSteps]

## Current Step (In Progress)
[checkpoint.currentStep.description]
Partial work: [checkpoint.currentStep.partialWork]

## Files to Review
[list of files from completedSteps — read these to understand current state]

## Verification Criteria
[from verification.contractRef — what success looks like]

## Instructions
1. Read the files listed above to verify the checkpoint is accurate
2. Continue from the current step (or the first pending step if current is null)
3. Complete the remaining steps
4. Run verification criteria when done
```

### Example: Checkpoint in builder-state.json

```json
{
  "sessionId": "builder-abc123",
  "lastHeartbeat": "2026-02-28T10:15:00Z",
  "activePrd": {
    "id": "prd-dark-mode",
    "file": "docs/prds/prd-dark-mode.md",
    "branch": "main",
    "currentStory": "US-003",
    "storiesCompleted": ["US-001", "US-002"],
    "storiesPending": ["US-004"],
    "checkpoint": {
      "phase": "implementation",
      "completedSteps": [
        {
          "step": "Created DarkModeToggle component",
          "filesCreated": ["src/components/DarkModeToggle.tsx"],
          "filesModified": [],
          "timestamp": "2026-02-28T10:00:00Z"
        },
        {
          "step": "Added ThemeContext for state management",
          "filesCreated": ["src/contexts/ThemeContext.tsx"],
          "filesModified": ["src/App.tsx"],
          "timestamp": "2026-02-28T10:05:00Z"
        }
      ],
      "pendingSteps": [
        "Wire toggle to ThemeContext",
        "Add CSS custom properties for dark theme",
        "Write unit tests for toggle",
        "Write E2E test for theme switch"
      ],
      "currentStep": {
        "description": "Wire toggle to ThemeContext",
        "startedAt": "2026-02-28T10:10:00Z",
        "partialWork": "Added useTheme import, started onClick handler"
      },
      "decisions": [
        {
          "decision": "Use CSS custom properties for theming",
          "rationale": "Avoids runtime style calculation, better performance",
          "timestamp": "2026-02-28T10:02:00Z"
        },
        {
          "decision": "Store theme preference in localStorage",
          "rationale": "Persists across sessions without auth requirement",
          "timestamp": "2026-02-28T10:03:00Z"
        }
      ],
      "blockers": [],
      "verification": {
        "contractRef": "US-003.verificationContract",
        "results": []
      },
      "metadata": {
        "createdBy": "react-dev",
        "lastUpdatedAt": "2026-02-28T10:10:00Z",
        "reason": "periodic",
        "previousAgents": []
      }
    }
  }
}
```

## User Stories

### US-001: Schema Extension for Checkpoints

As a toolkit maintainer, I need the checkpoint schema added to builder-state.schema.json so that checkpoints have a validated structure.

**Acceptance Criteria:**
- [ ] `checkpoint` property added to `activePrd` schema
- [ ] `checkpoint` property added to `adhocQueue[]` items schema
- [ ] All checkpoint fields have descriptions and correct types
- [ ] Schema validates the example checkpoint above
- [ ] Schema version incremented

**Technical Notes:**
- Add as optional property (null when no checkpoint exists)
- Use `date-time` format for timestamps (ISO8601)
- Reference existing patterns from builder-state.schema.json

### US-002: Checkpoint Creation on Step Completion

As Builder, I need to update the checkpoint when a logical step completes so that progress is captured incrementally.

**Acceptance Criteria:**
- [ ] After each completed step, checkpoint is updated with:
  - Step description added to `completedSteps`
  - Files created/modified captured
  - Step removed from `pendingSteps`
  - `currentStep` cleared or updated
  - `metadata.lastUpdatedAt` updated
- [ ] Checkpoint update is atomic (read-modify-write)
- [ ] Checkpoint size stays under 2KB for typical stories

**Technical Notes:**
- Extend builder-state skill with checkpoint update functions
- Use concise step descriptions (action + object, not full details)
- Only track source files, not node_modules or build artifacts

### US-003: Checkpoint Creation on Failure/Rate Limit

As Builder, I need to create a checkpoint before reporting failure so that the next agent can resume.

**Acceptance Criteria:**
- [ ] On rate limit detection:
  - Full checkpoint created
  - `metadata.reason` set to `"rate_limit"`
  - Current step captured with `partialWork` description
- [ ] On task failure (after retries exhausted):
  - Full checkpoint created
  - `metadata.reason` set to `"failure"`
  - `blockers` array includes failure reason
- [ ] Checkpoint written before state update (not lost to crash)

**Technical Notes:**
- Integrate with existing rate limit handling in builder-state skill
- Use try-catch to ensure checkpoint write happens even on error

### US-004: Checkpoint Creation on Reassignment

As Builder, I need to create a checkpoint before reassigning to an alternative agent so that progress transfers.

**Acceptance Criteria:**
- [ ] When Dynamic Reassignment triggers (future PRD):
  - Checkpoint created with `metadata.reason: "reassignment"`
  - Current agent added to `metadata.previousAgents`
  - Checkpoint passed to alternative agent in prompt
- [ ] Alternative agent receives formatted resume prompt
- [ ] Progress from original agent is preserved

**Technical Notes:**
- This story creates the checkpoint; prd-dynamic-reassignment consumes it
- Resume prompt template added to builder-state skill

### US-005: Resume from Checkpoint

As a specialist agent (react-dev, jest-tester, etc.), I need to resume from a checkpoint so that I don't redo completed work.

**Acceptance Criteria:**
- [ ] When task includes checkpoint:
  - Agent outputs "Resuming from checkpoint (created by [agent])"
  - Agent reads files from `completedSteps` to verify state
  - Agent starts from `currentStep` (or first `pendingStep` if null)
  - Agent respects decisions already made
- [ ] Stale checkpoint detection:
  - Compare file mtimes with `metadata.lastUpdatedAt`
  - Warn if files are newer than checkpoint
  - Proceed with caution, verify before assuming
- [ ] Resumed work completes the full task (not just checkpoint steps)

**Technical Notes:**
- Add checkpoint awareness to implementation agents (react-dev, go-dev, etc.)
- Stale detection uses `stat` or file read tool metadata

### US-006: Context Overflow Checkpoint

As Builder, I need to create a checkpoint when context usage exceeds 75% so that a new session can resume.

**Acceptance Criteria:**
- [ ] Context usage monitored (via OpenCode API if available, or heuristic)
- [ ] At 75% context:
  - Warning: "Context limit approaching, creating checkpoint"
  - Full checkpoint created with `metadata.reason: "context_limit"`
  - Work can continue but checkpoint exists for safety
- [ ] At 90% context:
  - Stop current work
  - Final checkpoint with current state
  - Message: "Context limit reached. Resume with new session."
- [ ] New session detects checkpoint and offers resume

**Technical Notes:**
- Context measurement may require OpenCode-specific integration
- If no API available, use message count as heuristic proxy

### US-007: Update builder-state Skill

As a toolkit maintainer, I need the builder-state skill updated to document checkpoint operations.

**Acceptance Criteria:**
- [ ] Skill documents when to create/update checkpoints
- [ ] Skill includes checkpoint update examples
- [ ] Skill documents resume protocol
- [ ] Skill documents stale checkpoint handling

**Technical Notes:**
- Update `skills/builder-state/SKILL.md`
- Add checkpoint-specific "When to Write State" rows
- Add checkpoint examples to the Examples section

## Technical Considerations

### Size Management

- Target: <2KB per checkpoint
- Truncate `partialWork` to 200 chars
- Limit `completedSteps` to last 10 steps (older ones less relevant)
- Decision rationale limited to 100 chars

### Performance

- Checkpoint writes are I/O bound but small (<2KB)
- Target: <50ms per checkpoint update
- Batch updates when possible (step + decision in one write)

### Migration

- Existing `builder-state.json` files continue working (checkpoint is optional)
- No migration script needed — checkpoints added when created

### Integration Points

| Component | Integration |
|-----------|-------------|
| `builder-state.schema.json` | Add checkpoint schema |
| `builder-state` skill | Add checkpoint operations |
| Implementation agents | Add checkpoint awareness |
| `test-flow` skill | Record verification results in checkpoint |
| `prd-verifiable-completion` | Checkpoint references verification contract |

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Agent switch resume rate | >80% successfully continue | Manual review of reassignment logs |
| Checkpoint size | <2KB average | Log checkpoint sizes |
| Context overflow recovery | >50% work preserved | Compare completed steps before/after |
| Checkpoint overhead | <5% of task time | Time checkpoint operations |
| Stale checkpoint detection | 100% accuracy | Test with modified files |

## Rollout Plan

1. **Phase 1:** Schema and skill updates (US-001, US-007)
2. **Phase 2:** Basic checkpoints on step completion (US-002)
3. **Phase 3:** Failure/rate limit checkpoints (US-003)
4. **Phase 4:** Resume protocol (US-005)
5. **Phase 5:** Context overflow (US-006)
6. **Phase 6:** Reassignment integration (US-004) — after prd-dynamic-reassignment

## Credential & Service Access Plan

No external credentials required. All operations use local file system and existing git infrastructure.

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| How verbose should checkpoints be? | Medium — enough to resume, not full history |
| Should checkpoints include file diffs? | No — just paths, agent reads files directly |
| Where do checkpoints live? | Inline in builder-state.json |
| How detect stale checkpoints? | Compare file mtimes with checkpoint timestamp |
| What about non-file work? | Can't resume — just log and re-run |
