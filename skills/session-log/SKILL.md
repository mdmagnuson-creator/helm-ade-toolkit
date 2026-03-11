---
name: session-log
description: "Manage persistent session logs for Builder. Use when initializing sessions, managing chunks, writing session state, or resuming sessions. Triggers on: session log, session state, chunk management, session resume, heartbeat, session init."
---

# Session Log Management

> Load this skill when: initializing Builder sessions, managing work chunks, writing session state, resuming sessions, updating heartbeat, or performing chunk transitions.

## Overview

Builder maintains persistent session logs at `docs/sessions/{date}-{short-id}/` to enable resumability, context shedding, and cross-machine continuity. This skill defines when and how to read/write session state.

Session logs are **committed to git** (not gitignored) so sessions can be resumed on any machine. Machine-specific data lives in `docs/builder-config.json` (gitignored).

**Schemas:**
- `schemas/session.schema.json` — Session manifest (`session.json`)
- `schemas/chunk.schema.json` — Chunk metadata (`chunk.json`)
- `schemas/builder-config.schema.json` — Machine-specific config (`builder-config.json`)

## File Hierarchy

```
docs/
  builder-config.json                              # Machine-specific (gitignored)
  sessions/
    {date}-{short-id}/                             # One folder per active session
      session.json                                 # Session manifest — ALWAYS loaded
      decisions.md                                 # Cross-cutting decisions spanning chunks
      chunks/
        {storyId}-{NN}-{slug}/                     # One folder per work chunk
          chunk.json                               # Full metadata: status, timing, tests, verification
          plan.md                                  # Acceptance criteria and planned approach
          changes.md                               # What was done (files, decisions, notes)
          issues.md                                # Problems encountered and resolutions (optional)
          log.jsonl                                # Append-only action log (every tool call)
    archive/                                       # Completed sessions moved here
      {date}-{short-id}/                           # Same structure as active sessions
```

**Chunk folder naming:** `{storyId}-{NN}-{slug}` — gives identity (story ID), ordering (sequence number), and readability (slug).
- PRD chunks: `US-001-01-user-registration`, `US-002-02-login-flow`
- Ad-hoc chunks: `TSK-001-01-fix-header`, `TSK-002-02-update-footer`

## Commit Ordering (CRITICAL)

> ⛔ **ALWAYS update session log files BEFORE committing.**
>
> Session log updates that happen after `git commit` will be left uncommitted. If the session ends (crash, rate limit, context compaction), the log will be out of sync with the committed code.
>
> **Correct order:**
> 1. Finalize `chunk.json` (status, tests, verification, commit info)
> 2. Write `changes.md` with implementation details
> 3. Write `issues.md` if problems were encountered
> 4. Update `session.json` (chunk summary, advance `currentChunk`, update heartbeat)
> 5. Update other state files (`docs/prd.json`, `docs/prd-registry.json`)
> 6. Run `git add -A && git commit`
>
> **Wrong order:** Commit first, then update session log → state drift

## When to Write State

### `session.json` — Session Manifest

Write to `session.json` at these key moments:

| Event | Fields Changed |
|-------|----------------|
| **Session init** | Create file: `sessionId`, `lastHeartbeat`, `project`, `mode`, `source`, `branch`, `analysisCompleted: false`, `status: "in_progress"`, `chunks: []` |
| **Analysis approved [G]** | `analysisCompleted: true` |
| **Chunks planned** | Populate `chunks[]` with IDs, storyIds, titles, all `status: "pending"` |
| **Start chunk** | Set chunk `status: "in_progress"`, `startedAt`, set `currentChunk` |
| **After every tool call** | Update `currentAction` (`description`, `contextAnchor`, `lastAction`, `updatedAt`) and `lastHeartbeat` |
| **Complete chunk** | Set chunk `status: "completed"`, `completedAt`, `commitHash`, write `summary`. Advance `currentChunk` to next pending chunk (or null). |
| **Fail chunk** | Set chunk `status: "failed"`, keep `currentChunk` pointing to it |
| **Skip chunk** | Set chunk `status: "skipped"`, advance `currentChunk` |
| **Session complete** | `status: "completed"`, `currentChunk: null`, `currentAction: null` |
| **Session abandoned** | `status: "abandoned"`, `currentChunk: null`, `currentAction: null` |

