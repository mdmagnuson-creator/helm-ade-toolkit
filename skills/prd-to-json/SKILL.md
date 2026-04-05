---
name: prd-to-json
description: "Convert PRDs to structured stories for the Developer autonomous agent system. Use when you have an existing PRD and need to convert it to Developer's format. Triggers on: convert this prd, turn this into developer format, create prd.json from this, developer json."
---

# Developer PRD Converter

Converts existing PRDs to structured stories that Developer uses for autonomous execution.

---

## Prerequisites

> ⛔ **CRITICAL: This skill requires the `helm-bridge` plugin.**
>
> Before performing any PRD operations, verify the `helm_prd_*` tools are available.
> If tools are not available, STOP and report:
> ```
> ⛔ helm-bridge plugin tools not available. Cannot perform PRD operations 
> without Supabase connection. Ensure helm-bridge plugin is installed and 
> HELM_SUPABASE_URL is set.
> ```
>
> **Do NOT fall back to file I/O** — if the tools fail, stop.

---

## The Job

1. **Read project context** from `docs/project.json` (if exists)
2. Take a PRD (markdown file or text)
3. Add stack-specific acceptance criteria
4. Create PRD and stories via `helm_prd_create` + `helm_prd_story_bulk_create`

---

## Step 0: Read Project Context

**Before converting any PRD, read the project manifest to understand the stack:**

```bash
cat docs/project.json 2>/dev/null || echo "NO_PROJECT_JSON"
```

If `docs/project.json` exists, extract key information for criteria generation:

| Field | Use For |
|-------|---------|
| `name` | Set `project` field in JSON |
| `stack.language` | Determine language-specific criteria |
| `styling.darkMode.enabled` | Add dark mode criteria for UI stories |
| `linting.enabled` | Add lint criteria |
| `apps` | Find artifact locations |
| `commands` | Reference correct command names |

**Store this context for use throughout conversion.**

If no `project.json` exists, note this and use defaults:
```
⚠️ No docs/project.json found. Using default criteria.
   Run project-bootstrap to configure stack-specific settings.
```

---

## Output Format

Stories are created via `helm_prd_story_bulk_create`. The tool expects this structure:

```json
{
  "prd_id": "[prd-id from PRD or folder name]",
  "stories": [
    {
      "story_id": "US-001",
      "title": "[Story title]",
      "content_markdown": "[Full story specification in markdown]",
      "acceptance_criteria": [{"text": "Criterion 1", "met": false}, {"text": "Criterion 2", "met": false}],
      "story_points": 1,
      "status": "pending",
      "phase": 1,
      "sort_order": 1
    }
  ]
}
```

---

## Stack-Aware Acceptance Criteria

**When converting PRD acceptance criteria to JSON, add stack-specific criteria based on `project.json`:**

### Conditional Criteria Matrix

| Condition | Add This Criterion |
|-----------|-------------------|
| `stack.language` is "typescript" | `"Typecheck passes"` |
| `stack.language` is "go" | `"go build succeeds"` |
| `stack.language` is "python" + typed | `"mypy passes"` |
| `linting.enabled: true` | `"Lint passes"` |
| Story has UI AND `apps.*.type` includes "frontend" | `"Verify in browser"` |
| Story has UI AND `styling.darkMode.enabled: true` | `"Works in both light and dark mode"` |
| `testing.unit.framework` exists AND story has testable logic | `"Unit tests pass"` |

### Example Transformation

**Input PRD (Markdown):**
```markdown
### US-002: Display priority indicator on task cards

**Acceptance Criteria:**
- [ ] Each task card shows colored priority badge
- [ ] Priority visible without hovering
```

**Output JSON (for TypeScript + Tailwind + Dark Mode project):**
```json
{
  "id": "US-002",
  "title": "Display priority indicator on task cards",
  "acceptanceCriteria": [
    "Each task card shows colored priority badge",
    "Priority visible without hovering",
    "Typecheck passes",
    "Lint passes",
    "Verify in browser",
    "Works in both light and dark mode"
  ]
}
```

**Output JSON (for Go backend project):**
```json
{
  "id": "US-002",
  "title": "Add priority endpoint",
  "acceptanceCriteria": [
    "GET /api/priorities returns list",
    "PUT /api/tasks/:id/priority updates priority",
    "go build succeeds",
    "Lint passes",
    "Unit tests pass"
  ]
}
```

---

## Creating the PRD

Create the PRD and stories:

1. **Create the PRD record:**
   ```
   helm_prd_create({
     prd_id: "prd-[feature-name]",
     title: "[PRD title]",
     status: "ready",
     content_markdown: "[original PRD markdown]",
     phases: [number],
     estimated_weeks: [estimate],
     total_stories: [count]
   })
   ```

2. **Create all stories in bulk:**
   ```
   helm_prd_story_bulk_create({
     prd_id: "prd-[feature-name]",
     stories: [
       {
         story_id: "US-001",
         title: "...",
         content_markdown: "...",
         acceptance_criteria: [...],
         story_points: 1,
         status: "pending",
         phase: 1,
         sort_order: 1,
         // Only include when story depends on external credentials:
         "required_credentials": [{"service": "stripe", "type": "apiKey", "status": "pending"}]
       },
       // ... more stories
     ]
   })
   ```

