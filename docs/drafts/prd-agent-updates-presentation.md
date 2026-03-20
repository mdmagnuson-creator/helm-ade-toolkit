# Agent & Toolkit Updates for Helm Task Management

## Presentation Outline

**Audience:** Dev Manager, PM, QA Tester
**Companion PRD:** `prd-task-management` (macOS app — 46 stories, already reviewed)
**This PRD:** 19 stories across 3 phases

---

## 1. WHY THIS PRD EXISTS

The toolkit currently assumes it runs standalone — it manages its own files,
sessions, and git workflow. Helm now handles all of that natively: sessions,
tasks, merge, working trees.

This PRD removes the redundant local systems and wires the agents into Helm's
infrastructure. It's the companion to the macOS PRD (46 stories) — that one
builds the Helm-side infrastructure, this one updates the agents to use it.

```
┌──────────────────────────────────────────────────────────────┐
│                      BEFORE (Current)                        │
│                                                              │
│  Builder ──writes──► docs/tasks/task-spec.md                 │
│  Builder ──writes──► docs/sessions/session.json              │
│  Builder ──writes──► chunk.json                              │
│  Builder ──runs───► git commit → push → PR → merge           │
│  Planner ──writes──► docs/prd-registry.json                  │
│  Planner ──writes──► docs/tasks/promotions/                  │
│                                                              │
│  Everything is local files. Agents ship their own code.      │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                      AFTER (This PRD)                        │
│                                                              │
│  Builder ──calls──► helm_task_create      (Supabase)         │
│  Builder ──calls──► helm_task_update      (Supabase)         │
│  Builder ──calls──► helm_merge_branch     (Helm controls)    │
│  QA Agent ──calls──► helm_task_add_activity (Supabase)       │
│  Planner ──calls──► helm_prd_get / helm_task_bulk_create     │
│                                                              │
│  All state in Supabase. Helm manages git. Agents focus       │
│  on the work, not the plumbing.                              │
└──────────────────────────────────────────────────────────────┘
```

**Key message:** Agents stop being file-system janitors and start being
purpose-built assistants that talk to Helm through structured tool calls.

---

## 2. WHAT'S BEING REMOVED (The Cleanup)

### 11 files deleted entirely

| Type     | File                       | Why It Goes                                          |
|----------|----------------------------|------------------------------------------------------|
| Agent    | `session-status.md`        | Dashboard → Helm native UI                           |
| Agent    | `overlord.md`              | External ticket routing → Helm feature               |
| Skill    | `task-promotion/`          | Local promotion → `helm_prd_create` tool             |
| Skill    | `session-log/`             | Local session files → Supabase                       |
| Skill    | `session-setup/`           | `session-locks.json` → Helm lifecycle                |
| Skill    | `builder-dashboard/`       | Startup dashboard → Helm native UI                   |
| Skill    | `multi-session/`           | Shared branch coordination → per-session branches    |
| Template | `task-spec.md`             | Local Task Spec → `helm_task_create`                 |
| Template | `task-promotion.md`        | Local promotion doc → `helm_prd_create`              |
| Schema   | `session.schema.json`      | Local session state → Supabase                       |
| Schema   | `task-registry.schema.json`| Local task registry → Supabase                       |

### Also removed from AGENTS.md

The **Git Completion Workflow** — the 7-step push/PR/merge pipeline that agents
currently follow to ship code — is removed entirely. Helm manages session
completion and merge. The `git.autoCommit` enforcement stays (agents still
commit during work), and `git.agentWorkflow` validation stays (Helm uses it too).

### Blast radius

```
┌─────────────────────────────────────────────────────────┐
│               202 TOTAL TOOLKIT ITEMS                    │
│                                                          │
│   ██████████████████████████████████░░░░░░░  163 stay    │
│   ░░░░░░                                     30 updated  │
│   ░░                                          9 deleted  │
│                                                          │
│   163 items stay exactly as-is (81%)                     │
│    30 items get targeted updates (15%)                   │
│     9 items are deleted (4%)                             │
└─────────────────────────────────────────────────────────┘
```

This is targeted surgery, not a rewrite of everything.

---

## 3. THE THREE AGENTS

Helm creates sessions with a mode — `build`, `qa`, or `plan` — and that mode
determines which agent prompt loads.

