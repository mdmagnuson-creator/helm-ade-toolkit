# PRD: Agent & Toolkit Updates for Helm Task Management

## Introduction

> **Helm-only toolkit.** The helm-ade-toolkit provides the agent prompts, skills, and scaffolds that Helm users interact with when they direct agents (Builder, QA, Planner) in sessions inside Helm to make changes to their projects. There are no consumers of this toolkit outside of Helm. All changes in this PRD assume Helm infrastructure is available: Supabase for state, helm-bridge plugin tools, Helm macOS app for session/working tree/merge management.

This PRD modernizes the helm-ade-toolkit to align with Helm's native session and task management infrastructure, as defined in the companion `prd-task-management` PRD (in helm-ade-macos). The work falls into three categories:

1. **Legacy removal & infrastructure** — The toolkit currently contains extensive local file-based tracking systems (Task Specs in `docs/tasks/`, session archives in `docs/sessions/`, `task-registry.json`, `session-locks.json`, `chunk.json` files) that are fully replaced by Supabase via helm-bridge tools. These local systems, along with the agents, skills, templates, and schemas that support them, are removed. The root guardrails file (`AGENTS.md`) is updated to remove the standalone Git Completion Workflow (Helm manages session completion and merge) and acknowledge the Helm ADE startup pattern.

2. **Agent rewrites** — Builder, Developer, and the ad-hoc/PRD workflow skills receive major rewrites to remove legacy file references, integrate with helm-bridge tools, and support Helm's session completion flow. Builder gains task auto-creation for ad-hoc sessions, task-aware context injection, a structured completion flow, and merge orchestration via helm-bridge tools. The ad-hoc workflow skill is stripped of its local Task Spec file system. The PRD workflow skill is stripped of local session/chunk management and rewritten for Helm-managed shipping.

3. **QA agent, Planner & Assistant expansion** — A new QA agent prompt (`helm-qa.md`) handles conversational testing sessions. Planner gains task scoping and PRD-to-task generation via helm-bridge tools, with legacy local file management removed. A new Helm Assistant agent prompt (`helm-assistant.md`) supports the conversational assistant that reads project state, manages settings, and orchestrates handoffs to Builder/QA/Planner.

> **Companion PRD:** `prd-task-management` (in helm-ade-macos) defines the task data model, Helm UI, automation hooks, notification system, and session completion flow that these agent changes integrate with.

> **Naming note:** The new testing agent is called "QA agent" throughout, and its prompt file is `helm-qa.md`. This avoids collision with two existing agents in the toolkit: (1) `qa.md` — the QA coordinator that dispatches `@qa-explorer` and `@qa-browser-tester` for exploratory testing, and (2) `tester.md` — the test orchestration agent that routes test-writing to specialist agents (193 references across the toolkit). Neither of those existing agents is modified by this PRD.

> **Session completion architecture:** Session completion is dual-path. The developer can click a "Complete this Session" button in Helm's session UI, or ask Builder conversationally ("merge this to main"). Both paths trigger the same underlying flow: merge to target branch (configurable from project settings), same-session conflict resolution if merge hits conflicts (the same Builder session resolves them since it has full context), task status transitions. Helm controls git operations; Builder orchestrates the conversation when the developer chooses the conversational path.

## Goals

- Remove all local file-based tracking systems replaced by Supabase (Task Specs, session archives, task-registry, session-locks, chunk.json state files)
- Delete agents, skills, templates, and schemas that exist solely to support those local systems
- Update `AGENTS.md` root guardrails to remove the standalone Git Completion Workflow and reflect Helm ADE startup patterns
- Migrate verification state (chunk.json) to Supabase via helm-bridge with local-memory-first caching for latency
- Rewrite Builder to support task auto-creation, task-aware sessions, structured completion flow, and session completion/merge via helm-bridge tools
- Rewrite the ad-hoc workflow skill to remove Task Spec file management while preserving quality checks and scope growth warnings
- Rewrite the PRD workflow skill to remove local session/chunk management while preserving story processing and quality checks
- Create a dedicated QA agent prompt for conversational task verification during testing sessions
- Enable Planner to scope both complex features (PRDs) and standalone tasks via helm-bridge tools, with legacy local management removed
- Maintain the existing delegation pattern: top-level agents delegate to `@developer`, `@developer` delegates to specialists
- Ensure all three agents (Builder, QA, Planner) use helm-bridge plugin tools for task state management
- Create a Helm Assistant agent prompt with project management personality, allowlisted tools, confirmation patterns, and session handoff behavior
- Support multi-task sessions with dynamic context updates

## Non-Goals

- **Agent UI changes** — Agent definitions don't include UI. The Helm macOS PRD handles all UI including the "Complete this Session" button, code review panel, and merge conflict UI.
- **Plugin tool additions** — Plugin tool implementations (task CRUD, search context, merge tools) are in the companion PRD, not here. This PRD defines how agents *use* those tools.
- **Automation hooks** — Hook implementation is in the companion PRD. This PRD only defines how agents consume the hooks' outputs.
- **Testing infrastructure** — Working tree management, merge automation, dev environment startup, and build triggers are in the companion PRD.
- **Modifications to existing QA coordinator** — The existing `qa.md` (dispatches `@qa-explorer` and `@qa-browser-tester` for exploratory testing) is not modified.
- **Modifications to existing tester agent** — The existing `tester.md` (test orchestration/routing agent) is not modified.
- **Specialist agent changes** — Specialist agents (`react-dev`, `swift-dev`, `go-dev`, etc.) stay as-is. They are invoked by `@developer` and don't interact with task management directly.

## Scope Considerations

- **opencode-serve-api** (required): relevant
  - All three agents run as opencode serve sessions launched from Helm
  - Agent definitions must be compatible with the opencode serve API
  - Plugin tools (helm-bridge) are available to all agents in-session
  - Session mode field (`build` | `qa` | `plan` | `assistant`) determines which agent prompt loads
  - Helm sets session mode at session creation time
  - Story coverage: all stories

## Audit Summary

A full audit of all 202 toolkit items was completed. This PRD addresses all items identified as needing changes:

