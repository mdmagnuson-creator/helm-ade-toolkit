---
description: Fix a task that failed QA testing
agent: builder
---

A task linked to this session has failed QA testing and needs fixes.

1. Use `query_session_tasks` to find the task linked to this session
2. Use `query_tasks` to read its full details, paying special attention to:
   - `testing_notes` — the QA tester's feedback
   - `status` — should be "fix_required"
   - `scope_markdown` — the original scope for context
3. Review the QA feedback and identify what needs to be fixed
4. Implement the fixes
5. When complete, use `task_changeStatus` to transition the task back to "ready_for_test" status

$ARGUMENTS