```
┌──────────────────────────────────────────────────────────────────┐
│                       SESSION MODES                              │
│                                                                  │
│   Helm creates session with mode:  build  |  qa  |  plan        │
│   Mode selects which agent prompt loads                          │
│                                                                  │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│   │   BUILDER    │   │   QA AGENT   │   │   PLANNER    │        │
│   │   (build)    │   │    (qa)      │   │   (plan)     │        │
│   │              │   │              │   │              │        │
│   │ Implements   │   │ Verifies     │   │ Scopes &     │        │
│   │ Delegates    │   │ Pass/Fail    │   │ Plans        │        │
│   │ Auto-creates │   │ Fix or       │   │ PRD-to-      │        │
│   │ tasks        │   │ handoff      │   │ tasks        │        │
│   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘        │
│          │                  │                   │                │
│          └──────────────────┴───────────────────┘                │
│                             │                                    │
│                      All use helm-bridge                         │
│                      tools for task state                        │
└──────────────────────────────────────────────────────────────────┘
```

### Builder (the developer's agent)

- Works on tasks — reads injected context, delegates to `@developer` → specialists
- **Ad-hoc mode:** Auto-creates tasks as it works (land at `agent_build_complete`)
- **PRD mode:** Processes stories in order, tracks progress via Supabase
- Writes testing notes directly to tasks during the session
- Handles session completion/merge conversationally OR via Helm UI button

### QA Agent (the tester's agent — NEW file: `helm-qa.md`)

- Presents test steps from Builder's testing notes + acceptance criteria
- Tracks pass/fail/warning per step
- On failure: fix now (delegates to `@developer` in-session) or send to developer (`fix_required`)
- Signals pass → Helm handles branch-scoped merge
- **NOT** the existing `qa.md` or `tester.md` — those are untouched

### Planner (the product owner's agent)

- Scopes individual tasks conversationally
- Generates tasks from PRDs interactively (user reviews/approves each)
- Uses helm-bridge tools for all task state
- Legacy local file management (registries, promotions, dashboards) removed

### Delegation chain (unchanged)

```
  Builder / QA Agent
       │
       ▼
  @developer  ◄── orchestrates implementation
       │
       ├──► @react-dev      (React/TypeScript)
       ├──► @swift-dev      (Swift/SwiftUI)
       ├──► @go-dev         (Go)
       ├──► @python-dev     (Python)
       ├──► @java-dev       (Java/Netty)
       ├──► @aws-dev        (CloudFormation)
       ├──► @docker-dev     (Docker)
       ├──► @terraform-dev  (Terraform)
       └──► @public-page-dev (Marketing/legal pages)
              │
              ▼
         @critic  ◄── reviews the work
```

The entire specialist ecosystem (57 agents) is untouched.

---

## 4. SESSION COMPLETION FLOW

This is the biggest architectural change — how work gets from "done" to "merged."

```
  Developer working in Builder session
                 │
                 ▼
  ┌──────────────────────────────────┐
  │   Builder finishes work           │
  │   → writes testing notes          │
  │   → sets agent_build_complete     │
  └──────────────┬───────────────────┘
                 │
                 ▼
  ┌──────────────────────────────────┐
  │   Developer reviews work          │
  │   (code review in Helm UI)        │
  │   → promotes to dev_testing       │
  │   → promotes to ready_for_test    │
  └──────────────┬───────────────────┘
                 │
        ┌────────┴─────────┐
        ▼                  ▼
  ┌────────────┐    ┌─────────────┐
  │  Test it   │    │  Merge it   │
  │  first     │    │  now        │
  └─────┬──────┘    └──────┬──────┘
        │                  │
        ▼                  │
  ┌────────────┐           │
  │ QA session │           │
  │ on branch  │           │
  │ pass/fail  │           │
  └─────┬──────┘           │
        │                  │
        └────────┬─────────┘
                 ▼
  ┌──────────────────────────────────┐
  │   Merge to target branch          │
  │   (via helm_merge_branch)         │
  │                                    │
  │   TWO WAYS TO TRIGGER:            │
  │   • "Complete this Session"       │
  │     button in Helm UI             │
  │   • Ask Builder: "merge this      │
  │     to main"                      │
  └──────────────┬───────────────────┘
                 │
        ┌────────┴─────────┐
        ▼                  ▼
  ┌────────────┐    ┌─────────────┐
  │  Clean     │    │  Conflicts  │
  │  merge     │    │  detected   │
  └─────┬──────┘    └──────┬──────┘
        │                  │
        │                  ▼
        │           ┌─────────────┐
        │           │  Same       │
        │           │  Builder    │
        │           │  session    │
        │           │  resolves   │
        │           │  conflicts  │
        │           │  (has full  │
        │           │  context)   │
        │           └──────┬──────┘
        │                  │
        │          ┌───────┴───────┐
        │          ▼               ▼
        │    ┌──────────┐   ┌───────────┐
        │    │ Re-merge │   │ Can't     │
        │    │ succeeds │   │ resolve → │
        │    │          │   │ fix_req'd │
        │    └────┬─────┘   │ (merge_   │
        │         │         │ conflict) │
        │         │         └───────────┘
        └────────┬┘
                 ▼
  ┌──────────────────────────────────┐
  │   Session → completed             │
  │   (read-only, viewable)           │
  │                                    │
  │   OR if destroyed:                │
  │   Session → abandoned             │
  │   (same storage, diff status)     │
  └──────────────────────────────────┘
```

