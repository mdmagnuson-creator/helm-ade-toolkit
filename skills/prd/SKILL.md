---
name: prd
description: "Generate a Product Requirements Document (PRD) for a new feature. Use when planning a feature, starting a new project, or when asked to create a PRD. Triggers on: create a prd, write prd for, plan this feature, requirements for, spec out."
---

# PRD Generator

Create detailed Product Requirements Documents that are clear, actionable, and suitable for implementation.

---

## The Job

1. **Read project context** from `docs/project.json` (if exists)
2. Receive a feature description from the user
3. Ask 3-5 essential clarifying questions (with lettered options)
4. Identify external service dependencies and credential timing needs
5. Generate a structured PRD based on answers
6. Save to `docs/drafts/prd-[feature-name].md`

**Important:** Do NOT start implementing. Just create the PRD.

---

## Step 0: Read Project Context

**Before generating any PRD, read the project manifest to understand the stack:**

```bash
cat docs/project.json 2>/dev/null || echo "NO_PROJECT_JSON"
```

If `docs/project.json` exists, extract key information:

| Field | Use For |
|-------|---------|
| `stack.languages` | Determine if "Typecheck passes" applies |
| `stack.framework` | Framework-specific acceptance criteria |
| `apps` | Understanding where code lives |
| `styling.darkMode.enabled` | Add dark mode verification for UI stories |
| `testing.unit.framework` | Add "Unit tests pass" criteria when appropriate |
| `testing.e2e.framework` | Know if E2E is available |
| `linting.enabled` | Add "Lint passes" criteria |
| `features` | Understand what capabilities exist |
| `planning.considerations` | Project-specific scope concerns to pass through (permissions, docs, AI tools, compliance, etc.) |
| `agents.browserVerification` | Whether to require visual verification |

**Store this context for use when generating acceptance criteria.**

If no `project.json` exists, use sensible defaults and note this in your output:
```
⚠️ No docs/project.json found. Using default acceptance criteria.
   Run the bootstrap wizard to configure stack-specific criteria.
```

---

## Step 1: Clarifying Questions

Ask only critical questions where the initial prompt is ambiguous. Focus on:

- **Problem/Goal:** What problem does this solve?
- **Core Functionality:** What are the key actions?
- **Scope/Boundaries:** What should it NOT do?
- **Success Criteria:** How do we know it's done?
- **External Dependencies:** Which services/API keys/accounts are needed, and when are they needed?

Also review `planning.considerations` from `project.json` (if present) and ask follow-up questions only for considerations that appear relevant to the requested feature.

Examples:
- Permissions consideration -> ask role/scope/deny-path questions
- Support docs consideration -> ask if user-visible behavior changed
- AI tools consideration -> ask whether chat access is required

### Format Questions Like This:

```
1. What is the primary goal of this feature?
   A. Improve user onboarding experience
   B. Increase user retention
   C. Reduce support burden
   D. Other: [please specify]

2. Who is the target user?
   A. New users only
   B. Existing users only
   C. All users
   D. Admin users only

3. What is the scope?
   A. Minimal viable version
   B. Full-featured implementation
   C. Just the backend/API
   D. Just the UI
```

This lets users respond with "1A, 2C, 3B" for quick iteration.

---

## Step 2: PRD Structure

Generate the PRD with these sections:

### 1. Introduction/Overview

Brief description of the feature and the problem it solves.

### 2. Goals

Specific, measurable objectives (bullet list).

### 3. User Stories

Each story needs:

- **Title:** Short descriptive name
- **Description:** "As a [user], I want [feature] so that [benefit]"
- **Acceptance Criteria:** Verifiable checklist of what "done" means (stack-aware!)
- **Documentation Required:** Whether this story needs support documentation (see below)
- **Tools Required:** Whether this story needs AI chatbot tools (see below)
- **Considerations:** Which project-level considerations this story addresses
- **Credentials:** Whether this story needs credentials, and whether they are required `upfront` or `after-initial-build`

Each story should be small enough to implement in one focused session.

**Format:**

