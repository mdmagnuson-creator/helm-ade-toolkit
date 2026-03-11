# PRD: Yo Go v2 — Streamlining & Testing System

**Status:** ✅ COMPLETE (as of 2026-02-28)

> All user stories have been implemented. This PRD can be moved to `docs/completed/`.

## Introduction

The AI toolkit has grown organically to 64 agents, 43 skills, and complex coordination systems. While the breadth is valuable for multi-project support, some areas were over-engineered and others were fragmented. This PRD addressed:

1. **Testing system consolidation** — Unified the 8+ testing agents into a coherent, automated system
2. **Work state tracking** — Resumable sessions with clear checkpoints for testing, docs, and commits
3. **Skill auto-generation** — Meta-skills fire when projects are bootstrapped or capabilities added
4. **Builder/Developer simplification** — Extracted workflow logic into skills, agents act as routers
5. **Agent consolidation** — Merged overlapping agents, clarified responsibilities

## Goals

- Reduce cognitive overhead when understanding/maintaining the toolkit
- Create a robust, automated testing pipeline that generates tests after PRD/adhoc work
- Enable session resumption when work is interrupted
- Ensure skills are auto-generated when projects are bootstrapped or capabilities are added
- Keep the toolkit suitable for managing 5-10 projects simultaneously
- Prepare for team-based agent orchestration (multi-session) without over-engineering solo use

---

## Core Concept: Builder State Machine

Builder maintains a state file (`docs/builder-state.json`) that tracks:
- Active PRD work and progress
- Ad-hoc work queue
- Pending tests (generated but not run)
- Documentation/marketing updates needed
- Uncommitted changes

This enables:
- **Resumability** — If session drops, Builder picks up where it left off
- **Visibility** — User sees what's in progress, what's queued, what needs attention
- **Clear workflow** — Work → Tests → Docs → Commit flow is explicit

### State File Schema

```json
{
  "lastHeartbeat": "ISO8601 timestamp",
  "sessionId": "builder-<random>",
  
  "activePrd": {
    "id": "feature-name",
    "file": "docs/prds/prd-feature.json",
    "branch": "feature/feature-name",
    "currentStory": "US-003",
    "storiesCompleted": ["US-001", "US-002"],
    "storiesPending": ["US-003", "US-004"]
  },
  
  "adhocQueue": [
    {
      "id": "adhoc-001",
      "description": "Fix the footer alignment",
      "status": "completed",
      "filesChanged": ["src/components/Footer.tsx"],
      "completedAt": "ISO8601"
    }
  ],
  
  "pendingTests": {
    "unit": {
      "generated": ["src/__tests__/Footer.test.tsx"],
      "status": "passed"
    },
    "e2e": {
      "generated": ["e2e/footer.spec.ts"],
      "status": "pending",
      "deferredTo": "prd-completion" 
    }
  },
  
  "pendingUpdates": {
    "supportArticles": ["footer-layout"],
    "marketingScreenshots": ["homepage-hero"],
    "status": "pending"
  },
  
  "uncommittedWork": {
    "hasChanges": true,
    "summary": "Fixed footer alignment",
    "testsPass": true,
    "docsComplete": false
  }
}
```

### Builder Startup Dashboard (with state)

```
═══════════════════════════════════════════════════════════════════════
                    [PROJECT] - BUILDER STATUS
═══════════════════════════════════════════════════════════════════════

⚠️  RESUMING PREVIOUS SESSION (last active: 15 min ago)

IN-PROGRESS PRD
───────────────────────────────────────────────────────────────────────
  PRD: print-templates (feature/print-templates)
  Progress: 2/5 stories complete
  Current: US-003 - Add print preview modal
  
  [R] Resume PRD    [A] Abandon and start fresh

PENDING AD-HOC WORK
───────────────────────────────────────────────────────────────────────
  ✅ adhoc-001: Fix footer alignment (done, needs E2E tests)
  🔨 adhoc-002: Add loading spinner (in progress)
  
  [C] Continue working    [T] Run E2E tests    [D] Discard

PENDING E2E TESTS
───────────────────────────────────────────────────────────────────────
  • e2e/footer.spec.ts (generated, deferred to PRD completion)
  • e2e/spinner.spec.ts (generated, ready to run)

PENDING UPDATES (auto-detected)
───────────────────────────────────────────────────────────────────────
  📝 Support article: footer-layout (Footer.tsx changed)
  📸 Screenshot: homepage-hero (Hero.tsx changed)

UNCOMMITTED CHANGES
───────────────────────────────────────────────────────────────────────
  4 files modified | Unit tests: ✅ | E2E tests: ⏳ | Docs: ⏳
  
> _
═══════════════════════════════════════════════════════════════════════
```