### Key points for the team

- **Helm controls git** — agents never run `git push`, `git merge`, `gh pr create`,
  or `gh pr merge` directly. All git operations go through `helm_merge_branch`.
- **Target branch comes from project settings** (`git.agentWorkflow.createPrTo`),
  not hardcoded or asked for.
- **Dual-path trigger** — developer can click the UI button OR ask Builder
  conversationally. Both paths execute the same underlying flow.
- **Same-session conflict resolution** — if merge conflicts arise, Helm routes
  the conflict context back into the **same Builder session** that produced the work.
  That session has full context, so it resolves conflicts automatically. The PM
  sees "I found conflicts, fixing them now..." — the developer can interject to
  review first. If Builder can't resolve after retries, task escalates to
  `fix_required` with `reason: merge_conflict`.
- **Destroyed sessions ≠ deleted** — they're stored as `abandoned` status (same
  storage as completed sessions, different status field).

### Task status flow

```
  ┌─────────────────┐
  │     planned      │  ◄── task created by Planner or manually
  └────────┬────────┘
           ▼
  ┌─────────────────┐
  │   in_progress    │  ◄── Builder session starts working on it
  └────────┬────────┘
           ▼
  ┌─────────────────────────┐
  │  agent_build_complete    │  ◄── Builder finishes (automated status)
  └────────┬────────────────┘
           ▼
  ┌─────────────────┐
  │   dev_testing    │  ◄── developer reviewing (manual promotion)
  └────────┬────────┘
           ▼
  ┌──────────────────┐
  │  ready_for_test   │  ◄── developer confirms ready (manual promotion)
  └────────┬─────────┘
           ▼
  ┌─────────────────┐
  │    testing       │  ◄── QA session active
  └────────┬────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
  ┌───────┐  ┌──────────────┐
  │ pass  │  │ fix_required │  ◄── back to developer
  └───┬───┘  └──────────────┘
      ▼
  ┌─────────────────┐
  │    merged        │  ◄── branch merged to target
  └─────────────────┘
```

**Note for QA tester:** The QA agent records "test passed" but does NOT directly
merge. Helm enforces that all tasks on a branch must pass before the branch can
merge. This prevents partial merges.

---

## 5. VERIFICATION STATE (chunk.json → Supabase)

19 skills currently read/write local `chunk.json` files for tracking:
test results, fix loop counts, critic dispatch records, reassignment history.

All of this moves to Supabase via helm-bridge tools, with a **local-memory-first**
pattern to avoid latency issues.

```
  Agent working on a story
         │
         ├──read──► Local memory (fast, zero latency)
         │
         ├──write─► Local memory (instant)
         │              │
         │              ├──sync──► Supabase (on key transitions)
         │              │           • story complete
         │              │           • fix loop iteration
         │              │           • session pause/complete
         │              │           • periodic background sync
         │
  Session crash or restart
         │
         └──recover──► Load from Supabase → local memory
```

### Why local-memory-first?

During active work, agents read/write verification state hundreds of times.
A Supabase round-trip on each would add noticeable latency. The hybrid approach:

- **Fast reads/writes** during active work (local memory)
- **Durable storage** for recovery (Supabase)
- **Sync on transitions** — when something meaningful happens, state is persisted

### What if sync fails?

