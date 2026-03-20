# Agent & Toolkit Updates — Companion Task File

> **Companion PRD:** `prd-agent-updates.md`
> **Companion macOS PRD:** `prd-task-management` (in helm-ade-macos)
> **Stories:** 20 across 3 phases
> **Tasks:** 20 (one per story)
> **All phases implemented simultaneously** — no phased rollout
> **Generated:** 2026-03-19

## How to Use This File

### For Builder (during implementation)
- Each task below maps to one PRD story
- Check off ACs as you complete them
- Add implementation notes in the `Builder Notes` section per task
- You may split a task into sub-tasks, collapse multiple tasks, or create new tasks as needed — update this file to reflect your changes
- When you finish a task, add a `Testing Notes` section with structured guidance for QA

### For QA (after implementation)
- Use this file as your testing checklist
- Each task's ACs become verification steps
- Builder's `Testing Notes` sections provide additional testing guidance
- Mark each AC as verified: ✅ (pass), ❌ (fail), ⚠️ (warning)

---

## Phase 1: Legacy Removal & Infrastructure

### TASK-001: AGENTS.md Modernization
**Story:** US-001
**Priority:** high
**Labels:** infrastructure, guardrails
**Status:** planned
**Companion macOS stories:** N/A (toolkit-only)

**Acceptance Criteria:**

- [ ] The "Git Completion Workflow" section (Steps 1-7: validate config, commit, push, PR prompt, PR creation, merge handling, report completion) is removed entirely from `AGENTS.md`
- [ ] The "Git Auto-Commit Enforcement" section is retained — agents still respect `git.autoCommit` settings when committing during work
- [ ] The "Git Workflow Enforcement" section is retained — `pushTo`, `createPrTo`, and `requiresHumanApproval` validation is still relevant for Helm-side enforcement
- [ ] The "Helm ADE Startup Pattern" section is retained — agents read `HELM_PROJECT_PATH` environment variable, skip project selection tables, skip startup dashboards, skip terminal title setting
- [ ] References to the removed Git Completion Workflow in other sections of `AGENTS.md` are cleaned up (e.g., cross-references from ad-hoc/PRD mode instructions)
- [ ] No other sections of `AGENTS.md` are modified (Protected System Resources, Temporary Files, Global Coding Behavior, Test Failure Output Policy, Requesting Toolkit Updates, etc.)

**Implementation guidance:**
- Start by reading the full `AGENTS.md` and identifying every reference to "Git Completion Workflow"
- The section to remove is clearly marked with a header — delete the entire section (Steps 1-7) and its subsections
- Search for cross-references: other sections may say "see Git Completion Workflow" or "follows the Git Completion Workflow" — these need cleanup
- Validate the remaining file reads coherently after removal

**Build Target:** helm-ade-toolkit (AGENTS.md)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-002: Legacy File System Removal
**Story:** US-002
**Priority:** high
**Labels:** infrastructure, cleanup
**Status:** planned
**Companion macOS stories:** N/A (toolkit-only deletions)

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
- [ ] All references to deleted items in other toolkit files are identified and noted (actual reference cleanup is covered by TASK-004)
- [ ] No files outside the deleted set are modified by this story

**Implementation guidance:**
- Delete files in the order listed. Total: 11 files across 4 directories
- After deletion, run a grep across the entire toolkit for each deleted filename to catalog references (do NOT fix them — that is TASK-004)
- Record the reference list in Builder Notes for TASK-004 to consume

**Build Target:** helm-ade-toolkit (file deletions)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-003: Verification State Migration
**Story:** US-003
**Priority:** high
**Labels:** infrastructure, state-management
**Status:** planned
**Depends On:** TASK-002
**Companion macOS stories:** US-003 (schema — `agent_state` jsonb on sessions), US-NEW-N (session history)

**Acceptance Criteria:**

