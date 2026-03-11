# PRD: Ad-hoc Analysis Phase with Task Specs

## Introduction

Currently, when a user asks Builder to do something in ad-hoc mode (outside of a PRD), Builder immediately starts implementing. This can lead to:

- **Misunderstood requirements** — Builder assumes intent without clarification
- **Missed context** — Changes that conflict with existing patterns or architecture
- **Scope creep** — Small requests that should be larger planned features
- **Downstream consequences** — Breaking changes, migration needs, or dependency impacts not considered
- **No tracking** — Ad-hoc work isn't documented like PRD work

This PRD adds an **Analysis Phase** to ad-hoc mode and introduces **Task Specs** — Builder-generated planning documents that mirror the PRD lifecycle while maintaining strict separation from Planner's domain.

## Key Concept: Task Specs vs PRDs

Task Specs follow the **same lifecycle as PRDs** but in a parallel folder structure:

| Aspect | Task Spec (Builder) | PRD (Planner) |
|--------|---------------------|---------------|
| **Created by** | Builder | Planner |
| **Drafts location** | `docs/tasks/drafts/` | `docs/drafts/` |
| **Ready location** | `docs/tasks/` | `docs/prds/` |
| **Completed location** | `docs/tasks/completed/` | `docs/completed/` |
| **Abandoned location** | `docs/tasks/abandoned/` | `docs/abandoned/` |
| **Registry** | `docs/task-registry.json` | `docs/prd-registry.json` |
| **Story prefix** | `TSK-001`, `TSK-002`, etc. | `US-001`, `US-002`, etc. |
| **User involvement** | Confirm understanding | Multi-round refinement |

**Strict separation:** 
- Builder NEVER creates or modifies files in `docs/prds/`, `docs/drafts/`, `docs/completed/`, or `docs/prd-registry.json`
- Planner NEVER creates or modifies files in `docs/tasks/` or `docs/task-registry.json`
- Exception: Builder MAY inject `TSK-###` stories into an active PRD at user request (see US-007)

## Goals

- Analyze ALL ad-hoc requests consistently with progress visibility
- Generate Task Specs for every ad-hoc request (using story format with acceptance criteria)
- Track Task Specs with same lifecycle as PRDs (draft → ready → in_progress → completed)
- Surface potential conflicts via AST/import analysis
- Present alternative approaches with recommendations
- Identify downstream consequences with severity levels
- Auto-create promotion documents for medium/large scope (easy path to Planner)
- Support mid-PRD task injection with clear `TSK-###` labeling

## User Stories

### US-001: Consistent Request Analysis

**Description:** As a user, I want Builder to analyze every ad-hoc request with visible progress so that I understand what's happening and can confirm Builder's understanding.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Every ad-hoc request triggers full analysis (no exceptions)
- [ ] Analysis uses AST/import tracing to find all impacted files
- [ ] Progress indicator shows analysis status as it runs (e.g., "Scanning imports... Checking dependencies... Estimating scope...")
- [ ] Analysis is time-boxed to 10 seconds; if incomplete, show what's found with note "analysis may be incomplete"
- [ ] Builder outputs confidence level: "High/Medium/Low confidence in this understanding"
- [ ] Understanding section summarizes: what user wants, affected files, scope estimate
- [ ] User confirms understanding before Task Spec is generated

### US-002: Clarifying Questions

**Description:** As a user, I want Builder to always verify its understanding and ask clarifying questions when ambiguous so that implementation matches my intent.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Builder ALWAYS provides its interpretation and asks user to verify understanding
- [ ] Builder identifies ambiguities: multiple interpretations OR missing information needed to implement
- [ ] Questions are presented in series format (one story-worth of questions at a time, like this PRD refinement)
- [ ] User can respond with letter codes (e.g., "1A, 2B") for quick answers
- [ ] Single round of questions — ask all at once, then proceed
- [ ] User can skip questions with "just do it" and Builder proceeds with stated interpretation
- [ ] For medium/large scope requests, Builder suggests using Planner and auto-creates promotion document
- [ ] User can always override and ask Builder to proceed anyway

### US-003: Alternative Approaches

**Description:** As a user, I want Builder to present alternative approaches when meaningful trade-offs exist so that I can make an informed decision.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Builder identifies when multiple approaches have meaningful trade-offs
- [ ] Builder presents 2-3 alternatives with 2-3 bullet points each (pros/cons)
- [ ] Each alternative includes complexity indication
- [ ] Builder ALWAYS makes a recommendation: "Recommended: X because Y"
- [ ] User can select an approach or ask for more detail
- [ ] Selected approach is recorded in Task Spec
- [ ] If only one sensible approach, Builder states recommendation without alternatives