If a Supabase sync fails mid-session, the agent retries. If the session crashes
before a sync, the worst case is losing state since the last successful sync
(typically one story's worth of progress). The agent can re-run quality checks
on resume — this is acceptable because quality checks are idempotent.

---

## 6. STORY MAP (19 stories, 3 phases)

```
PHASE 1: LEGACY REMOVAL & INFRASTRUCTURE
│
├── US-001  AGENTS.md modernization
│           Remove Git Completion Workflow section.
│           Keep autoCommit enforcement and workflow validation.
│
├── US-002  Delete 11 legacy files
│           2 agents, 5 skills, 2 templates, 2 schemas.
│           Pure deletions — no logic changes.
│
├── US-003  Verification state migration
│           Define the local-memory + Supabase sync pattern.
│           Update chunk.schema.json as documentation.
│           Define API contract: helm_session_get/set_state.
│
└── US-004  Minor reference cleanup
            ~19 skills + 5 agents have stale local file paths.
            Update to Supabase-backed pattern. Core logic unchanged.


PHASE 2: AGENT REWRITES
│
├── US-005  Builder agent rewrite
│           Remove legacy file refs, add helm-bridge tools.
│           Preserve: identity lock, delegation chain, lean execution.
│
├── US-006  Builder ad-hoc task auto-creation
│           Auto-create tasks via helm_task_create when working
│           without pre-existing task context. Land at agent_build_complete.
│
├── US-007  Builder task-aware sessions
│           Read injected task context. Use helm_task_get.
│           Derive work plan from acceptance criteria.
│
├── US-008  Builder completion flow
│           Write testing notes to task. Run optional automated tests.
│           Transition to agent_build_complete.
│
├── US-009  Builder session completion & merge
│           Dual-path: UI button or conversational.
│           Merge via helm_merge_branch. Conflict resolution in chat.
│
├── US-010  Ad-hoc workflow skill rewrite
│           Currently 1812 lines → much smaller.
│           Remove Task Spec files, analysis gate, local archival.
│           Keep quality checks, scope growth warning, design decisions.
│
├── US-011  PRD workflow skill rewrite
│           Currently 955 lines → much smaller.
│           Remove local session/chunk files, local archive, Ship flow.
│           Keep story processing, quality checks, critic dispatch.
│
└── US-012  Developer agent updates
            Remove docs/prd.json, docs/progress.txt, docs/sessions/ refs.
            Preserve specialist routing and quality requirements.


PHASE 3: QA AGENT & PLANNER
│
├── US-013  QA agent prompt (NEW: helm-qa.md)
│           Present test steps. Track pass/fail/warning.
│           Distinct personality from Builder.
│
├── US-014  QA agent fix delegation
│           Fix now (delegate to @developer) or send to developer.
│           All fix attempts recorded in activity log.
│
├── US-015  QA agent test completion
│           Record "test passed." Do NOT directly merge.
│           Helm enforces all-tasks-pass-before-merge.
│
├── US-016  Planner legacy cleanup
│           Remove project selection, dashboards, promotion pickup,
│           local registries, team sync. Preserve PRD workflows.
│
├── US-017  Planner task scoping via Helm
│           Scope tasks conversationally. Write to scope_markdown.
│           Can create sub-tasks via helm_task_bulk_create.
│
├── US-018  PRD-to-tasks generation via Planner session
│           Generate tasks from PRDs interactively.
│           User reviews/approves each proposed task.
│
└── US-019  Planner task tools usage
            Full helm-bridge tool usage for all task state.
            File-based PRD management still available for project PRDs.
```

### Phase dependencies

```
  Phase 1 ──────────────────────► must complete first
     │                             (infrastructure for everything else)
     │
     ├──► Phase 2 (Builder)  ──► can start after Phase 1
     │
     └──► Phase 3 (QA/Planner) ──► can start after Phase 1
                                    (partially overlaps with Phase 2)

  Exception: US-009 (merge flow) is cross-cutting —
  touches Builder behavior but depends on Helm-side
  merge infrastructure from the macOS PRD.
```

---

## 7. WHAT DOESN'T CHANGE

Worth calling out explicitly — the team should know the blast radius is contained.

| Category | Count | Status |
|----------|-------|--------|
| Specialist agents (react-dev, swift-dev, go-dev, etc.) | 57 | Untouched |
| Skills (test-flow, builder-verification, etc.) | 42 | Untouched |
| Data files | 10 | Untouched |
| Scripts | 6 | Untouched |
| Scaffolds | 3 | Untouched |
| Automations | 4 | Untouched |
| Agent templates | all | Untouched |
| Project templates | all | Untouched |
| Root config files | all | Untouched |

### Specifically preserved behaviors

- **Existing `qa.md`** (QA coordinator for exploratory testing) — untouched
- **Existing `tester.md`** (test orchestration/routing, 193 toolkit references) — untouched
- **Builder's delegation chain** (Builder → `@developer` → specialists → `@critic`) — preserved
- **Quality checks** (test-flow, verification loops, critic routing) — logic preserved, only storage refs updated
- **Specialist routing** (`@developer` routes to `@react-dev`, `@swift-dev`, etc.) — unchanged
- **All critic agents** (frontend-critic, backend-critic, security-critic, etc.) — unchanged

---

## 8. RELATIONSHIP TO macOS PRD

```
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│       macOS PRD (46 stories)      │     │     Toolkit PRD (19 stories)      │
│                                    │     │                                    │
│  Task data model (Supabase)       │◄───►│  Agents read/write tasks          │
│  Task UI (detail, list, board)    │     │  via helm-bridge tools             │
│                                    │     │                                    │
│  Plugin hooks (context            │────►│  Agents consume injected          │
│    injection, auto-status)        │     │  context from hooks                │
│                                    │     │                                    │
│  Session completion UI            │◄───►│  Builder merge conversation       │
│    ("Complete this Session")      │     │  via helm_merge_branch             │
│                                    │     │                                    │
│  helm-bridge tools                │────►│  All three agents use tools        │
│  (task CRUD, merge, search)       │     │  (task_create, task_update, etc.)  │
│                                    │     │                                    │
│  QA launch flow                   │◄───►│  QA agent prompt behavior         │
│  (session mode = qa)              │     │  (test steps, pass/fail)           │
│                                    │     │                                    │
│  Notification system              │     │  (not in toolkit scope)            │
│                                    │     │                                    │
│  Embedding pipeline               │────►│  Agents use helm_search_context   │
│  (Phase 8)                        │     │  when available (best-effort)      │
└──────────────────────────────────┘     └──────────────────────────────────┘
```

**In one sentence:** The macOS PRD builds the infrastructure (Supabase tables,
helm-bridge tools, Helm UI). The toolkit PRD wires agents into that infrastructure.

### Key integration points

| macOS PRD Story | Toolkit PRD Story | Integration |
|-----------------|-------------------|-------------|
| US-026 (context injection hook) | US-005, US-007 | Task context injected into Builder's system prompt |
| US-008 (task status) | US-008 | Builder transitions to `agent_build_complete` |
| US-022 (test pass & merge) | US-015 | QA signals pass, Helm enforces branch-scoped merge |
| US-NEW-O (dynamic task linking) | US-007, US-019 | Multi-task sessions with live updates |
| US-NEW-Q (inspector tasks tab) | US-015 | Tester clicks task to pivot in QA session |
| helm-bridge tools (various) | US-005–019 | All agents use tools for state management |

---

## 9. RISKS & DISCUSSION POINTS

### For the Dev Manager

1. **Verification state latency** — The local-memory + Supabase sync is a hybrid.
   If sync fails mid-session and the session crashes, state since the last sync
   could be lost. Quality checks are idempotent (can be re-run), so this is
   acceptable. Worth monitoring sync reliability in production.

2. **Skill size reduction** — The ad-hoc workflow goes from 1,812 lines to much
   less. The PRD workflow goes from 955 lines. These are significant rewrites,
   not tweaks. The new versions should be dramatically simpler because the bulk
   of the current code is file-system management that's being removed.

3. **Phase dependencies** — Phase 1 must complete first. Phase 2 and 3 can
   partially overlap, but US-009 (merge flow) depends on Helm-side merge
   infrastructure from the macOS PRD being ready.

### For the PM

4. **Ad-hoc task auto-creation** — "Logical unit of work" is intentionally vague.
   Prompt engineering handles the decision of when to create a task. Could
   over-create or under-create tasks initially — tuning expected. All auto-created
   tasks land at `agent_build_complete` for developer review, so bad auto-creates
   are caught before going further.

5. **Planner task generation is conversational** — No "Generate Tasks" button.
   The PM opens a Planner session with a PRD and reviews proposed tasks
   interactively. This is slower than a button click but produces better results
   because the PM can modify, split, or reject tasks in real time.

### For the QA Tester

6. **QA agent is new** — `helm-qa.md` is a brand-new agent prompt. Testing
   workflows will need iteration. The agent presents test steps from Builder's
   testing notes and acceptance criteria — the quality of testing depends on
   Builder writing good testing notes (US-008).

7. **Fix delegation has two paths** — "Fix now" keeps the QA session alive and
   delegates to `@developer`. "Send to developer" ends the testing attempt,
   sets `fix_required`, and releases the task for a new Builder session. The
   tester chooses which path on each failure.

8. **QA agent signals pass but doesn't merge** — The QA agent records "test passed"
   as an activity entry. Helm enforces that all tasks on a branch must pass before
   the branch can merge. This is deliberate — no single task passing should trigger
   a merge of a multi-task branch.

### Cross-cutting

9. **Merge via conversation** — Builder orchestrates merge but Helm executes git.
   The handoff boundary needs clean error reporting when merges fail. If
   `helm_merge_branch` returns an error, Builder needs to present it clearly.

10. **No backward compatibility needed** — The toolkit has no non-Helm consumers.
    All changes assume Helm infrastructure is available. If someone tried to run
    these agents outside of Helm, they would fail immediately (no helm-bridge tools).

---

## 10. DEFINITION OF DONE (Summary)

The PRD is complete when:

| # | Condition | Stories |
|---|-----------|---------|
| 1 | Zero references to local file paths (`docs/tasks/`, `docs/sessions/`, `chunk.json`) remain in active files | US-001–004 |
| 2 | All 11 legacy files deleted with no remaining references | US-002 |
| 3 | Verification state uses local-memory + Supabase sync; all 19 referencing skills updated | US-003, US-004 |
| 4 | Builder rewritten: helm-bridge tools, task auto-creation, completion flow, merge orchestration | US-005–009 |
| 5 | Ad-hoc workflow skill rewritten (Task Spec files removed, quality checks preserved) | US-010 |
| 6 | PRD workflow skill rewritten (local session/chunk removed, story processing preserved) | US-011 |
| 7 | Developer agent updated (legacy refs removed, specialist routing preserved) | US-012 |
| 8 | QA agent exists (`helm-qa.md`) with testing personality, pass/fail, fix delegation | US-013–015 |
| 9 | Planner cleaned up (project selection, dashboards, promotions removed) | US-016 |
| 10 | Planner supports task scoping and PRD-to-tasks via helm-bridge tools | US-017–019 |
| 11 | All three agents use helm-bridge tools — task state managed through Supabase | All |
| 12 | Multi-task sessions work for all three agents | US-007, US-015, US-019 |
| 13 | Session completion is dual-path (UI button + conversational merge) | US-009 |
| 14 | Destroyed sessions stored as abandoned (same storage, different status) | US-009 |
| 15 | Existing agents preserved (`qa.md`, `tester.md`, 57 specialists, delegation chain) | All |

---

## APPENDIX: Quick Reference

### Helm-bridge tools used by agents

| Tool | Used By | Purpose |
|------|---------|---------|
| `helm_task_create` | Builder | Auto-create tasks in ad-hoc mode |
| `helm_task_get` | Builder, QA, Planner | Read task details |
| `helm_task_update` | Builder, QA, Planner | Update task fields, status, testing notes |
| `helm_task_list` | Planner | Find related existing tasks |
| `helm_task_bulk_create` | Planner | Create multiple tasks from PRD |
| `helm_task_add_comment` | Builder, Planner | Leave notes/decisions on tasks |
| `helm_task_add_activity` | Builder, QA | Record activity entries (test results, fixes) |
| `helm_prd_get` | Planner | Read PRD content |
| `helm_prd_create` | Planner | Create new PRDs |
| `helm_merge_branch` | Builder | Initiate merge to target branch |
| `helm_search_context` | Builder, QA, Planner | Semantic search of related work (best-effort) |
| `helm_session_get_state` | All (via skills) | Read verification state from Supabase |
| `helm_session_set_state` | All (via skills) | Write verification state to Supabase |

### Files affected summary

| Action | Count | Details |
|--------|-------|---------|
| Delete | 11 | 2 agents, 5 skills, 2 templates, 2 schemas |
| Major rewrite | 5 | builder.md, adhoc-workflow, prd-workflow, planner.md, AGENTS.md |
| Create new | 1 | helm-qa.md |
| Minor updates | 24 | 19 skills + 5 agents (ref cleanup only) |
| Unchanged | 163 | Everything else |
