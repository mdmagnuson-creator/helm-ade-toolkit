# PRD: Proactive Context Management with Persistent Session Logs

**Status:** COMPLETE  
**Created:** 2026-03-08  
**Completed:** 2026-03-08  
**Author:** @toolkit

---

## Problem Statement

### The Manual Chunking Problem

When Builder works through full PRDs (5+ stories) or larger ad-hoc task sets, context compaction repeatedly interrupts work. The current flow:

1. Builder loads project context, PRD, and starts working
2. As it processes stories/tasks, it accumulates file contents, skill outputs, test results, and decision context
3. Context hits the token limit → OpenCode compacts → Builder loses working memory
4. Builder recovers (via `builder-state.json`) but the recovery is lossy and costs 1-3 minutes
5. This cycle repeats 3-5 times during a full PRD implementation

**The user currently has to manually intervene** — telling Builder to "break it up into chunks." When prompted, Builder adopts efficient behaviors:
- Works story-by-story instead of holding the full PRD in memory
- Summarizes completed work instead of keeping full context
- Maintains a lean todo tracker
- Drops file contents after processing

**These behaviors should be automatic from the start, not triggered by user frustration.**

### Root Cause Analysis

Builder's current design is **accumulative** — it reads and retains everything in conversation context:

| What accumulates | Why | Size impact |
|-----------------|-----|-------------|
| Full file contents from reads | No eviction strategy | 5-50KB per file |
| Skill content after loading | Stays in conversation | 10-30KB per skill |
| Test output (pass and fail) | Never summarized | 5-20KB per run |
| Previous story implementation details | No shedding between stories | 10-30KB per story |
| Sub-agent delegation results | Full output retained | 5-15KB per delegation |

After 2-3 stories, the conversation easily exceeds 100K tokens even with lean startup.

### What Exists Today (Prior Art)

| System | What it does | Limitation |
|--------|-------------|------------|
| `builder-state.json` | Persists active work, todos, checkpoints, verification, CLI state | Lossy — captures milestones, not full detail. Single JSON blob grows complex. |
| `session-state` skill | Compaction recovery via `currentTask` | Reactive — recovers after compaction, doesn't prevent it |
| Token Budget Management | Rules for selective reads, skill loading | Advisory — no enforcement, no shedding |
| `prd-compaction-resilience` PRD | Reactive recovery after compaction | Only recovers; doesn't prevent the problem |

**This PRD addresses the gap:** proactive context management during work execution, unified with a persistent session log that replaces `builder-state.json` as the single source of truth.

---

## Proposed Solution

### Core Concept: Persistent Session Logs Replace `builder-state.json`

Instead of a single JSON blob (`builder-state.json`) that tries to capture everything in one file, Builder writes structured logs to disk organized by session and work chunk. The session log serves as **both** the hot working state (for compaction recovery) **and** the cold persistent record (for context shedding).

**Three key changes:**

1. **Persistent Session Logs** — A structured file system that captures everything Builder does. Replaces `builder-state.json` as the single source of truth for session state. **Committed to git** so sessions can be resumed on any machine.

2. **Lean Execution Mode** — Builder automatically works story-by-story (or task-by-task), shedding context between chunks. The session logs ensure nothing is lost.

3. **Unified Hot+Cold State** — The session log IS the state. Reactive compaction recovery becomes trivial: read `session.json` → find current chunk → read that chunk's files. No separate "hot" and "cold" stores to keep in sync.

### Why Replace `builder-state.json`?

`builder-state.json` currently tracks everything in a single JSON file: session identity, active work, stories, checkpoints, verification contracts, test state, CLI detection, UI todos, uncommitted work, reassignment history, and advisory tasks. This has problems:

1. **It's a poor man's session log** — It already tries to track work history (stories, checkpoints, completed steps) but crams it into one growing JSON blob
2. **It's lossy by design** — Checkpoints keep only the last 10 steps, truncate descriptions to 200 chars, and discard rationale after 100 chars
3. **It conflates concerns** — Session state, work tracking, environment cache, and UI state are all in one file
4. **It doesn't support context shedding** — Since it's one file read as a whole, you can't selectively load just the current chunk

The session log structure does everything `builder-state.json` does, but better:

| `builder-state.json` field | Session log equivalent |
|---------------------------|----------------------|
| `sessionId`, `lastHeartbeat` | `session.json` → `sessionId`, `lastHeartbeat` |
| `currentTask` | `session.json` → `currentAction` + `currentChunk` (richer — points to full chunk folder) |
| `activeWork` (mode, stories, index) | `session.json` → `mode`, `chunks[]`, `currentChunk` |
| `activeWork.stories[]` | `session.json` → `chunks[]` with summaries always present |
| `activeWork.analysisCompleted` | `session.json` → `analysisCompleted` |
| `checkpoint` (steps, decisions) | Current chunk's `changes.md`, `issues.md`, `log.jsonl` (unlimited detail) |
| `pendingTests` | Current chunk's `chunk.json` → `tests` |
| `verificationContract/Results` | Current chunk's `chunk.json` → `verification` |
| `uiTodos` | Derived from `session.json` → `chunks[]` (status maps to todos) |
| `uncommittedWork` | Current chunk's `chunk.json` → `uncommitted` |
| `reassignment` | Current chunk's `chunk.json` → `reassignment` |
| `advisoryTasks` | Current chunk's `chunk.json` → `advisory` |
| `availableCLIs` | **Moves to `builder-config.json`** (machine-specific, gitignored, 24h TTL) |
| `projectContext` | **Moves to `builder-config.json`** (machine-specific cache) |

### `builder-config.json` — Machine-Specific Configuration (Gitignored)

A slim file for data that is machine-specific and must survive across sessions:

```json
{
  "availableCLIs": {
    "vercel": { "installed": true, "authenticated": true, "user": "my-team", "detectedAt": "2026-03-03T10:00:00Z" },
    "gh": { "installed": true, "authenticated": true, "user": "username", "detectedAt": "2026-03-03T10:00:00Z" }
  },
  "projectContext": {
    "loadedAt": "2026-03-08T10:00:00Z",
    "git": { "defaultBranch": "main", "autoCommit": "onStoryComplete" }
  },
  "lastSessionPath": "docs/sessions/2026-03-08-a1b2c3"
}
```

This file is ~1-2KB, rarely updated, gitignored (CLI auth state is machine-specific), and serves as a pointer + environment cache.

### Persistent Session Log Structure

```
docs/sessions/
  {date}-{short-id}/                           # One folder per active Builder session
    session.json                                # Session manifest (master index) — ALWAYS loaded
    decisions.md                                # Cross-cutting decisions that span chunks
    chunks/
      US-001-01-user-registration/              # One folder per work chunk
        chunk.json                              # Full metadata: status, timing, verification, tests
        plan.md                                 # What was planned (acceptance criteria, approach)
        changes.md                              # What was done (files modified, decisions, patterns)
        issues.md                               # Problems encountered and resolutions
        log.jsonl                               # Append-only action log (every tool call)
      US-002-02-login-flow/
        chunk.json
        plan.md
        changes.md
        issues.md
        log.jsonl
      ...
  archive/                                     # Completed sessions moved here to keep active list short
    {date}-{short-id}/                         # Same structure as active sessions
      session.json
      decisions.md
      chunks/
        ...
```

**Chunk folder naming:** `{storyId}-{NN}-{slug}` — gives both identity (story ID) and ordering (sequence number). For ad-hoc tasks: `TSK-001-01-fix-header`.

#### `session.json` — Session Manifest (Always in Memory)

This is the **only file always loaded into context**. It must stay lean (<5KB) but contain enough information to orient Builder at any point — including after compaction.

**Critical design rule:** Every chunk entry includes a `summary` field (1-2 sentences) that is always brought into memory. This gives Builder awareness of what was accomplished in completed chunks without reading their full details.