- [ ] Verification state (test results, fix loop tracking, critic dispatch records, reassignment history) is stored in Supabase via helm-bridge tools (`helm_session_update` or equivalent)
- [ ] Agents maintain state in local memory during active work for low-latency access — no Supabase round-trip for every state read
- [ ] Local memory state syncs to Supabase periodically and on key transitions (story completion, fix loop iteration, session pause/complete)
- [ ] On session resume, state is loaded from Supabase (recovering from crashes, context compaction, or session restarts)
- [ ] `schemas/chunk.schema.json` is updated to document the Supabase-backed data structures (the schema remains as documentation of the data shape, not as a local file format)
- [ ] `schemas/builder-config.schema.json` is updated to remove `lastSessionPath` and other local session file references
- [ ] The 19 skills that reference `chunk.json` for verification state are updated to use the new Supabase-backed access pattern (the actual skill updates are covered by TASK-004, but this story defines the access pattern they use)
- [ ] A clear API contract is defined for how skills read/write verification state: `helm_session_state_get(key)` / `helm_session_state_save(key, value)` or equivalent

**Implementation guidance:**
- The `agent_state` jsonb column on the sessions table (macOS PRD US-003) is the Supabase storage target
- The access pattern should use `helm_session_state_save` and `helm_session_state_get` tools (macOS PRD US-002)
- Document the API contract clearly — TASK-004 (19 skill updates) depends on this contract
- Local-memory-first means: read from Supabase once on session start/resume, cache in memory, write back on transitions
- The sync cadence during active work should be defined (e.g., every N minutes or on specific events)

**Build Target:** helm-ade-toolkit (schemas + API contract documentation)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-004: Minor Reference Cleanup
**Story:** US-004
**Priority:** medium
**Labels:** infrastructure, cleanup
**Status:** planned
**Depends On:** TASK-002, TASK-003
**Companion macOS stories:** N/A (toolkit-only reference updates)

**Acceptance Criteria:**

- [ ] The following skills have `chunk.json` / `session.json` / `docs/sessions/` references updated to use the Supabase-backed verification state pattern defined in TASK-003:
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

**Implementation guidance:**
- Use the reference list from TASK-002's Builder Notes as a starting point
- For each file: find the legacy path reference, replace with the API contract from TASK-003
- `session-state/SKILL.md` needs the most attention — it has structural references to `docs/sessions/` beyond simple path mentions
- Test each updated skill/agent loads correctly (no syntax errors in markdown)
- Total: 11 skills + 5 agents = 16 files to update

**Build Target:** helm-ade-toolkit (skills + agents)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

## Phase 2: Agent Rewrites

### TASK-005: Builder Agent Rewrite
**Story:** US-005
**Priority:** high
**Labels:** agent, builder, rewrite
**Status:** planned
**Depends On:** TASK-001, TASK-002
**Companion macOS stories:** US-026 (context injection hook), US-NEW-O (mid-session task add/remove)

**Acceptance Criteria:**

- [ ] Legacy project selection logic removed — Builder no longer renders project selection tables or reads `projects.json`; Helm provides project context via `HELM_PROJECT_PATH` environment variable
- [ ] All references to `docs/sessions/`, session-log integration, local session archives, and `session-locks.json` removed
- [ ] All references to the Git Completion Workflow (push, PR creation, merge) removed — session completion is handled by Helm (see TASK-009)
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

**Implementation guidance:**
- This is the largest rewrite (~1825 lines). Read the full current `builder.md` first
- Preserve sections: Identity Lock, Token Budget, Lean Execution, Story Processing Pipeline, delegation patterns
- Remove sections: project selection, startup dashboard, Git Completion Workflow references, session-log integration, `docs/sessions/` paths
- Add sections: helm-bridge tool usage, multi-task session handling, task context consumption
- The rewritten file should be significantly shorter — most removed content is startup/shipping ceremony

**Build Target:** helm-ade-toolkit (agents/builder.md)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-006: Builder Ad-Hoc Task Auto-Creation
**Story:** US-006
**Priority:** high
**Labels:** agent, builder, ad-hoc
**Status:** planned
**Depends On:** TASK-005
**Companion macOS stories:** US-NEW-C (ad-hoc task auto-creation behavior), US-032 (story embeddings for auto-assignment)

**Acceptance Criteria:**

