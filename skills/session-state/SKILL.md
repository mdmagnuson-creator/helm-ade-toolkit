# Session State Skill

> Shared session management for agents with state persistence.
>
> This skill provides common patterns for right-panel todos, rate limit handling, and compaction recovery that are shared across builder, planner, and toolkit agents.

## Triggers

- Agent startup (to restore session state)
- Rate limit detection
- Compaction recovery check
- "session state", "resume", "rate limited"

## Applicable Agents

- **builder** — uses `docs/sessions/{id}/session.json` (see `session-log` skill for full details)
- **planner** — uses `docs/planner-state.json`
- **toolkit** — uses `~/.config/opencode/.tmp/toolkit-state.json`

---

## State File Location

Each agent uses its own state file:

| Agent | State File |
|-------|------------|
| builder | `<project>/docs/sessions/{id}/session.json` (committed to git) + `<project>/docs/builder-config.json` (gitignored, machine-local) |
| planner | `<project>/docs/planner-state.json` |
| toolkit | `~/.config/opencode/.tmp/toolkit-state.json` |

> **Builder note:** Builder's state has been split into two files. `session.json` holds the session log (committed to git for cross-machine resume). `builder-config.json` holds machine-specific data (`availableCLIs`, `projectContext`, `lastSessionPath`). See the `session-log` skill for full details.

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

> **Builder uses a different structure.** Builder's `session.json` uses `currentAction` (not `currentTask`) and derives todos from `chunks[]` (no separate `uiTodos`). See the `session-log` skill for Builder's state structure.

---

## Right-Panel Todo Contract

Keep OpenCode right-panel todos and state file synchronized for resumability.

> **Builder exception:** Builder derives todos from `session.json` → `chunks[]` instead of a separate `uiTodos` store. The contract below applies to planner and toolkit; Builder follows the `session-log` skill.

### Required Behavior

1. **On startup:** Restore panel todos from state file (`uiTodos.items`) via `todowrite`
2. **On every state change:** Update both stores in one action:
   - Right panel via `todowrite`
   - State file (`uiTodos.items`, `uiTodos.lastSyncedAt`, `uiTodos.flow`)
3. **One active rule:** Only one todo may be `in_progress` at a time
4. **Before handoff:** Ensure state file matches panel so another session can resume

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

> **Builder uses `currentAction`** (in `session.json`) instead of `currentTask`. Same purpose, different field name. See `session-log` skill.

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

### What Qualifies as Significant Step

Update `lastAction` and `contextAnchor` after:
- Completing a file edit
- Running a command that changes state
- Completing a todo item
- Reaching a decision point

---

## Startup Integration

Each agent integrates this skill at startup:

### 1. Read State File

```bash
# Read state (may not exist)
cat <state-file> 2>/dev/null || echo '{}'
```

### 2. Restore Todos

If `uiTodos.items` exists:
- Mirror items to right panel via `todowrite`
- Keep at most one `in_progress` item

### 3. Check for Compaction Recovery

If `currentTask` exists and has a `description`:
- Output: `Resuming: [currentTask.description]`
- Skip welcome menus
- Continue from `contextAnchor`

### 4. Normal Startup

If no `currentTask`, proceed to normal welcome/menu flow.

---

## Flow Mapping (Per Agent)

### Builder Flows

> Builder todos are derived from `session.json` → `chunks[]`. Each chunk = one todo.

| Flow | Todo Granularity | Completion Condition |
|------|------------------|----------------------|
| `prd` | One per chunk (story) | Story implemented, checks pass |
| `adhoc` | One per chunk (task) | Task completed by @developer |
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