```json
{
  "schemaVersion": 1,
  "sessionId": "2026-03-08-a1b2c3",
  "lastHeartbeat": "2026-03-08T14:30:00Z",
  "project": "my-project",
  "mode": "prd",
  "source": {
    "prdId": "prd-auth-system",
    "prdFile": "docs/prds/prd-auth-system.md",
    "description": "Implement full authentication system with registration, login, and dashboard"
  },
  "branch": "feat/prd-auth-system",
  "analysisCompleted": true,
  "status": "in_progress",
  "currentChunk": "US-002-02-login-flow",
  "currentAction": {
    "description": "Implementing login API endpoint",
    "contextAnchor": "src/api/auth.ts",
    "lastAction": "Created POST /login route, working on session management",
    "updatedAt": "2026-03-08T14:30:00Z"
  },
  "chunks": [
    {
      "id": "US-001-01-user-registration",
      "storyId": "US-001",
      "title": "User Registration",
      "summary": "Implemented registration form with email/password, bcrypt hashing, and email verification via 6-digit code. Created users table migration.",
      "status": "completed",
      "startedAt": "2026-03-08T10:05:00Z",
      "completedAt": "2026-03-08T11:20:00Z",
      "commitHash": "a1b2c3d"
    },
    {
      "id": "US-002-02-login-flow",
      "storyId": "US-002",
      "title": "Login Flow",
      "summary": null,
      "status": "in_progress",
      "startedAt": "2026-03-08T11:25:00Z",
      "completedAt": null,
      "commitHash": null
    },
    {
      "id": "US-003-03-dashboard",
      "storyId": "US-003",
      "title": "Dashboard",
      "summary": null,
      "status": "pending",
      "startedAt": null,
      "completedAt": null,
      "commitHash": null
    }
  ]
}
```

**Key properties of `session.json`:**
- The `summary` field on each chunk is filled when the chunk completes — it's a 1-2 sentence description of what was accomplished
- `currentAction` replaces `currentTask` from the old system — same purpose (compaction recovery pointer) but lives in the session manifest. **Updated on every tool call.**
- `chunks[]` replaces `activeWork.stories[]` — same data, better structure
- `analysisCompleted` is preserved as a session-level gate (same compaction-resilient checkpoint as before)
- This entire file is ~2-4KB for a 5-story PRD — always safe to load

#### `chunk.json` — Full Chunk Metadata

This file captures everything the old `builder-state.json` tracked per-story, plus more. It is **only read when working on that chunk** or during compaction recovery for the current chunk.

```json
{
  "id": "US-001-01-user-registration",
  "storyId": "US-001",
  "title": "User Registration",
  "status": "completed",
  "startedAt": "2026-03-08T10:05:00Z",
  "completedAt": "2026-03-08T11:20:00Z",
  "filesModified": [
    "src/components/RegisterForm.tsx",
    "src/api/auth.ts",
    "src/db/migrations/001_users.sql"
  ],
  "tests": {
    "unit": { "generated": ["src/__tests__/RegisterForm.test.tsx"], "status": "passed", "passed": 12, "failed": 0 },
    "e2e": { "generated": ["e2e/registration.spec.ts"], "status": "passed", "passed": 3, "failed": 0 }
  },
  "verification": {
    "contract": { "type": "verifiable", "criteria": ["unit-test", "typecheck", "lint"] },
    "result": { "overall": "pass", "completedAt": "2026-03-08T11:18:00Z" }
  },
  "commit": {
    "hash": "a1b2c3d",
    "message": "feat(auth): implement user registration with email verification"
  },
  "uncommitted": null,
  "reassignment": null,
  "advisory": null
}
```

#### `log.jsonl` — Append-Only Action Log

Every significant tool call is appended as a single JSON line. This file is **never read during normal operation** — it exists for debugging, auditing, and rich context recovery if needed.

```jsonl
{"ts":"2026-03-08T10:05:12Z","action":"read","target":"src/db/schema.ts","note":"Checking existing table structure"}
{"ts":"2026-03-08T10:06:30Z","action":"write","target":"src/db/migrations/001_users.sql","note":"Created users table migration"}
{"ts":"2026-03-08T10:07:15Z","action":"write","target":"src/db/schema.ts","note":"Added users table type definitions"}
{"ts":"2026-03-08T10:08:45Z","action":"delegate","target":"@react-dev","note":"Delegating RegisterForm component creation"}
{"ts":"2026-03-08T10:10:30Z","action":"delegate-result","target":"@react-dev","note":"RegisterForm created with email/password fields, validation"}
{"ts":"2026-03-08T10:11:00Z","action":"write","target":"src/api/auth.ts","note":"Created POST /register and POST /verify-email routes"}
{"ts":"2026-03-08T10:12:00Z","action":"test","target":"npm test","note":"Unit tests: 12 passed, 0 failed"}
{"ts":"2026-03-08T10:12:30Z","action":"test","target":"npx playwright test","note":"E2E tests: 3 passed, 0 failed"}
```

**Action types:** `read`, `write`, `delete`, `delegate`, `delegate-result`, `test`, `command`, `decision`, `issue`, `skill-load`

