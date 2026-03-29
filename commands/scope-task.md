---
description: Scope a task with technical approach and effort estimate
agent: planner
---

A task linked to this session needs scoping.

1. Use `helm_session_task_list` to find the task linked to this session
2. Use `helm_task_get` to read its full details (title, description, status, priority, parent story)
3. Walk through the scoping process with the user:
   a. What needs to be done (technical approach)
   b. Any prerequisites or dependencies
   c. Potential risks or challenges
   d. Estimated effort
4. After agreeing on the scope, use `helm_task_update` to:
   - Set the `scope_markdown` field with the agreed scope
   - Transition the task to "approved" status

$ARGUMENTS