- [ ] Builder retains ad-hoc mode — when no task context is injected, Builder works normally on the user's request
- [ ] When Builder completes a logical unit of work in an ad-hoc session, it creates a task via `helm_task_create` with: title (derived from work done), description (what was built), labels (inferred from file types/areas), and the original user prompt as first activity entry
- [ ] Auto-created task is immediately linked to the current session
- [ ] If Builder completes multiple logical units in one session, each gets its own task
- [ ] Auto-created tasks land at `agent_build_complete` status — the developer is present but hasn't reviewed the work yet
- [ ] Builder writes testing notes to auto-created tasks (same as task-linked sessions — see TASK-008)
- [ ] Story assignment is handled server-side by the `helm_task_create` plugin tool — Builder passes the task description and the plugin performs semantic matching against story embeddings (US-032 in companion PRD) to auto-assign; auto-creates a new story if no match meets the similarity threshold. Builder does not query embeddings directly for story assignment
- [ ] Builder still delegates to `@developer` → specialists (never writes code directly)
- [ ] Existing PRD mode is unaffected — PRD-linked sessions receive task context via injection and do not auto-create tasks

**Implementation guidance:**
- This is behavioral guidance within `builder.md`, not a separate file
- The "logical unit of work" boundary is left to prompt engineering — Builder decides when a unit is complete
- Story auto-assignment is server-side (plugin tool handles it) — Builder just calls `helm_task_create` with a description
- Auto-created tasks always start at `agent_build_complete` (not `planned` or `in_progress`)

**Build Target:** helm-ade-toolkit (agents/builder.md — ad-hoc section)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-007: Task-Aware Builder Sessions
**Story:** US-007
**Priority:** high
**Labels:** agent, builder
**Status:** planned
**Depends On:** TASK-005
**Companion macOS stories:** US-026 (context injection), US-NEW-O (mid-session task management)

**Acceptance Criteria:**

- [ ] Builder reads task context from system prompt (injected by companion PRD US-026 context injection hook)
- [ ] Builder uses `helm_task_get` to fetch latest task state at session start
- [ ] Builder uses `helm_search_context` (when available) to find related tasks, past sessions, and known issues — surfaces connections to the developer
- [ ] Builder's work plan is derived from the task's acceptance criteria and scope notes
- [ ] Builder delegates to `@developer` with the task's acceptance criteria as implementation requirements
- [ ] Builder can use `helm_task_add_comment` to leave notes or questions on the task
- [ ] If the task has sub-tasks, Builder can see them and work on them in order
- [ ] Multi-task sessions: when multiple tasks are linked, Builder receives context for all tasks and works through them. Dynamic updates when tasks are added/removed mid-session (companion PRD US-NEW-O)

**Implementation guidance:**
- Task context arrives via system prompt injection (Helm injects it, Builder consumes it)
- Builder should describe how it uses each field: title → work plan header, description → scope understanding, ACs → implementation checklist, scope_markdown → detailed requirements
- Multi-task handling: Builder should describe its strategy for multiple tasks (sequential, prioritized, etc.)

**Build Target:** helm-ade-toolkit (agents/builder.md — task context section)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-008: Builder Completion Flow
**Story:** US-008
**Priority:** high
**Labels:** agent, builder, completion
**Status:** planned
**Depends On:** TASK-005
**Companion macOS stories:** US-008 (task detail — developer reviews and promotes status)

**Acceptance Criteria:**

- [ ] On completion of a task, Builder uses `helm_task_update` to write structured testing notes (`testing_notes_markdown`) — what to test, how to verify, edge cases, any manual steps needed
- [ ] Builder writes testing notes directly during its session (not extracted post-session by a hook)
- [ ] If automated testing is enabled (project-level default in `project.json`, toggleable at session launch), Builder delegates to `@tester` to write and run automated tests before marking ready
- [ ] If automated tests fail, Builder auto-fixes (delegates to `@developer`) and retries, up to max attempts. On max-attempts failure, task still transitions with activity entry noting test failures
- [ ] After testing notes are written (and optional automated tests pass), Builder transitions the task to `agent_build_complete` status via `helm_task_update`
- [ ] `agent_build_complete` is an automated status — Builder sets it when finished. Developer reviews the work, then manually promotes to `dev_testing` and then `ready_for_test` via Helm UI (companion PRD US-008)
- [ ] Multi-task sessions: each task completes independently with its own testing notes and status transition
- [ ] Builder's delegation to `@developer`, `@tester`, and `@critic` is unchanged

**Implementation guidance:**
- Testing notes format should be structured markdown: sections for "What to Test", "How to Verify", "Edge Cases", "Manual Steps"
- The testing notes replace the post-session extraction hook from the old system — Builder writes them directly
- Status transition: Builder only sets `agent_build_complete`. The developer manually promotes through `dev_testing` → `ready_for_test` via Helm UI

