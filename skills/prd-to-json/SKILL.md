---
name: prd-to-json
description: "Convert PRDs to prd.json format for the Developer autonomous agent system. Use when you have an existing PRD and need to convert it to Developer's JSON format. Triggers on: convert this prd, turn this into developer format, create prd.json from this, developer json."
---

# Developer PRD Converter

Converts existing PRDs to the prd.json format that Developer uses for autonomous execution.

---

## The Job

1. **Read project context** from `docs/project.json` (if exists)
2. Take a PRD (markdown file or text)
3. Auto-detect flags and add stack-specific acceptance criteria
4. Present interactive flag review
5. Convert to `docs/prds/prd-[name].json`

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
| `stack.languages` | Determine language-specific criteria |
| `styling.darkMode.enabled` | Add dark mode criteria for UI stories |
| `linting.enabled` | Add lint criteria |
| `capabilities.supportDocs` | Enable documentation flag detection |
| `capabilities.ai` | Enable tools flag detection |
| `capabilities.marketing` | Enable marketing flag detection |
| `planning.considerations` | Enable project-specific scope consideration review |
| `apps` | Find artifact locations for auto-detection |
| `commands` | Reference correct command names |

**Store this context for use throughout conversion.**

If no `project.json` exists, note this and use defaults:
```
⚠️ No docs/project.json found. Using default criteria.
   Run the bootstrap wizard to configure stack-specific settings.
```

---

## Output Format