**Size constraint:** `session.json` must stay under 5KB. Keep chunk summaries to 1-2 sentences (~300 chars max).

### `chunk.json` — Chunk Metadata

Write to `chunk.json` at these moments:

| Event | Fields Changed |
|-------|----------------|
| **Chunk start** | Create file: `id`, `storyId`, `title`, `status: "in_progress"`, `startedAt` |
| **Files modified** | Append to `filesModified[]` |
| **Tests generated** | `tests.unit.generated[]` or `tests.e2e.generated[]` |
| **Tests run** | `tests.unit.status`, `tests.e2e.status`, pass/fail counts |
| **Tests deferred** | `tests.e2e.status: "deferred"`, `tests.e2e.deferredTo` |
| **Verification contract set** | `verification.contract` |
| **Verification completed** | `verification.result` |
| **Chunk complete** | `status: "completed"`, `completedAt`, `commit.hash`, `commit.message`, `uncommitted: null` |
| **Chunk failed** | `status: "failed"` |
| **Reassignment** | `reassignment.attempts[]`, `reassignment.currentAgent` |
| **Advisory task** | `advisory.description`, `advisory.output` |
| **Uncommitted work** | `uncommitted.hasChanges`, `uncommitted.summary`, `uncommitted.filesChanged` |
| **Pending updates detected** | `pendingUpdates.supportArticles[]`, `pendingUpdates.marketingScreenshots[]` |

### `builder-config.json` — Machine Config (Gitignored)

Write to `builder-config.json` at these moments:

| Event | Fields Changed |
|-------|----------------|
| **Session init** | `lastSessionPath` set to session folder path |
| **CLI detection** | `availableCLIs` with install/auth status and `detectedAt` |
| **Project context load** | `projectContext` cached from `project.json` |
| **Session complete** | `lastSessionPath: null` (cleared) |

### `log.jsonl` — Append-Only Action Log

Append one JSON line per significant tool call:

```jsonl
{"ts":"2026-03-08T10:05:12Z","action":"read","target":"src/db/schema.ts","note":"Checking existing table structure"}
{"ts":"2026-03-08T10:06:30Z","action":"write","target":"src/db/migrations/001_users.sql","note":"Created users table migration"}
{"ts":"2026-03-08T10:08:45Z","action":"delegate","target":"@react-dev","note":"Delegating RegisterForm component creation"}
{"ts":"2026-03-08T10:12:00Z","action":"test","target":"npm test","note":"Unit tests: 12 passed, 0 failed"}
```

**Action types:** `read`, `write`, `delete`, `delegate`, `delegate-result`, `test`, `command`, `decision`, `issue`, `skill-load`

**Rules:**
- Append-only (one line per action, never rewrite)
- Never read during normal execution or compaction recovery
- Available for debugging ("what happened during this chunk?")
- Each line is self-contained JSON

### `changes.md` — What Was Done

Write at chunk completion (or incrementally for large chunks):

```markdown
# Changes: [Chunk Title] ([storyId])

## Files Created
- `path/to/file.ts` — Brief description

## Files Modified
- `path/to/file.ts` — What changed

## Key Decisions
- Decision and rationale

## Dependencies Added
- package@version — why

## Implementation Notes
- Relevant patterns, conventions followed
```

### `issues.md` — Problems and Resolutions

Write only when problems are encountered (optional file):

```markdown
# Issues: [Chunk Title] ([storyId])

## Issue 1: Brief title
- **Problem:** What happened
- **Root cause:** Why it happened
- **Fix:** How it was resolved
- **Time spent:** ~N min
```

### `decisions.md` — Cross-Cutting Decisions (Session Root)

Append when decisions affect multiple chunks:

```markdown
# Cross-Cutting Decisions

## [Topic]
Decision description and rationale.
```

## Analysis Gate Checkpoint (MANDATORY — Compaction Resilient)