---

## User Stories

### US-001: Builder State Tracking

**Description:** As a developer, I want Builder to track work state so I can resume interrupted sessions.

**Acceptance Criteria:**

- [x] Create `docs/builder-state.json` schema (see above) — created schemas/builder-state.schema.json
- [x] Builder writes state on: session start, todo completion, test generation, test run, commit
- [x] Builder reads state on startup and displays resume prompt if WIP exists
- [x] Heartbeat updated every action (configurable timeout, default 10 min)
- [x] Add `agents.heartbeatTimeoutMinutes` to project.json schema (default: 10) — added in US-002
- [x] Stale sessions (no heartbeat > timeout) shown as resumable

---

### US-002: Unified Testing Orchestrator

**Description:** As a developer, I want a single testing agent that intelligently orchestrates all test types.

**Acceptance Criteria:**

- [x] Create `@test-orchestrator` agent (or repurpose `tester.md`) — using existing tester.md
- [x] Orchestrator reads `project.json` → `testing` config
- [x] Delegates to specialists: unit tests (jest/vitest/go), component tests (react), E2E (playwright)
- [x] Two modes: `--unit-only` (Story/Ad-hoc mode) and `--full` (Full Suite Mode with E2E)
- [x] Generates test files for changed code without existing coverage
- [x] Reports consolidated pass/fail results

**Testing Agent Hierarchy (after consolidation):**

```
@test-orchestrator (router)
  ├── @jest-tester (JS/TS unit tests)
  ├── @react-tester (React component tests)  
  ├── @go-tester (Go unit tests)
  ├── @playwright-dev (E2E test writing)
  └── @quality-critic (visual, a11y, performance)
```

---

### US-003: Test Flow for PRD Work

**Description:** As a developer, I want tests automatically handled during PRD implementation.

**Acceptance Criteria:**

- [x] After each story completion: auto-generate and run unit tests for changed files
- [x] Unit test failures block story completion (must fix before moving on)
- [x] E2E test scripts generated per story, queued for PRD completion
- [x] After ALL stories complete: run full E2E test suite
- [x] E2E failures → fix and re-run (loop until pass)
- [x] Tests committed as part of PRD: `test: add tests for [story-id]`

---

### US-004: Test Flow for Ad-hoc Work (Standalone)

**Description:** As a developer, I want a clear test flow when doing ad-hoc work outside a PRD.

**Acceptance Criteria:**

- [x] After ad-hoc todos complete: auto-generate and run unit tests (no prompt)
- [x] Unit test failures → fix before proceeding
- [x] E2E test scripts auto-generated (no prompt), added to pending queue
- [x] Prompt user: `Run E2E tests now, or keep working? [T]ests / [W]ork`
- [x] If "Work" → E2E tests stay queued, user continues
- [x] If "Tests" → run E2E suite, then proceed to docs/commit

---

### US-005: Test Flow for Ad-hoc During PRD

**Description:** As a developer, I want ad-hoc work during a PRD session to integrate with the PRD test flow.

**Acceptance Criteria:**

- [x] Ad-hoc request during active PRD is tracked separately in `adhocQueue`
- [x] After ad-hoc todos complete: auto-generate and run unit tests
- [x] E2E test scripts generated, then prompt:
  ```
  Run E2E tests now, or defer to PRD completion?
    [N]ow - Run immediately
    [D]efer - Queue for PRD completion  
    [W]ork - Keep working (tests queued)
  ```
