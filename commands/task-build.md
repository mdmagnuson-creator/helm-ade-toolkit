---
description: Build tasks linked to this session
agent: builder
---

You have tasks linked to this session that need to be built.

## Task Discovery (in order of preference)

1. **System prompt context** — Check for "Active Task Context" section above (injected automatically by Helm)
2. **`query_session_tasks`** — MCP query tool to get tasks linked to this session (uses HELM_SESSION_ID automatically). This is more efficient than fetching all org tasks.
3. **`query_tasks`** — If specific task IDs were passed as arguments below, fetch each one directly

## Build Flow

1. Discover linked tasks using the methods above
2. Filter to tasks that are ready to build (status: "approved", "planned", or "new")
3. For any task that needs more detail, use `query_tasks` with the task ID
4. Create your todo list from the buildable tasks, ordered by priority
5. Begin implementing each task in order

When you complete a task, use `task_changeStatus` to transition it to "agent_build_complete" status.

If any tasks have status "fix_required", check their testing_notes and QA feedback first — those contain the tester's findings that need to be addressed.

$ARGUMENTS