**Build Target:** helm-ade-toolkit (agents/builder.md — completion section)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-009: Builder Session Completion & Merge
**Story:** US-009
**Priority:** high
**Labels:** agent, builder, merge, session-completion
**Status:** planned
**Depends On:** TASK-005
**Companion macOS stories:** US-022 (branch-scoped merge & conflict resolution), US-NEW-D (workflow configuration)

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

**Implementation guidance:**
- This replaces the entire Git Completion Workflow from AGENTS.md
- Builder's role is conversational orchestration — Helm does the actual git work
- Conflict resolution: Builder uses `@developer` to fix conflicts in the working tree, then signals Helm to re-attempt merge
- The dual-path (UI button vs conversational) should be described clearly in the prompt — Builder handles both the same way

**Build Target:** helm-ade-toolkit (agents/builder.md — session completion section)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-010: Ad-Hoc Workflow Skill Rewrite
**Story:** US-010
**Priority:** high
**Labels:** skill, rewrite, ad-hoc
**Status:** planned
**Depends On:** TASK-005, TASK-003
**Companion macOS stories:** US-NEW-C (ad-hoc auto-creation behavior)

**Acceptance Criteria:**

- [ ] **Removed entirely:**
  - Task Spec file generation (`docs/tasks/task-YYYY-MM-DD-*.md`)
  - `task-registry.json` management
  - Local file archival (`docs/tasks/completed/`, `docs/tasks/abandoned/`)
  - Local promotion documents (`docs/tasks/promotions/promote-task-*.md`)
  - Phase 2 "Ship" flow (git commit, push, PR creation) — replaced by Helm session completion (TASK-009)
  - Structured analysis gate (Phase 0 with screenshots, dashboard rendering, `[G]` approval menu) — ad-hoc means "go straight to Builder." If the developer wants analysis/planning, they use Planner first
- [ ] **Preserved and updated:**
  - Quality checks via `test-flow` skill — still runs before completion, results recorded via helm-bridge tools instead of chunk.json
  - Scope growth detection/warning — Builder warns when ad-hoc work exceeds original scope, suggests breaking into multiple tasks (via `helm_task_create`)
  - Design decision capture — significant design decisions recorded as task comments via `helm_task_add_comment`
- [ ] Task creation during ad-hoc sessions uses `helm_task_create` (as defined in TASK-006)
- [ ] All state that was previously written to local files is now written to Supabase via helm-bridge tools
- [ ] The rewritten skill is significantly shorter than 1812 lines — the bulk of the current skill is Task Spec file management

**Implementation guidance:**
- Read the current 1812-line skill first and identify the three categories: REMOVE, PRESERVE, UPDATE
- The analysis gate (Phase 0) is removed entirely — this was a major source of complexity
- Scope growth warnings: keep the detection logic, change the output from "promote to PRD" to "create additional tasks via helm_task_create"
- Target length: ~200-400 lines (80%+ reduction)

**Build Target:** helm-ade-toolkit (skills/adhoc-workflow/SKILL.md)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-011: PRD Workflow Skill Rewrite
**Story:** US-011
**Priority:** high
**Labels:** skill, rewrite, prd
**Status:** planned
**Depends On:** TASK-005, TASK-003
**Companion macOS stories:** US-013 (PRD task generation), US-012 (PRD detail view)

**Acceptance Criteria:**

- [ ] **Removed entirely:**
  - Local `session.json` and `chunk.json` file creation/management — session state now in Supabase
  - Local branch setup — Helm creates working branches for sessions
  - Local session archive (`docs/sessions/` archival on completion)
  - Phase 3 "Ship" flow (git commit, push, PR creation) — replaced by Helm session completion (TASK-009)
- [ ] **Preserved and updated:**
  - PRD story processing pipeline — Builder processes stories in order, tracks progress via helm-bridge tools instead of local files
  - Story status tracking — uses Supabase-backed verification state (TASK-003 pattern) instead of `chunk.json`
  - Quality checks via `test-flow` skill — results recorded via helm-bridge tools
  - Critic dispatch — `@critic` routing still works, dispatch records stored via Supabase instead of chunk.json
  - Fix loop tracking — retry counts and fix history stored via Supabase instead of chunk.json
