# Agent & Toolkit Updates for Helm Task Management

## A Day-in-the-Life Walkthrough

**Audience:** Dev Manager, PM, QA Tester
**Companion PRD:** `prd-task-management` (macOS app — 46 stories, already reviewed)
**This PRD:** 19 stories across 3 phases

---

## 1. SETTING THE STAGE

Today, agents manage their own plumbing. They write local files, push branches,
create PRs, run merge scripts. They're part developer assistant, part file-system
janitor. This PRD strips out the janitor half and lets Helm handle it.

```
  BEFORE                                AFTER
  ──────                                ─────
  Builder writes Task Specs to disk     Builder calls helm_task_create
  Builder manages session files         Helm manages sessions in Supabase
  Builder runs git push → PR → merge    Builder asks Helm to merge
  Planner manages local registries      Planner uses helm-bridge tools
  No QA agent exists                    QA agent handles test sessions

  Agents own the plumbing               Helm owns the plumbing
  Agents focus on plumbing + work       Agents focus on work
```

**What's changing:** 9 files deleted, 30 files updated, 163 files untouched.
81% of the toolkit stays exactly as-is. This is targeted surgery.

---

## 2. A DAY IN THE LIFE: THE DEVELOPER

### Morning — Opening Helm

You open Helm and see your task board. Three tasks are in `planned`, one
is `in_progress` from yesterday's session. You click into a task called
"Add export to CSV for reports."

The task has a description, acceptance criteria, and scope notes that your
PM wrote during a Planner session last week. You click **"Start Session"**.

### Starting a Builder Session

Helm creates a working branch, spins up a session, and loads Builder.

Builder doesn't ask you to pick a project. It doesn't render a dashboard.
It doesn't check for stale sessions or scan lock files. Helm already did all
of that. Builder reads your task context — the description, acceptance criteria,
scope notes — and starts talking to you:

> "I can see this task needs a CSV export for the reports page. Based on the
> acceptance criteria, I'll need to add an export button, a backend endpoint
> that generates the CSV, and handle large datasets with streaming. Let me
> get started."

Builder delegates to `@developer`, who routes to `@react-dev` for the
frontend button and `@go-dev` for the backend endpoint. The delegation chain
is exactly the same as today — Builder → `@developer` → specialists → `@critic`.
None of the 57 specialist agents changed.

### While Builder Works

You can watch Builder work or step away. Builder does what it always does —
writes code through specialists, runs critics, iterates on feedback. The
difference is what it does with *state*:

| Today | After this PRD |
|-------|----------------|
| Writes progress to `chunk.json` on disk | Keeps progress in memory, syncs to Supabase on key transitions |
| Records design decisions in local Task Spec | Records design decisions as task comments via `helm_task_add_comment` |
| Creates local session files in `docs/sessions/` | Session state lives in Supabase — Helm manages it |

If Builder crashes or context compacts, it recovers from Supabase instead
of hoping local files survived. The quality checks, test-flow, critic
dispatch — all the logic stays identical. Only the storage changed.

### Builder Finishes the Work

Builder completes the export feature. Before it's done, it does two things
that didn't happen before:

1. **Writes testing notes** directly to the task via `helm_task_update`:

   > *Testing notes: Verify the Export button appears on `/reports`. Click it
   > with a small dataset (<100 rows) — CSV should download immediately. Test
   > with a large dataset (>10K rows) — should stream without timeout. Check
   > that column headers match the table headers. Edge case: empty dataset
   > should produce a CSV with headers only.*

2. **Sets the task to `agent_build_complete`** — an automated status that
   means "Builder is done, developer hasn't reviewed yet."

### You Review the Work

You're still in the session. You can see the code changes in Helm's native
code review panel. You read through the diff, check the testing notes.
Looks good.