```json
{
  "project": "[From project.json or folder name]",
  "branchName": "feature/[feature-name-kebab-case]",
  "description": "[Feature description from PRD title/intro]",
  "credentialRequirements": [
    {
      "service": "stripe",
      "credentialType": "apiKey",
      "requestTiming": "upfront",
      "requiredForStories": ["US-003"],
      "fallbackPlan": "Implement mocks until credentials are provided",
      "status": "pending"
    }
  ],
  "userStories": [
    {
      "id": "US-001",
      "title": "[Story title]",
      "description": "As a [user], I want [feature] so that [benefit]",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2", "[Stack-specific criteria]"],
      "priority": 1,
      "passes": false,
      "notes": "",
      "supportArticleRequired": false,
      "documentationType": null,
      "relatedArticleSlugs": [],
      "marketingRequired": false,
      "marketingType": null,
      "relatedMarketingPages": [],
      "toolsRequired": false,
      "toolsType": null,
      "relatedToolNames": [],
      "considerations": [],
      "requiredCredentials": []
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
| `stack.languages` includes "typescript" | `"Typecheck passes"` |
| `stack.languages` includes "go" | `"go build succeeds"` |
| `stack.languages` includes "python" + typed | `"mypy passes"` |
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

## Flag Auto-Detection

Before presenting the PRD for approval, **automatically detect** the flag values for each story based on analysis of the story content and existing project artifacts.

### Step 1: Gather Existing Artifacts

**Use paths from `project.json` when available:**

1. **Support Articles** - Check for existing article slugs:
   ```bash
   # Use database.migrationsPath from project.json
   grep -r "slug" ${migrationsPath}/*support* 2>/dev/null | grep -oE "'[a-z-]+'" | tr -d "'"
   # Or check support pages using apps.web.path
   ls ${webAppPath}/app/support/*/page.tsx 2>/dev/null | xargs -I{} basename $(dirname {})
   ```

2. **Marketing Pages** - Check existing marketing pages:
   ```bash
   # Use apps.web.path from project.json
   ls ${webAppPath}/app/\(marketing\)/ 2>/dev/null
   ```

3. **AI Tools** - Check existing tool definitions:
   ```bash
   ls ~/.config/opencode/tools/*.json 2>/dev/null
   # Or check for tool executor files using apps.web.structure.lib
   grep -r "toolName" ${webAppPath}/${libDir}/ai/ 2>/dev/null
   ```

### Step 2: Check Feature Flags

**Only detect flags for capabilities enabled in `project.json`:**

| Capability Flag | Detection Enabled |
|--------------|-------------------|
| `capabilities.supportDocs: true` | Documentation detection |
| `capabilities.ai: true` | AI tools detection |
| `capabilities.marketing: true` | Marketing detection |
| `planning.considerations` has entries | Consideration detection |

**If a capability is disabled, skip that detection and set flags to false.**

### Step 3: Analyze Each Story

For each story, analyze the acceptance criteria and title to auto-detect flags:

#### Support Article Detection (if `capabilities.supportDocs: true`)

| Pattern | Detection |
|---------|-----------|
| Story adds/changes user-facing settings | `supportArticleRequired: true` |
| Story adds/changes user-visible features | `supportArticleRequired: true` |
| Story mentions "help", "tutorial", "onboarding" | `supportArticleRequired: true` |
| Story is backend/infrastructure only | `supportArticleRequired: false` |
| Story is refactoring with no behavior change | `supportArticleRequired: false` |

**documentationType:**
- If related article slug exists in project → `"update"`
- If no related article exists → `"new"`

**relatedArticleSlugs:**
- Derive from feature name (e.g., "time slots" → `["time-slots"]`)
- Match against existing slugs found in Step 1

#### Marketing Detection (if `capabilities.marketing: true`)

| Pattern | Detection |
|---------|-----------|
| Story is a major new capability | `marketingRequired: true, relatedMarketingPages: ["features", "changelog"]` |
| Story is visible improvement to existing feature | `marketingRequired: true, relatedMarketingPages: ["changelog"]` |
| Story is admin/internal only | `marketingRequired: false` |
| Story is bug fix or refactoring | `marketingRequired: false` |
| Story is infrastructure | `marketingRequired: false` |

#### Tools Detection (if `capabilities.ai: true`)

| Pattern | Detection |
|---------|-----------|
| Story creates new API endpoint | `toolsRequired: true` |
| Story modifies existing API that tools use | `toolsRequired: true` |
| Story adds data that AI chatbot should access | `toolsRequired: true` |
| Story is UI-only | `toolsRequired: false` |
| Story is migration-only | `toolsRequired: false` (unless it enables new queries) |

**toolsType:**
- If tool already exists for this endpoint → `"update"`
- If new endpoint → `"new"`

**relatedToolNames:**
- Derive from feature (e.g., "list events" → `["list_events"]`)
- Match against existing tools found in Step 1

#### Project Considerations Detection (if `planning.considerations` exists)

For each story, map relevant consideration IDs from `project.json` into a working review field named `considerations`.

Detection guidance:
- If consideration id/label contains `permission`, `authz`, `rbac`, `role` and story touches auth, API access, admin operations, or tenant boundaries -> include it
- If consideration id/label contains `support-doc` and story is user-facing -> include it
- If consideration id/label contains `ai`, `tools`, `chat` and story changes chat-accessible data/actions -> include it
- Otherwise include only when story title/criteria clearly match the consideration label or `appliesWhen` tags

If uncertain, mark consideration mapping as `⚠` and ask the user to confirm.

### Step 4: Mark Uncertain Detections

When detection is ambiguous, mark the flag as **uncertain** using `⚠` in the review table.

Uncertain cases:
- Story could be user-facing OR internal-only
- Story modifies API but unclear if AI tools use it
- Story is visible but unclear if marketing-worthy
- Story risk is unclear between `medium` and `high` (or `high` and `critical`)
- Story may require a project consideration but mapping is unclear (for example `permissions`)

---

## Interactive Flag Review

After auto-detecting flags, present an interactive review table for user confirmation.

### Review Table Format

**Include project context in header:**

```
════════════════════════════════════════════════════════════════════════
                         STORY FLAG REVIEW
════════════════════════════════════════════════════════════════════════
Project: Example Scheduler
Stack: TypeScript / Next.js 16 / Supabase
Features: ✅ Docs  ✅ Marketing  ✅ AI Tools

┌─────────┬──────────────────────────────────────┬──────┬──────┬───────┬────────────────┐
│ Story   │ Title                                │ Docs │ Mktg │ Tools │ Considerations │
├─────────┼──────────────────────────────────────┼──────┼──────┼───────┼────────────────┤
│ US-001  │ Add time_slots table                 │  -   │  -   │   -   │       -        │
│ US-002  │ Seed default 'All Day' slot          │  -   │  -   │   -   │       -        │
│ US-003  │ Time slot selector in event form     │  ✓   │  -   │   -   │  support-docs  │
│ US-004  │ Render time slots on calendar        │  ✓   │  ⚠   │   -   │  support-docs  │
│ US-005  │ Manage time slots in settings        │  ✓   │  -   │  ⚠   │ permissions ⚠  │
└─────────┴──────────────────────────────────────┴──────┴──────┴───────┴────────────────┘

Legend: ✓ = yes, - = no, ⚠ = uncertain (requires confirmation)

Stack-specific criteria that will be added:
  • Typecheck passes (TypeScript)
  • Lint passes (ESLint + Prettier)
  • Works in both light and dark mode (UI stories)

════════════════════════════════════════════════════════════════════════
```

### Handling Uncertain Flags

If any flags are marked `⚠` (uncertain), **block until user confirms**:

```
⚠ 3 flags require confirmation before proceeding:

1. US-004 (Render time slots on calendar) → Marketing
   Reason: Major UI change that could be a headline feature
   [Y] Yes, update marketing pages  [N] No marketing update needed
   > _

2. US-005 (Manage time slots in settings) → Tools  
   Reason: Settings page may be accessible via AI assistant
   [Y] Yes, create/update AI tools  [N] No tools needed
   > _

3. US-005 (Manage time slots in settings) → Considerations
   Reason: Might need `permissions` consideration based on admin access scope
   [Y] Include `permissions`  [N] Do not include
   > _
```

### Final Approval

After all uncertain flags are resolved:

```
════════════════════════════════════════════════════════════════════════

All flags confirmed. Final PRD summary:

  Project: Example Scheduler
  Branch: feature/time-slots
  Stories: 5
  
  Stack criteria (auto-added):
    • Typecheck passes
    • Lint passes  
    • Dark mode verification (UI stories)
  
  Documentation updates: 3 stories
  Marketing updates: 1 story
  AI tools updates: 1 story
  Consideration mappings: permissions (1), support-docs (3)

[A] Approve and write prd.json
[E] Edit individual story flags
[C] Cancel

> _
```

---

## Support Article Fields

Each user story includes support article tracking fields:

| Field | Type | Description |
|-------|------|-------------|
| `supportArticleRequired` | boolean | `true` if this story needs a support article |
| `documentationType` | string \| null | `"new"` for new article, `"update"` for existing article, `null` if no article needed |
| `relatedArticleSlugs` | string[] | Article slugs to create or update (e.g., `["task-priority"]`) |

**Determine these values from the PRD's Support Article field:**
- `Support Article: No` → `supportArticleRequired: false, documentationType: null, relatedArticleSlugs: []`
- `Support Article: Yes (new: slug)` → `supportArticleRequired: true, documentationType: "new", relatedArticleSlugs: ["slug"]`
- `Support Article: Yes (update: slug)` → `supportArticleRequired: true, documentationType: "update", relatedArticleSlugs: ["slug"]`

### Tools Fields

Each user story includes AI tools tracking fields:

| Field | Type | Description |
|-------|------|-------------|
| `toolsRequired` | boolean | `true` if this story needs AI chatbot tools |
| `toolsType` | string \| null | `"new"` for new tool, `"update"` for existing tool, `null` if no tools needed |
| `relatedToolNames` | string[] | Tool names to create or update (e.g., `["list_events"]`) |

**Determine these values from the PRD's Tools field:**
- `Tools: No` → `toolsRequired: false, toolsType: null, relatedToolNames: []`
- `Tools: Yes (new: tool_name)` → `toolsRequired: true, toolsType: "new", relatedToolNames: ["tool_name"]`
- `Tools: Yes (update: tool_name)` → `toolsRequired: true, toolsType: "update", relatedToolNames: ["tool_name"]`

### Marketing Fields

Each user story includes marketing website tracking fields:

| Field | Type | Description |
|-------|------|-------------|
| `marketingRequired` | boolean | `true` if this story needs marketing page updates |
| `marketingType` | string \| null | `"new"` for new page, `"update"` for existing page, `null` if no marketing needed |
| `relatedMarketingPages` | string[] | Page slugs to create or update (e.g., `["features", "changelog"]`) |

**Determine these values from the PRD's Marketing field or infer from feature visibility:**
- Internal/admin-only features → `marketingRequired: false, marketingType: null, relatedMarketingPages: []`
- User-visible features worth promoting → `marketingRequired: true, marketingType: "update", relatedMarketingPages: ["features"]`
- Major new features → `marketingRequired: true, marketingType: "update", relatedMarketingPages: ["features", "changelog"]`
- `Marketing: No` → `marketingRequired: false, marketingType: null, relatedMarketingPages: []`
- `Marketing: Yes (update: page)` → `marketingRequired: true, marketingType: "update", relatedMarketingPages: ["page"]`

### Consideration Fields

Each user story can include project-level consideration mapping:

| Field | Type | Description |
|-------|------|-------------|
| `considerations` | string[] | IDs from `project.json` `planning.considerations[]` that this story must address |

Guidance:
- If no project considerations exist, set `considerations: []`
- If mapping is uncertain, confirm before finalizing

### Credential Planning Fields

Use these optional fields when PRD stories depend on external services:

Top-level:

| Field | Type | Description |
|-------|------|-------------|
| `credentialRequirements` | object[] | List of credential dependencies and request timing |

`credentialRequirements[]` object shape:

| Field | Type | Description |
|-------|------|-------------|
| `service` | string | Provider or API name (e.g., `stripe`, `supabase`, `sendgrid`) |
| `credentialType` | string | Type such as `apiKey`, `oauthClient`, `serviceAccount`, `token` |
| `requestTiming` | string | `upfront` or `after-initial-build` |
| `requiredForStories` | string[] | Story IDs blocked by this credential |
| `fallbackPlan` | string | What can proceed when credential is unavailable |
| `status` | string | `pending`, `provided`, or `deferred` |

Per-story:

| Field | Type | Description |
|-------|------|-------------|
| `requiredCredentials` | string[] | Service names this story depends on |

Rules:
- If no credential dependencies exist, set `credentialRequirements: []` and `requiredCredentials: []`.
- Do not include real secrets in JSON; capture only metadata and timing.
- If timing is unclear, mark as `⚠` in review and ask the user to choose `upfront` or `after-initial-build`.

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

1. **Each user story becomes one JSON entry**
2. **IDs**: Sequential (US-001, US-002, etc.)
3. **Priority**: Based on dependency order, then document order
4. **All stories**: `passes: false` and empty `notes`
5. **branchName**: Use format `feature/[feature-name-kebab-case]` (no ticket prefix)
6. **project**: Use `name` from `project.json` if available, otherwise folder name
7. **Acceptance criteria**: Include stack-specific criteria from `project.json`

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

**Before writing a new prd.json, check if there is an existing one from a different feature:**

1. Read the current `docs/prds/prd-[name].json` if it exists
2. Check if `branchName` differs from the new feature's branch name
3. If different AND progress exists:
   - Create archive folder: `docs/archive/YYYY-MM-DD-feature-name/`
   - Copy current PRD files to archive

---

## Checklist Before Saving

Before writing prd.json, verify:

- [ ] **Read `docs/project.json`** for stack context
- [ ] **Previous run archived** (if prd.json exists with different branchName, archive it first)
- [ ] Each story is completable in one iteration (small enough)
- [ ] Stories are ordered by dependency (schema to backend to UI)
- [ ] **Stack-specific criteria added** based on project.json:
  - [ ] TypeScript projects: "Typecheck passes"
  - [ ] Go projects: "go build succeeds"
  - [ ] Projects with linting: "Lint passes"
  - [ ] UI stories with dark mode: "Works in both light and dark mode"
  - [ ] UI stories: "Verify in browser"
- [ ] User-facing stories have `supportArticleRequired: true` (if `capabilities.supportDocs`)
- [ ] Promotable features have `marketingRequired: true` (if `capabilities.marketing`)
- [ ] Chat-accessible stories have `toolsRequired: true` (if `capabilities.ai`)
- [ ] `planning.considerations` mapped to relevant stories (when present)
- [ ] Credential dependencies captured in `credentialRequirements` with request timing
- [ ] Stories map credential dependencies via `requiredCredentials`
- [ ] Acceptance criteria are verifiable (not vague)
- [ ] No story depends on a later story
- [ ] **All uncertain (⚠) flags have been confirmed by user**