### US-004: Downstream Consequences

**Description:** As a user, I want Builder to identify downstream consequences with clear severity so that I understand the full impact before implementation.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Builder uses all discovery methods: static analysis, semantic understanding, and checklist review
- [ ] Consequences are categorized by severity:
  - **Critical** — blocks deployment, requires immediate attention
  - **Warning** — needs attention, could cause issues
  - **Info** — FYI, minor impact
- [ ] Consequences include impact scope: "affects 2 files" vs "affects 15 files across 3 modules"
- [ ] Identifies: breaking changes, migration needs, dependency impacts, test impacts
- [ ] Consequences shown before implementation, recorded in Task Spec
- [ ] No effort estimates (just identify, don't estimate time)
- [ ] If no consequences: "No downstream consequences identified"

### US-005: Task Spec Generation

**Description:** As a user, I want Builder to generate a Task Spec with stories and acceptance criteria matching PRD format so that tracking is consistent.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Builder generates Task Spec for every ad-hoc request
- [ ] Task Spec uses story format with `TSK-001`, `TSK-002`, etc. numbering
- [ ] Each story has acceptance criteria checkboxes (matching PRD story format)
- [ ] Task Spec saved to `docs/tasks/drafts/task-YYYY-MM-DD-brief-name.md` initially
- [ ] Summary view shown to user (story list), full spec saved to file
- [ ] Task Spec includes: summary, scope, approach, stories with acceptance criteria, consequences
- [ ] On user confirmation, Task Spec moves to `docs/tasks/` (ready status)

### US-006: Task Registry with PRD-like Lifecycle

**Description:** As a user, I want Task Specs tracked with the same registry format as PRDs so that tooling and reporting are consistent.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] `docs/task-registry.json` uses same schema as `prd-registry.json`
- [ ] Registry fields: id, title, status, filePath, createdAt, completedAt, stories (count)
- [ ] Status values match PRD: `draft`, `ready`, `in_progress`, `completed`, `abandoned`, `promoted`
- [ ] Registry uses file locking during updates (prevent concurrent edit conflicts)
- [ ] Task Specs appear in Project Status dashboard (alongside PRDs)
- [ ] Builder can resume `in_progress` Task Specs from previous sessions

### US-007: Task Spec Todo Tracking and Mid-PRD Injection

**Description:** As a user, I want Task Spec todos tracked like PRD stories, and I want to inject ad-hoc tasks into an active PRD when I realize additional work is needed mid-session.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Task Spec stories displayed in right panel matching PRD story display style
- [ ] Completed stories remain visible with checkmark (same as PRD)
- [ ] `builder-state.json` tracks `activeTask` (mutually exclusive with `activePrd` for standalone tasks)
- [ ] **Mid-PRD injection:** User can add tasks during active PRD work
- [ ] Injected tasks use `TSK-001`, `TSK-002` prefix (distinct from `US-###` PRD stories)
- [ ] User specifies injection position: "run this after US-002" or "add this at the end"
- [ ] Injected tasks are added to the PRD file in specified position
- [ ] Injected tasks appear in right panel todo list at correct position
- [ ] Injected tasks execute in sequence with PRD stories

### US-008: Task Spec Promotion to PRD

**Description:** As a user, I want to promote a Task Spec to a formal PRD when scope grows, with the option to preserve or restart work.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Promotion available at any time via [P] option
- [ ] Builder proactively suggests promotion when scope grows beyond original estimate
- [ ] Handoff document includes full context: original request, analysis, alternatives considered, consequences, work completed
- [ ] Handoff saved to `docs/tasks/promotions/promote-task-YYYY-MM-DD-name-to-prd.md`
- [ ] Builder asks: "Keep completed work or start fresh with PRD?"
- [ ] If "keep": completed stories noted in handoff, PRD continues from there
- [ ] If "fresh": handoff notes all work as "to be re-evaluated by Planner"
- [ ] Task Spec status changes to `promoted` in registry
- [ ] Builder notifies: "Promotion request created. Run @planner to continue."

### US-009: PRD Recommendation for Large Requests