You promote the task to `dev_testing` (you're going to run it yourself for
a quick check), then to `ready_for_test` (it's ready for QA).

### Session Completion — Two Ways to Merge

Now you want to get this onto the target branch. You have two options — both
do the same thing under the hood:

**Option A — Conversational:**

> **You:** "Merge this to main."
>
> **Builder:** "I'll merge your working branch to main now."
> *(Builder calls `helm_merge_branch` — Helm executes the actual git operations)*
> **Builder:** "Done — your changes are on main. Session complete."

**Option B — Click the button:**

You click **"Complete this Session"** in the Helm UI. Helm initiates the merge.
If everything's clean, it just merges and the session completes.

Before merging, Builder asks: "Test this branch first, or merge to [target]?"
If you want QA to look at it first, you can launch a QA session on the branch
instead. More on that in the QA section.

### What If There's a Conflict?

Say another developer merged to main while you were working. When Builder (or
Helm) attempts the merge, there are conflicts.

Here's what happens: Helm routes the conflict context back into your **same
Builder session**. This is the session that wrote the code — it has full context
of what it built and why.

> **Builder:** "I found merge conflicts in `src/reports/ExportButton.tsx` and
> `src/api/reports.go`. I know what I changed in both files — let me resolve
> them."
>
> *(Builder resolves conflicts in the working tree, commits the resolution)*
>
> **Builder:** "Conflicts resolved. Re-attempting merge."
> *(Merge succeeds)*
> **Builder:** "Done — your changes are on main."

If you're an experienced developer who wants to review the conflict resolution
before Builder touches it, you can interject:

> **You:** "Wait — show me the conflicts first."
>
> **Builder:** "Here are the conflicts: [shows diff]. Want me to resolve them,
> or would you prefer to handle it?"

If Builder can't resolve the conflicts after retries, it escalates:

> **Builder:** "I couldn't resolve these automatically. The conflicts in
> `reports.go` involve changes I don't have enough context for. You'll need
> to fix these manually."

The task gets `fix_required` with `reason: merge_conflict`.

### Ad-Hoc Mode — "Just Fix This"

Not everything starts with a task. Sometimes you just want to say "fix the
broken login page" without going through Planner first.

You open an ad-hoc Builder session — no task linked, no context injected.
You tell Builder what to fix. Builder works exactly like it does today, except:

When Builder finishes a logical unit of work, it **auto-creates a task** in
Supabase via `helm_task_create`. The task gets a title derived from what was
built, a description, labels inferred from the files touched, and your original
request as the first activity entry. It also gets testing notes, just like a
task-linked session.

The auto-created task lands at `agent_build_complete` — not further down the
pipeline. You're present, but you haven't formally reviewed it. You decide
what happens next: promote to testing, merge, or leave it.

If Builder does multiple distinct things in one session, each gets its own task.
No more "one giant session with no traceability."

### Destroyed Sessions

If you decide to abandon a session — maybe the approach was wrong, maybe you
want to start over — the session isn't deleted. It's stored with `abandoned`
status. Same storage as completed sessions, different status field. You can
still view it for reference.

---

## 3. A DAY IN THE LIFE: THE QA TESTER

### Your Queue

You open Helm and see the task board filtered to `ready_for_test`. Three tasks
are waiting. You pick the first one — "Add export to CSV for reports" — the
one the developer just finished.

You can see the task details: description, acceptance criteria, and — this is
new — **testing notes** that Builder wrote during the build session. The
testing notes tell you exactly what to verify, what edge cases to check, and
what the expected behavior is.

### Launching a QA Session

You click **"Start QA Session"** on the task. Helm creates a session with
mode `qa`, which loads a different agent: the **QA agent** (`helm-qa.md`).

This is not Builder in a testing hat. The QA agent has its own personality —
methodical, asks clear questions, doesn't assume, focuses on verification
not implementation. It reads the task's testing notes and acceptance criteria,
then presents your test steps:

> **QA Agent:** "Here's what we need to verify for the CSV export feature:
>
> **Step 1:** Navigate to `/reports`. Verify the Export button is visible.
>
> **Step 2:** Click Export with a small dataset (<100 rows). Verify a CSV
> file downloads immediately.
>
> **Step 3:** Click Export with a large dataset (>10K rows). Verify the
> download streams without timeout.
>
> **Step 4:** Open the CSV. Verify column headers match the table headers.
>
> **Step 5:** Test with an empty dataset. Verify the CSV has headers only.
>
> Let's start with Step 1. Does the Export button appear on the reports page?"

### Walking Through Steps

You go through each step. For each one, you tell the QA agent: **pass**,
**fail** (with what went wrong), or **warning** (something that's not blocking
but worth noting).

> **You:** "Step 1 — pass."
>
> **QA Agent:** "Step 2: Click Export with a small dataset. Does a CSV
> download immediately?"
>
> **You:** "Pass, but the filename is `export.csv` — should probably include
> the date."
>
> **QA Agent:** "Noted as a warning — non-blocking. Step 3: Large dataset
> export..."

The QA agent tracks cumulative results across all steps and can summarize
progress at any point.

### When Something Fails

You get to Step 3 and the large dataset export times out.

> **You:** "Step 3 — fail. The download hangs after about 30 seconds on a
> dataset with 15K rows."
>
> **QA Agent:** "That's a failure on the streaming export. I have two options:
>
> **[A] Fix now** — I'll try to fix this in the current session by delegating
> to a developer specialist.
>
> **[B] Send to developer** — I'll mark this task as `fix_required` and hand
> it back. A developer will pick it up in a new Builder session."
>
> Which would you prefer?"

#### Path A — Fix Now

If you choose to fix now, the QA agent delegates to `@developer`, who routes
to the appropriate specialist (`@go-dev` in this case). The fix happens
in your QA session — you see one continuous conversation:

> **QA Agent:** "I'm delegating to a Go specialist to investigate the
> streaming timeout."
>
> *(specialist investigates, finds the issue, applies a fix)*
>
> **QA Agent:** "The fix has been applied — the streaming endpoint now uses
> chunked transfer encoding with a 60-second timeout per chunk. Let's re-test
> Step 3."
>
> **You:** "Step 3 — pass now."

All fix attempts and results are recorded in the task's activity log.

#### Path B — Send to Developer

If you choose to hand it back:

> **QA Agent:** "I've set this task to `fix_required` with the failure context:
> 'Large dataset export (15K rows) hangs after ~30 seconds. Streaming endpoint
> appears to not be using chunked transfer.' A developer will see this when
> they pick up the task."

The exclusive checkout releases. A developer can start a new Builder session
on this task, see exactly what failed, fix it, and send it back to
`ready_for_test`.

### All Steps Pass

When all steps pass (or pass with warnings):

> **QA Agent:** "All 5 test steps passed (1 warning: filename should include
> date). Recording test results on the task."