**Properties:**
- Append-only (cheap to write — one line per action)
- Never read during normal execution or compaction recovery
- Available for debugging ("what happened during this chunk?")
- Committed with the story — full audit trail in git history
- Each line is self-contained JSON — no parsing dependencies

#### `changes.md` — What Was Done (Unlimited Detail)

This replaces the checkpoint's lossy `completedSteps` (limited to 10, truncated) with full narrative:

```markdown
# Changes: User Registration (US-001)

## Files Created
- `src/components/RegisterForm.tsx` — Registration form with email/password fields, client-side validation, error display
- `src/api/auth.ts` — Auth API routes: POST /register (creates user, sends verification email), POST /verify-email (validates 6-digit code)
- `src/db/migrations/001_users.sql` — Users table: id, email, passwordHash, verified, verificationCode, createdAt

## Files Modified
- `src/db/schema.ts` — Added users table type definitions
- `src/app/layout.tsx` — Added AuthProvider wrapper around children

## Key Decisions
- Used bcrypt for password hashing (project convention from CONVENTIONS.md)
- Email verification via 6-digit code (not link) per PRD requirement US-001 AC #3
- Rate limited registration to 5 attempts per IP per hour (Supabase RLS policy)
- Chose to store verification code in users table rather than separate table (simpler, code expires in 10 min)

## Dependencies Added
- bcrypt@5.1.1 — password hashing

## Implementation Notes
- RegisterForm uses react-hook-form (project convention) with zod validation
- API routes follow project pattern from CONVENTIONS.md section 3.2
- Migration tested locally with `supabase db reset`
```

#### `issues.md` — Problems and Resolutions

```markdown
# Issues: User Registration (US-001)

## Issue 1: Supabase RLS policy blocked registration
- **Problem:** INSERT on users table was blocked by default RLS policy
- **Root cause:** No policy for unauthenticated inserts
- **Fix:** Added `allow_registration` policy: `CREATE POLICY allow_registration ON users FOR INSERT WITH CHECK (true)`
- **Time spent:** ~15 min

## Issue 2: bcrypt import error in Edge runtime
- **Problem:** `bcrypt` uses native bindings, fails in Vercel Edge
- **Fix:** Switched to `bcryptjs` (pure JS implementation) for Edge compatibility
- **Time spent:** ~10 min
```

#### `decisions.md` — Cross-Cutting Decisions (Session Root)

This file lives at the session root (not per-chunk) and captures decisions that affect multiple chunks. It's always loaded when starting a new chunk along with `session.json`.

```markdown
# Cross-Cutting Decisions

## Auth Pattern
Using Supabase Auth with custom JWT claims. All auth routes go through `src/api/auth.ts`. Session stored in httpOnly cookie.

## Password Hashing  
bcryptjs (not bcrypt) — Edge runtime compatible. Cost factor: 12.

## Form Pattern
react-hook-form + zod validation. Error messages from API mapped to field-level errors.

## Database Naming
Snake_case for columns, camelCase for TypeScript types. Mapping via Supabase codegen.
```

### Lean Execution Mode

Builder adopts these behaviors **automatically** from session start:

#### Between Chunks (Story/Task Transitions)

1. **Finalize current chunk** — Write `changes.md`, `issues.md`, update `chunk.json` with final status, tests, commit info
2. **Update `session.json`** — Set chunk status to `completed`, write `summary` (1-2 sentences), advance `currentChunk` to next pending chunk
3. **Update `decisions.md`** — If any cross-cutting decisions were made during this chunk, append them
4. **Commit** — Session log updates are included in the story commit: `git add -A && git commit` (code + session log together)
5. **Shed context** — The completed chunk's details exist only on disk. Builder's working context now contains only `session.json` (with summaries) + `decisions.md`
6. **Load next chunk** — Read next chunk's acceptance criteria from PRD, create `plan.md`, begin work

#### On Session Completion

When all chunks are completed (or the session is explicitly closed):

1. **Update `session.json`** — Set `status: "completed"`, clear `currentAction`
2. **Move session folder** — `mv docs/sessions/{session-id}/ docs/sessions/archive/{session-id}/`
3. **Update `builder-config.json`** — Clear `lastSessionPath` (no active session)
4. **Commit** — `git add -A && git commit -m "chore: Archive completed session {session-id}"`