**Description:** As a user, I want Builder to strongly recommend PRD for large requests with an easy path to accept, while still allowing me to override.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Builder estimates complexity during analysis
- [ ] For medium/large scope: Builder recommends formal PRD with concise reasoning
- [ ] Reasoning includes: file count, breaking changes, architecture impact
- [ ] Builder auto-creates promotion document before showing recommendation (easy accept path)
- [ ] Recommendation: "This is large scope. Recommend creating PRD. [P] Promote to Planner | [O] Override and continue"
- [ ] PRD recommendation threshold configurable via `project.json` → `agents.prdRecommendationThreshold`
- [ ] If user overrides, Builder warns once more at ~50% completion if scope grew significantly
- [ ] User can always proceed with Task Spec regardless of size

### US-010: Analysis Output Format

**Description:** As a user, I want a clear, progressive format for analysis output that I can scan quickly or expand for detail.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Analysis uses progressive disclosure: summary first, "[D] Details" to expand sections
- [ ] Sections: Understanding, Scope, Questions (if any), Alternatives, Consequences, Story Preview
- [ ] Smart collapse: sections with "none identified" are collapsed by default; sections with content are expanded
- [ ] Final prompt clearly labeled:
  ```
  [G] Go ahead — create Task Spec and start
  [E] Edit/Clarify — refine understanding
  [P] Promote to PRD — hand off to Planner (promotion doc ready)
  [C] Cancel — abort this request
  ```
- [ ] Format matches Builder's existing dashboard/prompt visual style

### US-011: Task Spec Completion and Archival

**Description:** As a user, I want completed Task Specs to show a full completion report and be archived permanently.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Builder auto-generates completion summary from completed stories and git commits
- [ ] Completion report matches PRD completion: files changed, tests added, stories completed
- [ ] Completed Task Spec moves to `docs/tasks/completed/`
- [ ] Registry status updates to `completed` with `completedAt` timestamp
- [ ] Task Spec file updated with completion section
- [ ] `builder-state.json` → `activeTask` cleared
- [ ] Completed Task Specs kept forever (no auto-cleanup)

### US-012: Task Spec Abandonment

**Description:** As a user, I want to abandon a Task Spec with the option to resume later if needed.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] User can abandon via "abandon" command or [A] option
- [ ] Builder prompts for optional reason (can skip)
- [ ] Builder asks: "Revert uncommitted changes? [Y/N]"
- [ ] If yes: uncommitted changes reverted; committed work preserved
- [ ] If no: all changes preserved as-is
- [ ] Task Spec moves to `docs/tasks/abandoned/`
- [ ] Registry status updates to `abandoned`
- [ ] Abandoned Task Specs CAN be resumed: user can "resume task-YYYY-MM-DD-name"
- [ ] Resume moves Task Spec back to `docs/tasks/` with `in_progress` status

### US-013: Update adhoc-workflow Skill

**Description:** As a developer, I need the adhoc-workflow skill updated with full analysis phase and Task Spec lifecycle documentation.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Update existing `skills/adhoc-workflow/SKILL.md` in place
- [ ] Add "Phase 0: Analysis & Task Spec Generation" section
- [ ] Document full Task Spec lifecycle (draft → ready → in_progress → completed/abandoned/promoted)
- [ ] Document mid-PRD injection flow with `TSK-###` prefix
- [ ] Document promotion flow and handoff document format
- [ ] Include full example flow: analysis → questions → Task Spec → execution → completion
- [ ] Example shows progress indicators, confidence levels, and all prompt options

### US-014: Planner Promotion Pickup

**Description:** As a developer, I need Planner to recognize promotion documents and auto-fill PRD drafts from them.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Planner checks `docs/tasks/promotions/` on startup
- [ ] Promotions shown in separate dashboard section: "Promotions from Builder (1)"
- [ ] User can select promotion to review
- [ ] Planner auto-generates complete PRD draft from promotion document
- [ ] PRD draft includes: introduction (from original request), completed work as done stories, remaining scope as new stories
- [ ] PRD references origin: "Promoted from Task Spec: task-YYYY-MM-DD-name"
- [ ] After PRD is created and confirmed, promotion document is deleted
- [ ] Promotions remain in dashboard until processed (no auto-dismiss)

## Functional Requirements