The QA agent records a "test passed" activity entry — who tested it, when,
a summary of results.

**The QA agent does NOT merge.** It records the pass. Helm enforces that all
tasks on a branch must pass before the branch can merge. This prevents a
single task passing from triggering a merge of a multi-task branch.

### Multi-Task Testing

If a branch has three tasks and you're testing all of them in one QA session:

> **QA Agent:** "CSV export passed. Move to the next task — 'Add date range
> filter for reports'?"

You can also click a task in the inspector's Tasks tab to pivot to a different
task. The QA agent adapts — picks up the new task's testing notes and
acceptance criteria.

### What You're NOT Doing

You're not running test scripts manually. You're not reading code to figure
out what changed. You're not guessing what to verify. The testing notes from
Builder tell you what to test, and the QA agent walks you through it.

If there are automated tests registered for the task, the QA agent can run
those too — it delegates to `@tester` inline.

---

## 4. A DAY IN THE LIFE: THE PM / PRODUCT OWNER

### You Have a Feature Idea

You've been thinking about adding a notification system to the app. Users
want to know when their reports are ready, when tasks are assigned to them,
when builds complete.

You could write a PRD in a document. But with Helm, you can also scope this
conversationally.

### Opening a Planner Session

You open Helm and start a **Planner session**. Planner loads — same serve
infrastructure as Builder, but with a different agent prompt focused on
planning, not implementation.

Planner doesn't show you a project selection table. It doesn't render a
startup dashboard. It doesn't check for pending updates or scan for stale
sessions. Helm handles all of that. Planner addresses your first message
directly.

### Scoping a Standalone Task

Sometimes you don't need a full PRD. You just need a well-scoped task.

