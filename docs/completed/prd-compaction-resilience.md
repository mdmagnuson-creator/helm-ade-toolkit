# PRD: Context Compaction Resilience

## Introduction

When OpenCode compacts context (to stay within token limits), agents sometimes lose track of their current task and revert to startup behavior — showing menus, asking "what would you like to do?", or forgetting mid-task state. This breaks the user experience and requires manual intervention to resume.

## Problem Statement

1. **Lost task context** — After compaction, the agent forgets what it was doing mid-task
2. **Startup behavior triggered** — Agent shows project selection or mode selection menus as if starting fresh
3. **User must re-orient the agent** — User has to explain "you were doing X" to resume
4. **No automatic recovery** — Agent doesn't check state files to recover context

### Example (from screenshot)

```
[Agent was comparing live site with local build]
    ↓
[Context compaction occurs]
    ↓
Agent: "What would you like to do next? [P] PRD Mode [A] Ad-hoc Mode..."
    ↓
User: "before compaction you were comparing the live site with the local"
    ↓
Agent: "You're right — I was in the middle of..."
```

## Goals

- Agents automatically detect when they've lost context after compaction
- Agents recover task state from disk (`builder-state.json`, `planner-state.json`, etc.)
- Agents resume mid-task work without user intervention
- Users never see startup menus when work is in progress

## Analysis: Why This Happens

Context compaction removes older messages to fit within token limits. After compaction:

1. **System prompt remains** — Agent instructions are preserved
2. **Recent messages remain** — But may not include task context from earlier
3. **State files exist on disk** — But agent doesn't know to check them
4. **Agent follows startup flow** — Because the conversation looks "new"

### Current Behavior

Agents have startup flows that:
1. Check for state files (`builder-state.json`)
2. Offer resume options
3. Show menus if no state

But this only works on **actual session start**. After compaction, the agent doesn't realize it should check state — it just continues from the compacted context, which may lack task information.

## Proposed Solution

### Approach: Compaction Detection + State Recovery

Add a **compaction recovery check** that fires when:
- The agent's response seems like a "fresh start" (showing menus, asking what to do)
- But state files indicate work is in progress

### Implementation Options

**Option A: Pre-response state check**

Before every response, agents check:
1. Is there an in-progress task in state file?
2. Does current context include that task?
3. If state exists but context doesn't mention it → compaction occurred → recover

**Option B: Identity anchor with task context**

Add to identity section:
```markdown
> 🔄 **COMPACTION RECOVERY — CHECK BEFORE EVERY RESPONSE**
>
> Before responding, ask: "Do I know what task I'm working on?"
>
> If NO or UNSURE:
> 1. Read `docs/builder-state.json` (or equivalent state file)
> 2. If `uiTodos` has `in_progress` items → resume that task
> 3. If state file has `currentTask` → resume that
> 4. Only show startup menu if state file confirms no work in progress
```

**Option C: State file "heartbeat" check**

Require agents to read state file periodically and re-anchor:
- Every N responses, re-read state file
- If state says "working on X" but agent context doesn't mention X → re-anchor

## Open Questions

1. ~~How does the agent know compaction occurred?~~ **Resolved: Always check state before startup menus — don't try to detect compaction**

2. ~~What should the state file track?~~ **Resolved: Add `currentTask` object with description, startedAt, lastAction, contextAnchor**

3. ~~Should recovery be silent or acknowledged?~~ **Resolved: Brief acknowledgment — "Resuming: [task description]"**

4. ~~Which agents need this?~~ **Resolved: Primary agents (Builder, Planner, Toolkit). Sub-agents are short-lived and unlikely to hit compaction mid-execution. If issues emerge, address with richer context blocks from parent.**

5. ~~When should state be updated?~~ **Resolved: After every significant step + after tool calls complete. `lastAction` is cheap to update.**

## User Stories

### US-001: Add compaction recovery check to Builder

**Description:** As a user, I want Builder to automatically recover its task context after compaction, so I don't have to re-explain what we were doing.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Builder checks state file before showing startup/mode menus
- [ ] If `uiTodos` has `in_progress` items, resume that task
- [ ] If resuming, show brief acknowledgment: "Resuming: [task description]"
- [ ] Only show startup menu if state confirms no work in progress
- [ ] Works correctly even if state file doesn't exist

### US-002: Add `currentTask` field to builder-state.json

**Description:** As a developer, I want the state file to track what task is currently being worked on, so recovery has enough context to resume meaningfully.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Add `currentTask` object to builder-state.json schema:
  ```json
  "currentTask": {
    "description": "Comparing live site with local build for deployment verification",
    "startedAt": "2026-02-26T02:00:00Z",
    "lastAction": "Fetched live site, about to compare with local",
    "contextAnchor": "US-005 visual verification step"
  }
  ```
- [ ] Builder sets `currentTask` when starting any task (ad-hoc or PRD story)
- [ ] Builder updates `lastAction` after significant steps and tool calls
- [ ] Builder clears `currentTask` (sets to null) when task completes
- [ ] Recovery uses `description` for the brief acknowledgment message

### US-003: Add compaction recovery to Planner

**Description:** As a user, I want Planner to also recover context after compaction.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Planner checks `planner-state.json` before showing startup behavior
- [ ] If work in progress, resume without prompting
- [ ] Consistent behavior with Builder recovery

### US-004: Add compaction recovery to Toolkit

**Description:** As a user, I want Toolkit to also recover context after compaction.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Toolkit checks `toolkit-state.json` before showing startup behavior
- [ ] If work in progress, resume without prompting
- [ ] Consistent behavior with Builder/Planner recovery

## Functional Requirements

- FR-1: State file must include `currentTask` with enough context to resume
- FR-2: Agents must check state file before showing any "what would you like to do?" prompt
- FR-3: Recovery check must be fast (single file read, not multiple tool calls)
- FR-4: If state file is missing or empty, proceed with normal startup
- FR-5: Recovery acknowledgment must be brief (one line, not a full status dump)

## Non-Goals

- No changes to OpenCode's compaction algorithm
- No attempt to "detect" compaction programmatically
- No recovery of full conversation history (just current task)
- No cross-session recovery (this is for mid-session compaction only)

## Technical Considerations

- **State file location:** Already defined (`docs/builder-state.json`, etc.)
- **Read performance:** Single `cat` or `read` call — fast
- **Schema update:** Add `currentTask` to existing state schema
- **Backward compatibility:** Missing `currentTask` field = no recovery info (graceful degradation)

## Success Metrics

- After compaction, agent resumes without user intervention
- User never sees startup menu when task is in progress
- Recovery adds <1 second to response time

## Credential & Service Access Plan

No external credentials required for this PRD.