| Category | Total | Stays As-Is | Needs Changes | Goes Entirely |
|----------|-------|-------------|---------------|---------------|
| Agents | 64 | 57 | 5 | 2 |
| Skills | 68 | 42 | 23 | 3 |
| Templates | 22 | 20 | 0 | 2 |
| Schemas | 16 | 12 | 2 | 2 |
| **TOTAL** | **202** | **163** | **30** | **9** |

Items staying as-is (163) include: all 57 specialist agents, all data files, all scripts, all scaffolds, all automations, all agent templates, project templates, and root config files.

## User Stories

### Phase 1: Legacy Removal & Infrastructure

#### US-001: AGENTS.md Modernization

**Description:** As a toolkit maintainer, I need the root guardrails file (`AGENTS.md`) updated to remove the standalone Git Completion Workflow and reflect that Helm manages session lifecycle, so agents don't carry outdated shipping instructions.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] The "Git Completion Workflow" section (Steps 1-7: validate config, commit, push, PR prompt, PR creation, merge handling, report completion) is removed entirely from `AGENTS.md`
- [ ] The "Git Auto-Commit Enforcement" section is retained — agents still respect `git.autoCommit` settings when committing during work
- [ ] The "Git Workflow Enforcement" section is retained — `pushTo`, `createPrTo`, and `requiresHumanApproval` validation is still relevant for Helm-side enforcement
- [ ] The "Helm ADE Startup Pattern" section is retained — agents read `HELM_PROJECT_PATH` environment variable, skip project selection tables, skip startup dashboards, skip terminal title setting
- [ ] References to the removed Git Completion Workflow in other sections of `AGENTS.md` are cleaned up (e.g., cross-references from ad-hoc/PRD mode instructions)
- [ ] No other sections of `AGENTS.md` are modified (Protected System Resources, Temporary Files, Global Coding Behavior, Test Failure Output Policy, Requesting Toolkit Updates, etc.)

#### US-002: Legacy File System Removal

**Description:** As a toolkit maintainer, I need to remove all agents, skills, templates, and schemas that exist solely to support local file-based tracking systems now replaced by Supabase, so the toolkit doesn't carry dead code.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] **Agents deleted (2):**
  - `agents/session-status.md` — Dashboard agent fully replaced by Helm native UI
  - `agents/overlord.md` — External ticket routing; no non-Helm consumers, external ticket integration is a Helm feature
- [ ] **Skills deleted (5):**
  - `skills/task-promotion/SKILL.md` — Local Task Spec promotion mechanism; replaced by `helm_prd_create` tool
  - `skills/session-log/SKILL.md` — Local session file management (`docs/sessions/`, chunk files); Helm manages session persistence in Supabase
  - `skills/session-setup/SKILL.md` — Local `session-locks.json` setup; Helm manages session lifecycle natively
  - `skills/builder-dashboard/SKILL.md` — Builder startup dashboard; Helm shows dashboards natively in its UI
  - `skills/multi-session/SKILL.md` — Multi-session coordination on shared branches; Helm manages session lifecycle with per-session working branches
- [ ] **Templates deleted (2):**
  - `templates/task-spec.md` — Local Task Spec template; replaced by Supabase tasks via `helm_task_create`
  - `templates/task-promotion.md` — Local promotion document template; replaced by `helm_prd_create`
- [ ] **Schemas deleted (2):**
  - `schemas/session.schema.json` — Local session state schema; session state now in Supabase
  - `schemas/task-registry.schema.json` — Local Task Spec registry schema; task registry now in Supabase
- [ ] All references to deleted items in other toolkit files are identified and noted (actual reference cleanup is covered by US-004)
- [ ] No files outside the deleted set are modified by this story

#### US-003: Verification State Migration

**Description:** As a toolkit maintainer, I need to migrate the verification state system (currently stored in local `chunk.json` files) to Supabase via helm-bridge tools, so verification state persists across sessions and is recoverable after crashes, while maintaining low-latency access during active work.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] Verification state (test results, fix loop tracking, critic dispatch records, reassignment history) is stored in Supabase via helm-bridge tools (`helm_session_update` or equivalent)
- [ ] Agents maintain state in local memory during active work for low-latency access — no Supabase round-trip for every state read
- [ ] Local memory state syncs to Supabase periodically and on key transitions (story completion, fix loop iteration, session pause/complete)
- [ ] On session resume, state is loaded from Supabase (recovering from crashes, context compaction, or session restarts)
- [ ] `schemas/chunk.schema.json` is updated to document the Supabase-backed data structures (the schema remains as documentation of the data shape, not as a local file format)
- [ ] `schemas/builder-config.schema.json` is updated to remove `lastSessionPath` and other local session file references
- [ ] The 19 skills that reference `chunk.json` for verification state are updated to use the new Supabase-backed access pattern (the actual skill updates are covered by US-004, but this story defines the access pattern they use)
- [ ] A clear API contract is defined for how skills read/write verification state: `helm_session_get_state(key)` / `helm_session_set_state(key, value)` or equivalent

#### US-004: Minor Reference Cleanup

**Description:** As a toolkit maintainer, I need to clean up references to legacy local file paths (`chunk.json`, `session.json`, `docs/sessions/`, `docs/tasks/`, `task-registry.json`) across the ~19 skills that have minor references to these systems, updating them to use Supabase-backed patterns while preserving their core logic.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] The following skills have `chunk.json` / `session.json` / `docs/sessions/` references updated to use the Supabase-backed verification state pattern defined in US-003:
  - `skills/test-flow/SKILL.md`
  - `skills/builder-verification/SKILL.md`
  - `skills/builder-delegation/SKILL.md`
  - `skills/test-ui-verification/SKILL.md`
  - `skills/test-verification-loop/SKILL.md`
  - `skills/ui-test-flow/SKILL.md`
  - `skills/test-failure-handling/SKILL.md`
  - `skills/post-completion/SKILL.md`
  - `skills/pending-updates/SKILL.md`
  - `skills/project-bootstrap/SKILL.md`
  - `skills/session-state/SKILL.md`
- [ ] The following agents have minor local file references cleaned up:
  - `agents/felix.md`
  - `agents/hammer.md`
  - `agents/prd-impact-analyzer.md`
  - `agents/tester.md`
  - `agents/critic.md`