> ⛔ **CRITICAL: `analysisCompleted` is a mandatory checkpoint field in `session.json`.**
>
> This field serves as a technical backstop for the Analysis Gate guardrail.
> Even if behavioral instructions are "forgotten" after context compaction, this field persists on disk and is checked before every @developer delegation.

**Lifecycle:**

1. **On session init:** Write `analysisCompleted: false`
2. **Before showing analysis dashboard:** Verify field is `false` (safety check)
3. **After user responds with [G]:** Set `analysisCompleted: true`
4. **Before ANY @developer delegation:** Read `session.json` and verify `analysisCompleted === true`
5. **On session completion:** Session is archived; field is preserved for history

**Pre-delegation check:**

```bash
SESSION_DIR=$(jq -r '.lastSessionPath // empty' docs/builder-config.json 2>/dev/null)
if [ -z "$SESSION_DIR" ]; then
  echo "⛔ No active session. Cannot delegate."
  exit 1
fi

ANALYSIS_COMPLETED=$(jq -r '.analysisCompleted // false' "$SESSION_DIR/session.json" 2>/dev/null)
echo "Analysis gate check: analysisCompleted=$ANALYSIS_COMPLETED"

if [ "$ANALYSIS_COMPLETED" != "true" ]; then
  echo "⛔ Analysis gate not passed. Must show ANALYSIS COMPLETE dashboard and receive [G]."
  exit 1
fi
```

## Verification State Isolation (Per-Chunk — No Resets Needed)

Verification state lives in `chunk.json` → `verification`. Each chunk starts with a fresh `chunk.json` — **no cross-chunk contamination by design**.

**Why this is better:**
- Old system: `verificationContract` and `verificationResults` were top-level in `builder-state.json`, requiring explicit reset at every task boundary (a source of bugs)
- New system: Each chunk owns its verification state. Starting a new chunk = starting fresh. No reset code needed.

**Reading verification state:**

```bash
SESSION_DIR=$(jq -r '.lastSessionPath // empty' docs/builder-config.json 2>/dev/null)
CURRENT_CHUNK=$(jq -r '.currentChunk // empty' "$SESSION_DIR/session.json" 2>/dev/null)
CHUNK_DIR="$SESSION_DIR/chunks/$CURRENT_CHUNK"

# Read verification contract
jq '.verification.contract' "$CHUNK_DIR/chunk.json" 2>/dev/null

# Read verification result
jq '.verification.result' "$CHUNK_DIR/chunk.json" 2>/dev/null
```

## CLI State Persistence (Compaction Resilience)

CLI detection state lives in `builder-config.json` → `availableCLIs`. It is machine-specific (gitignored) and cached for 24 hours.

| Event | Action |
|-------|--------|
| **Session start (fresh)** | Detect CLIs, write `availableCLIs` with `detectedAt` timestamps |
| **Session start (resume)** | Read `availableCLIs`, skip detection if fresh (<24h) |
| **CLI auth expires** | User reports failure → clear that CLI's `authenticated` flag |
| **Re-authentication** | User confirms → re-run detection for that CLI |

**Staleness check:**

```bash
CLI_DETECTED_AT=$(jq -r '.availableCLIs.vercel.detectedAt // empty' docs/builder-config.json)
if [ -n "$CLI_DETECTED_AT" ]; then
  DETECTED_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$CLI_DETECTED_AT" +%s 2>/dev/null || date -d "$CLI_DETECTED_AT" +%s)
  NOW_EPOCH=$(date +%s)
  AGE_HOURS=$(( (NOW_EPOCH - DETECTED_EPOCH) / 3600 ))
  if [ "$AGE_HOURS" -lt 24 ]; then
    echo "CLI state is fresh ($AGE_HOURS hours old), reusing"
  else
    echo "CLI state is stale ($AGE_HOURS hours old), re-detecting"
  fi
fi
```

## Session Initialization

When Builder starts a new session:

```bash
# Generate session ID
SESSION_DATE=$(date +%Y-%m-%d)
SESSION_SHORT=$(openssl rand -hex 3)
SESSION_ID="${SESSION_DATE}-${SESSION_SHORT}"
SESSION_DIR="docs/sessions/${SESSION_ID}"

# Create directory structure
mkdir -p "$SESSION_DIR/chunks"

# Create session.json
cat > "$SESSION_DIR/session.json" << EOF
{
  "schemaVersion": 1,
  "sessionId": "$SESSION_ID",
  "lastHeartbeat": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "project": "<project-id>",
  "mode": "<prd|adhoc>",
  "source": { ... },
  "branch": "<branch-name>",
  "analysisCompleted": false,
  "status": "in_progress",
  "currentChunk": null,
  "currentAction": null,
  "chunks": []
}
EOF

# Create decisions.md
cat > "$SESSION_DIR/decisions.md" << 'EOF'
# Cross-Cutting Decisions

(Decisions that span multiple chunks will be recorded here.)
EOF

# Update builder-config.json
jq --arg path "$SESSION_DIR" '.lastSessionPath = $path' docs/builder-config.json > /tmp/bc.json && mv /tmp/bc.json docs/builder-config.json
# (Or create builder-config.json if it doesn't exist)
```

## Chunk Lifecycle

### Starting a Chunk

```bash
CHUNK_ID="US-001-01-user-registration"
CHUNK_DIR="$SESSION_DIR/chunks/$CHUNK_ID"
mkdir -p "$CHUNK_DIR"

# Create chunk.json
cat > "$CHUNK_DIR/chunk.json" << EOF
{
  "id": "$CHUNK_ID",
  "storyId": "US-001",
  "title": "User Registration",
  "status": "in_progress",
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "completedAt": null,
  "filesModified": [],
  "tests": null,
  "verification": null,
  "commit": null,
  "uncommitted": null,
  "reassignment": null,
  "advisory": null,
  "pendingUpdates": null
}
EOF

# Create plan.md (from PRD acceptance criteria or ad-hoc description)
cat > "$CHUNK_DIR/plan.md" << 'EOF'
# Plan: User Registration (US-001)

## Acceptance Criteria
- ...

## Approach
- ...
EOF

# Initialize log.jsonl
touch "$CHUNK_DIR/log.jsonl"

# Update session.json: set currentChunk, update chunk status
# (use jq to update the chunks[] entry and set currentChunk)
```

### Completing a Chunk

1. **Write `changes.md`** with implementation details
2. **Write `issues.md`** if problems were encountered
3. **Update `chunk.json`:** `status: "completed"`, `completedAt`, `commit`, `uncommitted: null`
4. **Update `session.json`:**
   - Set chunk entry: `status: "completed"`, `completedAt`, `commitHash`, `summary`
   - Advance `currentChunk` to next pending chunk (or `null` if done)
   - Update `lastHeartbeat`
5. **Commit:** `git add -A && git commit -m "feat: [message]"`

### Transitioning Between Chunks (Lean Execution)

After committing the completed chunk:

1. **Log transition:** `"✅ US-001 complete. Starting US-002: [title]"`

2. **Shed context** — Completed chunk details (code files, test output, delegation results) exist only on disk in the chunk folder. Builder does NOT carry them in working context.

3. **Carry forward ONLY these files (total ~5-9KB / ~2K tokens):**

   | File | Size | Purpose |
   |------|------|---------|
   | `session.json` | ~2-4KB | Manifest with chunk summaries, currentAction, currentChunk |
   | `decisions.md` | ~1-3KB | Cross-cutting decisions spanning chunks |
   | Next chunk's `plan.md` | ~1-2KB | Acceptance criteria and approach |

   **Nothing else.** No source files, no test output, no previous chunk details.

4. **Load next chunk:**
   - Read acceptance criteria from PRD (or ad-hoc task description)
   - Create `plan.md` in the new chunk folder
   - Read relevant source files fresh (not carried over from previous chunk)
   - Create `chunk.json` with clean state (per-chunk verification isolation)

5. **Update right-panel todos** — Derive from `session.json` → `chunks[]`

