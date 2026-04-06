---
name: adhoc-workflow
description: "Ad-hoc mode workflow for Builder. Use when handling direct requests without a PRD, quick fixes, or one-off tasks. Triggers on: ad-hoc mode, quick fix, direct request, one-off task."
---

# Ad-hoc Workflow

> Load this skill when: handling direct requests without a PRD, ad-hoc mode, quick fixes, one-off tasks.

## Prerequisites

> ⛔ **CRITICAL: This skill requires MCP connection to Helm.**
>
> Before performing any ad-hoc task operations, verify the MCP task tools are available.
> If tools are not available, STOP and report:
> ```
> ⛔ MCP tools not available. Cannot perform task operations 
> without Helm connection. Ensure Helm ADE is running and 
> MCP server is connected.
> ```
>
> **Do NOT fall back to file I/O** — if the tools fail, stop.

## Overview

Ad-hoc mode handles direct user requests without requiring a PRD. Work is tracked through Helm's native task system via MCP tools.

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  RECEIVE REQUEST    │ ──► │   IMPLEMENT WORK    │ ──► │   COMPLETE TASK     │
│                     │     │                     │     │                     │
│ Understand request, │     │ Delegate to         │     │ Quality checks,     │
│ delegate to         │     │ @developer, run     │     │ testing notes,      │
│ @developer          │     │ quality checks      │     │ status update       │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

## MCP Tools Reference

| Tool | Purpose |
|------|---------|
| `task_create` | Create a new task in Supabase |
| `query_tasks` | Query tasks (fetch task state) |
| `task_changeStatus` | Update task status |
| `task_editTitle` | Update task title |
| `task_editDescription` | Update task description or testing notes |
| `task_saveComment` | Leave notes/questions on a task |
| `session_saveState` | Persist session state to Supabase |
| `query_session_state` | Read session state from Supabase |

---

## Context Loading (CRITICAL — Do This First)

> ⚠️ **Ad-hoc tasks fail when project context is missing or stale.**

**On entering ad-hoc mode:**

1. Read `docs/project.json` and note:
   - `stack` — framework/language
   - `commands` — test, lint, build commands
   - `styling` — CSS framework, dark mode
   - `testing` — test framework, patterns

2. Read `docs/CONVENTIONS.md` in full — do NOT summarize or compress it. Keep the full content in session context and pass it to sub-agents via context blocks. If CONVENTIONS.md contains a `## TL;DR for Agents` section, use it as a quick-reference anchor but do NOT treat it as a substitute for the full file.

3. Store this context for the session — pass it to @developer via context blocks

---

## Session Context Detection

Builder detects session type from the system prompt:

| Session Type | Detection | Behavior |
|--------------|-----------|----------|
| **Task-linked** | Task context injected in system prompt | Work on injected tasks |
| **Ad-hoc** | No task context injected | Work on user's direct request, auto-create task on completion |

In ad-hoc mode, Builder receives the user's request directly and implements it without pre-existing task context.

---

## Implementation Flow

### Step 1: Delegate to @developer

When user provides an ad-hoc request, delegate immediately to `@developer` with project context:

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
  mode: adhoc
  request: "{user's original request}"
</context>

