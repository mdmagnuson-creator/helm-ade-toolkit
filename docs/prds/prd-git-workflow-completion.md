# PRD: Consistent Git Workflow Completion Behavior

## Introduction

Ensure Builder's git workflow completion behavior (push, PR creation, merge) is consistent between ad-hoc and PRD modes, driven entirely by `project.json` settings rather than mode-specific logic. Currently, there's ambiguity and inconsistency in how Builder handles task completion git operations, leading to unexpected behavior like auto-creating PRs without asking or pushing to wrong branches.

## Problem Statement

A recent incident revealed the following issues:

1. **Builder auto-created a PR to `main`** after ad-hoc work without asking, even though `main` was in `requiresHumanApproval`
2. **Inconsistent behavior between modes** — PRD mode and ad-hoc mode had different git completion logic
3. **Schema ambiguity** — The `git.agentWorkflow` schema description incorrectly stated that branches in `requiresHumanApproval` are "BLOCKED for all agent operations" when actually PR creation IS allowed (only auto-merge should be blocked)

The fix should NOT be mode-specific behavior. All git completion decisions should be driven by `git.agentWorkflow` settings uniformly.

## Goals

- Unify git workflow completion logic between ad-hoc and PRD modes
- Make all git completion decisions driven by `git.agentWorkflow` settings
- Clarify the distinction between push blocking, PR creation, and auto-merge blocking
- Add explicit user prompts before PR creation (no surprise PRs)
- Ensure protected branches (`requiresHumanApproval`) block only auto-merge, not PR creation

## User Stories

### US-001: Audit and align git completion logic in Builder

**Description:** As a toolkit maintainer, I need to audit Builder's git completion logic to ensure PRD mode and ad-hoc mode use identical workflows driven by project settings.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Identify all git completion code paths in `builder.md`
- [ ] Identify git completion code paths in `adhoc-workflow/SKILL.md`
- [ ] Document current behavior differences between modes
- [ ] Create unified completion workflow specification

### US-002: Create shared git completion workflow

**Description:** As a toolkit maintainer, I want a single, shared git completion workflow that both PRD mode and ad-hoc mode use, so behavior is consistent.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Define canonical git completion workflow in AGENTS.md (if cross-agent) or Builder (if Builder-only)
- [ ] Both PRD mode and ad-hoc mode reference the same workflow
- [ ] No mode-specific git logic except where absolutely necessary
- [ ] Workflow follows this sequence:
  1. Commit (respecting `git.autoCommit`)
  2. Prompt before push (unless already on `pushTo` branch)
  3. Prompt before PR creation
  4. Create PR but do NOT auto-merge to protected branches

### US-003: Update schema description for `requiresHumanApproval`

**Description:** As a toolkit maintainer, I need to correct the `requiresHumanApproval` description in the schema to accurately reflect that PR creation is allowed, only auto-merge is blocked.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Update `project.schema.json` description for `requiresHumanApproval`
- [ ] Make it clear: push blocked, PR creation allowed, auto-merge blocked
- [ ] Ensure description matches behavior in AGENTS.md

### US-004: Add explicit PR creation prompt

**Description:** As a user, I want Builder to always ask before creating a PR, so I'm not surprised by unexpected PRs.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Builder prompts before any `gh pr create` command
- [ ] Prompt shows target branch and asks for confirmation
- [ ] Prompt offers alternatives: create PR, skip PR, or create PR to different branch
- [ ] No auto-PR-creation without user confirmation

### US-005: Implement protected branch detection with correct behavior

**Description:** As a user, I want Builder to correctly handle protected branches by allowing PR creation but blocking auto-merge.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Direct push to protected branch → BLOCKED with clear error
- [ ] Create PR to protected branch → ALLOWED
- [ ] Auto-merge PR to protected branch → BLOCKED (human must approve and merge)
- [ ] After creating PR to protected branch, report: "PR created. Human approval required to merge."

### US-006: Add workflow state validation

**Description:** As a toolkit maintainer, I want Builder to validate `git.agentWorkflow` configuration before performing git operations, failing fast with a helpful error if misconfigured.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] If `git.agentWorkflow` not defined, show "GIT WORKFLOW NOT CONFIGURED" error
- [ ] Error prompts user to describe their workflow
- [ ] Builder can generate suggested configuration from user's answers
- [ ] Never assume defaults for protected operations

## Functional Requirements

- FR-1: Git completion logic must be identical for ad-hoc and PRD modes
- FR-2: All git operations must respect `git.agentWorkflow` settings
- FR-3: Builder must prompt before creating PRs (no auto-PR)
- FR-4: PRs to `requiresHumanApproval` branches are allowed, but auto-merge is blocked
- FR-5: Direct push to `requiresHumanApproval` branches is blocked
- FR-6: Missing `git.agentWorkflow` configuration triggers configuration prompt, not defaults
- FR-7: Error messages must clearly explain what's blocked and why
- FR-8: Workflow supports these operations in order:
  1. `git commit` (respecting `git.autoCommit`)
  2. `git push` to `pushTo` branch
  3. `gh pr create` to `createPrTo` branch (if different from `pushTo`)
  4. Report PR status (with "human approval required" for protected branches)

## Non-Goals

- No changes to `git.autoCommit` behavior (out of scope)
- No changes to branching strategy detection (out of scope)
- No auto-merge functionality even for non-protected branches (too risky)
- No multi-branch push support (one target at a time)

## Technical Considerations

- **Affected files:**
  - `agents/builder.md` — main orchestrator, has PRD mode completion logic
  - `skills/adhoc-workflow/SKILL.md` — has ad-hoc mode completion logic (Phase 2: Ship)
  - `AGENTS.md` — Git Workflow Enforcement section (already updated)
  - `schemas/project.schema.json` — `requiresHumanApproval` description

- **Key distinction to preserve:**
  | Operation | Protected Branch | Non-Protected Branch |
  |-----------|------------------|---------------------|
  | Direct push | BLOCKED | ALLOWED |
  | Create PR | ALLOWED | ALLOWED |
  | Auto-merge | BLOCKED | (not supported) |

- **Workflow decision tree:**
  ```
  Task Complete
      │
      ├─ git.autoCommit = true? → Commit
      │
      ├─ Push to pushTo?
      │   ├─ pushTo in requiresHumanApproval? → BLOCK push, suggest PR workflow
      │   └─ pushTo OK? → Push, then prompt for PR
      │
      └─ Create PR to createPrTo?
          ├─ User confirms? → Create PR
          │   ├─ createPrTo in requiresHumanApproval? → Report "human approval required"
          │   └─ createPrTo OK? → Report PR link
          └─ User declines? → Done (changes pushed but no PR)
  ```

## Success Metrics

- Zero instances of "surprise PRs" (PRs created without user confirmation)
- Consistent behavior between ad-hoc and PRD modes (no user reports of different behavior)
- Clear error messages when configuration is missing or operations are blocked
- Protected branches properly protected from auto-merge

## Open Questions

- Should we add a `git.agentWorkflow.allowAutoMerge` setting for non-protected branches? (Current answer: no, too risky)
- Should the PR creation prompt be skippable via a setting? (Current answer: no, always prompt)
- Should we support "draft PR" creation as an option? (Could be future enhancement)

## Credential & Service Access Plan

No external credentials required for this PRD.