- [ ] PRD content is read via `helm_prd_get` (or from local file system if PRD is a local markdown file)
- [ ] Story completion transitions use `helm_task_update` to set task status
- [ ] The rewritten skill reflects that shipping is now Helm-managed — the skill's job ends at "all stories complete, all quality checks pass," and session completion is handled by TASK-009

**Implementation guidance:**
- Read the current 955-line skill and identify REMOVE vs PRESERVE sections
- The story processing pipeline is the core value — preserve it fully
- Replace all `chunk.json` reads/writes with `helm_session_state_get`/`helm_session_state_save`
- The "Ship" phase is eliminated — skill ends at "all stories complete"
- Target length: ~300-500 lines (50%+ reduction)

**Build Target:** helm-ade-toolkit (skills/prd-workflow/SKILL.md)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-012: Developer Agent Updates
**Story:** US-012
**Priority:** medium
**Labels:** agent, developer, cleanup
**Status:** planned
**Depends On:** TASK-002
**Companion macOS stories:** N/A (toolkit-only cleanup)

**Acceptance Criteria:**

- [ ] References to `docs/prd.json` removed — PRD data comes from helm-bridge tools or system prompt injection
- [ ] References to `docs/progress.txt` removed — progress tracked via Supabase
- [ ] References to `docs/sessions/` removed — session state in Supabase
- [ ] Specialist routing is preserved: `@developer` delegates to `@react-dev`, `@swift-dev`, `@go-dev`, `@java-dev`, `@python-dev`, `@aws-dev`, `@docker-dev`, `@terraform-dev`, `@public-page-dev` based on file types and task context
- [ ] Quality requirements are preserved: `@developer` runs `@critic` for review, follows test-flow for quality checks
- [ ] `@developer` continues to be the primary implementation agent that Builder and QA agent delegate to — this role is unchanged

**Implementation guidance:**
- This is a minor cleanup (~714 lines). Search for the 3 legacy paths and replace/remove references
- Do NOT change specialist routing or quality check patterns — those are the core of this agent
- Verify the file reads coherently after changes

**Build Target:** helm-ade-toolkit (agents/developer.md)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

## Phase 3: QA Agent, Planner & Assistant

### TASK-013: QA Agent Prompt
**Story:** US-013
**Priority:** high
**Labels:** agent, qa, new-file
**Status:** planned
**Depends On:** TASK-005
**Companion macOS stories:** US-021 (QA session launch UI), US-NEW-Q (session inspector Tasks tab)

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

**Implementation guidance:**
- This is a new file — `agents/helm-qa.md`. Named `helm-qa.md` to avoid collision with existing `qa.md`
- Follow the same markdown structure as the rewritten `builder.md` (identity lock, tools, behavior sections)
- The QA agent uses the SAME helm-bridge plugin tools as Builder (task tools, search, reminders) but with a distinct personality and workflow
- Key personality trait: QA agent is a verifier, not an implementer. It asks "does this work?" not "let me build this"
- Test step derivation: read `testing_notes_markdown` from the task (written by Builder in TASK-008), then present as a walkthrough
- Multi-task support: track results per task, offer to pivot between tasks in the session

**Build Target:** helm-ade-toolkit (agents/helm-qa.md — new file)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-014: QA Agent Fix Delegation
**Story:** US-014
**Priority:** medium
**Labels:** agent, qa, fix-delegation
**Status:** planned
**Depends On:** TASK-013
**Companion macOS stories:** US-008 (task detail — fix_required status transition)

**Acceptance Criteria:**

- [ ] When tester reports a failure, QA agent asks: "Should I try to fix this now, or send it to a developer?"
- [ ] If fix now: QA agent delegates to `@developer` with failure context (what failed, expected behavior, actual behavior, relevant code/screenshot context)
- [ ] `@developer` delegates to the appropriate specialist (`@swift-dev`, `@react-dev`, etc.)
- [ ] After fix is applied, QA agent resumes the testing conversation where the tester left off
- [ ] If send to developer: QA agent sets task to `fix_required` status via `helm_task_update`, releases exclusive checkout, and records failure context as activity entry
- [ ] QA agent can also run automated tests inline — delegates to `@tester` if the task has registered test files
- [ ] All fix attempts and results are recorded in the task's activity log via `helm_task_add_activity`
- [ ] Tester sees one unified conversation throughout (including fix cycles)

