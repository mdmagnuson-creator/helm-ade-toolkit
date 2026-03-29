---
description: Generate implementation tasks from a PRD
agent: planner
---

This session is linked to a PRD that needs implementation tasks generated.

1. Identify the PRD for this session (check the session's source context)
2. Review the PRD's stories, scope, and current status
3. Walk the user through the overall scope first, then propose tasks one at a time for approval
4. Each proposed task should include:
   - Clear title
   - Description of what needs to be done
   - Priority (urgent/high/medium/low)
   - Which story it belongs to
5. For each approved task, use `helm_task_create` with:
   - Status: "planned"
   - `parent_prd_id` set to link the task to this PRD

$ARGUMENTS
