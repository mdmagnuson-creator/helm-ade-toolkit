---
name: session-state
description: "Shared session management for agents with state persistence. Use when managing session state, handling rate limits, or recovering from compaction. Triggers on: session state, resume, rate limited, compaction recovery."
---

# Session State Skill

> Shared session management for agents with state persistence via helm-bridge.
>
> This skill provides common patterns for right-panel todos, rate limit handling, and compaction recovery that are shared across builder, planner, and toolkit agents.

## Triggers

- Agent startup (to restore session state)
- Rate limit detection
- Compaction recovery check
- "session state", "resume", "rate limited"

## Applicable Agents

- **builder** — uses helm-bridge for session state (backed by Supabase)
- **planner** — uses `docs/planner-state.json`
- **toolkit** — uses `$OPENCODE_CONFIG/.tmp/toolkit-state.json`

---

## State Management via helm-bridge

Builder and other Helm-integrated agents use helm-bridge tools for state management:

| Tool | Purpose |
|------|---------|
| `helm_session_get_state(key)` | Read state from local memory cache |
| `helm_session_set_state(key, value)` | Write state to local memory, queues Supabase sync |
| `helm_session_sync()` | Flush state to Supabase (on transitions: story completion, fix loop, pause) |
| `helm_session_load()` | Load state from Supabase on session resume |

> **Note:** Helm manages sessions natively — there are no local session files or directories.

---

## State File Location (Non-Helm Agents)

Agents not using helm-bridge use local state files:

| Agent | State File |
|-------|------------|
| builder | **helm-bridge** (Supabase-backed, no local files) |
| planner | `<project>/docs/planner-state.json` |
| toolkit | `$OPENCODE_CONFIG/.tmp/toolkit-state.json` |

---

## Common State Structure

Planner and toolkit share this core structure:

```json
{
  "uiTodos": {
    "flow": "draft|adhoc|updates|...",
    "lastSyncedAt": "2026-02-28T10:00:00Z",
    "items": [
      {
        "content": "Task description",
        "status": "pending|in_progress|completed|cancelled",
        "priority": "high|medium|low",
        "flow": "draft|adhoc|updates|...",
        "refId": "US-001|adhoc-001|filename.md|..."
      }
    ]
  },
  "currentTask": {
    "description": "What the agent is doing",
    "startedAt": "2026-02-28T10:00:00Z",
    "lastAction": "Last completed action",
    "contextAnchor": "File or section being worked on",
    "rateLimitDetectedAt": null
  }
}
```

> **Builder uses helm-bridge.** Builder reads/writes state via `helm_session_get_state()` and `helm_session_set_state()`. It uses `currentAction` (not `currentTask`) and derives todos from session chunks (no separate `uiTodos`).

### Builder Chunk Model

Builder stores work units as chunks in `session.chunks[]`. Each chunk can optionally link to a Helm Task:

```json
{
  "chunks": [
    {
      "id": "TSK-001",
      "title": "Fix header layout",
      "status": "pending",
      "helmTaskId": "uuid-of-the-linked-helm-task-or-null"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Chunk identifier (e.g., `TSK-001`, `US-003`) |
| `title` | string | Short description of the work |
| `status` | string | `pending`, `in_progress`, `completed`, `failed` |
| `helmTaskId` | string \| null | UUID of the linked Helm Task, or `null` for session-level chunks |

**When to set `helmTaskId`:**
- **Task-linked sessions:** Set `helmTaskId` to the task UUID when creating chunks from `helm_session_task_list()` results
- **Single-task sessions:** All chunks get that task's UUID
- **Multi-task sessions:** Each chunk gets its corresponding task's UUID
- **Session-level chunks:** Use `null` (e.g., "Run tests", "Commit changes")

> ⛔ **CRITICAL:** Without `helmTaskId`, todos appear in the "Session" section instead of being grouped under their Helm Task.

The macOS app reads `agent_state.chunks`, matches each chunk to a todo, and uses `helmTaskId` to populate `task_id` in `session_todos` for UI grouping.

### Chunk Creation Order (CRITICAL)

> ⛔ **Chunks MUST be created in logical execution order, not analysis order.**
>
> The order chunks are created determines `todoIndex` in the Helm UI. Users see todos in creation order, so that order must be logical.

**Correct execution order:**

1. **Prerequisites/setup** — Downloads, environment config, dependencies
2. **Implementation tasks** — Code changes, features, fixes
3. **Quality checks** — Typecheck, lint, build, tests — **ALWAYS near last**
4. **Completion tasks** — Commit, signal done — **ALWAYS last**

When Builder analyzes work, it must reorder todos into execution sequence before creating chunks.

---

## Right-Panel Todo Contract

Keep OpenCode right-panel todos and state synchronized for resumability.

> **Builder exception:** Builder derives todos from session state via helm-bridge instead of a separate `uiTodos` store. The contract below applies to planner and toolkit; Builder uses helm-bridge tools.

### Required Behavior

1. **On startup:** Restore panel todos from state (`uiTodos.items`) via `todowrite`
2. **On every state change:** Update both stores in one action:
   - Right panel via `todowrite`
   - State file (`uiTodos.items`, `uiTodos.lastSyncedAt`, `uiTodos.flow`)
3. **One active rule:** Only one todo may be `in_progress` at a time
4. **Before handoff:** Ensure state is synced so another session can resume

### Todo Fields

| Field | Description |
|-------|-------------|
| `content` | Task description (shown in panel) |
| `status` | `pending`, `in_progress`, `completed`, `cancelled` |
| `priority` | `high`, `medium`, `low` |
| `flow` | Workflow context (for resume) |
| `refId` | Reference ID (story ID, update filename, etc.) |

---

## Rate Limit Handling

> ⚠️ Rate limits are **NOT** transient tool failures. Do not auto-retry.

### Detection

Rate limit detected when error contains:
- `429`
- `"rate limit"`
- `"quota"`
- `"too many requests"`

### On Rate Limit

1. **Write state immediately:**
   - Update `currentTask.lastAction` and `contextAnchor`
   - Set `currentTask.rateLimitDetectedAt` (ISO timestamp)
   - For builder: `helm_session_set_state("currentAction.rateLimitDetectedAt", new Date().toISOString())`

2. **Show clear message and stop:**

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

3. **Do not perform further actions** until user responds

---

## Current Task Tracking (Compaction Recovery)

Track `currentTask` so work can resume after context compaction or rate limiting.

> **Builder uses `currentAction`** (via helm-bridge) instead of `currentTask`. Same purpose, different field name.

### Required Behavior

| Event | Action |
|-------|--------|
| Task start | Set `description`, `startedAt`, `contextAnchor` |
| After every tool call | Update `lastAction` and `contextAnchor` |
| Rate limit detected | Set `rateLimitDetectedAt` |
| Task completion | Clear `currentTask` (set to `null`) |

### Resume Behavior

- **After rate limit:** If user responds with intent to continue, resume from `currentTask.lastAction`
- **New session:** If `currentTask` exists, output: `Resuming: [currentTask.description]`
- **Builder:** Use `helm_session_load()` to restore state from Supabase on session resume

### What Qualifies as Significant Step

Update `lastAction` and `contextAnchor` after:
- Completing a file edit
- Running a command that changes state
- Completing a todo item
- Reaching a decision point

---

## Startup Integration

Each agent integrates this skill at startup:

### 1. Load State

**For builder (helm-bridge):**
```typescript
// Load state from Supabase
await helm_session_load();
const currentAction = helm_session_get_state("currentAction");
```

**For planner/toolkit (local files):**
```bash
# Read state (may not exist)
cat <state-file> 2>/dev/null || echo '{}'
```

### 2. Restore Todos

If `uiTodos.items` exists (or session chunks for builder):
- Mirror items to right panel via `todowrite`
- Keep at most one `in_progress` item

### 3. Check for Compaction Recovery

If `currentTask` (or `currentAction` for builder) exists and has a `description`:
- Output: `Resuming: [currentTask.description]`
- Skip welcome menus
- Continue from `contextAnchor`

### 4. Normal Startup

If no `currentTask`, proceed to normal welcome/menu flow.

---

## Flow Mapping (Per Agent)

### Builder Flows

> Builder todos are derived from session state via helm-bridge. Each task = one todo.

| Flow | Todo Granularity | Completion Condition |
|------|------------------|----------------------|
| `prd` | One per story | Story implemented, checks pass |
| `adhoc` | One per task | Task completed by @developer |
| `updates` | One per update file | Update applied or skipped |
| `e2e` | One per E2E file | Test passed or skipped |

### Planner Flows

| Flow | Todo Granularity | Completion Condition |
|------|------------------|----------------------|
| `draft` | One per refinement task | Draft updated |
| `new` | One per creation step | Draft + registry updated |
| `ready` | One per PRD moved | PRD converted, status `ready` |
| `updates` | One per planning update | Update applied or skipped |

### Toolkit Flows

| Flow | Todo Granularity | Completion Condition |
|------|------------------|----------------------|
| `pending` | One per pending update | Update applied + committed |
| `adhoc` | One per toolkit task | File updates complete |
| `workflow` | One per post-change step | Manifest/README/website sync done |