**Implementation guidance:**
- This is behavioral guidance within `helm-qa.md`, not a separate file
- The fix-now path reuses Builder's delegation pattern: QA → `@developer` → specialist → fix → QA resumes
- The send-to-developer path is simpler: update status, record context, release checkout, done
- The unified conversation is important UX — the tester should never feel like the session restarted after a fix
- Automated test delegation to `@tester` follows the same pattern as Builder's test delegation

**Build Target:** helm-ade-toolkit (agents/helm-qa.md — fix delegation section)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-015: QA Agent Test Completion
**Story:** US-015
**Priority:** medium
**Labels:** agent, qa, completion
**Status:** planned
**Depends On:** TASK-013
**Companion macOS stories:** US-022 (branch-scoped merge — all tasks must pass before merge)

**Acceptance Criteria:**

- [ ] When all test steps pass, QA agent records a "test passed" activity entry on the task via `helm_task_add_activity` (who passed it, when, summary)
- [ ] QA agent does NOT directly transition the task to `merged` — it records the pass. Helm macOS app handles branch-scoped merge logic (all tasks on a branch must pass before merge, per companion PRD US-022)
- [ ] If some steps have warnings (non-blocking), QA agent includes them in the pass summary
- [ ] If the tester decides to fail the task entirely, QA agent offers: "Send to developer" (`fix_required`) or "Send to planner" (`needs_planning`)
- [ ] In multi-task sessions: after a task passes, QA agent asks "Move to next task?" and pivots to the next linked task. Tester can also click a task in the inspector Tasks tab (companion PRD US-NEW-Q) to pivot
- [ ] Task status transitions are handled via `helm_task_update`

**Implementation guidance:**
- Critical distinction: QA agent records the pass but does NOT merge. Merge is Helm's responsibility (branch-scoped — all tasks on a branch must pass)
- The `needs_planning` status (not `replanning`) is the correct name for the "send to planner" transition
- Multi-task pivoting: QA agent should present a summary of remaining tasks and let the tester choose next, or offer sequential progression
- Warning handling: warnings are non-blocking — they appear in the pass summary but don't prevent the pass

**Build Target:** helm-ade-toolkit (agents/helm-qa.md — completion section)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-016: Planner Agent Legacy Cleanup
**Story:** US-016
**Priority:** medium
**Labels:** agent, planner, cleanup
**Status:** planned
**Depends On:** TASK-002
**Companion macOS stories:** N/A (toolkit-only cleanup)

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

**Implementation guidance:**
- Current `planner.md` is ~566 lines. The removal list is substantial — most of the startup flow goes away
- The "Preserved and updated" list is the core Planner value that must survive: PRD creation, codebase analysis, Q&A, DoD authoring
- The Helm startup pattern from AGENTS.md applies: read `HELM_PROJECT_PATH`, skip selection/dashboard, address user's first message directly
- After cleanup, Planner should be shorter — the startup ceremony was a major portion of the file

**Build Target:** helm-ade-toolkit (agents/planner.md)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-017: Planner Task Scoping via Helm
**Story:** US-017
**Priority:** high
**Labels:** agent, planner, scoping
**Status:** planned
**Depends On:** TASK-016
**Companion macOS stories:** US-008 (task detail — scope fields), US-NEW-O (mid-session task management)

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

**Implementation guidance:**
- This is the structured walkthrough protocol — the core Planner interaction pattern for Helm
- The Summary/Purpose/Q&A format is rigid by design: Planner always presents in this structure so users know what to expect
- Shorthand responses (`1A, 2C, 3B`) are essential UX — users should never have to write paragraphs during scoping
- State persistence via `helm_session_state_save`/`helm_session_state_get` makes this compaction-safe — Planner can resume a long scoping session after context compaction without restarting
- Chunking: complete one task fully before starting the next. This prevents losing work if the session is interrupted
- Sub-task creation is one-at-a-time via `helm_task_create` (no bulk create)

**Build Target:** helm-ade-toolkit (agents/planner.md — task scoping section)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-018: PRD-to-Tasks Generation via Planner Session
**Story:** US-018
**Priority:** high
**Labels:** agent, planner, prd, task-generation
**Status:** planned
**Depends On:** TASK-016, TASK-017
**Companion macOS stories:** US-013 (PRD task generation UI), US-012 (PRD detail view)

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