- [ ] `skills/session-state/SKILL.md` receives additional updates: `docs/sessions/` paths removed, right-panel todo contract preserved, rate limit handling preserved, compaction recovery concepts preserved
- [ ] Core logic of all updated skills and agents is unchanged — only storage/path references are updated
- [ ] No behavioral changes to specialist agents, data files, scripts, scaffolds, automations, or agent templates

### Phase 2: Agent Rewrites

#### US-005: Builder Agent Rewrite

**Description:** As a developer using Builder in Helm, I need the Builder agent prompt (`agents/builder.md`) rewritten to remove legacy local file management and integrate with Helm's session infrastructure, so Builder operates cleanly within Helm-managed sessions.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] Legacy project selection logic removed — Builder no longer renders project selection tables or reads `projects.json`; Helm provides project context via `HELM_PROJECT_PATH` environment variable
- [ ] All references to `docs/sessions/`, session-log integration, local session archives, and `session-locks.json` removed
- [ ] All references to the Git Completion Workflow (push, PR creation, merge) removed — session completion is handled by Helm (see US-009)
- [ ] References to startup dashboards removed — Helm shows dashboards natively; Builder addresses the user's first message directly
- [ ] Builder's core behavioral sections are preserved and functional:
  - Identity lock (Builder never writes code directly, delegates to `@developer`)
  - Token budget management
  - Lean execution principles
  - Story Processing Pipeline (for PRD-linked sessions)
  - Delegation to `@developer` → specialists → `@critic`
- [ ] Builder reads task context from system prompt injection (provided by companion PRD US-026 context injection hook)
- [ ] Builder uses helm-bridge plugin tools for task state management (`helm_task_get`, `helm_task_update`, `helm_task_add_comment`, `helm_task_add_activity`, `helm_reminder_create`)
- [ ] Builder prompt references `helm_search_context` for semantic search of related tasks/sessions (best-effort — proceeds without it if embeddings not available)
- [ ] Builder prompt acknowledges multi-task sessions — multiple tasks linked to a single session, with context injected for each, and dynamic updates when tasks are added/removed mid-session

#### US-006: Builder Ad-Hoc Task Auto-Creation

**Description:** As a developer, when I launch an ad-hoc Builder session without a pre-existing task, I need Builder to auto-create tasks in Supabase as it completes logical units of work, so all work has task-level traceability.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] Builder retains ad-hoc mode — when no task context is injected, Builder works normally on the user's request
- [ ] When Builder completes a logical unit of work in an ad-hoc session, it creates a task via `helm_task_create` with: title (derived from work done), description (what was built), labels (inferred from file types/areas), and the original user prompt as first activity entry
- [ ] Auto-created task is immediately linked to the current session
- [ ] If Builder completes multiple logical units in one session, each gets its own task
- [ ] Auto-created tasks land at `agent_build_complete` status — the developer is present but hasn't reviewed the work yet
- [ ] Builder writes testing notes to auto-created tasks (same as task-linked sessions — see US-008)
- [ ] Story assignment is handled server-side by the `helm_task_create` plugin tool — Builder passes the task description and the plugin performs semantic matching against story embeddings (US-032 in companion PRD) to auto-assign; auto-creates a new story if no match meets the similarity threshold. Builder does not query embeddings directly for story assignment
- [ ] Builder still delegates to `@developer` → specialists (never writes code directly)
- [ ] Existing PRD mode is unaffected — PRD-linked sessions receive task context via injection and do not auto-create tasks

#### US-007: Task-Aware Builder Sessions

**Description:** As a developer, I need Builder to read and use the task context (description, scope, acceptance criteria) injected into its session so it can plan and delegate work accurately.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] Builder reads task context from system prompt (injected by companion PRD US-026 context injection hook)
- [ ] Builder uses `helm_task_get` to fetch latest task state at session start
- [ ] Builder uses `helm_search_context` (when available) to find related tasks, past sessions, and known issues — surfaces connections to the developer
- [ ] Builder's work plan is derived from the task's acceptance criteria and scope notes
- [ ] Builder delegates to `@developer` with the task's acceptance criteria as implementation requirements
- [ ] Builder can use `helm_task_add_comment` to leave notes or questions on the task
- [ ] If the task has sub-tasks, Builder can see them and work on them in order
- [ ] Multi-task sessions: when multiple tasks are linked, Builder receives context for all tasks and works through them. Dynamic updates when tasks are added/removed mid-session (companion PRD US-NEW-O)

#### US-008: Builder Completion Flow

**Description:** As a developer, I need Builder to follow a structured completion flow when it finishes work: writing testing notes to the task, optionally running automated tests, and transitioning to the appropriate status.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] On completion of a task, Builder uses `helm_task_update` to write structured testing notes (`testing_notes_markdown`) — what to test, how to verify, edge cases, any manual steps needed
- [ ] Builder writes testing notes directly during its session (not extracted post-session by a hook)
- [ ] If automated testing is enabled (project-level default in `project.json`, toggleable at session launch), Builder delegates to `@tester` to write and run automated tests before marking ready
- [ ] If automated tests fail, Builder auto-fixes (delegates to `@developer`) and retries, up to max attempts. On max-attempts failure, task still transitions with activity entry noting test failures
- [ ] After testing notes are written (and optional automated tests pass), Builder transitions the task to `agent_build_complete` status via `helm_task_update`
- [ ] `agent_build_complete` is an automated status — Builder sets it when finished. Developer reviews the work, then manually promotes to `dev_testing` and then `ready_for_test` via Helm UI (companion PRD US-008)
- [ ] Multi-task sessions: each task completes independently with its own testing notes and status transition
- [ ] Builder's delegation to `@developer`, `@tester`, and `@critic` is unchanged

#### US-009: Builder Session Completion & Merge

**Description:** As a developer, when I'm ready to complete a Builder session, I need Builder to support merge orchestration via helm-bridge tools — either conversationally when I ask, or as part of Helm's "Complete this Session" button flow — so my work lands on the target branch.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] Builder supports two completion paths that trigger the same underlying flow:
  - **Conversational:** Developer says "merge this to main" (or similar) in the chat — Builder orchestrates the merge conversation
  - **UI-triggered:** Developer clicks "Complete this Session" in Helm UI — Helm initiates the flow, Builder participates if needed (e.g., conflict resolution)
