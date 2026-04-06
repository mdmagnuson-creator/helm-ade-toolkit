---
description: Resume planning work on a spec/PRD from wherever it currently is
agent: planner
---

Pick up planning from wherever this spec currently is.

## Steps

1. Check the `📋 Active Spec Context` in the system prompt for the linked PRD
2. Use `query_prd` if you need full spec details beyond the injected context
3. Review current state: status, existing stories (`query_prd_stories`), existing tasks (`query_tasks` with prd_id filter)
4. Based on the current state, determine where to pick up:
   - **Bare draft (no stories):** Start full planning — ask clarifying questions, define scope, write stories
   - **Has stories but no tasks:** Offer to refine stories or generate implementation tasks
   - **Has stories AND tasks:** Review task status, identify gaps, offer to refine scope or add missing tasks
   - **Ready status:** Ask what the user wants to change or if they want to review before building
5. Use the appropriate MCP tools as you work: `prd_changeStatus`, `prd_updateContent`, `prd_story_bulk_create`, `prd_story_update`, `task_create`

## Data Model Reference

**Content model — spec vs story content:**
- Spec `content_markdown` = high-level summary/overview (what the spec is about, why it matters, dependencies, phases)
- Story `content_markdown` = full story specification in markdown (detailed requirements, context, implementation notes)
- When writing stories, put the detailed spec content in each story's `content_markdown`, NOT in the spec-level content

**Story fields for `prd_story_bulk_create`:**
- `story_id` — identifier like "US-001", "US-002"
- `title` — concise story title
- `content_markdown` — full story specification in markdown
- `acceptance_criteria` — jsonb array: `[{"text": "Criterion description", "met": false}]`
- `story_points` — effort estimate (integer)
- `status` — "pending" (default for new stories)
- `phase` — phase number (default 1)
- `sort_order` — execution order within the spec
- `required_credentials` — jsonb array: `[{"service": "stripe", "type": "apiKey", "status": "pending"}]` — only populate when a story depends on external credentials the user must provide

**Credential requirements:**
- If any story requires external service credentials (API keys, OAuth clients, etc.), populate `required_credentials` on both the story AND the parent spec
- Spec-level `required_credentials` = union of all story-level credential needs
- These are surfaced in the Helm UI so the user can act on them outside the agent system
- Status values: "pending" (not yet provided), "provided" (user has provided), "deferred" (not needed yet)

**Conventions-driven approach:**
- Write clear, well-structured stories — Builder + CONVENTIONS.md determine post-implementation actions (support articles, marketing, etc.)
- Do NOT pre-flag stories with metadata about support articles, marketing, or AI tools
- Focus on: clear titles, detailed content_markdown, verifiable acceptance criteria, correct ordering

$ARGUMENTS