**Why this matters:** Without lean execution, Builder accumulates context across stories until compaction forces a reset (~128K tokens). With lean execution, each chunk starts with ~5-9KB of context, making compaction rare.

## UI Todo Derivation

Right-panel todos are **derived** from `session.json` → `chunks[]`. No separate `uiTodos` persistence.

| Chunk `status` | Todo `status` |
|----------------|---------------|
| `pending` | `pending` |
| `in_progress` | `in_progress` |
| `completed` | `completed` |
| `failed` | Shows as failed (user chooses retry/skip) |
| `skipped` | `cancelled` |

**On resume or compaction recovery:**

```javascript
// Derive todos from session.json chunks
const todos = session.chunks.map(chunk => ({
  content: `${chunk.storyId}: ${chunk.title}`,
  status: chunk.status === 'skipped' ? 'cancelled' :
          chunk.status === 'failed' ? 'pending' : // Show failed as actionable
          chunk.status,
  priority: chunk.status === 'in_progress' ? 'high' :
            chunk.status === 'failed' ? 'high' : 'medium'
}));
// Sync to right panel via todowrite
```

**Rule:** Keep at most one `in_progress` todo (matching one `in_progress` chunk).

## Session Resume Protocol

### Session Discovery

On startup, find active sessions:

1. **Fast path:** Read `docs/builder-config.json` → `lastSessionPath`
   - If path exists and `session.json` has `status: "in_progress"` → found active session
2. **Fallback:** Scan `docs/sessions/` (exclude `archive/`) for any `session.json` with `status: "in_progress"`
   - If multiple found, pick the one with latest `lastHeartbeat`
3. **No session found:** Normal startup (no resume)

If using a file-read tool that throws on missing paths, first check directory existence. Missing state is expected for first-time sessions.

### Resume Flow

If an active session is found:

1. **Read `session.json`** — Full session picture with chunk summaries
2. **Reset interrupted chunks:** Any chunk with `status: "in_progress"` → reset to `pending` (not resumable mid-chunk)
3. **Handle failed chunks first:** If any chunks have `status: "failed"`, present each with per-chunk options:
   - `[R] Retry` — reset to `pending`, clear verification/test state in `chunk.json`
   - `[S] Skip` — set to `skipped`
   - `[A] Abort` — cancel all remaining non-completed chunks, end session
4. **Show Resume Dashboard** with updated statuses:
   - `[R] Resume` — continue from first `pending` chunk
   - `[A] Abort` — mark all `pending` chunks as `skipped`, set session `status: "abandoned"`
   - `[S] Start fresh` — archive current session, start new session
5. **Re-derive right-panel todos** from `session.json` → `chunks[]`

**Key rules:**
- Never auto-resume — always require explicit user choice
- Resume enters chunk processing directly (no re-analysis if `analysisCompleted: true`)
- The Resume Dashboard shows: mode, source, branch, each chunk with status icon, progress summary

### Stale Session Detection

Compare `lastHeartbeat` against configured timeout (`project.json → agents.heartbeatTimeoutMinutes`, default: 10 minutes):

```bash
HEARTBEAT=$(jq -r '.lastHeartbeat' "$SESSION_DIR/session.json")
HEARTBEAT_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$HEARTBEAT" +%s 2>/dev/null || date -d "$HEARTBEAT" +%s)
NOW_EPOCH=$(date +%s)
AGE_MINUTES=$(( (NOW_EPOCH - HEARTBEAT_EPOCH) / 60 ))
TIMEOUT=${HEARTBEAT_TIMEOUT_MINUTES:-10}

if [ "$AGE_MINUTES" -gt "$TIMEOUT" ]; then
  echo "Found stale session (last active: ${AGE_MINUTES} min ago)"
fi
```

## Session Completion

When all chunks are completed (or session is explicitly closed):

1. **Update `session.json`:** `status: "completed"`, `currentChunk: null`, `currentAction: null`
2. **Move session folder:** `mv docs/sessions/{session-id}/ docs/sessions/archive/{session-id}/`
3. **Update `builder-config.json`:** Clear `lastSessionPath`
4. **Commit:** `git add -A && git commit -m "chore: Archive completed session {session-id}"`

