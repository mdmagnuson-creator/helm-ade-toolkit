---
name: prd-workflow
description: "PRD mode workflow for Builder. Use when building features from PRDs, implementing user stories, or managing PRD state transitions. Triggers on: PRD mode, build PRD, implement stories, ship PRD."
---

# PRD Workflow

> Load this skill when: building features from PRDs, implementing user stories, managing PRD state transitions.

## Prerequisites

> ⛔ **CRITICAL: This skill requires MCP connection to Helm.**
>
> Before performing any PRD operations, verify the MCP `prd_*` and task tools are available.
> If tools are not available, STOP and report:
> ```
> ⛔ MCP tools not available. Cannot perform PRD operations 
> without Helm connection. Ensure Helm ADE is running and 
> MCP server is connected.
> ```
>
> **Do NOT fall back to file I/O** — if the tools fail, stop.

## Overview

PRD mode implements features from PRDs stored in Supabase. Each PRD story maps to a task that Builder processes in sequence.

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   CLAIM PRD         │ ──► │   BUILD STORIES     │ ──► │   COMPLETE          │
│                     │     │                     │     │                     │
│ Load PRD, check     │     │ Process stories in  │     │ All stories done,   │
│ conflicts, claim    │     │ order, quality      │     │ hand off to Builder │
│                     │     │ checks per story    │     │ completion flow     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

## MCP Tools Reference

| Tool | Purpose |
|------|---------|
| `query_prd` | Fetch PRD content and stories from Supabase |
| `query_prds` | List PRDs with filters (status, limit) |
| `prd_changeStatus` | Update PRD status |
| `prd_updateProgress` | Update PRD progress (current_story, completed_stories) |
| `prd_story_update` | Update story status after completion |
| `query_tasks` | Query tasks (each story maps to a task) |
| `task_changeStatus` | Update task status |
| `task_editDescription` | Update task fields, testing notes |
| `task_saveComment` | Leave notes/questions on a task |
| `session_saveState` | Persist session state (fix loop counts, verification state) |
| `query_session_state` | Read session state |

---

## PRD Lifecycle States

PRDs progress through these states:

```
┌───────┐     ┌───────┐     ┌─────────────┐     ┌─────────┐     ┌───────────┐
│ draft │ ──► │ ready │ ──► │ in_progress │ ──► │ pr_open │ ──► │ completed │
└───────┘     └───────┘     └─────────────┘     └─────────┘     └───────────┘
```

| State | Meaning |
|-------|---------|
| `draft` | PRD exists but not ready for implementation |
| `ready` | PRD approved, waiting to be picked up |
| `in_progress` | Implementation actively happening |
| `pr_open` | PR created, awaiting review/merge |
| `completed` | PR merged, work done |

---

## Phase 1: Claim PRD

When user selects a PRD to build:

### Step 1: Load PRD Content

Fetch the PRD and its stories:

```
query_prd({ prd_id: "prd-[name]" })
```

The response includes:
- PRD metadata (title, description, status)
- Stories array with id, description, acceptance criteria, status

### Step 2: Check for Conflicts

List active PRDs to check for conflicts:

```
query_prds({ status: "in_progress" })
```

- If HIGH conflict risk with an active session, warn and get confirmation
- If MEDIUM conflict risk, note it but proceed if user confirms

### Step 3: Claim the PRD

Update the PRD to claim it:

```
prd_changeStatus({
  prd_id: "prd-[name]",
  status: "in_progress"
})
prd_updateProgress({
  prd_id: "prd-[name]",
  started_at: "<ISO timestamp>",
  current_story: "US-001"
})
```

### Step 4: Display Story List

Show the stories and offer to proceed:

```
═══════════════════════════════════════════════════════════════════════
                      STARTING PRD EXECUTION
═══════════════════════════════════════════════════════════════════════

PRD: {prd-title}
Stories: {total count}

  US-001: {description}
  US-002: {description}
  US-003: {description}
  ...

Pipeline per story: implement → test-flow → status update

[G] Go — start executing stories

> _
═══════════════════════════════════════════════════════════════════════
```

---

## Phase 2: Build Stories

Process each story in priority order.

### Per-Story Flow

For each story:

#### Step 2.1: Delegate to @developer

Generate a verification contract and delegate implementation:

```yaml
<context>
version: 1
project:
  path: {absolute path}
  stack: {stack from project.json}
  commands:
    test: {commands.test}
    lint: {commands.lint}
conventions:
  summary: |
    {2-5 sentence summary from CONVENTIONS.md}
currentWork:
  mode: prd
  prdId: "prd-[name]"
  storyId: "US-001"
  description: "{story description}"
</context>

Implement: {story description}

## Verification Contract

Your work will be verified by:
1. Typecheck — No type errors
2. Lint — No lint errors
3. Unit tests — Tests for [component/module] must pass
4. [E2E if applicable] — Page behavior test

Requirements:
- {acceptance criteria from story}
```

#### Step 2.2: Run Quality Checks