**What Builder carries forward between chunks (always in memory):**
- `session.json` — the lean manifest with chunk summaries (~2-4KB)
- `decisions.md` — cross-cutting decisions (~1-3KB)
- Current chunk's `plan.md` — acceptance criteria and approach (~1-2KB)
- **Total carry-forward: ~5-9KB (~1.5-2.5K tokens)** — negligible

#### Within a Chunk

- Work normally (read files, write code, run tests, delegate to specialists)
- Update `currentAction` in `session.json` on every tool call (overwrite — always latest state)
- Append to `log.jsonl` on every significant tool call (cheap append-only write)
- No special context management needed — a single story rarely exceeds context limits
- If the chunk is unusually large, write `changes.md` incrementally

#### On Compaction Recovery

This is where the unified state model shines. Recovery is now trivial:

1. **Read `session.json`** (~2-4KB) → get full session picture including all chunk summaries
2. **Read `currentAction`** → know exactly what was being done
3. **Read current chunk's `plan.md`** → know what needs to be accomplished
4. **Read current chunk's `changes.md`** (if exists) → know what's been done so far in this chunk
5. **Read `decisions.md`** → know cross-cutting decisions
6. **Re-derive right-panel todos** from `session.json` → `chunks[]`
7. **Resume work** — all context reconstructed from ~5-10KB of targeted reads

**Comparison with current reactive recovery:**

| Aspect | Current (`builder-state.json`) | New (Session Log) |
|--------|-------------------------------|-------------------|
| Files to read | 1 large file (2-10KB, growing) | 3-5 small targeted files (~5-10KB total) |
| Information quality | Lossy (truncated checkpoints) | Full detail (unlimited markdown) |
| Context about completed work | Story IDs + status only | Full summaries in `session.json`, detail on disk |
| Recovery accuracy | Moderate — often re-reads files unnecessarily | High — knows exactly what was done and what remains |
| Time to recover | 1-3 minutes (re-reads, re-orients) | <30 seconds (targeted reads) |

### Git Strategy: Sessions Are Committed

Session logs are **committed to git**, not gitignored. This enables:

1. **Cross-machine continuity** — Start a session on one computer, pull on another, resume seamlessly
2. **Development history** — Look back at how any feature was built, what decisions were made, what problems were hit
3. **Audit trail** — `log.jsonl` provides a complete record of every action taken

**Commit strategy:** Session log updates are included in the story commit. Each commit contains both the code changes AND the session log for that chunk. This keeps git history clean — one commit per story with full context. When the session completes, the session folder is moved to `docs/sessions/archive/` in a final housekeeping commit.

```
commit a1b2c3d — feat(auth): implement user registration with email verification
  src/components/RegisterForm.tsx        ← code
  src/api/auth.ts                        ← code
  src/db/migrations/001_users.sql        ← code
  docs/sessions/2026-03-08-a1b2c3/       ← session log
    session.json                          ← updated manifest
    decisions.md                          ← cross-cutting decisions
    chunks/US-001-01-user-registration/   ← this chunk's full log
      chunk.json
      plan.md
      changes.md
      issues.md
      log.jsonl
```

**What stays gitignored:**
- `docs/builder-config.json` — machine-specific (CLI auth state, cached project context)

### Relationship to UI Todos

The right-panel todo list is derived from `session.json` → `chunks[]`:

| Chunk status | Todo status |
|--------------|-------------|
| `pending` | `pending` |
| `in_progress` | `in_progress` |
| `completed` | `completed` |
| `failed` | Shows as failed, user chooses retry/skip |
| `skipped` | `cancelled` |

On session resume or compaction recovery, Builder reads `session.json` and **re-derives** the right-panel todos from `chunks[]`. No separate `uiTodos` persistence needed — the session manifest IS the todo list.

### Relationship to Analysis Gate

The `analysisCompleted` checkpoint (currently `activeWork.analysisCompleted` in `builder-state.json`) moves to `session.json` as a top-level field. It works exactly the same way:

1. Set to `false` on session start
2. Set to `true` when user approves analysis with `[G]`
3. Checked before every `@developer` delegation
4. Survives compaction because it's in `session.json` on disk

### Relationship to Verification State

Currently, `verificationContract` and `verificationResults` are top-level fields in `builder-state.json` that must be explicitly reset at every task boundary (a source of bugs). In the session log model:

- Verification state lives in `chunk.json` → `verification`
- Each chunk has its own verification — **no cross-chunk contamination by design**
- No explicit reset needed — starting a new chunk means starting with a fresh `chunk.json`

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| User interventions for context management | 2-4 per PRD session | 0 |
| Context compaction frequency | Every 2-3 stories | Rare (only within large stories) |
| Recovery time after compaction | 1-3 minutes | <30 seconds |
| Information loss after compaction | Moderate (lossy checkpoints) | None (full log on disk) |
| Session history availability | None after session ends | Full persistent record in git |
| Verification state leaking across stories | Occasional (reset bugs) | Impossible (isolated by design) |
| Cross-machine session resume | Not possible | Supported via git pull |

---

## User Stories

### US-001: Design and implement session log file structure

**As** a Builder session  
**I want** a structured file system that captures all session state and work history  
**So that** state is organized by chunk, detail is unlimited, and context shedding is possible

**Acceptance Criteria:**
- [ ] Session folder created at `docs/sessions/{date}-{short-id}/` when Builder starts work
- [ ] `session.json` manifest created with session identity, mode, source, branch, chunks array
- [ ] Every chunk entry in `session.json` includes a `summary` field (1-2 sentences, filled on completion) that is always loaded into memory
- [ ] `session.json` includes `currentAction` object (replaces `currentTask`) updated on every tool call
- [ ] Each chunk gets its own folder under `chunks/` with naming `{storyId}-{NN}-{slug}/`
- [ ] `chunk.json` captures: status, timing, files modified, test results, verification contract/results, commit info, uncommitted state
- [ ] `plan.md` written at chunk start with acceptance criteria and planned approach
- [ ] `changes.md` written at chunk completion (or incrementally for large chunks) with files modified, key decisions, implementation notes
- [ ] `issues.md` written when problems are encountered (optional — only created if issues exist)
- [ ] `log.jsonl` append-only action log: every significant tool call appended as one JSON line with `ts`, `action`, `target`, `note`
- [ ] `decisions.md` at session root captures cross-cutting decisions that span chunks
- [ ] `session.json` stays under 5KB regardless of number of chunks
- [ ] Session log files committed to git alongside code changes (not gitignored)
- [ ] Schema files created: `schemas/session.schema.json`, `schemas/chunk.schema.json`

### US-002: Replace `builder-state.json` with session log + `builder-config.json`

**As** the Builder agent system  
**I want** the session log to be the single source of truth for session state  
**So that** there's one state system instead of two, and the state naturally supports context shedding

**This is a clean cut — no transition period.** `builder-state.json` is fully replaced.

**Acceptance Criteria:**
- [ ] New `builder-config.json` file handles machine-specific cross-session data: `availableCLIs`, `projectContext`, `lastSessionPath`
- [ ] `builder-config.json` added to `.gitignore` (machine-specific data)
- [ ] `builder-config.json` schema file created (slim — only the fields listed above)
- [ ] All `builder-state.json` reads in `builder.md` migrated to session log reads
- [ ] All `builder-state.json` writes in `builder.md` migrated to session log writes
- [ ] All `builder-state.json` references in skills migrated: `builder-state` skill, `prd-workflow`, `adhoc-workflow`, `test-flow`, `test-verification-loop`, `test-failure-handling`, `test-prerequisite-detection`, `test-ui-verification`, `builder-verification`, `builder-delegation`, `builder-dashboard`, `dynamic-reassignment`
- [ ] All `builder-state.json` references in `developer.md` migrated
- [ ] `builder-state.schema.json` removed (replaced by `session.schema.json` + `builder-config.schema.json`)
- [ ] `builder-state` skill rewritten as `session-log` skill with new read/write patterns
- [ ] Analysis gate checkpoint (`analysisCompleted`) works from `session.json`
- [ ] Verification state isolation works (each chunk has own verification in `chunk.json` — no cross-chunk leakage, no manual reset needed)
- [ ] UI todos derived from `session.json` → `chunks[]` on resume (no separate `uiTodos` field)
- [ ] Heartbeat updated in `session.json` → `lastHeartbeat`
- [ ] Session resume protocol works from `session.json` (reset `in_progress` chunks to `pending`, handle `failed` chunks)
- [ ] Commit ordering rule updated: finalize chunk files → update `session.json` → `git add -A && git commit`