**Implementation guidance:**
- This extends the walkthrough protocol from TASK-017 to PRD-level scope
- The key difference from TASK-017: PRD-to-tasks has an extra initial step — PRD-level scope review (intro, goals, non-goals, architecture) before diving into individual tasks
- Story assignment uses semantic matching (embeddings available from start) — `helm_task_create` handles matching server-side via the plugin
- One-at-a-time creation is critical: user approves each task individually, Planner creates it immediately via `helm_task_create`, then moves to next
- State persistence ensures a large PRD with 20+ stories can be broken down across multiple context windows without restarting

**Build Target:** helm-ade-toolkit (agents/planner.md — PRD task generation section)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-019: Planner Task Tools Usage
**Story:** US-019
**Priority:** medium
**Labels:** agent, planner, tools
**Status:** planned
**Depends On:** TASK-016
**Companion macOS stories:** US-002 (helm-bridge plugin tools — tool definitions), US-NEW-R (reminder schema)

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

**Implementation guidance:**
- This task defines the tool usage section of `planner.md` — which tools Planner uses and how
- The tool list should be explicit in the prompt (similar to how the assistant has an allowlist)
- `helm_reminder_create` is available to ALL agents (Builder, QA, Planner, Assistant) — not Planner-specific
- `helm_search_context` is best-effort: Planner should use it to find related work when available, but proceed without it if embeddings aren't ready
- Session state tools (`helm_session_state_save`/`helm_session_state_get`) are critical for compaction safety — document when to save (after each significant decision)

**Build Target:** helm-ade-toolkit (agents/planner.md — tools section)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

### TASK-020: Helm Assistant Agent Prompt
**Story:** US-020
**Priority:** medium
**Labels:** agent, assistant, new-file
**Status:** planned
**Depends On:** TASK-005
**Companion macOS stories:** US-NEW-W (Helm Assistant UI — sidebar icon, slide-in panel, persistent session)

**Acceptance Criteria:**

*Agent identity & personality:*
- [ ] Create `agents/helm-assistant.md` — loaded when session mode is `assistant`
- [ ] Helm passes the per-repo `assistant_model` setting to the serve session at launch; the agent prompt does NOT select the model
- [ ] Personality: helpful project manager / admin assistant. Conversational, non-technical by default. Adapts tone to user's technical level based on conversation history.
- [ ] Identity lock: "You are the Helm Assistant. You help users understand, configure, and manage their projects. You do NOT write code, create branches, run tests, or modify files. For implementation work, help the user start a Builder session. For testing, help them start a QA session. For planning, help them start a Planner session."
- [ ] Distinct from Builder (implements), QA (tests), and Planner (plans) — the assistant orchestrates and advises but doesn't do their work

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

**Implementation guidance:**
- This is a new file — `agents/helm-assistant.md`. Follow the same markdown structure as other agent prompts
- The `assistant_model` AC is important: Helm passes the per-repo model setting at session launch. The prompt does NOT reference or select the model. This allows users to run the assistant on a cheaper model (e.g., Sonnet) while Builder/QA/Planner use the project default (e.g., Opus)
- The tool allowlist is explicit — list what the assistant CAN use, not what it can't. New tools are excluded by default (safety)
- The Helm feature knowledge section should be concise bullet points — enough for the LLM to answer "how does X work in Helm?" but not a full user manual
- Confirmation patterns: reads are silent, writes get confirmation. This prevents the assistant from modifying things without user awareness
- Session handoffs are the key differentiator: the assistant doesn't DO work, it helps the user START the right session type for their goal

**Build Target:** helm-ade-toolkit (agents/helm-assistant.md — new file)
**Builder Notes:** _To be filled by Builder_
**Testing Notes:** _To be filled by Builder_

---

## Summary

| Phase | Tasks | Priority Mix |
|-------|-------|-------------|
| Phase 1: Legacy Removal & Infrastructure | TASK-001 through TASK-004 (4 tasks) | 3 high, 1 medium |
| Phase 2: Agent Rewrites | TASK-005 through TASK-012 (8 tasks) | 7 high, 1 medium |
| Phase 3: QA Agent, Planner & Assistant | TASK-013 through TASK-020 (8 tasks) | 4 high, 4 medium |
| **Total** | **20 tasks** | **14 high, 6 medium** |