- [ ] Builder uses `helm_merge_branch` (or equivalent helm-bridge tool) to initiate merge to the target branch — Helm executes the actual git operations, Builder never touches git directly for merge/push
- [ ] Target branch is read from project settings (`git.agentWorkflow.createPrTo` or equivalent) — Builder does not hardcode or ask for target branch
- [ ] Before merge, Builder asks: "Test this branch first, or merge to [target]?"
  - If test first: Builder signals Helm to launch a QA session on the working branch ("Launch for Testing")
  - If merge: Builder proceeds with merge via helm-bridge
- [ ] If merge encounters conflicts, Helm routes the conflict context back into the **same Builder session** that produced the work — that session has full context of what was built. Builder resolves conflicts in the working tree (same branch, same context), commits the resolution, and Helm re-attempts the merge
- [ ] If conflicts persist after resolution attempts, Builder reports "I couldn't resolve these automatically. You'll need to fix these manually." — the session stays open for manual resolution or the user abandons, triggering `fix_required` with `reason: merge_conflict`
- [ ] The PM persona sees this as transparent: "I found conflicts, fixing them now..." followed by "Done, your changes are on the target branch." The experienced developer can interject and ask to review the conflicts before Builder touches them
- [ ] After successful merge, Builder reports completion and the session transitions to completed state (read-only, viewable for history)
- [ ] Builder does NOT create PRs, push branches, or auto-merge — all git operations are executed by Helm via helm-bridge tools
- [ ] If the developer destroys the session instead of completing it, the session is stored with "abandoned" status (same storage as completed, different status)

#### US-010: Ad-Hoc Workflow Skill Rewrite

**Description:** As a toolkit maintainer, I need the ad-hoc workflow skill (`skills/adhoc-workflow/SKILL.md`, currently 1812 lines) rewritten to remove the entire local Task Spec file system while preserving quality checks, scope growth warnings, and design decision tracking.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] **Removed entirely:**
  - Task Spec file generation (`docs/tasks/task-YYYY-MM-DD-*.md`)
  - `task-registry.json` management
  - Local file archival (`docs/tasks/completed/`, `docs/tasks/abandoned/`)
  - Local promotion documents (`docs/tasks/promotions/promote-task-*.md`)
  - Phase 2 "Ship" flow (git commit, push, PR creation) — replaced by Helm session completion (US-009)
  - Structured analysis gate (Phase 0 with screenshots, dashboard rendering, `[G]` approval menu) — ad-hoc means "go straight to Builder." If the developer wants analysis/planning, they use Planner first
- [ ] **Preserved and updated:**
  - Quality checks via `test-flow` skill — still runs before completion, results recorded via helm-bridge tools instead of chunk.json
  - Scope growth detection/warning — Builder warns when ad-hoc work exceeds original scope, suggests breaking into multiple tasks (via `helm_task_create`)
  - Design decision capture — significant design decisions recorded as task comments via `helm_task_add_comment`
- [ ] Task creation during ad-hoc sessions uses `helm_task_create` (as defined in US-006)
- [ ] All state that was previously written to local files is now written to Supabase via helm-bridge tools
- [ ] The rewritten skill is significantly shorter than 1812 lines — the bulk of the current skill is Task Spec file management

#### US-011: PRD Workflow Skill Rewrite

**Description:** As a toolkit maintainer, I need the PRD workflow skill (`skills/prd-workflow/SKILL.md`, currently 955 lines) rewritten to remove local session/chunk file management while preserving PRD story processing and quality checks.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] **Removed entirely:**
  - Local `session.json` and `chunk.json` file creation/management — session state now in Supabase
  - Local branch setup — Helm creates working branches for sessions
  - Local session archive (`docs/sessions/` archival on completion)
  - Phase 3 "Ship" flow (git commit, push, PR creation) — replaced by Helm session completion (US-009)
- [ ] **Preserved and updated:**
  - PRD story processing pipeline — Builder processes stories in order, tracks progress via helm-bridge tools instead of local files
  - Story status tracking — uses Supabase-backed verification state (US-003 pattern) instead of `chunk.json`
  - Quality checks via `test-flow` skill — results recorded via helm-bridge tools
  - Critic dispatch — `@critic` routing still works, dispatch records stored via Supabase instead of chunk.json
  - Fix loop tracking — retry counts and fix history stored via Supabase instead of chunk.json
- [ ] PRD content is read via `helm_prd_get` (or from local file system if PRD is a local markdown file)
- [ ] Story completion transitions use `helm_task_update` to set task status
- [ ] The rewritten skill reflects that shipping is now Helm-managed — the skill's job ends at "all stories complete, all quality checks pass," and session completion is handled by US-009

#### US-012: Developer Agent Updates

**Description:** As a toolkit maintainer, I need the Developer agent (`agents/developer.md`) updated to remove legacy local file references while preserving its specialist routing and quality requirements.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] References to `docs/prd.json` removed — PRD data comes from helm-bridge tools or system prompt injection
- [ ] References to `docs/progress.txt` removed — progress tracked via Supabase
- [ ] References to `docs/sessions/` removed — session state in Supabase
- [ ] Specialist routing is preserved: `@developer` delegates to `@react-dev`, `@swift-dev`, `@go-dev`, `@java-dev`, `@python-dev`, `@aws-dev`, `@docker-dev`, `@terraform-dev`, `@public-page-dev` based on file types and task context
- [ ] Quality requirements are preserved: `@developer` runs `@critic` for review, follows test-flow for quality checks
- [ ] `@developer` continues to be the primary implementation agent that Builder and QA agent delegate to — this role is unchanged

### Phase 3: QA Agent, Planner & Assistant

#### US-013: QA Agent Prompt