### US-003: Implement automatic lean execution mode

**As** a Builder agent  
**I want** to automatically work in chunked mode from session start  
**So that** I don't accumulate context until compaction forces a reset

**Acceptance Criteria:**
- [ ] PRD work: Builder processes one story at a time as an independent chunk
- [ ] Ad-hoc work: Builder groups tasks into logical chunks (pseudo-stories) before starting
- [ ] Between chunks: Builder writes session log, commits (code + session log together), and sheds completed work context
- [ ] Builder carries forward only: `session.json` (~2-4KB), `decisions.md` (~1-3KB), current chunk's `plan.md` (~1-2KB)
- [ ] No user prompt required to activate chunked behavior — it's the default mode
- [ ] Builder logs a brief one-line transition message: "✅ US-001 complete. Starting US-002: [title]"
- [ ] When loading next chunk, Builder reads only the carry-forward files + relevant source files for the new chunk
- [ ] Chunk summaries in `session.json` are descriptive enough that Builder understands what was done without reading the chunk folder
- [ ] Single-task ad-hoc requests work as a single chunk (no unnecessary overhead)
- [ ] For multi-task ad-hoc, Builder shows grouping: "I'll work through these in N chunks: [list]" — user can override

### US-004: Implement unified compaction recovery

**As** a Builder agent recovering from context compaction  
**I want** to recover seamlessly using the session log  
**So that** compaction is invisible to the user and no information is lost

**Acceptance Criteria:**
- [ ] On compaction recovery, Builder reads `session.json` → full session picture with chunk summaries
- [ ] Builder reads `currentAction` from `session.json` for immediate orientation
- [ ] Builder reads current chunk's `plan.md` and `changes.md` (if exists) for work context
- [ ] Builder reads `decisions.md` for cross-cutting decisions
- [ ] Builder re-derives right-panel todos from `session.json` → `chunks[]`
- [ ] Recovery message is brief: "Resuming: [currentAction.description] (chunk: [title])"
- [ ] Recovery does NOT re-read completed chunk folders — summaries in `session.json` suffice
- [ ] Recovery completes in <30 seconds (3-5 targeted file reads)
- [ ] Session discovery: check `builder-config.json` → `lastSessionPath` first; fallback to scanning `docs/sessions/` (excludes `archive/`) for any `session.json` with `status: "in_progress"`

### US-005: Session log git integration and management

**As** a project maintainer  
**I want** session logs committed to git and manageable across machines  
**So that** I can resume sessions on any computer and have a development history

**Acceptance Criteria:**
- [ ] `docs/sessions/` is committed to git (NOT gitignored)
- [ ] `docs/builder-config.json` IS gitignored (machine-specific)
- [ ] Session log updates included in story commits (one commit = code + session log for that chunk)
- [ ] Session discovery on startup: read `builder-config.json` → `lastSessionPath`, scan `docs/sessions/` for `status: "in_progress"` as fallback (excludes `archive/`)
- [ ] Completed sessions moved to `docs/sessions/archive/` after session ends (all chunks completed or session explicitly closed)
- [ ] Archive is automatic: Builder moves the session folder on session completion (final chunk committed)
- [ ] Active session list (`docs/sessions/` top level) stays short — only in-progress or recently failed sessions
- [ ] Session folders are self-contained (can be deleted individually from archive if user wants to clean up)
- [ ] Cross-machine resume works: pull on new machine → Builder finds in-progress session → offers resume

---

## Technical Considerations

### File I/O Overhead

Writing `changes.md`, `issues.md`, `log.jsonl`, etc. adds I/O. Estimated overhead:
- `currentAction` update (every tool call): single `session.json` rewrite (~2-4KB)
- `log.jsonl` append (every tool call): single line append (~100-200 bytes)
- Chunk transition: 3-5 file writes (~2-5 seconds)

The per-tool-call I/O (`session.json` rewrite + `log.jsonl` append) is the main new cost. This is ~2 file operations per tool call. Given that tool calls already involve reading/writing project files, this is marginal overhead.

**Mitigation:** If `session.json` rewrites prove costly, `currentAction` could be moved to a separate small file (e.g., `current.json`) that's only read during recovery.

### Chunk Size Estimation

