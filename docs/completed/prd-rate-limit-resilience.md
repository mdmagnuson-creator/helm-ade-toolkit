# PRD: Rate Limit Resilience

## Introduction

When an agent is rate-limited by the model provider (GitHub Copilot, Claude API), the session can be interrupted mid-task. Unlike context compaction (where the conversation is preserved but shortened), rate limiting can cause the session to stall, error out, or require a restart. When the user returns after limits reset, the agent should seamlessly resume from where it left off.

## Problem Statement

1. **Session interruption** — Rate limiting (429) stops the agent mid-task without graceful degradation
2. **Lost progress on restart** — If the user starts a new session after limits reset, the agent shows startup menus instead of resuming
3. **No wait-and-retry** — Agent doesn't know to wait for rate limits to reset
4. **User confusion** — User doesn't know if they should wait, retry, or restart
5. **Partial work may be lost** — If rate limiting occurs after tool calls but before state update, the agent may re-do work

### Example Scenarios

**Scenario A: Mid-task rate limit**
```
Agent: Running tests...
[Tool call to bash succeeds]
Agent: Tests passed, now committing...
[Rate limit hit before commit]
Session stalls or errors
User waits, restarts session
Agent: "What would you like to do?" (lost context)
```

**Scenario B: Rate limit during sub-agent call**
```
Agent: Delegating to @developer...
[Sub-agent starts working]
[Rate limit hit during sub-agent execution]
Sub-agent fails, returns partial/no result
Parent agent doesn't know what was completed
```

**Scenario C: Rate limit on response generation**
```
Agent: [thinking, about to respond]
[Rate limit hit before response generated]
User sees error or empty response
Agent state not updated with what it was about to do
```

## Goals

- Agents detect rate limiting and communicate clearly to the user
- Agents persist task state frequently enough to resume after any interruption
- Agents resume mid-task work when session restarts after rate limit reset
- Users receive clear guidance on what's happening and when to retry

## Analysis: Rate Limiting vs Compaction

| Aspect | Compaction | Rate Limiting |
|--------|------------|---------------|
| Trigger | Context too long | API quota exceeded |
| Context preserved | Partially (shortened) | Fully (if session survives) |
| Agent continues | Yes, immediately | No, must wait |
| Recovery mechanism | Check state file, resume | Wait for reset, then resume from state |
| User action needed | None (ideal) | Wait, then continue or restart |

### Current State

- **Compaction resilience (just implemented):** Agents check `currentTask` in state file before showing menus
- **Tool error recovery:** Builder retries failed tool calls (499, timeout)
- **No rate limit handling:** Agents don't detect or communicate rate limiting gracefully

## Proposed Solution

### Approach: Frequent State Persistence + Graceful Degradation

1. **More frequent state writes** — Update `currentTask.lastAction` after every tool call, not just "significant steps"
2. **Rate limit detection** — Recognize rate limit errors and communicate clearly
3. **Graceful pause** — On rate limit, save state and tell user to wait
4. **Resume on restart** — Use existing compaction resilience to resume after restart

### Policy: Agent-specific handling with shared pattern

Use a consistent detection + messaging pattern across primary agents, but implement within each agent's error-handling section. This preserves uniform UX while allowing agent-specific workflows.

### Implementation Details

**State persistence frequency:**
- Current: After "significant steps" (file edits, command completions)
- Proposed: After every tool call (cheap operation, high resilience)

**State schema extension:**

Extend `currentTask` to include a timestamp for the rate limit event:

```json
"currentTask": {
  "description": "Comparing live site with local build",
  "startedAt": "2026-02-26T02:00:00Z",
  "lastAction": "Ran tests",
  "contextAnchor": "Verification step",
  "rateLimitDetectedAt": "2026-02-26T02:15:42Z"
}
```

**Rate limit detection:**
Rate limit errors may appear as:
- HTTP 429 from model API
- Error message containing "rate limit", "quota", "too many requests"
- Timeout followed by error on retry

**User communication:**
```
⚠️ RATE LIMITED

The model provider has temporarily limited requests.
Current task state has been saved.

What to do:
• Wait a few minutes, then respond to resume
• Or close this session and start a new one later — I'll remember where we were

Task in progress: [currentTask.description]
Last action: [currentTask.lastAction]
Rate limit detected at: [currentTask.rateLimitDetectedAt]
```

**Resume behavior:**
Same as compaction resilience — check state file before showing menus, output "Resuming: [task]"

## User Stories

### US-001: Persist state after every tool call

**Description:** As a user, I want the agent to save its progress after every tool call, so that rate limiting or crashes don't lose significant work.

**Documentation:** No

**Tools:** No

**Considerations:** State writes are cheap (small JSON file), but frequency should be balanced. Writing after every tool call is reasonable — most tool calls are already I/O bound.

**Credentials:** none