- [x] If "Defer" → E2E tests added to PRD's test queue
- [x] If "Now" → run E2E, then return to PRD work
- [x] Deferred tests run with full PRD suite at completion

---

### US-006: Auto-Detect Documentation/Marketing Updates

**Description:** As a developer, I want Builder to auto-detect when changes need support articles or marketing updates.

**Acceptance Criteria:**

- [x] After todos complete, Builder analyzes changed files:
  - Files in `app/(marketing)/` or `pages/marketing/` → marketing update needed
  - Files in `screenshot-registry.json` → screenshot update needed  
  - New user-facing components without docs → support article may be needed
- [x] Detected updates added to `pendingUpdates` in state
- [x] Builder shows pending updates in dashboard
- [x] Updates run after tests pass, before commit prompt
- [x] For ambiguous cases, prompt: `Does this change need a support article? [Y/n]`

---

### US-007: Commit Flow

**Description:** As a developer, I want a clear commit flow after tests and docs are complete.

**Acceptance Criteria:**

- [x] After tests pass AND docs complete → commit prompt
- [x] Add `agents.commitStrategy` to project.json:
  - `batch-per-session` (default): One commit for all work after tests pass
  - `per-todo`: One commit per completed todo
  - `manual`: Builder stages changes, user commits manually
- [x] Commit prompt shows: summary, files changed, test status, doc status
- [x] After commit → push prompt: `Push to remote? [Y/n]`
- [x] State cleared after successful push (or after commit if push declined)

---

### US-008: Quality-Beyond-Correctness Checks

**Description:** As a developer, I want automated quality checks beyond just "tests pass".

**Acceptance Criteria:**

- [x] Create `@quality-critic` agent (or extend aesthetic-critic)
- [x] Checks: visual regression, CLS/layout shift, dark mode, accessibility (axe-core)
- [x] Integrates with Playwright for browser-based checks
- [x] Runs as part of E2E test phase (optional, configurable)
- [x] Add `testing.qualityChecks: true` to project.json (default: false)
- [x] Outputs findings to `docs/quality-report.md`

---

### US-009: Auto-Generate Project Skills on Bootstrap

**Description:** As a developer, I want project-specific skills generated when I bootstrap a project.

**Acceptance Criteria:**

- [x] During project-bootstrap, after detecting capabilities, auto-invoke meta-skills:
  - `capabilities.authentication: true` → auth skill
  - `capabilities.multiTenant: true` → multi-tenant skill
  - `capabilities.api: true` → API endpoint skill
  - Stripe in integrations → Stripe skill
- [x] Generated skills saved to `<project>/docs/skills/[name]/SKILL.md`
- [x] Update `project.json` → `skills.generated[]`
- [x] User can skip: `Skip skill generation? [y/N]`

---

### US-010: Auto-Generate Skills When Capabilities Added

**Description:** As a developer, I want new skills generated when capabilities are added.

**Acceptance Criteria:**

- [x] In Developer's Phase 3B, after adding a capability:
- [x] Check if a meta-skill exists for that capability
- [x] If yes and skill not already generated → invoke meta-skill generator
- [x] Commit generated skill with capability update

---

### US-011: Simplify Builder Agent

**Description:** As a toolkit maintainer, I want builder.md to be a thin router that delegates to skills.

**Acceptance Criteria:**

- [x] Extract ad-hoc workflow into `skills/adhoc-workflow/SKILL.md`
- [x] Extract PRD workflow into `skills/prd-workflow/SKILL.md`
- [x] Extract merge queue logic into `skills/multi-session/SKILL.md` and `skills/prd-workflow/SKILL.md`
- [x] Extract state management into `skills/builder-state/SKILL.md`
- [x] Builder becomes a router that loads appropriate skill
- [x] No functionality lost
- [x] Core workflow logic lives in skills, not inline in agent

---

### US-012: Simplify Developer Agent

**Description:** As a toolkit maintainer, I want developer.md to focus on orchestration with details in skills.