A single story/chunk should comfortably fit in context:
- Story acceptance criteria: ~1-2KB
- Source files being modified: ~10-50KB (read selectively)
- Test output: ~2-10KB
- Total per chunk: ~20-70KB (~5-17K tokens)

With reasonable startup overhead, a chunk uses ~30-50K tokens total, well under the 128K limit.

### Session Log vs. Git History

Session logs capture **intent, decisions, and problems** — things not in git diffs:
- Why a particular approach was chosen
- What problems were hit and how they were resolved
- Which tests failed initially and what was fixed
- The planned approach before implementation started
- A complete action log of every tool call

Git diffs capture the final code. Session logs capture the journey.

### Migration from `builder-state.json`

Clean cut — no transition period:

1. All agent/skill references updated to use session log
2. `builder-state.json` file is no longer read or written
3. `builder-state.schema.json` is removed
4. `builder-state` skill is replaced by `session-log` skill
5. If a project still has a `builder-state.json` file, it's ignored (can be manually deleted)

### Ad-hoc Pseudo-Story Grouping

For ad-hoc multi-task requests, Builder groups tasks by:
1. **Related files** — tasks touching the same files go together
2. **Dependency** — tasks that depend on each other go in order
3. **Logical domain** — tasks in the same feature area group together
4. **Default** — if no clear grouping, each task is its own chunk

### Commit Ordering

The existing rule "update state files BEFORE committing" still applies. The new equivalent:
1. Update `chunk.json` with final status, test results, verification results
2. Write `changes.md` with implementation details
3. Write `issues.md` if problems were encountered
4. Update `session.json` with chunk summary, advance `currentChunk`
5. Then `git add -A && git commit` (code + session log in one commit)

### Verification State Isolation

This is a significant improvement over the current system. Currently, `verificationContract` and `verificationResults` are top-level fields that must be manually reset at every task boundary — and forgetting to reset causes verification to be skipped for the next task.

In the session log model, verification lives inside `chunk.json`. Each chunk starts with a fresh `chunk.json` → no state to reset → no cross-contamination bugs.

### `log.jsonl` Size Management

For a typical story (30-60 tool calls), `log.jsonl` will be ~5-15KB. For a complex story with many retries, it could reach ~30-50KB. This is acceptable for committed files — comparable to a medium source file.

If a session has 5 stories, the total `log.jsonl` across all chunks is ~25-75KB — a small fraction of a typical git repo.

---

## Out of Scope

- Changes to OpenCode's compaction algorithm (external dependency)
- Reducing model context window size (fixed by provider)
- Session log visualization/UI (future enhancement)
- Sharing session logs between agents within a session (future enhancement)
- Real-time `log.jsonl` streaming/tailing (future enhancement)

---

## Dependencies

- **`prd-compaction-resilience`** (COMPLETED) — This PRD supersedes the reactive-only recovery system with a unified proactive+reactive approach. The reactive recovery becomes trivial when the session log exists.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration from `builder-state.json` introduces bugs | High — many references across agents and skills | Comprehensive story (US-002) with grep-verified migration list |
| Per-tool-call I/O overhead (`session.json` + `log.jsonl`) | Low-Medium — 2 file ops per tool call | Monitor; can split `currentAction` to separate file if needed |
| Session logs add git repo size | Low — ~50-200KB per session | Acceptable; comparable to source files. Users can delete old sessions. |
| Builder forgets to write session log | Medium — loses the benefit | Make log writing part of chunk transition protocol (mandatory, not optional) |
| Pseudo-story grouping is wrong for ad-hoc | Low — user can override | Show grouping before starting, allow adjustments |
| Context shedding too aggressive | Medium — might drop needed info | Carry forward `decisions.md` + summaries; can always read chunk folders |
| Skills with hardcoded `builder-state.json` references missed | High — broken behavior | Grep-verified migration list in US-002 covers all 14+ files |

---

## Timeline Estimate

| Story | Estimate |
|-------|----------|
| US-001 (Session log structure + schemas) | 2-3 hours |
| US-002 (Replace builder-state.json — clean cut) | 4-6 hours |
| US-003 (Lean execution mode) | 3-4 hours |
| US-004 (Unified compaction recovery) | 1-2 hours |
| US-005 (Git integration and management) | 1-2 hours |
| **Total** | **11-17 hours** |

---

## Credential & Service Access Plan

No external credentials required for this PRD. All changes are to local file I/O and agent behavior.