---

## Credential Planning Fields

The `required_credentials` field is a jsonb column on `prd_stories` for tracking external service dependencies:

| Field | Type | Description |
|-------|------|-------------|
| `service` | string | Provider or API name (e.g., `stripe`, `supabase`, `sendgrid`) |
| `type` | string | Credential type: `apiKey`, `oauthClient`, `serviceAccount`, `token` |
| `status` | string | `pending`, `provided`, or `deferred` |

Example:
```json
"required_credentials": [
  {"service": "stripe", "type": "apiKey", "status": "pending"},
  {"service": "sendgrid", "type": "apiKey", "status": "deferred"}
]
```

Rules:
- Only include when the story depends on external credentials
- Do not include real secrets; capture only metadata
- Use `pending` for upfront needs, `deferred` for after-initial-build

---

## Story Size: The Number One Rule

**Each story must be completable in ONE Developer iteration (one context window).**

Developer spawns a fresh agent per iteration with no memory of previous work. If a story is too big, the LLM runs out of context before finishing and produces broken code.

### Right-sized stories:

- Add a database column and migration
- Add a UI component to an existing page
- Update a server action with new logic
- Add a filter dropdown to a list

### Too big (split these):

- "Build the entire dashboard" - Split into: schema, queries, UI components, filters
- "Add authentication" - Split into: schema, middleware, login UI, session handling
- "Refactor the API" - Split into one story per endpoint or pattern

**Rule of thumb:** If you cannot describe the change in 2-3 sentences, it is too big.

---

## Story Ordering: Dependencies First

Stories execute in priority order. Earlier stories must not depend on later ones.

**Correct order:**

1. Schema/database changes (migrations)
2. Server actions / backend logic
3. UI components that use the backend
4. Dashboard/summary views that aggregate data

**Wrong order:**

1. UI component (depends on schema that does not exist yet)
2. Schema change

---

## Acceptance Criteria: Must Be Verifiable

Each criterion must be something Developer can CHECK, not something vague.

### Good criteria (verifiable):

- "Add `status` column to tasks table with default 'pending'"
- "Filter dropdown has options: All, Active, Completed"
- "Clicking delete shows confirmation dialog"
- "Typecheck passes"
- "Tests pass"

### Bad criteria (vague):

- "Works correctly"
- "User can do X easily"
- "Good UX"
- "Handles edge cases"

### Stack-Specific Criteria

**Read from `project.json` and add appropriate criteria:**

| Project Type | Always Add |
|--------------|------------|
| TypeScript | "Typecheck passes" |
| Go | "go build succeeds" |
| Any with linting | "Lint passes" |
| UI + dark mode | "Works in both light and dark mode" |
| UI + browser verification | "Verify in browser" |

---

## Conversion Rules

1. **Each user story becomes one story record** via `helm_prd_story_bulk_create`
2. **IDs**: Sequential (US-001, US-002, etc.)
3. **Priority**: Mapped to `sort_order` based on dependency order, then document order
4. **All stories**: Start with `status: "pending"`
5. **project**: Use `name` from `project.json` if available, otherwise folder name
6. **Acceptance criteria**: Include stack-specific criteria from `project.json`

---

## Splitting Large PRDs

If a PRD has big features, split them:

**Original:**

> "Add user notification system"

**Split into:**

1. US-001: Add notifications table to database
2. US-002: Create notification service for sending notifications
3. US-003: Add notification bell icon to header
4. US-004: Create notification dropdown panel
5. US-005: Add mark-as-read functionality
6. US-006: Add notification preferences page

Each is one focused change that can be completed and verified independently.

---

## Archiving Previous Runs

**Before creating a new PRD, check if there is an existing one with the same ID:**

1. Check for existing PRD: `helm_prd_get({ prd_id: "prd-[name]" })`
2. If PRD exists with different content or completed status:
   - The existing PRD data is already in Supabase history
   - Create the new PRD with a unique ID (e.g., `prd-[name]-v2`) if needed
   - Or update the existing PRD if it's still in draft/ready status

---

## Checklist Before Saving

Before creating PRD and stories, verify:

- [ ] **Read `docs/project.json`** for stack context
- [ ] **Previous PRD checked** (if prd_id exists, handle appropriately)
- [ ] Each story is completable in one iteration (small enough)
- [ ] Stories are ordered by dependency (schema to backend to UI)
- [ ] **Stack-specific criteria added** based on project.json:
  - [ ] TypeScript projects: "Typecheck passes"
  - [ ] Go projects: "go build succeeds"
  - [ ] Projects with linting: "Lint passes"
  - [ ] UI stories with dark mode: "Works in both light and dark mode"
  - [ ] UI stories: "Verify in browser"
- [ ] Credential dependencies captured via `required_credentials` when needed
- [ ] Acceptance criteria are verifiable (not vague)
- [ ] No story depends on a later story
- [ ] **PRD created via `helm_prd_create`**
- [ ] **Stories created via `helm_prd_story_bulk_create`**
