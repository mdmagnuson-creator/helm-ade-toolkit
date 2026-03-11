# PRD: Dynamic Reassignment

**Status:** Complete  
**Priority:** High  
**Source:** Intelligent AI Delegation paper (arXiv:2602.11865)  
**Dependencies:**
- prd-verifiable-completion (provides verification contracts for success/failure detection)
- prd-checkpoint-serialization (provides checkpoint format for work preservation)

## Introduction

When a specialist agent fails mid-execution (crashes, hits rate limits, exceeds context, or produces unacceptable output), the current toolkit has no automatic fallback mechanism. The orchestrator (Builder/Developer) must either retry with the same agent or escalate to the user. This is fragile and wastes time.

The paper describes "adaptive execution" — the ability to switch delegatees mid-execution when context shifts or agents fail. This PRD implements dynamic reassignment by detecting failures, preserving work via checkpoints (PRD #2), and routing to alternative agents based on configurable fallback chains.

## Problem Statement

1. **No automatic retry** — When a specialist fails, Builder/Developer don't automatically try an alternative
2. **No escalation protocol** — Failures require user intervention or manual retry
3. **No partial work recovery** — If a specialist fails 80% through, all progress is lost (addressed by PRD #2, consumed here)
4. **Single point of failure** — One bad specialist blocks the entire task
5. **No failure classification** — All failures treated the same (rate limit vs. bad output vs. capability mismatch)

### Current Failure Scenarios

| Scenario | Current Behavior | Desired Behavior |
|----------|-----------------|------------------|
| Specialist hits rate limit | Task fails, user must resume | Auto-retry with backoff, then switch to alternative |
| Specialist exceeds context | Task fails mid-execution | Checkpoint work (PRD #2), resume with fresh context |
| Specialist produces bad output | Developer retries once, then fails | Try alternative specialist with checkpoint |
| Specialist crashes/hangs | Task hangs indefinitely | Detect timeout, switch to alternative |
| All alternatives fail | User left with no clear next step | Structured escalation with context and options |

## Goals

1. **Automatic retry** — Transient failures (rate limits) retry with exponential backoff
2. **Alternative routing** — Persistent failures trigger fallback to alternative agents
3. **Work preservation** — Checkpoints passed to alternative agents (via PRD #2)
4. **Clear escalation** — When all options exhausted, user gets actionable context
5. **Visibility without noise** — One-line notifications, detailed logs available

## Non-Goals

- **Automatic code repair** — If task is fundamentally impossible, reassignment won't help
- **Cost optimization** — Choosing cheaper alternatives based on token usage
- **User preference learning** — Tracking which alternatives work best per-user
- **Multi-agent coordination** — Complex tasks requiring multiple specialists (single-specialist focus)
- **Timeout detection** — Requires background monitoring not available in current architecture (future enhancement)

## Design Decisions

### Decision 1: Fallback Chain Location

**Choice:** Define defaults in toolkit, allow per-project overrides in `project.json`.

**Implementation:**
- Toolkit provides `~/.config/opencode/data/fallback-chains.yaml` with defaults
- Projects can override in `project.json → agents.fallbackChains`
- Project chains merge with (not replace) defaults unless `"override": true`

**Rationale:**
- Most projects don't need custom fallback chains
- Power users can customize for specific stacks
- Toolkit maintains sensible defaults centrally

### Decision 2: Retry Limits

**Choice:** 3 retries for transient failures, try all alternatives in chain, then escalate.

| Failure Type | Max Retries (Same Agent) | Alternatives to Try | Example with 3 alternatives |
|--------------|--------------------------|---------------------|----------------------------|
| Rate limit | 3 (with backoff) | 0 (same agent) | 3 attempts total |
| Bad output | 1 | All in chain | 1 + 1 + 1 + 1 = 4 attempts |
| Context overflow | 0 | 0 (fresh context first) | 1 fresh attempt, then escalate |
| Crash/error | 1 | All in chain | 1 + 1 + 1 + 1 = 4 attempts |

**Rationale:**
- Rate limits are transient — retry same agent, don't switch
- Bad output suggests capability mismatch — try all alternatives before giving up
- Context overflow needs fresh context with same agent (checkpoint helps)
- If we define alternatives, we should use them all before escalating
- Fallback chains are short (1-3 alternatives), so "try all" is bounded

### Decision 3: Notification Level

**Choice:** One-line status during reassignment, detailed log at escalation.

**During reassignment:**
```
⟳ Rate limited, retrying in 30s... (1/3)
```
```
⟳ Switching to go-tester (react-tester failed: verification failed)
```

**At escalation (when all options exhausted):**
```
═══════════════════════════════════════════════════════════════════════
                    TASK REQUIRES YOUR ATTENTION
═══════════════════════════════════════════════════════════════════════

Task: US-003 - Add dark mode toggle

Attempted:
  1. react-dev (primary) — Failed: exceeded context limit
  2. frontend-dev (alternative) — Failed: verification failed
  
Checkpoint saved with:
  - 3 completed steps
  - 2 pending steps
  - 1 decision recorded

Options:
  [R] Retry with different approach (describe what to try)
  [M] Fix manually (I'll provide the checkpoint context)
  [S] Skip this task for now
  [A] Abandon PRD and start fresh

> _
═══════════════════════════════════════════════════════════════════════
```

**Rationale:**
- Users shouldn't be overwhelmed during normal operation
- When intervention is needed, provide full context for decision-making

### Decision 4: Alternative Agent Selection

**Choice:** Static fallback chains with capability-aware filtering.

For task type `react-component`:
1. Primary: `react-dev` (specialist)
2. First alternative: `frontend-dev` (generalist frontend, if exists)
3. Second alternative: `developer` (generalist)

Selection process:
1. Consult fallback chain for task type
2. Skip alternatives that already failed for this task
3. Skip alternatives lacking required capabilities (from `project.json → capabilities`)
4. If no alternatives remain, escalate

**Rationale:**
- Static chains are simple and predictable
- Capability filtering prevents obvious mismatches
- `developer` as final fallback is always available

### Decision 5: Success/Failure Detection

**Choice:** Use verification contracts from PRD #1 to determine success/failure.

| Outcome | Detection Method | Action |
|---------|------------------|--------|
| Success | All `verificationContract.criteria` pass | Task complete |
| Verification failure | One or more criteria fail | Try alternative |
| Exception/crash | Agent throws error | Try alternative |
| Rate limit | Error contains "rate limit", "429", "quota" | Retry with backoff |
| Context overflow | Agent reports context limit | Checkpoint, try with fresh context |

**Rationale:**
- Verification contracts provide objective success criteria
- No subjective assessment needed — tests pass or they don't

## Proposed Solution

### Fallback Chain Schema

Add to `~/.config/opencode/data/fallback-chains.yaml`:

```yaml
# Default fallback chains for agent reassignment
schemaVersion: 1

chains:
  # Frontend implementation
  react-component:
    primary: react-dev
    alternatives: [developer]
    description: "React/JSX component implementation"
    
  frontend-generic:
    primary: react-dev  
    alternatives: [developer]
    description: "General frontend work"

  # Backend implementation  
  go-service:
    primary: go-dev
    alternatives: [developer]
    description: "Go service/handler implementation"
    
  java-service:
    primary: java-dev
    alternatives: [developer]
    description: "Java service implementation"
    
  python-service:
    primary: python-dev
    alternatives: [developer]
    description: "Python service implementation"
    
  typescript-backend:
    primary: developer
    alternatives: []
    description: "TypeScript backend (no specialist)"

  # Testing
  jest-tests:
    primary: jest-tester
    alternatives: [tester, developer]
    description: "Jest unit/integration tests"
    
  react-tests:
    primary: react-tester
    alternatives: [jest-tester, tester, developer]
    description: "React component tests"
    
  go-tests:
    primary: go-tester
    alternatives: [tester, developer]
    description: "Go tests"
    
  playwright-tests:
    primary: e2e-playwright
    alternatives: [playwright-dev, developer]
    description: "Playwright E2E tests"

  # Infrastructure
  cloudformation:
    primary: aws-dev
    alternatives: [developer]
    description: "CloudFormation templates"
    
  terraform:
    primary: terraform-dev
    alternatives: [developer]
    description: "Terraform configurations"
    
  docker:
    primary: docker-dev
    alternatives: [developer]
    description: "Docker images and configs"

  # Generic fallback
  generic:
    primary: developer
    alternatives: []
    description: "Catch-all for unmatched task types"

# Retry configuration
retry:
  rateLimit:
    maxRetries: 3
    backoffSeconds: [30, 60, 120]  # Exponential backoff
  badOutput:
    maxRetries: 1
  contextOverflow:
    maxRetries: 0  # Don't retry, just switch
  crash:
    maxRetries: 1
```

### Project Override Schema

Add to `project.schema.json` under `agents`:

```json
{
  "fallbackChains": {
    "type": "object",
    "description": "Per-project fallback chain overrides",
    "properties": {
      "override": {
        "type": "boolean",
        "default": false,
        "description": "If true, replace defaults entirely. If false, merge with defaults."
      },
      "chains": {
        "type": "object",
        "additionalProperties": {
          "type": "object",
          "properties": {
            "primary": { "type": "string" },
            "alternatives": { 
              "type": "array", 
              "items": { "type": "string" } 
            }
          }
        }
      }
    }
  }
}
```

### Reassignment State Schema

Add to `builder-state.schema.json`:

```json
{
  "reassignment": {
    "type": ["object", "null"],
    "description": "Tracks reassignment attempts for current task",
    "properties": {
      "taskId": {
        "type": "string",
        "description": "Task being reassigned"
      },
      "attempts": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "agent": { "type": "string" },
            "startedAt": { "type": "string", "format": "date-time" },
            "endedAt": { "type": "string", "format": "date-time" },
            "outcome": {
              "type": "string",
              "enum": ["success", "rate_limit", "verification_failed", "context_overflow", "crash", "timeout"]
            },
            "error": { "type": "string" },
            "retryCount": { "type": "integer" }
          },
          "required": ["agent", "startedAt", "outcome"]
        }
      },
      "currentAgent": {
        "type": "string",
        "description": "Agent currently working on task"
      },
      "checkpointRef": {
        "type": "string",
        "description": "Reference to checkpoint in activePrd or adhocQueue"
      }
    }
  }
}
```

### Reassignment Flow

```
                    ┌─────────────────────────────────────────────────────────────────┐
                    │                     TASK DELEGATION                             │
                    │                                                                 │
                    │  Builder receives task → Looks up fallback chain → Delegates   │
                    └─────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
                    ┌─────────────────────────────────────────────────────────────────┐
                    │                     AGENT EXECUTION                             │
                    │                                                                 │
                    │  Specialist works on task → Updates checkpoint periodically     │
                    └─────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
                              ┌────────────────────────────────────┐
                              │         CHECK OUTCOME              │
                              │                                    │
                              │   Verification contract passes?    │
                              └────────────────────────────────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           │                           │
                    ▼                           ▼                           ▼
           ┌────────────┐              ┌────────────┐              ┌────────────┐
           │   SUCCESS  │              │ RATE LIMIT │              │  FAILURE   │
           │            │              │            │              │            │
           │ Task done! │              │ Retry with │              │ Checkpoint │
           │            │              │ backoff    │              │ + switch   │
           └────────────┘              └────────────┘              └────────────┘
                                                │                           │
                                                ▼                           ▼
                                       ┌────────────┐              ┌────────────┐
                                       │ Retries    │              │ Alternative│
                                       │ exhausted? │              │ available? │
                                       └────────────┘              └────────────┘
                                                │                           │
                                    ┌───────────┼───────────┐   ┌───────────┼───────────┐
                                    │           │           │   │           │           │
                                    ▼           ▼           ▼   ▼           ▼           ▼
                               ┌─────┐     ┌─────┐     ┌─────────────┐  ┌─────────────────┐
                               │ No  │     │ Yes │     │    Yes      │  │       No        │
                               │     │     │     │     │             │  │                 │
                               │Retry│     │Try  │     │Delegate to  │  │   ESCALATE      │
                               │same │     │alt  │     │alternative  │  │   TO USER       │
                               └─────┘     └─────┘     │with checkpoint│ └─────────────────┘
                                                       └─────────────┘
```

## User Stories

### US-001: Rate Limit Retry with Backoff

As Builder, I need to automatically retry when a specialist hits a rate limit so that transient failures don't require user intervention.

**Acceptance Criteria:**
- [ ] Detect rate limit errors by pattern matching: "429", "rate limit", "quota", "too many requests"
- [ ] First retry after 30 seconds
- [ ] Second retry after 60 seconds
- [ ] Third retry after 120 seconds
- [ ] Show brief status: "⟳ Rate limited, retrying in 30s... (1/3)"
- [ ] After 3 retries exhausted, proceed to alternative selection (if available) or escalate
- [ ] Log each retry attempt to `reassignment.attempts[]`

**Technical Notes:**
- Rate limit detection patterns in `fallback-chains.yaml → retry.rateLimit`
- Backoff intervals configurable but defaults sensible
- Use existing rate limit handling from `builder-state` skill as starting point

### US-002: Alternative Agent Selection

As Builder, I need to delegate to an alternative agent when the primary fails so that tasks complete without user intervention.

**Acceptance Criteria:**
- [ ] Read fallback chain for task type from `fallback-chains.yaml` (or project override)
- [ ] When primary agent fails with non-transient error:
  - Create checkpoint (per PRD #2)
  - Look up next alternative not already tried
  - Show: "⟳ Switching to [alternative] ([primary] failed: [reason])"
  - Delegate to alternative with checkpoint in prompt
- [ ] Try ALL alternatives in the chain before escalating
- [ ] Skip alternatives that have already failed for this task
- [ ] If no alternatives remain, proceed to escalation
- [ ] Record switch decision in `reassignment.attempts[]`

**Technical Notes:**
- Task type determined by file patterns and task description
- Checkpoint passed using resume prompt template from PRD #2
- Track failed agents in `reassignment.attempts[]` to avoid retrying
- Chain example: `[react-tester, jest-tester, tester, developer]` → try all 4 before escalating

### US-003: Escalation with Context

As a user, I need clear information when all reassignment options are exhausted so that I can make an informed decision.

**Acceptance Criteria:**
- [ ] Show escalation dialog with:
  - Task description
  - List of agents tried with their failure reasons
  - Checkpoint summary (completed steps, pending steps)
  - Clear options: Retry, Manual fix, Skip, Abandon
- [ ] If user chooses "Retry", prompt for different approach
- [ ] If user chooses "Manual fix", output checkpoint context for copy-paste
- [ ] If user chooses "Skip", mark task as skipped and continue PRD
- [ ] If user chooses "Abandon", stop PRD execution
- [ ] Log final escalation outcome

**Technical Notes:**
- Escalation dialog uses box-drawing characters for visibility
- Checkpoint summary extracted from `activePrd.checkpoint` or `adhocQueue[].checkpoint`
- "Skip" only available for individual stories, not entire PRD

### US-004: Context Overflow Handling

As Builder, I need to handle context overflow by starting a fresh session with the checkpoint so that large tasks can complete.

**Acceptance Criteria:**
- [ ] When agent reports context limit exceeded:
  - Create checkpoint immediately (per PRD #2)
  - Do not retry same agent (won't help)
  - Show: "⟳ Context limit reached, starting fresh session with checkpoint"
  - Delegate same task to same agent with fresh context + checkpoint
- [ ] If fresh session also fails context limit:
  - Task is too large — escalate with suggestion to break down
- [ ] Record context overflow in `reassignment.attempts[]`

**Technical Notes:**
- "Fresh session" means new Task invocation, not same conversation
- Checkpoint provides context without full conversation history
- Consider: should alternative agent be tried instead? (Design decision: same agent first, since context was the issue, not capability)

### US-005: Fallback Chain Configuration

As a toolkit maintainer, I need default fallback chains defined so that reassignment works out of the box.

**Acceptance Criteria:**
- [ ] Create `~/.config/opencode/data/fallback-chains.yaml` with chains for:
  - Frontend: react-dev → developer
  - Backend: go-dev, java-dev, python-dev → developer
  - Testing: jest-tester → tester → developer, etc.
  - Infrastructure: aws-dev, terraform-dev, docker-dev → developer
  - Generic: developer (no alternatives)
- [ ] Include retry configuration with sensible defaults
- [ ] Document schema and how to override in projects
- [ ] Validate YAML on toolkit startup

**Technical Notes:**
- YAML chosen for human readability
- Schema version included for future migrations
- `developer` as universal fallback (handles any language)

### US-006: Project Fallback Override

As a project maintainer, I need to customize fallback chains for my project so that I can use project-specific agents.

**Acceptance Criteria:**
- [ ] Add `agents.fallbackChains` to `project.schema.json`
- [ ] Support merge mode (add to defaults) and override mode (replace defaults)
- [ ] Example in project.json:
  ```json
  {
    "agents": {
      "fallbackChains": {
        "override": false,
        "chains": {
          "react-component": {
            "primary": "my-custom-react-agent",
            "alternatives": ["react-dev", "developer"]
          }
        }
      }
    }
  }
  ```
- [ ] Merged chains used when delegating tasks
- [ ] Invalid chain references logged as warnings (don't break execution)

**Technical Notes:**
- Most projects won't use this — defaults should be good enough
- Custom agents must exist in `~/.config/opencode/agents/` or project's agent dir
- Merge mode: project chains override matching keys, defaults for rest

### US-007: Verification-Based Failure Detection

As Builder, I need to use verification contracts to detect task failure so that success/failure is objective.

**Acceptance Criteria:**
- [ ] After specialist completes, run verification criteria from `verificationContract` (per PRD #1)
- [ ] If all criteria pass → task success, no reassignment needed
- [ ] If any criteria fail:
  - Record failure in `reassignment.attempts[]`
  - Proceed to alternative selection
- [ ] Verification failures include: test failures, lint errors, type errors, E2E failures
- [ ] Verification results stored in checkpoint for alternative agent

**Technical Notes:**
- Verification contract comes from PRD #1
- Existing `test-flow` skill handles running tests
- `checkpoint.verification.results` captures what was checked

## Technical Considerations

### Performance

- Reassignment adds latency (checkpoint creation, agent switch)
- Target: <5 seconds overhead per reassignment
- Backoff delays intentional (rate limit recovery), not performance overhead

### State Size

- `reassignment` object is temporary (cleared on task success)
- Checkpoint size addressed in PRD #2 (<2KB target)
- `attempts[]` limited to ~10 entries (enough for debugging)

### Integration Points

| Component | Integration |
|-----------|-------------|
| `builder-state.schema.json` | Add `reassignment` schema |
| `builder-state` skill | Add reassignment state management |
| `fallback-chains.yaml` | New file with default chains |
| `project.schema.json` | Add `agents.fallbackChains` |
| Builder agent | Implement reassignment protocol |
| Developer agent | Implement reassignment protocol |
| All implementation agents | Accept checkpoint in prompt (from PRD #2) |

### Error Handling

- If fallback chain lookup fails: use "generic" chain (developer only)
- If checkpoint creation fails: log warning, proceed with reassignment anyway
- If alternative agent doesn't exist: skip to next alternative
- If all else fails: escalate to user (never silently fail)

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Rate limit recovery rate | 90% auto-recovered | Count escalations vs. auto-recoveries |
| Alternative success rate | >50% complete after switch | Track alternative outcomes |
| User intervention reduction | <10% require user action | Compare to baseline |
| Reassignment overhead | <5 seconds per switch | Time from failure to alternative start |
| Escalation clarity | User understands options | Qualitative feedback |

## Rollout Plan

1. **Phase 1:** Schema and configuration (US-005, US-006, US-007)
2. **Phase 2:** Rate limit retry (US-001)
3. **Phase 3:** Alternative selection (US-002)
4. **Phase 4:** Escalation protocol (US-003)
5. **Phase 5:** Context overflow handling (US-004)

## Credential & Service Access Plan

No external credentials required. All operations use local file system and existing agent infrastructure.

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Where should fallback chains be defined? | Toolkit defaults + project overrides |
| How much retry is too much? | 3 for rate limits, 1 for other failures |
| Should users be notified of every reassignment? | One-line during, full context at escalation |
| How verify alternative is better? | Use verification contracts (PRD #1) |
| What about multi-agent tasks? | Out of scope — single-specialist focus |