**Description:** As a tester, I need a dedicated QA agent that handles conversational testing sessions — presenting test steps, accepting pass/fail, and guiding me through the verification process.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] New agent prompt file created: `agents/helm-qa.md`
- [ ] QA agent shares Builder's `opencode-serve` session infrastructure — same session model, same plugin tools, same working tree access
- [ ] Helm loads the QA agent prompt when session mode is `qa` (mode set at session creation by Helm macOS app)
- [ ] QA agent detects testing context from the task's status (`ready_for_test` or `testing`) and the `qa` session mode
- [ ] QA agent presents test steps derived from the task's `testing_notes_markdown` and acceptance criteria
- [ ] QA agent walks the tester through steps one at a time or in groups, depending on complexity
- [ ] Tester responds to each step with: pass, fail (with description/screenshot), or warning (non-blocking concern)
- [ ] QA agent tracks cumulative results across all linked tasks and can summarize progress at any point
- [ ] QA agent's personality is distinct from Builder — methodical, asks clear questions, doesn't assume, focuses on verification not implementation
- [ ] Existing `qa.md` (QA coordinator for exploratory testing) is NOT modified
- [ ] Existing `tester.md` (test orchestration/routing agent) is NOT modified

#### US-014: QA Agent Fix Delegation

**Description:** As a tester, when I report a failure during testing, I need the QA agent to offer in-session fix delegation or async handoff to a developer.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] When tester reports a failure, QA agent asks: "Should I try to fix this now, or send it to a developer?"
- [ ] If fix now: QA agent delegates to `@developer` with failure context (what failed, expected behavior, actual behavior, relevant code/screenshot context)
- [ ] `@developer` delegates to the appropriate specialist (`@swift-dev`, `@react-dev`, etc.)
- [ ] After fix is applied, QA agent resumes the testing conversation where the tester left off
- [ ] If send to developer: QA agent sets task to `fix_required` status via `helm_task_update`, releases exclusive checkout, and records failure context as activity entry
- [ ] QA agent can also run automated tests inline — delegates to `@tester` if the task has registered test files
- [ ] All fix attempts and results are recorded in the task's activity log via `helm_task_add_activity`
- [ ] Tester sees one unified conversation throughout (including fix cycles)

#### US-015: QA Agent Test Completion

**Description:** As a tester, when all test steps pass for a task, I need the QA agent to handle the completion flow — recording the pass and moving to the next task.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] When all test steps pass, QA agent records a "test passed" activity entry on the task via `helm_task_add_activity` (who passed it, when, summary)
- [ ] QA agent does NOT directly transition the task to `merged` — it records the pass. Helm macOS app handles branch-scoped merge logic (all tasks on a branch must pass before merge, per companion PRD US-022)
- [ ] If some steps have warnings (non-blocking), QA agent includes them in the pass summary
- [ ] If the tester decides to fail the task entirely, QA agent offers: "Send to developer" (`fix_required`) or "Send to planner" (`needs_planning`)
- [ ] In multi-task sessions: after a task passes, QA agent asks "Move to next task?" and pivots to the next linked task. Tester can also click a task in the inspector Tasks tab (companion PRD US-NEW-Q) to pivot
- [ ] Task status transitions are handled via `helm_task_update`

#### US-016: Planner Agent Legacy Cleanup

**Description:** As a toolkit maintainer, I need the Planner agent (`agents/planner.md`) updated to remove legacy local file management systems that are now replaced by Helm's native infrastructure.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] **Removed entirely:**
  - Project selection tables and project registry reading (`projects.json`) — Helm provides project context via `HELM_PROJECT_PATH`
  - Startup dashboards — Helm shows dashboards natively; Planner addresses the user's first message directly
  - Terminal title setting — Helm manages window titles
  - Task Spec promotion pickup (`docs/tasks/promotions/`) — promotions handled by `helm_prd_create` tool
  - Local `docs/bugs/` management — bug tracking through Supabase tasks
  - Local `docs/prd-registry.json` management for task-level operations — PRD registry interaction goes through helm-bridge tools
  - `session-locks.json` management — Helm manages session lifecycle
  - Team sync / auto-commit of PRD files — Helm manages git operations
  - Pending project updates processing (`docs/pending-updates/`) — toolkit updates handled separately from Planner sessions
- [ ] **Preserved and updated:**
  - PRD creation and refinement workflows — Planner still creates PRDs, but reads/writes via helm-bridge tools where applicable
  - Codebase analysis for PRD refinement — Planner still searches the project codebase to understand current state
  - Clarifying questions with lettered options (A, B, C, D) — core Planner interaction pattern
  - Definition of Done authoring — Planner still writes DoD sections
  - Flag auto-detection (documentation, tools flags) — still runs during PRD refinement
  - Credential & Service Access Planning — still included when PRDs involve external services
- [ ] Planner reads project configuration from `docs/project.json` within the project (via `HELM_PROJECT_PATH`)
- [ ] Planner uses helm-bridge tools for task and PRD operations (`helm_task_update`, `helm_prd_get`, `helm_prd_create`, etc.)

#### US-017: Planner Task Scoping via Helm

**Description:** As a product owner, I need Planner to scope tasks when launched from Helm, refining the task's description, acceptance criteria, and scope notes through a conversational Planner session.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

*Session initialization:*
- [ ] Planner agent definition (`agents/planner.md`) supports task scoping mode
- [ ] When launched with task context (session mode `plan`), Planner reads the task via `helm_task_get`
- [ ] Planner reads the user's seed prompt (provided via Helm UI before session start) for scoping direction
- [ ] Planner analyzes the repo codebase to understand current state relevant to the task

*Structured walkthrough protocol:*
- [ ] Planner presents a structured review of the task:
  - **Summary** — title and refined description
  - **Purpose** — explanation of the reason for the task
  - **Q&A** — only if Planner needs clarification: numbered questions, each with multiple-choice options (A, B, C) and Planner's recommended answer highlighted
- [ ] User responds with shorthand (e.g., `1A, 2C, 3B`) — Planner processes answers and either asks follow-up questions or asks user to approve
- [ ] If Planner determines the task should be broken down, it proposes sub-tasks as a preview list and walks through each using the same Summary/Purpose/Q&A protocol
- [ ] Sub-tasks are created one at a time in Supabase via `helm_task_create` as the user approves each (not batch)