**Acceptance Criteria:**

- [ ] Builder updates `currentTask.lastAction` after every successful tool call
- [ ] State file is written atomically (write to temp, rename)
- [ ] If state write fails, continue working (don't fail the task)
- [ ] Works for both direct tool calls and sub-agent delegations

### US-002: Detect rate limit errors gracefully

**Description:** As a user, I want the agent to recognize when it's been rate limited and communicate clearly, instead of showing a cryptic error or failing silently.

**Documentation:** No

**Tools:** No

**Considerations:** Rate limit detection may need to be heuristic (string matching on error messages) since OpenCode may not expose structured error codes.

**Credentials:** none

**Acceptance Criteria:**

- [ ] Agent detects rate limit errors (429, "rate limit" in message, "quota exceeded")
- [ ] Agent does NOT retry immediately on rate limit (unlike transient 499 errors)
- [ ] Agent saves current state before showing error
- [ ] Agent displays user-friendly message explaining the situation
- [ ] Agent provides clear next steps (wait and respond to resume, or restart later)
- [ ] Agent writes `currentTask.rateLimitDetectedAt` (ISO timestamp) before messaging user

### US-003: Resume after rate limit recovery

**Description:** As a user, when I return after rate limits reset, I want the agent to resume my task automatically.

**Documentation:** No

**Tools:** No

**Considerations:** This reuses compaction resilience. The key is ensuring state was saved before the rate limit error was shown.

**Credentials:** none

**Acceptance Criteria:**

- [ ] When user responds with intent to continue after rate limit, agent resumes from saved state
- [ ] When user starts new session, agent detects in-progress task and resumes
- [ ] Resume message is brief: "Resuming: [task description]"
- [ ] Agent picks up from `lastAction`, not from the beginning

### US-004: Apply to primary agents (Builder, Planner, Toolkit)

**Description:** As a user, I want all primary agents to have rate limit resilience.

**Documentation:** No

**Tools:** No

**Considerations:** Implementation pattern should be consistent across agents.

**Credentials:** none

**Acceptance Criteria:**

- [ ] Builder has rate limit detection and graceful degradation
- [ ] Planner has rate limit detection and graceful degradation
- [ ] Toolkit has rate limit detection and graceful degradation
- [ ] Consistent user messaging across all three

## Functional Requirements

- FR-1: State file must be updated after every tool call (not just significant steps)
- FR-2: Agents must detect rate limit errors by status code (429) or message content
- FR-3: On rate limit, agent must save state before showing error message
- FR-4: Rate limit message must include task description and next steps
- FR-5: User responses that clearly indicate intent to resume must resume from saved state
- FR-6: New sessions must resume automatically if in-progress task exists (reuse compaction resilience)
 - FR-7: State includes `currentTask.rateLimitDetectedAt` timestamp for user context

## Non-Goals

- No automatic wait-and-retry (rate limits can last minutes to hours)
- No prediction of when limits will reset (API doesn't always expose this)
- No cross-agent coordination (each agent handles its own rate limits)
- No modification to OpenCode's error handling (work with what's surfaced)

## Technical Considerations

- **State file atomicity:** Write to `.tmp/state.json.new`, then rename to avoid corruption
- **Error detection heuristics:** May need to evolve as we see real rate limit error formats
- **Sub-agent rate limits:** If sub-agent hits rate limit, it should save its own state; parent should handle the failed delegation gracefully
- **Backward compatibility:** Older state files without frequent `lastAction` updates work fine — just less precise resume

## Open Questions

1. **How does OpenCode surface rate limit errors?** We need to see actual error messages to write detection heuristics. Start with common patterns (429, "rate limit", "quota", "too many requests") and iterate.

2. **Should we implement automatic retry with backoff?** Probably not for rate limits (unlike transient 499 errors), since rate limits can last indefinitely. Better to inform user and let them decide.

3. **Should state persistence be configurable?** Probably not — the overhead is minimal and the resilience benefit is high. Default to "after every tool call."

## Success Metrics

- After rate limit + wait + "continue", agent resumes without user re-explaining task
- After rate limit + new session, agent resumes automatically
- User receives clear guidance (not cryptic errors) when rate limited
- No significant performance impact from more frequent state writes

## Dependencies

- US-001 through US-004 from `prd-compaction-resilience.md` should be complete first (provides the `currentTask` structure and resume behavior)
- This PRD extends that foundation with more frequent state writes and rate limit detection

## Credential & Service Access Plan

No external credentials required for this PRD.

## Definition of Done

- All user stories (US-001 to US-004) are implemented for Builder, Planner, and Toolkit
- Rate limit detection and messaging are consistent across primary agents
- `currentTask.rateLimitDetectedAt` is written on rate limit events
- State is updated after every tool call without causing task failures
- Resume behavior works with both "continue" intent responses and new sessions