> 📚 **SKILL: test-flow** → "Skip Gate → Activity Resolution → Quality Check Pipeline"
>
> Load the `test-flow` skill for the complete quality check pipeline.
> It includes typecheck/lint/test/rebuild/critic/Playwright.
>
> **PRD-specific context:**
> - `mode: "prd"` — 5-attempt Playwright retry strategy (vs ad-hoc's 3-attempt)
> - `storyId` and `prdId` for scoped test selection
>
> **Failure behavior:** Steps 1-4 (typecheck/lint/test/critic): max 3 attempts, then STOP.
> Step 5 (Playwright): max 5 attempts, then skip and log, continue to next story.

Record quality check results — activity logging is handled automatically by Helm's CommandLogSubscriber. No manual activity recording needed.

#### Step 2.3: Track Fix Loop (if needed)

If quality checks fail, track fix attempts via session state:

```
// Track fix loop for story
session_saveState({
  fixLoop: {
    "US-001": {
      attempts: 2,
      lastError: "typecheck failed: Property 'foo' does not exist",
      lastAttempt: "<ISO timestamp>"
    }
  }
})
```

After each fix attempt, re-run quality checks. Max 3 attempts for typecheck/lint/test, max 5 for Playwright.

#### Step 2.4: Update Story Status

After story completes and quality checks pass:

**Update the story in Supabase:**

```
prd_story_update({
  prd_id: "prd-[name]",
  story_id: "US-001",
  status: "completed",
  completed_at: "<ISO timestamp>",
  notes: "Implemented with React component, added unit tests"
})
```

**Update PRD progress:**

```
prd_updateProgress({
  prd_id: "prd-[name]",
  current_story: "US-002",  // next pending story
  completed_stories: 1
})
```

**Update task status:**

```
task_changeStatus({
  task_id: "{story_task_id}",
  status: "agent_build_complete"
})
```

#### Step 2.5: Commit Story Changes

> ⚓ **AGENTS.md: Git Auto-Commit Enforcement**
>
> Check `project.json` → `git.autoCommit` before committing:
> - If `true` or `onStoryComplete`: commit with per-story message
> - If `manual` or `false`: stage files and report, do NOT commit

```bash
git add -A
git commit -m "feat: [prd-summary] (US-00X)"
```

### Critic Batching

When to run @critic depends on configured `criticMode`:

| Mode | When Critic Runs |
|------|------------------|
| `strict` | After every story |
| `balanced` | After story 2, then every 3 stories (5, 8, 11...) |
| `fast` | Only at PRD completion |

**Configuration cascade:**
1. CLI flag: `--critic-mode=strict`
2. Project: `project.json` → `agents.criticMode`
3. Fallback: `balanced`

Record critic results — activity logging is handled automatically by Helm's CommandLogSubscriber. No manual activity recording needed.

### Step 3: Repeat for All Stories

Continue Steps 2.1-2.5 for each story until all are complete.

---

## Phase 3: PRD Completion

When all stories have `status: "completed"`:

### Step 1: Run Final Quality Gates

Use commands from `docs/project.json`:

```bash
npm run typecheck && CI=true npm run test && npm run build
```

### Step 2: Run Queued E2E Tests

If any Playwright tests were deferred to PRD completion, run them now using `test-flow` retry semantics.

### Step 3: Update PRD Status

Mark PRD ready for completion:

```
prd_updateProgress({
  prd_id: "prd-[name]",
  completed_stories: {total}
})
```

Note: PRD remains `in_progress` until PR is merged.

### Step 4: Hand Off to Builder Completion Flow

> ⚓ **Builder agent (US-009): Session Completion & Merge**
>
> The PRD workflow skill's job ends here. Builder's Session Completion & Merge section handles:
> - Git push to configured branch
> - PR creation (if configured)
> - PR merge (if auto-merge allowed)
> - PRD status transition to `pr_open` then `completed`
>
> See Builder agent for the complete git completion workflow.

Report PRD readiness:

```
═══════════════════════════════════════════════════════════════════════
                    PRD IMPLEMENTATION COMPLETE
═══════════════════════════════════════════════════════════════════════

PRD: {prd-title}
Stories completed: {total}/{total}

Quality gates: ✅ Passed
E2E tests: ✅ Passed (or skipped if configured)

Ready for git completion workflow.
═══════════════════════════════════════════════════════════════════════
```

---

## Handling Ad-hoc Requests During PRD Mode

If user makes an ad-hoc request while a PRD is active:

1. **Determine if it's PRD-related:**
   - If the request relates to the current PRD's scope → treat as part of PRD work
   - If it's unrelated → run as ad-hoc (separate from PRD)

2. **For unrelated ad-hoc requests:**
   - Load `adhoc-workflow` skill
   - **⚠️ PRD PROTECTION: Do NOT modify PRD state during ad-hoc work**
   - Commit separately from PRD work
   - Return to PRD work when done

---

## Session State Management

All session state is persisted via MCP tools:

| State | Tool | Key |
|-------|------|-----|
| Current story | `prd_updateProgress` | `current_story` field |
| Quality check results | (auto-logged) | N/A (activity auto-captured) |
| Fix loop tracking | `session_saveState` | `fixLoop.{storyId}` |
| Critic results | (auto-logged) | N/A (activity auto-captured) |

### State Persistence Example

```
// Track verification state for story
session_saveState({
  verification: {
    "US-001": {
      typecheck: "passed",
      lint: "passed",
      tests: "passed",
      playwright: "deferred"
    }
  }
})

// Read state on resume
const state = await query_session_state()
const verificationState = state.verification?.["US-001"]
```

---

## PRD History Command

Users can request PRD history with "show PRD history" or similar phrases.

**Implementation:**

```
// List recent completed PRDs
query_prds({ status: "completed", limit: 5 })

// Get details for a specific PRD
query_prd({ prd_id: "prd-[name]" })
```

---

## What This Skill Does NOT Do

The following are handled elsewhere:

| Responsibility | Handled By |
|----------------|------------|
| Git commit/push/PR | Builder agent (US-009 Git Completion Workflow) |
| PRD creation | @planner agent |
| Session logging | Helm native session infrastructure |
| Branch creation | Helm creates working branches for sessions |
| Dashboard rendering | Helm native UI |
| Post-merge cleanup | Builder agent (Phase 4 cleanup on startup) |