*Scope output:*
- [ ] Planner proposes: refined description, acceptance criteria (as markdown checklist), and scope notes
- [ ] Planner does NOT write testing considerations — that is Builder's responsibility (US-008)
- [ ] User (product owner) can accept, modify, or reject proposals conversationally
- [ ] Accepted scope is written to the task's `scope_markdown` field via `helm_task_update`

*State persistence and chunking:*
- [ ] Planner saves walkthrough progress to Supabase via `helm_session_state_save` after each significant decision (task approval, Q&A answers, scope acceptance)
- [ ] On session resume after context compaction, Planner reads saved state via `helm_session_state_get` and continues from where it left off — does not restart
- [ ] When working through large sets of tasks or complex scoping, Planner chunks its work: complete one task fully (read → present → Q&A → approve → save state) before starting the next

*Availability:*
- [ ] Available on any task regardless of status or origin
- [ ] "Scope with Planner" offers choice: new Planner session or add task to existing open Planner session (exclusive checkout semantics apply)

#### US-018: PRD-to-Tasks Generation via Planner Session

**Description:** As a product owner, I need Planner to generate tasks from an approved PRD as a conversational Planner session, not a direct LLM call, so I can review and refine the task breakdown interactively.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

- [ ] Task generation happens conversationally within a Planner session during PRD refinement — not via a "Generate Tasks" button or direct LLM call
- [ ] Planner reads the PRD content via `helm_prd_get`

*PRD-level scope review (before task walkthrough):*

- [ ] Planner presents a PRD-level scope review first:
  - **Introduction** — what the PRD covers
  - **Goals** — what success looks like
  - **Non-goals** — what's explicitly out of scope
  - **Architecture approach** — high-level technical direction (if applicable)
- [ ] User approves or modifies PRD-level scope before Planner proceeds to individual tasks

*Task walkthrough protocol:*

- [ ] Planner proposes a task breakdown as a preview list: each story/section becomes one or more tasks
- [ ] Tasks are walked through one at a time using the structured protocol:
  - **Summary** — task title and refined description
  - **Purpose** — why this task exists and what it achieves
  - **Q&A** — only if Planner needs clarification: numbered questions, each with multiple-choice options (A, B, C) and Planner's recommended answer highlighted
- [ ] User responds with shorthand (e.g., `1A, 2C, 3B`) — Planner processes answers and either asks follow-up questions or asks user to approve the task
- [ ] Each approved task is created individually in Supabase via `helm_task_create` (not batch) — linked to the PRD via `prd_id`
- [ ] Each task includes: title, description (from acceptance criteria), priority (inferred), labels (inferred), and story assignment
- [ ] Story assignment is conversational (Planner suggests, user confirms) — uses semantic matching against story embeddings (US-032 in companion PRD) to suggest best-fit stories; auto-creates a new story if no match meets the similarity threshold
- [ ] Generated tasks start in `planned` status
- [ ] Activity log entries created for task generation (via plugin hooks)

*State persistence and chunking:*

- [ ] Planner saves walkthrough progress to Supabase via `helm_session_state_save` after each significant decision (PRD scope approval, task approval, Q&A answers)
- [ ] On session resume after context compaction, Planner reads saved state via `helm_session_state_get` and continues from where it left off — does not restart
- [ ] When working through large sets of tasks, Planner chunks its work: complete one task fully (read → present → Q&A → approve → save state) before starting the next
- [ ] Planner reports completion with summary of tasks created

#### US-019: Planner Task Tools Usage

**Description:** As a product owner, I need Planner to use the full set of helm-bridge task tools during scoping sessions so all task state is managed through Supabase.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Acceptance Criteria:**

*Task management tools:*

- [ ] Planner uses `helm_task_create` to create tasks one at a time during walkthrough (not `helm_task_bulk_create` — individual creation allows per-task Q&A and approval)
- [ ] Planner uses `helm_task_update` to write scope, description, and acceptance criteria
- [ ] Planner uses `helm_task_add_comment` to leave scoping notes and decisions as comments
- [ ] Planner uses `helm_task_list` to find related existing tasks (avoid duplicates)
- [ ] Planner uses `helm_search_context` (when available) for semantic search of related work
- [ ] Planner uses `helm_reminder_create` to create reminders on behalf of the user during scoping sessions (e.g., "remind me to review this task's test plan tomorrow at 9am"). Builder and QA agents also have access to `helm_reminder_create` for the same purpose — any agent can create reminders when the user asks conversationally or when the agent proactively suggests one (e.g., Builder suggests a reminder to check CI results after merge)

*Session state tools:*

- [ ] Planner uses `helm_session_state_save` to persist walkthrough progress (task approvals, Q&A answers, current position in task list) after each significant decision
- [ ] Planner uses `helm_session_state_get` to restore walkthrough state on session resume after context compaction — continues from where it left off, does not restart
- [ ] State is stored in Supabase on the session record (not local files) — compaction-safe

*Behavioral constraints:*

- [ ] Planner does NOT use file-based management for task scoping — all task state goes through helm-bridge tools
- [ ] File-based PRD management (`docs/drafts/`, `docs/prds/`) is still available for complex PRD creation when working on project PRDs (existing behavior for projects that use file-based PRDs)
- [ ] Multi-task sessions: Planner can have multiple tasks linked to a session, with context for each. Tasks can be added/removed mid-session (companion PRD US-NEW-O)
- [ ] When working through large sets of tasks or complex scoping, Planner chunks its work: complete one task fully (read → present → Q&A → approve → save state) before starting the next

#### US-020: Helm Assistant Agent Prompt

**Description:** As a user, I need a dedicated agent prompt (`helm-assistant.md`) for the Helm Assistant so it behaves as a helpful project manager / admin assistant that can answer questions, audit settings, surface gaps, and initiate actions through helm-bridge tools — distinct from Builder, QA, and Planner personalities.

**Documentation:** No

**Tools:** No

**Considerations:** opencode-serve-api

**Credentials:** none

**Dependencies:** US-005 (Builder Agent Rewrite — establishes helm-bridge tool patterns that assistant reuses)

**Acceptance Criteria:**

