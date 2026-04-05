---
description: Resume planning work on a spec/PRD from wherever it currently is
agent: planner
---

Pick up planning from wherever this spec currently is.

1. Check the `📋 Active Spec Context` in the system prompt for the linked PRD
2. Use `helm_prd_get` if you need full spec details beyond the injected context
3. Review current state: status, existing stories (`helm_prd_stories_get`), existing tasks (`helm_task_list` with prd_id filter)
4. Based on the current state, determine where to pick up:
   - **Bare draft (no stories):** Start full planning — ask clarifying questions, define scope, write stories
   - **Has stories but no tasks:** Offer to refine stories or generate implementation tasks
   - **Has stories AND tasks:** Review task status, identify gaps, offer to refine scope or add missing tasks
   - **Ready status:** Ask what the user wants to change or if they want to review before building
5. Use the appropriate tools as you work: `helm_prd_update`, `helm_prd_set_content`, `helm_prd_story_bulk_create`, `helm_prd_story_update`, `helm_task_create`

$ARGUMENTS