Implement: {user's request}

Requirements:
- {derived requirements from request}
- Ensure typecheck passes
- Follow project conventions
```

### Step 2: Run Quality Checks

> 📚 **SKILL: test-flow** → "Skip Gate → Activity Resolution → Quality Check Pipeline"
>
> Load the `test-flow` skill for the complete quality check pipeline.
> It includes typecheck/lint/test/rebuild/critic/Playwright.
>
> **Ad-hoc context:**
> - `mode: "adhoc"` — 3-attempt retry strategy (vs PRD's 5-attempt)
>
> **Failure behavior:** If any check fails after 3 fix attempts, STOP and report to user.

After `@developer` completes work, run the quality check pipeline. Activity logging is handled automatically by Helm's CommandLogSubscriber — no manual activity recording needed.

---

## Task Auto-Creation

When Builder completes a logical unit of work in an ad-hoc session, it auto-creates a task for traceability.

### Auto-Creation Flow

1. **Create task via `task_create`:**
   ```
   task_create({
     title: "Add loading spinner to submit button",  // derived from work done
     description: "Added visual loading feedback during form submission with spinner icon and disabled state to prevent double-submit",
     labels: ["frontend", "ui"],  // inferred from file types touched
     status: "agent_build_complete"
   })
   ```

2. **Save todoTaskLinks with the new task's UUID:** After task creation, save the link between the todo content and the created task:
   ```
   session_saveState({
     todoTaskLinks: [
       {
         todoContent: 'Add loading spinner to submit button',
         taskId: '{created_task_id}'  // link todo to the auto-created task
       }
     ]
   })
   ```

3. **Activity logging** — handled automatically by Helm's CommandLogSubscriber. No manual activity recording needed.

4. **Story assignment** — handled server-side by `task_create`. The MCP server performs semantic matching against story embeddings to auto-assign the task to the best-matching story. If no match meets the similarity threshold, a new story is auto-created. Builder does not query embeddings directly for story assignment.

### Multiple Units of Work

If Builder completes multiple logical units in one ad-hoc session, each gets its own task:

```
User: "Fix the login bug and also add a loading spinner to the dashboard"

→ Task 1: "Fix login authentication bug" (agent_build_complete)
→ Task 2: "Add loading spinner to dashboard" (agent_build_complete)
```

---

## Scope Growth Detection

Monitor for scope growth during implementation. If work exceeds the original scope, warn and suggest breaking into multiple tasks.

### Detection Triggers

| Trigger | Action |
|---------|--------|
| Files touched exceeds 10 | Warn user |
| Work reveals need for related changes | Suggest additional task |
| Original request was underestimated | Note scope growth |

### Scope Warning

When scope growth is detected:

```
⚠️ SCOPE GROWTH DETECTED

This work has grown beyond the original request:
- Original: "Add loading spinner" (~2 files expected)
- Actual: 8 files touched, accessibility improvements needed

Suggestions:
[1] Continue with current work, note scope growth
[2] Break remaining work into a new task
```

If user chooses [2], create additional task via `task_create`:

```
task_create({
  title: "Add accessibility improvements to loading states",
  description: "Follow-up from loading spinner work. Add aria labels, keyboard navigation, and screen reader announcements.",
  labels: ["frontend", "a11y"],
  status: "ready"  // not started yet
})
```

---

## Design Decision Capture

Record significant design decisions as task comments for future reference.

### When to Capture

| Capture | Don't Capture |
|---------|---------------|
| Architectural choices | Obvious implementation details |
| Trade-offs considered | Boilerplate decisions |
| Non-obvious approaches | Standard patterns |
| User-specified preferences | Default behaviors |

### Capture via `task_saveComment`

```
task_saveComment({
  task_id: "{task_id}",
  comment: "Design decision: Used localStorage for wizard state persistence (user requested simpler approach over server-side storage). Trade-off: state lost if user clears browser data."
})
```

---

## Completion Flow

When all work is complete and quality checks pass:

### Step 1: Write Testing Notes

Write structured testing notes to the task via `task_editDescription`:

```
task_editDescription({
  task_id: "{task_id}",
  testing_notes_markdown: "## What to Test\n\n- Submit button shows loading spinner during form submission\n- Button is disabled while loading (prevents double-submit)\n- Loading state clears on success or error\n\n## How to Verify\n\n1. Navigate to checkout page\n2. Fill form and click Submit\n3. Observe spinner appears immediately\n4. Verify button cannot be clicked again during loading\n\n## Edge Cases\n\n- Network timeout: spinner should clear after timeout\n- Rapid clicks: only one submission should occur"
})
```

### Step 2: Update Task Status

Transition the task to `agent_build_complete`:

```
task_changeStatus({
  task_id: "{task_id}",
  status: "agent_build_complete"
})
```

### Step 3: Record Completion

Activity logging is handled automatically by Helm's CommandLogSubscriber. No manual activity recording needed.

### Step 4: Git Completion

> ⚓ See Builder agent (US-009) for the full Git Completion Workflow.
>
> After completing work:
> 1. Commit changes (respecting `git.autoCommit` setting)
> 2. Push to configured branch (respecting `git.agentWorkflow.pushTo`)
> 3. Create PR if configured (respecting `git.agentWorkflow.createPrTo`)

Builder handles git operations per the project's git configuration. See the main Builder agent for the complete git workflow.

---

## Git Auto-Commit Enforcement

> ⛔ **CRITICAL: Check `git.autoCommit` setting before ANY commit operation**
>
> **Trigger:** Before running `git commit` or any commit delegation.
>
> **Check:** Read `project.json` → `git.autoCommit` value.
>
> **Failure behavior:** If `autoCommit` is `manual` or `false`, do NOT run `git commit`. Stage files and report suggested commit message instead.
>
> See AGENTS.md for full rules.

---

## Session State Management

All session state is persisted via MCP tools:

| State | Tool | Key |
|-------|------|-----|
| Quality check results | (auto-logged) | N/A (activity auto-captured) |
| Current work status | `session_saveState` | `currentWork` |
| Todo-task links | `session_saveState` | `todoTaskLinks` array |
| Design decisions | `task_saveComment` | N/A (comment entry) |
| Testing notes | `task_editDescription` | `testing_notes_markdown` field |

### Todo-Task Linking

Builder links todos to Helm Tasks via `todoTaskLinks` in `agent_state`:

```
session_saveState({
  todoTaskLinks: [
    {
      todoContent: 'Add loading spinner to submit button',
      taskId: 'uuid-from-query_session_tasks-or-null'
    }
  ]
})
```

**Setting `taskId`:**
- **Task-linked session:** Use the task UUID from `query_session_tasks` results
- **Ad-hoc session (no linked tasks):** Use `null` — the task will be auto-created on completion
- **Session-level todos** (e.g., "Run tests"): Use `null`

> ⛔ **CRITICAL: `todoContent` must be the exact same string passed to `todowrite`.** No trimming, no rewording, no normalization. The macOS app content-matches this to resolve task_id for UI grouping.

> ⛔ **MANDATORY COMPANION CALL: Every `todowrite` call MUST be immediately followed by `session_saveState` with the `todoTaskLinks` array.** Never call `todowrite` alone — always pair it with `session_saveState({ todoTaskLinks: [...] })`.

### Todo Creation Order (CRITICAL)

> ⛔ **Todos MUST be created in logical execution order, not analysis/thinking order.**
>
> The order todos are created (via `todowrite`) determines `todoIndex` in the Helm UI. Users see todos in creation order.

**Correct execution order:**

1. **Prerequisites/setup** — Download files, configure environment
2. **Implementation tasks** — Modify code, add features
3. **Quality checks** — Typecheck, lint, build — **ALWAYS near last**
4. **Completion tasks** — Commit, signal done — **ALWAYS last**

**Wrong:** Creating "Commit and complete task" first because you thought of it first.
**Right:** Reorder todos into execution sequence before creating them via `todowrite`. Then immediately call `session_saveState` with the `todoTaskLinks` array.

### State Persistence Example

```
// Save current work state
session_saveState({
  currentWork: {
    mode: 'adhoc',
    taskId: 'task-abc123',
    filesModified: ['src/components/Button.tsx', 'src/components/Button.test.tsx'],
    qualityChecks: { typecheck: 'passed', lint: 'passed', tests: 'passed' }
  }
})

// Read state on resume
const state = await query_session_state()
```

---

## Example Flow (Complete)

```
User: "Add loading spinner to submit button"

Builder:
Let me implement that for you.

[Delegates to @developer with context block]

@developer completes work...

Builder:
Running quality checks...

✅ Typecheck: passed
✅ Lint: passed  
✅ Unit tests: passed (3 new tests)

Creating task record...

[Calls task_create with title, description, labels]

Writing testing notes...

[Calls task_editDescription with testing_notes_markdown]

✅ Implementation complete!

Task created: "Add loading spinner to submit button"
Status: agent_build_complete
Files modified: 2
Tests added: 3

[Commits and pushes per git workflow configuration]
```

---

## What This Skill Does NOT Do

The following are handled elsewhere:

| Responsibility | Handled By |
|----------------|------------|
| Analysis gate (Phase 0) | Builder agent directly (if needed for ambiguous requests) |
| Git commit/push/PR | Builder agent (US-009 Git Completion Workflow) |
| PRD creation | @planner agent |
| Session logging | Helm native session infrastructure |
| Dashboard rendering | Helm native UI |