*Agent identity & personality:*
- [ ] Create `agents/helm-assistant.md` — loaded when session mode is `assistant`
- [ ] Personality: helpful project manager / admin assistant. Conversational, non-technical by default. Adapts tone to user's technical level based on conversation history.
- [ ] Identity lock: "You are the Helm Assistant. You help users understand, configure, and manage their projects. You do NOT write code, create branches, run tests, or modify files. For implementation work, help the user start a Builder session. For testing, help them start a QA session. For planning, help them start a Planner session."
- [ ] Distinct from Builder (implements), QA (tests), and Planner (plans) — the assistant orchestrates and advises but doesn't do their work
- [ ] Model selection is handled by Helm at session launch — Helm reads the repo's `assistant_model` setting (companion PRD US-NEW-D, US-003) and passes it to the serve session. The prompt does not select or reference the model. This allows users to run the assistant on a cheaper model (e.g., Sonnet) while Builder/QA/Planner use the project default (e.g., Opus)

*Tool access (allowlist):*
- [ ] Available tools: `helm_task_create`, `helm_task_update`, `helm_task_list`, `helm_task_get`, `helm_task_add_comment`, `helm_prd_list`, `helm_prd_get`, `helm_session_list`, `helm_search_context`, `helm_reminder_create`, `helm_project_settings_get`, `helm_project_settings_update`, `helm_notification_prefs_get`, `helm_notification_prefs_set`, `helm_dashboard_widgets_get`, `helm_dashboard_widgets_set`
- [ ] Excluded tools: any tool requiring filesystem access (`helm_file_read`, `helm_file_write`), working tree operations, git operations (`helm_merge_branch`), and build/test commands
- [ ] Tool list is defined in the prompt as an explicit allowlist — the assistant prompt states which tools it can use, not which it can't (safety: new tools are excluded by default)

*Helm feature knowledge:*
- [ ] Prompt includes a concise reference section covering Helm's key concepts: task statuses and lifecycle, session types and modes, PRD structure, story hierarchy, project settings, environment strategies, notification system, reminders, dashboard widgets
- [ ] Reference is terse (bullet points, not full explanations) — enough for the LLM to answer user questions about "how does X work in Helm?" accurately
- [ ] Reference section is maintained as part of this prompt file — updated when Helm features change

*Confirmation patterns:*
- [ ] Reads are silent — no confirmation needed for queries, searches, list operations
- [ ] Writes require explicit confirmation: assistant describes the action, waits for user to confirm ("Yes" / "No"), then executes
- [ ] Confirmation is conversational (inline in chat), not a separate UI element
- [ ] Bulk operations: assistant lists all changes in a summary, user confirms the batch or requests per-item review
- [ ] If user says "just do it" or similar, assistant can batch-confirm remaining items in the current operation

*Session handoff patterns:*
- [ ] When user asks to build something: assistant creates/identifies the task(s), then tells the user to start a Builder session ("I've created the task. You can start building by clicking 'Start Building' on the task, or I can initiate it for you"). If initiating, assistant triggers the checkout + Builder session flow via the appropriate helm-bridge action
- [ ] When user asks to plan a feature: assistant helps frame the scope, then initiates a Planner session handoff — the assistant does NOT do Planner's interactive walkthrough itself
- [ ] When user asks to test: assistant identifies ready tasks and initiates QA session launch
- [ ] Handoff is explicit — the assistant tells the user what's happening ("I'm opening a Builder session for this task now") rather than silently switching agents

*Behavioral constraints in the prompt:*
- [ ] Prompt explicitly states: no filesystem access, no git operations, no code writing, no test execution
- [ ] Prompt states: all actions are attributed to the requesting user (no impersonation)
- [ ] Prompt states: cancel-only for tasks (no deletion), consistent with project policy
- [ ] Prompt states: RLS is enforced server-side — the assistant cannot access cross-org data even if asked

## Functional Requirements

- All three agents (Builder, QA, Planner) use helm-bridge plugin tools for task state management
- The Helm Assistant agent (`helm-assistant.md`) uses helm-bridge tools for reads and writes but has no filesystem or git access. Session mode: `assistant`. Loaded by Helm alongside Builder/QA/Planner based on session type.
- Agent definitions are markdown files in the `agents/` directory following existing conventions
- Session mode field (`build` | `qa` | `plan` | `assistant`) determines which agent prompt Helm loads — this is set by Helm at session creation, not by the agent
- Task context is injected via the system prompt transform hook (companion PRD US-026)
- Multi-task sessions are supported — agents can have multiple tasks linked to a single session, with context injected for each
- Builder retains both ad-hoc and PRD modes. Ad-hoc sessions auto-create tasks. PRD sessions receive pre-existing task context
- QA agent shares Builder's serve session infrastructure but has a distinct prompt and personality
- Planner sessions use Planner's existing serve infrastructure. The `plan` session mode is a schema label for the sessions table — Planner does not share Builder's serve process
- Builder's testing note writing replaces any post-session extraction hook — notes are written during the session via `helm_task_update`
- Session completion (merge, conflict resolution) is dual-path: developer can use UI button ("Complete this Session") or ask Builder conversationally. Both paths trigger the same helm-bridge merge flow. If merge hits conflicts, Helm routes them back into the same Builder session for resolution — no new session is created
- Verification state (chunk.json replacement) uses local-memory-first with Supabase sync — low-latency reads during active work, persistent storage for recovery
- Destroyed sessions are stored with "abandoned" status, not deleted

## Technical Considerations