- FR-1: Builder MUST analyze every ad-hoc request with progress indicator (10s time-box)
- FR-2: Builder MUST show confidence level in understanding (High/Medium/Low)
- FR-3: Builder MUST always verify interpretation with user before proceeding
- FR-4: Builder MUST generate Task Spec for every request (using TSK-### story format)
- FR-5: Task Specs MUST have acceptance criteria matching PRD story format
- FR-6: Task Specs MUST follow same lifecycle as PRDs (draft → ready → in_progress → completed/abandoned/promoted)
- FR-7: Task registry MUST match PRD registry schema
- FR-8: Task Specs MUST appear in Project Status dashboard
- FR-9: Builder MUST support mid-PRD task injection with TSK-### prefix
- FR-10: Builder MUST auto-create promotion document for medium/large scope before recommending PRD
- FR-11: Builder MUST allow user override of PRD recommendation
- FR-12: Planner MUST auto-generate PRD draft from promotion documents
- FR-13: Abandoned Task Specs MUST be resumable

## Non-Goals

- No Builder involvement in formal PRD creation (Planner only)
- No Planner involvement in Task Spec creation (Builder only)
- No automatic promotion without user confirmation
- No changes to PRD mode workflow (PRD execution unchanged except for TSK injection)
- No changes to quality checks or ship phase

## Technical Considerations

### File Structure

```
docs/
├── drafts/                      # Planner's PRD drafts
├── prds/                        # Planner's ready PRDs
├── completed/                   # Planner's completed PRDs
├── abandoned/                   # Planner's abandoned PRDs
├── prd-registry.json            # Planner's registry
│
├── tasks/                       # Builder's domain
│   ├── drafts/                  # Task Spec drafts (during analysis)
│   ├── completed/               # Completed Task Specs
│   ├── abandoned/               # Abandoned Task Specs (resumable)
│   ├── promotions/              # Handoff docs for Planner
│   └── task-*.md                # Ready/in-progress Task Specs
│
├── task-registry.json           # Builder's registry (matches PRD registry schema)
└── builder-state.json           # Tracks activeTask OR activePrd
```

### Task Spec Format

```markdown
---
id: task-2026-03-01-add-spinner
title: Add Loading Spinner to Submit Button
status: in_progress
scope: small
confidence: high
createdAt: 2026-03-01T10:30:00Z
---

# Task: Add Loading Spinner to Submit Button

## Summary

Add a loading spinner to the submit button that shows during form submission.

## Analysis

**Scope:** Small (2 files, no breaking changes)
**Confidence:** High

**Approach:** Use existing Spinner component, disable button during submission.

**Alternatives Considered:**
- CSS-only animation — simpler but inconsistent with design system
- Full-page overlay — overkill for single button

**Recommendation:** Use Spinner component (consistent, accessible, already styled)

**Consequences:**
- None identified

## Stories

### TSK-001: Add loading state to SubmitButton component

**Description:** As a user, I want the submit button to track loading state so that it can show feedback during submission.

**Acceptance Criteria:**

- [ ] Add `isLoading` prop to SubmitButton
- [ ] Pass loading state from parent form
- [ ] Typecheck passes

### TSK-002: Show Spinner when loading

**Description:** As a user, I want to see a spinner when the form is submitting so that I know the action is in progress.

**Acceptance Criteria:**

- [ ] Import Spinner component
- [ ] Render Spinner when `isLoading` is true
- [ ] Hide button text while loading
- [ ] Verify in browser

### TSK-003: Disable button during submission

**Description:** As a user, I want the button disabled during submission so that I can't accidentally submit twice.

**Acceptance Criteria:**

- [ ] Add `disabled={isLoading}` to button
- [ ] Style disabled state appropriately
- [ ] Works in both light and dark mode

### TSK-004: Add unit tests

**Description:** As a developer, I want unit tests for the loading behavior so that regressions are caught.

**Acceptance Criteria:**

- [ ] Test loading state renders spinner
- [ ] Test button is disabled during loading
- [ ] Unit tests pass

## Completion

**Completed:** [timestamp when done]
**Files Changed:** [list]
**Tests Added:** [count]
**Summary:** [auto-generated from commits]
```

### Task Registry Format (matches PRD registry)

```json
{
  "$schema": "https://opencode.ai/schemas/task-registry.json",
  "tasks": [
    {
      "id": "task-2026-03-01-add-spinner",
      "title": "Add Loading Spinner to Submit Button",
      "status": "in_progress",
      "filePath": "docs/tasks/task-2026-03-01-add-spinner.md",
      "createdAt": "2026-03-01T10:30:00Z",
      "completedAt": null,
      "stories": 4
    },
    {
      "id": "task-2026-02-28-fix-footer",
      "title": "Fix Footer Alignment",
      "status": "completed",
      "filePath": "docs/tasks/completed/task-2026-02-28-fix-footer.md",
      "createdAt": "2026-02-28T14:00:00Z",
      "completedAt": "2026-02-28T14:30:00Z",
      "stories": 2
    },
    {
      "id": "task-2026-02-27-refactor-auth",
      "title": "Refactor Auth Flow",
      "status": "promoted",
      "filePath": "docs/tasks/task-2026-02-27-refactor-auth.md",
      "createdAt": "2026-02-27T09:00:00Z",
      "completedAt": null,
      "promotedTo": "prd-auth-refactor",
      "stories": 3
    }
  ]
}
```

### Mid-PRD Injection Example

When user says "add a task to handle error states after US-002":

```markdown
# PRD: User Settings Feature (excerpt)

### US-001: Add settings page
...

### US-002: Add theme selector
...

### TSK-001: Handle error states for theme save [INJECTED]

**Description:** As a user, I want to see error feedback if theme save fails.

**Acceptance Criteria:**

- [ ] Show toast on save failure
- [ ] Allow retry
- [ ] Verify in browser

### US-003: Add notification preferences
...
```

The `[INJECTED]` label is for documentation; the `TSK-###` prefix is the primary indicator.

### Promotion Document Format

```markdown
---
taskId: task-2026-03-01-big-feature
promotedAt: 2026-03-01T15:00:00Z
preserveWork: true
reason: Scope grew beyond original estimate
---

# Promotion Request: User Preferences Feature

## Original Request

"Add user preferences with theme selection"

## Analysis Summary

**Original Scope Estimate:** Small
**Actual Scope:** Large (discovered during implementation)
**Confidence:** High

**Why promotion is recommended:**
- Requires database schema changes (migration needed)
- Affects 15+ files across 3 modules
- Has breaking changes to user settings API
- Downstream impacts on mobile app and browser extension

## Approach Taken

Use database-backed preferences with real-time sync.

**Alternatives Considered:**
- Local storage only — rejected due to cross-device requirement
- Hybrid approach — too complex for initial implementation

## Work Completed

### TSK-001: Create preferences database table ✅
- Migration created and applied
- Schema includes theme, notifications, accessibility settings

### TSK-002: Add theme selection UI ✅
- ThemeSelector component created
- Integrated with settings page

## Remaining Scope (for PRD)

- User preference sync across devices
- Default preference migration for existing users
- Theme application to all 40+ components
- Dark mode edge cases
- Accessibility audit for color contrast
- Mobile app integration
- Browser extension integration

## Files Modified So Far

- `src/db/schema/preferences.ts` (new)
- `src/db/migrations/20260301_preferences.sql` (new)
- `src/components/settings/ThemeSelector.tsx` (new)
- `src/pages/settings.tsx` (modified)
- `src/api/preferences.ts` (new)

## Recommended PRD Structure

1. **Database & API Layer** — completed (TSK-001)
2. **Theme System Core** — completed (TSK-002)  
3. **Cross-Device Sync** — new US-001
4. **Migration Strategy** — new US-002
5. **Component Theming** — new US-003 (large)
6. **Accessibility Audit** — new US-004
7. **Mobile Integration** — new US-005
8. **Extension Integration** — new US-006
```

### Builder State Extension

```json
{
  "activePrd": {
    "id": "prd-user-settings",
    "currentStory": "US-002",
    "injectedTasks": ["TSK-001"]
  },
  "activeTask": null,
  "uiTodos": { ... }
}
```

OR for standalone Task Spec:

```json
{
  "activePrd": null,
  "activeTask": {
    "id": "task-2026-03-01-add-spinner",
    "currentStory": "TSK-002",
    "completedStories": ["TSK-001"]
  },
  "uiTodos": { ... }
}
```

**Rule:** For standalone work, `activePrd` and `activeTask` are mutually exclusive. However, `injectedTasks` can exist within an `activePrd` context.

### Configuration

```json
{
  "agents": {
    "prdRecommendationThreshold": "medium",
    "analysisTimeoutMs": 10000,
    "taskSpecEnabled": true
  }
}
```

- `prdRecommendationThreshold`: `"small"` | `"medium"` | `"large"` — scope at which PRD is recommended
- `analysisTimeoutMs`: max time for analysis phase (default 10000)
- `taskSpecEnabled`: disable for legacy ad-hoc behavior (not recommended)

## Success Metrics

- Every ad-hoc request has a Task Spec (100% coverage)
- Users confirm understanding before implementation (reduced rework)
- Analysis completes within 10 seconds with progress visibility
- Medium/large requests have promotion doc ready for easy Planner handoff
- Mid-PRD task injection works seamlessly with TSK-### labeling
- Task Specs appear in Project Status alongside PRDs
- Clear separation between Builder (tasks) and Planner (PRDs) domains

## Open Questions

None — all questions resolved through clarification process.

## Credential & Service Access Plan

No external credentials required for this PRD.
