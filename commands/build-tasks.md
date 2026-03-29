---
description: Build tasks linked to this session
agent: builder
---

You have tasks linked to this session that need to be built.

1. Use `helm_session_task_list` to discover all tasks linked to this session
2. For each task, use `helm_task_get` to read its full details (title, description, status, priority, scope_markdown)
3. Filter to tasks that are ready to build (status: "approved" or "planned")
4. Create your todo list from the buildable tasks, ordered by priority
5. Begin implementing each task in order

When you complete a task, use `helm_task_update` to transition it to "agent_build_complete" status.

If any tasks have status "fix_required", check their testing_notes and QA feedback first — those contain the tester's findings that need to be addressed.

$ARGUMENTS
