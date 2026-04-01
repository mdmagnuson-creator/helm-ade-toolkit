---
description: Build tasks linked to this session
agent: builder
---

You have tasks linked to this session that need to be built.
The tasks are already in your system prompt under "Active Task Context" — injected automatically when the session was created.

1. Read the task context from your system prompt (look for the "Active Task Context" section above)
2. If task IDs were passed as arguments below, use those to identify which tasks to build
3. Filter to tasks that are ready to build (status: "approved", "planned", or "new")
4. For any task that needs more detail, use `helm_task_get` with the task ID
5. Create your todo list from the buildable tasks, ordered by priority
6. Begin implementing each task in order

When you complete a task, use `helm_task_update` to transition it to "agent_build_complete" status.

If any tasks have status "fix_required", check their testing_notes and QA feedback first — those contain the tester's findings that need to be addressed.

$ARGUMENTS