> **You:** "I need a task for adding email notifications when a report
> finishes generating."
>
> **Planner:** "Let me look at the codebase to understand how reports are
> generated currently."
>
> *(Planner searches the repo, finds the report generation pipeline)*
>
> **Planner:** "I can see reports are generated asynchronously via a job
> queue. Here's what I'd propose for this task:
>
> **Title:** Add email notification on report completion
>
> **Description:** When a report job completes, send an email to the user
> who requested it with a link to download the report.
>
> **Acceptance Criteria:**
> - [ ] Email sent on successful report completion
> - [ ] Email includes report name and download link
> - [ ] Email uses existing transactional email service (Resend)
> - [ ] Failed reports send a different email (failure notification)
> - [ ] Users can opt out of report emails in their preferences
>
> **Scope Notes:** This touches the job queue completion handler
> (`src/jobs/report-worker.go`) and the email service
> (`src/services/email.ts`). The preferences opt-out requires a new
> field in the user settings table.
>
> Does this look right? Want to modify anything?"

You refine it conversationally — maybe you add a criterion about rate
limiting, or remove the opt-out for v1. When you're satisfied:

> **Planner:** "Creating this task now."
> *(Planner calls `helm_task_bulk_create`)*
> **Planner:** "Task created: 'Add email notification on report completion'
> with 5 acceptance criteria. It's in `planned` status, ready for a developer
> to pick up."

Planner writes the scope to the task's `scope_markdown` field via
`helm_task_update`. Planner does NOT write testing considerations — that's
Builder's responsibility when it implements the task.

### Breaking Down a PRD into Tasks

For the full notification system, you have a PRD. Maybe you wrote it in a
Planner session in a previous conversation, or maybe it's a markdown file
in `docs/prds/`.

> **You:** "I have a PRD for the notification system. Let's break it down
> into tasks."
>
> **Planner:** *(reads the PRD via `helm_prd_get`)*
>
> "Based on the PRD, here's a proposed task breakdown:
>
> 1. **Set up notification data model** — Create the notifications table,
>    types enum, delivery status tracking.
>    *Priority: High. Labels: backend, database.*
>
> 2. **Build notification delivery service** — Email + in-app channels,
>    retry logic, template system.
>    *Priority: High. Labels: backend.*
>
> 3. **Add notification preferences UI** — User settings page section for
>    channel preferences per notification type.
>    *Priority: Medium. Labels: frontend.*
>
> 4. **Add in-app notification feed** — Notification bell icon, dropdown
>    feed, read/unread state.
>    *Priority: Medium. Labels: frontend.*
>
> 5. **Wire up trigger events** — Report completion, task assignment, build
>    status change.
>    *Priority: High. Labels: backend, integration.*
>
> Want me to create all 5, or do you want to review each one first?"

This is a conversation, not a "Generate Tasks" button click. You can:

- **Modify:** "Task 2 should be split — email delivery and in-app delivery
  are separate concerns."
- **Remove:** "Skip task 4 for now — in-app feed is v2."
- **Add:** "Add a task for notification analytics — we need to track open rates."
- **Reorder priorities:** "Task 3 should be high priority — we need users to
  be able to opt out before we start sending anything."

When you approve the set:

> **Planner:** "Creating 5 tasks linked to the notification system PRD."
> *(Planner calls `helm_task_bulk_create`)*
> **Planner:** "Done. 5 tasks created in `planned` status:
> 1. Set up notification data model (High)
> 2. Build email notification delivery (High)
> 3. Build in-app notification delivery (Medium)
> 4. Add notification preferences UI (High)
> 5. Wire up trigger events (High)
>
> All linked to PRD `prd-notifications`. Ready for developers to pick up."

### What Planner Still Does

Planner still creates and refines PRDs — that workflow is unchanged. It still
analyzes the codebase, asks clarifying questions with lettered options (A, B,
C, D), writes Definitions of Done, runs flag auto-detection. The file-based
PRD workflow (`docs/drafts/`, `docs/prds/`) still works for complex PRDs.

What's gone is the plumbing: project selection tables, startup dashboards,
`prd-registry.json` management, session-locks, team sync auto-commits,
promotion pickup from `docs/tasks/promotions/`. All of that is either
Helm-native now or unnecessary.