**Acceptance Criteria:**

- [x] Extract multi-session coordination into `skills/multi-session/SKILL.md`
- [x] Extract post-completion polish into `skills/post-completion/SKILL.md`
- [x] Extract capability detection rules into `data/capability-detection.json`
- [x] No functionality lost
- [x] Core workflow logic lives in skills, not inline in agent

---

### US-013: Consolidate Testing Agents

**Description:** As a toolkit maintainer, I want clear 1:1 mapping of testing concern to agent.

**Acceptance Criteria:**

- [x] ~~Merge `tester.md` and `qa.md` into single orchestrator~~ Decision: Keep qa.md separate (distinct purpose: exploratory QA testing)
- [x] Remove `e2e-tester.md` (redundant with `e2e-playwright.md`) — merged Full Suite Mode into tester.md
- [x] Clarify `qa-browser-tester.md` vs `qa-explorer.md`:
  - `qa-explorer` = explores app for bugs (manual QA simulation)
  - `qa-browser-tester` = writes Playwright tests for found bugs
  - Keep both, distinct purposes
- [x] Update all references to removed agents
- [x] Document final hierarchy in toolkit README

---

### US-014: Solo Developer Mode

**Description:** As a solo developer, I want simpler operation without team coordination overhead.

**Acceptance Criteria:**

- [x] Add `agents.multiSession: false` to project.json (default: false) — already in schema
- [x] When false: skip session-locks, heartbeat, merge queue
- [x] Work directly on branches, push when ready
- [x] When true: full coordination system active
- [x] Builder dashboard simpler in solo mode (no session/lock info)

---

## Functional Requirements

- FR-1: State file (`docs/builder-state.json`) written atomically on each state change
- FR-2: Unit tests auto-run after todo completion (no prompt)
- FR-3: E2E tests generated after todos, run by user prompt (or deferred)
- FR-4: Documentation/marketing updates auto-detected from changed files
- FR-5: Commit strategy configurable per project
- FR-6: Heartbeat timeout configurable per project (default 10 min)
- FR-7: Test orchestrator delegates based on file extension and project config
- FR-8: Skill generators write to project's `docs/skills/` directory
- FR-9: Solo mode skips coordination files entirely

## Non-Goals

- No changes to critic system (working well)
- No changes to PRD format
- No removal of language-specific dev agents
- No UI/dashboard for toolkit itself
- No automatic CI integration (toolkit generates, CI runs)

## Technical Considerations

- **State file location:** `docs/builder-state.json` (project-specific, gitignored)
- **Skill extraction:** Move workflow logic from builder.md into loadable skills
- **Backwards compatibility:** Projects without new config fields use defaults
- **Testing frameworks:** Support Jest, Vitest, Go testing, Playwright, pytest

## Success Metrics

- Builder and Developer act as routers, delegating to skills for workflow logic
- Workflow logic (ad-hoc, PRD, state, multi-session) lives in dedicated skills
- Session resumption works 100% of the time after interruption
- Clear 1:1 mapping of testing concern → agent
- Tests auto-generated for 100% of completed work
- Documentation updates auto-detected for 90%+ of UI changes

## Configuration Summary

New `project.json` fields:

```json
{
  "agents": {
    "heartbeatTimeoutMinutes": 10,
    "commitStrategy": "batch-per-session",
    "multiSession": false
  },
  "testing": {
    "autoGenerate": true,
    "qualityChecks": false
  }
}
```

## Implementation Order

1. **US-013** — Consolidate testing agents (clears confusion)
2. **US-002** — Build unified test orchestrator
3. **US-001** — Implement builder state tracking
4. **US-003, US-004, US-005** — Test flows for PRD and ad-hoc
5. **US-006** — Auto-detect doc/marketing updates
6. **US-007** — Commit flow
7. **US-008** — Quality-beyond-correctness (optional enhancement)
8. **US-011, US-012** — Simplify builder/developer via skill extraction
9. **US-009, US-010** — Auto-generate skills
10. **US-014** — Solo mode simplification