- **Agent markdown format**: All agent definitions follow the existing markdown template structure with identity, capabilities, tools, and behavior sections.
- **QA agent prompt file**: Named `helm-qa.md` to avoid collision with existing `qa.md`. Helm knows to load this file when session mode is `qa`. The file is in `agents/` alongside other agent definitions.
- **Session mode**: Helm sets `session.mode` (`build` | `qa` | `plan` | `assistant`) at session creation. The serve process uses this to select which agent prompt to load.
- **Session linking**: Sessions can be linked to multiple tasks via the `session_tasks` junction table (companion PRD US-003). Agents receive context for all linked tasks.
- **Tool availability**: Agents depend on helm-bridge plugin tools being available. If the plugin is not loaded, agents report a clear error.
- **Verification state latency**: The local-memory-first + Supabase sync pattern for verification state ensures agents don't pay a Supabase round-trip cost on every state read. Sync happens on transitions (story complete, fix loop iteration) and periodically during long-running work.
- **Backward compatibility**: None required. The toolkit has no non-Helm consumers. All changes assume Helm infrastructure is available.
- **Related task search**: All agents can use `helm_search_context` to query embeddings for related tasks. This is a best-effort enhancement — if embeddings aren't available yet, agents proceed without.
- **Exclusive checkout**: When a task is linked to an active session, it has exclusive checkout. This is enforced by Helm, not by agent prompts.
- **Tool parameter naming**: Task tools use `assignee_ids` (array) for assignment, matching the multi-assignee model from companion PRD US-015.
- **Merge via helm-bridge**: Builder uses `helm_merge_branch` (or equivalent) for merge operations. Helm executes git commands. Builder never runs `git push`, `git merge`, `gh pr create`, or `gh pr merge` directly.
- **Skill size reduction**: The ad-hoc workflow skill (currently 1812 lines) and PRD workflow skill (currently 955 lines) should be significantly shorter after rewrite — the bulk of their current content is local file system management.

## Success Metrics

- **Legacy removal**: Zero references to `docs/tasks/`, `task-registry.json`, `docs/sessions/`, `session-locks.json`, or local `chunk.json` file paths remain in any active toolkit file
- **Ad-hoc task creation**: >90% of ad-hoc Builder sessions result in at least one auto-created task
- **Testing notes coverage**: >80% of tasks that reach `ready_for_test` have Builder-written `testing_notes_markdown`
- **QA session completion rate**: >80% of QA sessions result in a clear pass/fail/fix_required outcome
- **Planner scoping usage**: >50% of tasks receive Planner scoping before development starts
- **Fix delegation success**: >60% of in-session fix delegations result in a successful fix without leaving the QA session
- **Session completion**: Both completion paths (UI button and conversational) successfully trigger merge flow

## Credential & Service Access Plan

No external credentials required for this PRD. All changes are agent definition files and skills that use existing infrastructure (opencode serve, helm-bridge plugin, Supabase via plugin tools).

## Definition of Done

This PRD is complete when:

1. **AGENTS.md modernized** — Git Completion Workflow removed, Helm startup pattern acknowledged, autoCommit and workflow enforcement retained
2. **All legacy files deleted** — 2 agents, 5 skills, 2 templates, 2 schemas removed with no remaining references in active files
3. **Verification state migrated** — chunk.json replaced by Supabase-backed storage with local-memory-first caching; all 19 referencing skills updated
4. **Builder rewritten** — Legacy file refs removed, helm-bridge tools integrated, task auto-creation in ad-hoc mode, structured completion flow, session completion/merge via helm-bridge
5. **Ad-hoc workflow skill rewritten** — Task Spec file system removed, quality checks preserved, scope growth warnings preserved, analysis gate removed
6. **PRD workflow skill rewritten** — Local session/chunk management removed, story processing preserved, quality checks preserved, shipping replaced by Helm session completion
7. **Developer agent updated** — Legacy file refs removed, specialist routing and quality requirements preserved
8. **QA agent prompt exists** — `agents/helm-qa.md` with distinct testing personality, test step presentation, pass/fail tracking, fix delegation, and multi-task session support
9. **QA agent signals pass correctly** — Records "test passed" activity, does NOT directly transition to `merged`
10. **Planner cleaned up** — Project selection, startup dashboards, promotion pickup, local registry management all removed
11. **Planner supports task scoping** — Structured walkthrough protocol (Summary/Purpose/Q&A with shorthand responses), one-at-a-time task creation, PRD-level scope review before task generation, state persistence via `helm_session_state_save`/`helm_session_state_get` for compaction recovery
12. **All three agents use helm-bridge tools** — Task state managed through Supabase via plugin tools, not local files
13. **Multi-task sessions work** — All three agents handle multiple linked tasks with dynamic context updates
14. **Session completion is dual-path** — Both UI button and conversational merge work through helm-bridge tools
15. **Destroyed sessions stored as abandoned** — Same storage as completed sessions, different status
16. **Existing agents preserved** — `qa.md`, `tester.md`, all specialist agents, Builder's delegation patterns all unchanged
17. **Helm Assistant prompt exists** — `agents/helm-assistant.md` with project manager personality, explicit tool allowlist, confirmation patterns, Helm feature knowledge reference, session handoff patterns to Builder/QA/Planner, and behavioral constraints (no filesystem, no git, no code, no impersonation)

## Flag Review

| Story | Support Article? | Tools? | Reasoning |
|-------|------------------|--------|-----------|
| US-001: AGENTS.md Modernization | No | No | Toolkit infrastructure |
| US-002: Legacy File System Removal | No | No | Toolkit infrastructure — deletions |
| US-003: Verification State Migration | No | No | Backend state migration |
| US-004: Minor Reference Cleanup | No | No | Toolkit infrastructure — ref updates |
| US-005: Builder Agent Rewrite | No | No | Agent prompt changes |
| US-006: Builder Ad-Hoc Task Auto-Creation | No | No | Agent behavior change |
| US-007: Task-Aware Builder Sessions | No | No | Agent behavior change |
| US-008: Builder Completion Flow | No | No | Agent behavior change |
| US-009: Builder Session Completion & Merge | No | No | Agent/Helm integration |
| US-010: Ad-Hoc Workflow Skill Rewrite | No | No | Skill rewrite |
| US-011: PRD Workflow Skill Rewrite | No | No | Skill rewrite |
| US-012: Developer Agent Updates | No | No | Agent prompt cleanup |
| US-013: QA Agent Prompt | No | No | New agent prompt |
| US-014: QA Agent Fix Delegation | No | No | Agent behavior |
| US-015: QA Agent Test Completion | No | No | Agent behavior |
| US-016: Planner Agent Legacy Cleanup | No | No | Agent prompt cleanup |
| US-017: Planner Task Scoping via Helm | No | No | Agent behavior change |
| US-018: PRD-to-Tasks via Planner Session | No | No | Agent behavior change |
| US-019: Planner Task Tools Usage | No | No | Agent behavior change |
| US-020: Helm Assistant Agent Prompt | No | No | New agent prompt |