```markdown
### US-001: [Title]

**Description:** As a [user], I want [feature] so that [benefit].

**Documentation:** Yes/No (+ article slug if updating existing)

**Tools:** Yes/No (+ tool name if updating existing)

**Considerations:** [comma-separated ids from `planning.considerations`, or `none`]

**Credentials:** none | required (`service`, `credential type`, `timing: upfront|after-initial-build`)

**Acceptance Criteria:**

- [ ] Specific verifiable criterion
- [ ] Another criterion
- [ ] [Stack-specific criteria from project.json]
```

---

## Step 2b: Stack-Aware Acceptance Criteria

**Generate acceptance criteria based on `project.json` settings:**

### Universal Criteria (always include for relevant story types)

| Story Type | Always Include |
|------------|----------------|
| All stories | Specific functional criteria |
| Database/schema stories | Migration runs successfully |

### Conditional Criteria (based on project.json)

| Condition | Add This Criterion |
|-----------|-------------------|
| `stack.languages` includes "typescript" | `Typecheck passes` |
| `stack.languages` includes "go" | `go build succeeds` |
| `stack.languages` includes "python" | `mypy passes` (if typed) |
| `linting.enabled: true` | `Lint passes` |
| Story has UI AND `apps.*.type` includes "frontend" | `Verify in browser` |
| Story has UI AND `styling.darkMode.enabled: true` | `Works in both light and dark mode` |
| Story has testable logic AND `testing.unit.framework` exists | `Unit tests pass` |
| `capabilities.supportDocs: true` AND user-facing story | `Update/create support documentation` |
| `capabilities.ai: true` AND chat-accessible story | `Update/create AI agent tools` |

### Example: TypeScript + Next.js + Tailwind + Dark Mode Project

For a UI story, the acceptance criteria would be:
```markdown
**Acceptance Criteria:**

- [ ] Component renders correctly with mock data
- [ ] Clicking the button opens the modal
- [ ] Form validation shows errors for invalid input
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser
- [ ] Works in both light and dark mode
- [ ] Update/create support documentation
```

### Example: Go Backend Project (no frontend)

For an API endpoint story, the acceptance criteria would be:
```markdown
**Acceptance Criteria:**

- [ ] Endpoint returns 200 with valid request
- [ ] Endpoint returns 400 for invalid input
- [ ] go build succeeds
- [ ] Lint passes
- [ ] Unit tests pass
```

### Example: Python Project

For a data processing story:
```markdown
**Acceptance Criteria:**

- [ ] Function processes input correctly
- [ ] Handles edge cases (empty input, malformed data)
- [ ] mypy passes (if using type hints)
- [ ] Lint passes (ruff/flake8)
- [ ] Unit tests pass
```

---

## Identifying User-Facing Stories

## Project Scope Considerations (from `planning.considerations`)

If `project.json` has `planning.considerations`, include a short section in the PRD named `## Scope Considerations`.

For each consideration:
- State whether it is relevant to this PRD (`relevant`/`not relevant`)
- If relevant, add 1-3 concrete scope notes using `scopeQuestions`
- If relevant and the consideration has `acceptanceCriteriaHints`, map those hints into applicable story acceptance criteria

Example:

```markdown
## Scope Considerations

- permissions (required): relevant
  - Roles affected: owner, admin, member
  - Unauthorized behavior: return 403 with audit log
  - Story coverage: US-002, US-004

- support-docs: relevant
  - User-facing settings flow changed; update docs
  - Story coverage: US-003

- ai-tools: not relevant
```

A story requires documentation if it affects anything users see or interact with:

- **UI Changes:** New screens, buttons, forms, modals, or visual changes
- **Workflow Changes:** New or modified steps users perform
- **Feature Additions:** New capabilities users can access
- **Terminology Changes:** New labels, messages, or concepts users encounter
- **Behavior Changes:** Different responses to user actions (even if UI is unchanged)

**Backend-only stories** (database migrations, API internals, refactoring) do NOT require documentation unless they change observable behavior.

**Check `project.json`:** Only add documentation criteria if `capabilities.supportDocs: true`.

For user-facing stories in projects with support docs, add:
```
- [ ] Update/create support documentation
```

### Identifying Stories That Need AI Tools

A story requires AI tools if the feature should be accessible via chatbot/AI assistant:

- **Data Queries:** Users might ask the chatbot about this data
- **CRUD Operations:** Users might want to create, update, or delete via chat
- **Search/Lookup:** Users might search for information conversationally
- **Utility Functions:** Helpful utilities the AI might need

**Check `project.json`:** Only add tools criteria if `capabilities.ai: true`.

**Stories that do NOT need tools:**
- UI-only changes (the chatbot can't interact with UI)
- Administrative features not suitable for chat
- Complex multi-step workflows better done in UI
- Features requiring visual confirmation

For chat-accessible stories in projects with AI features, add:
```
- [ ] Update/create AI agent tools
```

And specify in the **Tools** field:
- `Yes (new: tool_name)` — Needs a new tool
- `Yes (update: tool_name)` — Updates an existing tool
- `No` — No tools needed

And specify in the **Documentation** field:
- `Yes (new)` — Needs a new support article
- `Yes (update: article-slug)` — Updates an existing article
- `No` — No documentation needed (backend-only)

### 4. Functional Requirements

Numbered list of specific functionalities:

- "FR-1: The system must allow users to..."
- "FR-2: When a user clicks X, the system must..."

Be explicit and unambiguous.

### 5. Non-Goals (Out of Scope)

What this feature will NOT include. Critical for managing scope.

### 6. Design Considerations (Optional)

- UI/UX requirements
- Link to mockups if available
- Relevant existing components to reuse

**If `context.designSystem` is set in project.json, reference it:**
```
See design system: [docs/design-system.md](docs/design-system.md)
```

### 7. Technical Considerations (Optional)

- Known constraints or dependencies
- Integration points with existing systems
- Performance requirements

**Reference project.json for technical context:**
- Framework: `stack.framework`
- Database: `database.type` + `database.client`
- Key directories: `apps.*.structure`

### 8. Success Metrics

How will success be measured?

- "Reduce time to complete X by 50%"
- "Increase conversion rate by 10%"

### 9. Open Questions

Remaining questions or areas needing clarification.

### 10. Credential & Service Access Plan

Include this section whenever the PRD touches third-party services, hosted providers, or protected APIs.

Use a concise table:

```markdown
## Credential & Service Access Plan

| Service | Credential Type | Needed For | Request Timing | Fallback if Not Available |
|---------|------------------|------------|----------------|---------------------------|
| Stripe | Secret API key | US-004, US-005 | upfront | Build UI and mocks first; delay live charge tests |
| SendGrid | API key | US-006 | after-initial-build | Implement local email preview and queue integration step |
```

Rules:
- Use `upfront` when progress is blocked without access.
- Use `after-initial-build` when scaffold/UI/local logic can proceed without live credentials.
- Never include actual secret values in PRDs.
- If no credentials are required, include `No external credentials required for this PRD.`

---

## Writing for Junior Developers

The PRD reader may be a junior developer or AI agent. Therefore:

- Be explicit and unambiguous
- Avoid jargon or explain it
- Provide enough detail to understand purpose and core logic
- Number requirements for easy reference
- Use concrete examples where helpful

---

## Output

- **Format:** Markdown (`.md`)
- **Location:** `docs/drafts/`
- **Filename:** `prd-[feature-name].md` (kebab-case)

---

## Example PRD (for TypeScript/Next.js/Tailwind project with dark mode)

```markdown
# PRD: Task Priority System

## Introduction

Add priority levels to tasks so users can focus on what matters most. Tasks can be marked as high, medium, or low priority, with visual indicators and filtering to help users manage their workload effectively.

## Goals

- Allow assigning priority (high/medium/low) to any task
- Provide clear visual differentiation between priority levels
- Enable filtering and sorting by priority
- Default new tasks to medium priority

## User Stories

### US-001: Add priority field to database

**Description:** As a developer, I need to store task priority so it persists across sessions.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Add priority column to tasks table: 'high' | 'medium' | 'low' (default 'medium')
- [ ] Generate and run migration successfully
- [ ] Typecheck passes
- [ ] Lint passes

### US-002: Display priority indicator on task cards

**Description:** As a user, I want to see task priority at a glance so I know what needs attention first.

**Documentation:** Yes (new: task-priority)

**Tools:** No

**Acceptance Criteria:**

- [ ] Each task card shows colored priority badge (red=high, yellow=medium, gray=low)
- [ ] Priority visible without hovering or clicking
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser
- [ ] Works in both light and dark mode
- [ ] Update/create support documentation

### US-003: Add priority selector to task edit

**Description:** As a user, I want to change a task's priority when editing it.

**Documentation:** Yes (update: task-priority)

**Tools:** Yes (new: update_task_priority)

**Acceptance Criteria:**

- [ ] Priority dropdown in task edit modal
- [ ] Shows current priority as selected
- [ ] Saves immediately on selection change
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser
- [ ] Works in both light and dark mode
- [ ] Update/create support documentation
- [ ] Update/create AI agent tools

### US-004: Filter tasks by priority

**Description:** As a user, I want to filter the task list to see only high-priority items when I'm focused.

**Documentation:** Yes (update: task-priority)

**Tools:** Yes (update: list_tasks)

**Acceptance Criteria:**

- [ ] Filter dropdown with options: All | High | Medium | Low
- [ ] Filter persists in URL params
- [ ] Empty state message when no tasks match filter
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser
- [ ] Works in both light and dark mode
- [ ] Update/create support documentation
- [ ] Update/create AI agent tools

## Functional Requirements

- FR-1: Add `priority` field to tasks table ('high' | 'medium' | 'low', default 'medium')
- FR-2: Display colored priority badge on each task card
- FR-3: Include priority selector in task edit modal
- FR-4: Add priority filter dropdown to task list header
- FR-5: Sort by priority within each status column (high to medium to low)

## Non-Goals

- No priority-based notifications or reminders
- No automatic priority assignment based on due date
- No priority inheritance for subtasks

## Design Considerations

See design system: [docs/design-system.md](docs/design-system.md)

- Reuse existing badge component with color variants
- Follow color conventions for semantic states

## Technical Considerations

- **Framework:** Next.js 16
- **Database:** Postgres via Supabase
- **Migrations:** supabase/migrations/
- Filter state managed via URL search params
- Priority stored in database, not computed

## Success Metrics

- Users can change priority in under 2 clicks
- High-priority tasks immediately visible at top of lists
- No regression in task list performance

## Open Questions

- Should priority affect task ordering within a column?
- Should we add keyboard shortcuts for priority changes?
```

---

## Checklist

Before saving the PRD:

- [ ] Read `docs/project.json` for stack context
- [ ] Asked clarifying questions with lettered options
- [ ] Incorporated user's answers
- [ ] User stories are small and specific
- [ ] Functional requirements are numbered and unambiguous
- [ ] Non-goals section defines clear boundaries
- [ ] **Acceptance criteria are stack-aware** (from project.json)
- [ ] User-facing stories have Documentation field set (if `capabilities.supportDocs`)
- [ ] UI stories include dark mode verification (if `styling.darkMode.enabled`)
- [ ] Chat-accessible stories have Tools field set (if `capabilities.ai`)
- [ ] `planning.considerations` reviewed and relevant items reflected in PRD scope
- [ ] PRD includes `## Scope Considerations` section when considerations exist
- [ ] Relevant stories include `Considerations` field with mapped ids
- [ ] Credential dependencies are captured with request timing (`upfront` or `after-initial-build`)
- [ ] Saved to `docs/drafts/prd-[feature-name].md`

## Automatic Post-Completion Tasks

**You do NOT need to add a "Final Polish" story.** When Developer completes all stories in a PRD, it automatically:

1. **Runs @aesthetic-critic** on all UI changes with full severity (Critical + Warnings)
2. **Runs @support-article-writer** for any stories marked `Support Article: Yes` that don't yet have documentation
3. **Runs @screenshot-maintainer** to capture screenshots for new support articles and update any affected product screenshots
4. **Runs @copy-critic** on new support articles to verify quality

This ensures documentation, visual quality, and screenshots are always up to date without requiring a separate story for each PRD.

Additionally, during implementation (on each commit), the @critic agent automatically routes to @aesthetic-critic for UI changes, catching Critical visual issues early.
