---
description: Build from a spec/PRD linked to this session
agent: builder
---

You have a spec/PRD linked to this session that needs to be built.

## Spec Discovery

1. **System prompt context** — Check for "Active Spec Context" section above (injected automatically by Helm)
2. **`query_prd`** — Use the PRD ID from the session context to get full spec details
3. **`query_prd_stories`** — Get all stories for this spec to understand the implementation scope

## Build Flow

1. Discover the linked spec using the methods above
2. Review the spec's stories and their status
3. Filter to stories that are ready to build (status: "pending" or "in_progress")
4. For each story, use `query_tasks` with the story ID to find implementation tasks
5. Create your todo list from the buildable stories/tasks, ordered by sort_order
6. Begin implementing each story in order

When you complete a story's tasks, use `task_changeStatus` to transition each task to "agent_build_complete" status.

If the spec has `required_credentials` that are still "pending", notify the user before attempting stories that depend on them.

$ARGUMENTS