## Compaction Recovery (Unified Protocol)

The same protocol handles both context compaction and session resume. Recovery is trivial with the session log:

1. **Read `session.json`** (~2-4KB) → full session picture with all chunk summaries
2. **Read `currentAction`** → know exactly what was being done (primary recovery anchor)
3. **Read current chunk's `plan.md`** → know what needs to be accomplished
4. **Read current chunk's `changes.md`** (if exists) → know what's been done so far in this chunk
5. **Read `decisions.md`** → know cross-cutting decisions
6. **Re-derive right-panel todos** from `session.json` → `chunks[]`
7. **Resume work** — all context reconstructed from ~5-10KB of targeted reads

**Recovery message:** `"Resuming: [currentAction.description] (chunk: [title])"`

**Recovery does NOT read:**
- Completed chunk folders (summaries in `session.json` suffice)
- `log.jsonl` (never read during normal operation or recovery)
- Source files from previous chunks (load fresh when needed)

**Total recovery: ~5-10KB / ~1.5-3K tokens → <30 seconds**

### Session Discovery

1. **Fast path:** `docs/builder-config.json` → `lastSessionPath`
2. **Fallback:** Scan `docs/sessions/` (exclude `archive/`) for `session.json` with `status: "in_progress"`
3. **Multiple found:** Pick latest `lastHeartbeat`
4. **None found:** Normal startup (no recovery)

## Heartbeat Management

**Timeout configuration** from `project.json → agents.heartbeatTimeoutMinutes`:
- Default: 10 minutes
- Configurable per project

**Heartbeat update frequency:**
- Update `lastHeartbeat` in `session.json` on every `currentAction` update
- At minimum, every 2-3 minutes during active work

## Branchless Trunk Semantics

When `git.agentWorkflow` resolves to branchless trunk mode:

- Session's `branch` field stores the default branch explicitly (e.g., `"main"`)
- No assumption that work is on a feature branch
- On resume, if current branch differs from `session.json` → `branch`, prompt to switch before continuing

## Context Overflow Handling

### At 75% Context Usage

```
Warning: Context limit approaching (75%)

Writing checkpoint to session log...
[session.json currentAction updated, changes.md written incrementally]

Work can continue, but session log is current if session must end.
```

### At 90% Context Usage

```
Context limit reached (90%)

Final checkpoint written to session log.

Stopping current work. To resume:
1. Start a new Builder session
2. Builder will detect active session and offer resume

Current progress:
- Completed: [N] chunks
- Current: [chunk title]
- Pending: [M] chunks
```

## Migration Notes

This skill replaces the `builder-state` skill. Key mapping:

| Old (builder-state.json) | New (session log) |
|--------------------------|-------------------|
| `sessionId` | `session.json` → `sessionId` |
| `lastHeartbeat` | `session.json` → `lastHeartbeat` |
| `currentTask` | `session.json` → `currentAction` + `currentChunk` |
| `activeWork` (mode, stories) | `session.json` → `mode`, `chunks[]`, `currentChunk` |
| `activeWork.analysisCompleted` | `session.json` → `analysisCompleted` |
| `activeWork.implementationDecisions` | `session.json` → `implementationDecisions` |
| `checkpoint` | Chunk's `changes.md`, `issues.md`, `log.jsonl` |
| `pendingTests` | `chunk.json` → `tests` |
| `verificationContract/Results` | `chunk.json` → `verification` |
| `uiTodos` | Derived from `session.json` → `chunks[]` |
| `uncommittedWork` | `chunk.json` → `uncommitted` |
| `reassignment` | `chunk.json` → `reassignment` |
| `advisoryTasks` | `chunk.json` → `advisory` |
| `availableCLIs` | `builder-config.json` → `availableCLIs` |
| `projectContext` | `builder-config.json` → `projectContext` |
| `pendingUpdates` | `chunk.json` → `pendingUpdates` |

**If a project still has a `builder-state.json` file**, it is ignored (can be manually deleted).