### What Planner Does NOT Do

Planner scopes and plans. It does NOT:

- Write testing notes (Builder does that during implementation)
- Implement anything (that's Builder → `@developer` → specialists)
- Run tests or quality checks (that's Builder or QA agent)
- Merge code (that's Builder or Helm UI)

If a PM asks Planner to implement something, Planner redirects: "I scope
and plan tasks. To implement this, start a Builder session."

---

## 5. WHAT HAD TO CHANGE TO MAKE THIS WORK

The personas above describe the end state. Here's what actually changes in
the toolkit to get there.

### The Big Picture

```
  202 total toolkit items
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ████████████████████████████████████░░░░░░░░░░░░  163 untouched (81%)
  ░░░░░░░░░░░░░░                                    30 updated   (15%)
  ░░░░                                                9 deleted    (4%)
```

### What Gets Deleted (9 items → 11 files)

| Type     | File                       | Why It Goes                              |
|----------|----------------------------|------------------------------------------|
| Agent    | `session-status.md`        | Dashboard → Helm native UI               |
| Agent    | `overlord.md`              | External ticket routing → Helm feature   |
| Skill    | `task-promotion/`          | Local promotion → `helm_prd_create`      |
| Skill    | `session-log/`             | Local session files → Supabase           |
| Skill    | `session-setup/`           | Session locks → Helm lifecycle           |
| Skill    | `builder-dashboard/`       | Startup dashboard → Helm native UI       |
| Skill    | `multi-session/`           | Shared branch coordination → per-session branches |
| Template | `task-spec.md`             | Local Task Spec → `helm_task_create`     |
| Template | `task-promotion.md`        | Local promotion doc → `helm_prd_create`  |
| Schema   | `session.schema.json`      | Local session state → Supabase           |
| Schema   | `task-registry.schema.json`| Local task registry → Supabase           |

### What Gets Rewritten (5 major changes)

**AGENTS.md** — The 7-step Git Completion Workflow (validate → commit → push →
PR prompt → PR creation → merge → report) is removed. Agents no longer ship
code themselves — Helm handles session completion and merge. The `git.autoCommit`
enforcement stays (agents still commit during work). The `git.agentWorkflow`
validation stays (Helm uses it for branch targeting).

**Builder agent** (1,825 lines) — Legacy project selection, `docs/sessions/`
references, session-log integration, Git Completion Workflow references all
removed. Helm-bridge tool calls added. Task auto-creation for ad-hoc mode.
Session completion/merge orchestration. Identity lock, delegation chain,
token budget, lean execution — all preserved.

**Ad-hoc workflow skill** (1,812 lines → much smaller) — The entire local Task
Spec file system is removed: file generation, `task-registry.json`, local
archival, promotion documents, the structured analysis gate, and the Phase 2
Ship flow. What survives: quality checks via `test-flow`, scope growth
warnings, design decision capture (now via task comments instead of local files).

**PRD workflow skill** (955 lines → much smaller) — Local `session.json` and
`chunk.json` file management removed. Local branch setup removed (Helm creates
branches). Local session archive removed. Phase 3 Ship flow removed. What
survives: PRD story processing pipeline, story status tracking (now via
Supabase), quality checks, critic dispatch, fix loop tracking.

**Planner agent** (566 lines) — Project selection tables, startup dashboards,
`prd-registry.json` management, session-locks, team sync, promotion pickup
all removed. PRD workflows preserved. Task scoping and PRD-to-tasks
generation added via helm-bridge tools.

### What Gets Minor Updates (24 items)

19 skills and 5 agents have references to `chunk.json`, `session.json`,
`docs/sessions/`, or `docs/tasks/` that need updating to the Supabase-backed
pattern. Their core logic is untouched — only the storage references change.

Examples: `test-flow`, `builder-verification`, `test-verification-loop`,
`post-completion`, `felix`, `hammer`, `tester`, `critic`.

### Verification State: chunk.json → Supabase

19 skills currently read/write local `chunk.json` files for tracking test
results, fix loop counts, critic dispatch records, and reassignment history.

All of this moves to Supabase via helm-bridge, with a **local-memory-first**
pattern:

- **During active work:** Read/write from local memory (zero latency)
- **On key transitions:** Sync to Supabase (story complete, fix loop,
  session pause/complete)
- **On crash/restart:** Recover from Supabase → local memory

If a sync fails and the session crashes, worst case is losing one story's
worth of progress. Quality checks are idempotent — the agent re-runs them on
resume.

### What Does NOT Change (163 items)

| Category | Count |
|----------|-------|
| Specialist agents (react-dev, swift-dev, go-dev, etc.) | 57 |
| Skills (test-flow logic, builder-verification, etc.) | 42 |
| Data files, scripts, scaffolds, automations | 23 |
| Agent/project templates, root configs | 41 |

The entire specialist ecosystem — every `@react-dev`, `@swift-dev`, `@go-dev`,
`@java-dev`, `@python-dev` — stays exactly as-is. The delegation chain
(Builder → `@developer` → specialists → `@critic`) is unchanged.

The existing `qa.md` (QA coordinator for exploratory testing) is untouched.
The existing `tester.md` (test orchestration, 193 references across the
toolkit) is untouched.

### The Three Agents After This PRD

```
  Session Mode    Agent Loaded       Role
  ────────────    ────────────       ────
  build           Builder            Implements tasks, delegates to specialists
  qa              QA Agent (NEW)     Verifies tasks, tracks pass/fail
  plan            Planner            Scopes tasks, generates from PRDs
                      │
                      ▼
                All use helm-bridge tools for task state
                All talk to Supabase, not local files
                All run in Helm-managed sessions
```

### Task Status Flow (The Pipeline)

```
  planned                        ◄── Planner or manual creation
     │
     ▼
  in_progress                    ◄── Builder session starts
     │
     ▼
  agent_build_complete           ◄── Builder finishes (automated)
     │
     ▼
  dev_testing                    ◄── Developer reviewing (manual)
     │
     ▼
  ready_for_test                 ◄── Developer confirms (manual)
     │
     ▼
  testing                        ◄── QA session active
     │
     ├─── pass ──► merged        ◄── Branch merged to target
     │
     └─── fail ──► fix_required  ◄── Back to developer
```

### Phase Dependencies

Phase 1 (legacy removal + infrastructure) must complete first.
Phase 2 (Builder rewrites) and Phase 3 (QA agent + Planner) can overlap
after Phase 1 is done. Exception: US-009 (merge flow) depends on Helm-side
merge infrastructure from the macOS PRD.

---

## 6. RISKS & DISCUSSION POINTS

### For the Dev Manager

**Verification state latency.** The local-memory + Supabase sync is a hybrid.
If sync fails mid-session and the session crashes, state since the last sync
could be lost. Quality checks are idempotent (re-runnable), so this is
acceptable. Worth monitoring sync reliability in production.

**Skill size reduction.** The ad-hoc workflow drops from 1,812 lines to much
less. The PRD workflow drops from 955 lines. These are significant rewrites,
not tweaks. The new versions should be dramatically simpler because the bulk
of the current code is file-system management that's being removed.

**Phase dependencies.** Phase 1 must complete before 2 and 3. But within
Phase 2, US-009 (merge flow) also depends on Helm-side merge infrastructure
from the macOS PRD. Coordinate timing.

### For the PM

**Ad-hoc task auto-creation.** "Logical unit of work" is intentionally vague.
Prompt engineering handles the decision. Could over-create or under-create
tasks initially — tuning expected. All auto-created tasks land at
`agent_build_complete` for developer review, so bad auto-creates are caught.

**Planner task generation is conversational.** No "Generate Tasks" button.
The PM opens a Planner session and reviews proposed tasks interactively.
This is slower than a button click but produces better results because
tasks can be modified, split, or rejected in real time.

### For the QA Tester

**QA agent is new.** `helm-qa.md` is a brand-new agent prompt. Testing
workflows will need iteration. The quality of testing depends on Builder
writing good testing notes (US-008) — if Builder's notes are vague, the QA
agent's test steps will be vague.

**Fix delegation has two paths.** "Fix now" keeps the QA session alive.
"Send to developer" ends the testing attempt and releases the task. The
tester chooses on each failure — it's a judgment call based on severity
and confidence that the agent can fix it.

**QA agent signals pass but doesn't merge.** This is deliberate. Helm
enforces all-tasks-pass-before-merge at the branch level. No single task
passing triggers a merge of a multi-task branch.

### Cross-Cutting

**Merge via conversation.** Builder orchestrates but Helm executes git.
The handoff boundary needs clean error reporting — if `helm_merge_branch`
returns an error, Builder needs to present it clearly, not swallow it.

**Same-session conflict resolution.** When merge hits conflicts, the same
Builder session resolves them (it has full context). This is the right call
architecturally, but it means the session must stay alive through the merge
attempt. If the session crashes during conflict resolution, it becomes messy.

**No backward compatibility.** The toolkit has no non-Helm consumers. If
someone tried to run these agents outside of Helm, they'd fail immediately
(no helm-bridge tools). This is intentional.

---

## 7. QUICK REFERENCE

### Helm-Bridge Tools Used by Agents

| Tool | Used By | Purpose |
|------|---------|---------|
| `helm_task_create` | Builder | Auto-create tasks in ad-hoc mode |
| `helm_task_get` | Builder, QA, Planner | Read task details |
| `helm_task_update` | Builder, QA, Planner | Update fields, status, testing notes |
| `helm_task_list` | Planner | Find related existing tasks |
| `helm_task_bulk_create` | Planner | Create multiple tasks from PRD |
| `helm_task_add_comment` | Builder, Planner | Notes and decisions on tasks |
| `helm_task_add_activity` | Builder, QA | Activity entries (test results, fixes) |
| `helm_prd_get` | Planner | Read PRD content |
| `helm_prd_create` | Planner | Create new PRDs |
| `helm_merge_branch` | Builder | Initiate merge to target branch |
| `helm_search_context` | All | Semantic search of related work |
| `helm_session_get_state` | All (via skills) | Read verification state |
| `helm_session_set_state` | All (via skills) | Write verification state |

### Story Map (19 stories, 3 phases)

**Phase 1 — Legacy Removal & Infrastructure**
- US-001: AGENTS.md modernization
- US-002: Delete 11 legacy files
- US-003: Verification state migration (chunk.json → Supabase)
- US-004: Minor reference cleanup (~19 skills + 5 agents)

**Phase 2 — Agent Rewrites**
- US-005: Builder agent rewrite
- US-006: Builder ad-hoc task auto-creation
- US-007: Task-aware Builder sessions
- US-008: Builder completion flow (testing notes, status)
- US-009: Builder session completion & merge (dual-path)
- US-010: Ad-hoc workflow skill rewrite (1,812 → smaller)
- US-011: PRD workflow skill rewrite (955 → smaller)
- US-012: Developer agent updates

**Phase 3 — QA Agent & Planner**
- US-013: QA agent prompt (NEW: `helm-qa.md`)
- US-014: QA agent fix delegation
- US-015: QA agent test completion
- US-016: Planner agent legacy cleanup
- US-017: Planner task scoping via Helm
- US-018: PRD-to-tasks generation via Planner session
- US-019: Planner task tools usage

### Files Affected

| Action | Count | Details |
|--------|-------|---------|
| Delete | 11 | 2 agents, 5 skills, 2 templates, 2 schemas |
| Major rewrite | 5 | builder.md, adhoc-workflow, prd-workflow, planner.md, AGENTS.md |
| Create new | 1 | helm-qa.md |
| Minor updates | 24 | 19 skills + 5 agents (ref cleanup) |
| Unchanged | 163 | Everything else (81%) |

### Relationship to macOS PRD (46 stories)

The macOS PRD builds the infrastructure. This PRD wires agents into it.

| macOS PRD Provides | Toolkit PRD Consumes |
|--------------------|----------------------|
| Task data model (Supabase) | Agents read/write tasks via helm-bridge |
| Context injection hook | Builder reads task context from system prompt |
| Session completion UI | Builder merge conversation via helm-bridge |
| helm-bridge tools | All three agents use tools |
| QA launch flow | QA agent prompt behavior |
| Embedding pipeline (Phase 8) | Agents use `helm_search_context` (best-effort) |
