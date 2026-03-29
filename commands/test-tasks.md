---
description: QA testing session for linked tasks
agent: builder
---

This is a QA testing session. Tasks are linked to this session for testing.

1. Use `helm_session_task_list` to discover all tasks linked to this session
2. For each task, use `helm_task_get` to read its full details and scope
3. Perform manual QA testing on each task according to its acceptance criteria and scope
4. When testing is complete for each task, update its status via `helm_task_update`:
   - "passed" if the task meets its acceptance criteria
   - "fix_required" if issues are found (include details in testing_notes)

$ARGUMENTS
