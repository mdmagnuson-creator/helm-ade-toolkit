# PRD: Mandatory Playwright Verification for Builder

**Status:** COMPLETE  
**Created:** 2026-03-03  
**Ready Date:** 2026-03-03  
**Completed Date:** 2026-03-03  
**Author:** @toolkit (on behalf of user)

---

## Problem Statement

Builder currently treats Playwright visual verification as **optional**. When completing tasks (both ad-hoc and PRD stories), Builder can mark work as "complete" without ever verifying that the UI actually works correctly. This leads to:

1. **False confidence** — Tasks marked complete may have broken UIs
2. **Silent failures** — Builder doesn't explicitly report when it skipped verification
3. **No accountability** — Users don't know if their change was visually validated
4. **No test artifacts** — Verification work is thrown away, not captured as reusable tests

The user wants a guarantee: **Every UI change must be verified with Playwright, AND the verification must be saved as a reusable test script with screenshots.**

---

## Goals

1. **Mandatory verification for UI projects** — Builder cannot mark a task complete without Playwright verification (unless the project explicitly opts out)
2. **Automatic test generation** — Every verification produces a saved test script in `tests/ui-verify/`
3. **Screenshot capture** — Every verification captures screenshots as proof
4. **Clear incomplete states** — When verification cannot complete, Builder reports why and does not mark the task complete
5. **Per-project configuration** — Projects without UIs can opt out; projects can configure selector strictness
6. **Testability improvements** — Strict mode enforces `data-testid` attributes on all tested elements

---

## Non-Goals

- Changing end-to-end journey tests (those remain in `tests/e2e/`)
- Requiring verification for documentation-only or config-only changes
- Visual regression testing against baseline images (future feature)
- Modifying how unit/integration tests work

---

## User Stories

### Story 1: Mandatory Verification with Test Generation

**As a** developer working on a UI project  
**I want** Builder to verify my changes with Playwright AND save the verification as a reusable test  
**So that** I know my UI works AND I accumulate test coverage over time

**Acceptance Criteria:**
- [ ] Builder runs Playwright verification before marking any UI-affecting task complete
- [ ] Verification includes: run existing tests + live visual verification + screenshot capture
- [ ] A new/updated test script is saved to `tests/ui-verify/`
- [ ] Screenshots are captured to `ai-tmp/verification/screenshots/`
- [ ] If verification passes, task is marked complete
- [ ] If verification fails, task is NOT marked complete — Builder reports the failure and attempts to fix
- [ ] Generated tests are auto-committed; @quality-critic reviews and flags issues

### Story 2: Strict Selector Mode (data-testid Enforcement)

**As a** developer who wants stable, maintainable tests  
**I want** all verification tests to use `data-testid` attributes  
**So that** tests don't break when I change styling or restructure components

**Acceptance Criteria:**
- [ ] `selectorStrategy: "strict"` is the default when no setting exists
- [ ] In strict mode, if an element lacks `data-testid`, @e2e-playwright adds it to the component before writing the test
- [ ] In flexible mode, tests fall back to role/text selectors when `data-testid` is missing
- [ ] Over time, strict mode causes `data-testid` to accumulate on all tested elements

### Story 3: Test File Format with Rich Documentation

**As a** developer reading a generated test  
**I want** clear documentation about what's being tested and how  
**So that** I can understand and maintain the test

**Acceptance Criteria:**
- [ ] Test files include header with: component name, UI location, navigation steps, success criteria
- [ ] Test files include metadata: @file, @description, @created, @lastVerified, @relatedFiles
- [ ] Tests use clear Arrange/Act/Assert structure
- [ ] Tests capture screenshots at verification points
- [ ] File naming follows `[area]-[component]-[behavior].spec.ts` convention

### Story 4: Backend/Non-UI Project Opt-Out

**As a** developer working on a backend-only project  
**I want** to opt out of Playwright verification requirements  
**So that** Builder can complete tasks without trying to run UI tests

**Acceptance Criteria:**
- [ ] Projects can set `agents.verification.mode: "no-ui"` in project.json
- [ ] Builder skips Playwright verification for these projects
- [ ] Builder still runs other tests (unit, integration) as normal
- [ ] Completion message notes that visual verification was skipped (by design)

### Story 5: Flaky Test Detection and Resolution

**As a** developer experiencing intermittent test failures  
**I want** Builder to detect flaky tests and fix them  
**So that** flakiness doesn't block my work or erode trust in the test suite

**Acceptance Criteria:**
- [ ] Builder detects intermittent failures (passes X/Y runs)
- [ ] Flaky tests are escalated back to Builder for analysis
- [ ] Builder delegates fix to @e2e-playwright (timing issues) or @developer (component issues)
- [ ] @quality-critic reviews the fix
- [ ] Flaky tests are not ignored or auto-retried indefinitely

### Story 6: Changes That Skip Verification

**As a** developer making non-UI changes  
**I want** Builder to skip verification for changes that don't affect the UI  
**So that** I don't waste time on unnecessary verification

**Acceptance Criteria:**
- [ ] Documentation files (`*.md`) skip verification
- [ ] Config files (`.*rc`, `*.config.*`) skip verification
- [ ] Test files (`*.test.*`, `*.spec.*`) skip verification
- [ ] CI/CD files (`.github/*`) skip verification
- [ ] When skipped, completion message explicitly notes WHY verification was skipped
- [ ] User can override to force verification if needed

---

## Technical Specification

### Configuration Schema

Add to `project.json` under `agents`:

```json
{
  "agents": {
    "workingDir": "ai-tmp",
    "verification": {
      "mode": "playwright-required",  // or "no-ui" for backends/CLIs
      "selectorStrategy": "strict",
      "testDir": "tests/ui-verify",
      "screenshotDir": "ai-tmp/verification/screenshots",
      "reviewGeneratedTests": true
    }
  }
}
```

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | enum | `playwright-required` | Verification requirement level |
| `selectorStrategy` | enum | `strict` | How elements are targeted in tests |
| `testDir` | string | `tests/ui-verify` | Where generated test scripts are saved |
| `screenshotDir` | string | `ai-tmp/verification/screenshots` | Where screenshots are stored (gitignored) |
| `reviewGeneratedTests` | boolean | `true` | Whether @quality-critic reviews generated tests |

#### Mode Options

| Mode | Behavior |
|------|----------|
| `playwright-required` | **Default.** Builder MUST verify with Playwright. If verification fails or cannot run, task is incomplete. Per-task overrides available for edge cases. |
| `no-ui` | Builder skips Playwright entirely. For backends, CLIs, libraries. |

#### Selector Strategy Options

| Strategy | Behavior |
|----------|----------|
| `strict` | **Default.** Tests MUST use `data-testid`. If element lacks one, @e2e-playwright adds it to the component first. |
| `flexible` | Tests prefer `data-testid`, fall back to role/text selectors if not present. |

### Directory Structure

```
<project-root>/
├── ai-tmp/                           # AI working directory (GITIGNORED)
│   ├── verification/
│   │   ├── screenshots/              # Temporary verification screenshots
│   │   │   ├── header-profile-dropdown-open.png
│   │   │   └── settings-dark-mode-on.png
│   │   └── last-run.json             # Metadata about last verification
│   └── tmp/                          # Other temporary AI files
├── tests/
│   └── ui-verify/                    # Permanent test scripts (COMMITTED)
│       ├── header-profile-dropdown.spec.ts
│       ├── settings-dark-mode-toggle.spec.ts
│       └── README.md                 # Explains the ui-verify system
└── .gitignore                        # Must include: ai-tmp/
```

### Test File Format

Every generated test file follows this structure:

```typescript
/**
 * @file header-profile-dropdown.spec.ts
 * @description Visual verification test for the user profile dropdown in the header
 * @created 2026-03-03
 * @lastVerified 2026-03-03
 * @relatedFiles src/components/Header/ProfileDropdown.tsx, src/components/Header/Header.tsx
 */

import { test, expect } from '@playwright/test';

/**
 * COMPONENT: Profile Dropdown
 * LOCATION: Top-right corner of the header, visible on all authenticated pages
 * 
 * HOW TO REACH:
 * 1. Navigate to any page while logged in
 * 2. Look for the user avatar/name in the top-right header area
 * 
 * WHAT IT DOES:
 * - Shows user's name/avatar when collapsed
 * - Opens dropdown menu on click
 * - Dropdown contains: Profile link, Settings link, Logout button
 * 
 * SUCCESS CRITERIA:
 * - Dropdown opens when avatar is clicked
 * - All menu items are visible and clickable
 * - Dropdown closes when clicking outside
 * - Logout button triggers logout flow
 */

test.describe('Header Profile Dropdown', () => {
  
  test.beforeEach(async ({ page }) => {
    // Setup: Navigate to app and ensure logged in
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="header"]')).toBeVisible();
  });

  test('dropdown opens when avatar is clicked', async ({ page }) => {
    // Arrange
    const avatarButton = page.locator('[data-testid="profile-avatar"]');
    const dropdownMenu = page.locator('[data-testid="profile-dropdown-menu"]');
    
    // Pre-condition: dropdown should be hidden
    await expect(dropdownMenu).not.toBeVisible();
    
    // Act
    await avatarButton.click();
    
    // Assert
    await expect(dropdownMenu).toBeVisible({ timeout: 5000 });
    
    // Capture verification screenshot
    await page.screenshot({ 
      path: 'ai-tmp/verification/screenshots/header-profile-dropdown-open.png',
      fullPage: false 
    });
  });

  test('dropdown displays all required menu items', async ({ page }) => {
    // Arrange & Act
    await page.locator('[data-testid="profile-avatar"]').click();
    const dropdownMenu = page.locator('[data-testid="profile-dropdown-menu"]');
    await expect(dropdownMenu).toBeVisible();
    
    // Assert: All required items are present
    await expect(dropdownMenu.locator('[data-testid="profile-link"]')).toBeVisible();
    await expect(dropdownMenu.locator('[data-testid="settings-link"]')).toBeVisible();
    await expect(dropdownMenu.locator('[data-testid="logout-button"]')).toBeVisible();
    
    // Capture verification screenshot
    await page.screenshot({ 
      path: 'ai-tmp/verification/screenshots/header-profile-dropdown-items.png',
      fullPage: false 
    });
  });

  test('dropdown closes when clicking outside', async ({ page }) => {
    // Arrange
    const avatarButton = page.locator('[data-testid="profile-avatar"]');
    const dropdownMenu = page.locator('[data-testid="profile-dropdown-menu"]');
    
    // Act: Open then click outside
    await avatarButton.click();
    await expect(dropdownMenu).toBeVisible();
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    
    // Assert
    await expect(dropdownMenu).not.toBeVisible();
  });

  test('logout button triggers logout flow', async ({ page }) => {
    // Arrange
    await page.locator('[data-testid="profile-avatar"]').click();
    
    // Act
    await page.locator('[data-testid="logout-button"]').click();
    
    // Assert: Should redirect to login page
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    
    // Capture verification screenshot
    await page.screenshot({ 
      path: 'ai-tmp/verification/screenshots/header-profile-logout-redirect.png',
      fullPage: false 
    });
  });

});
```

### Verification Flow

```
Builder completes a UI change
    │
    ▼
1. CHECK: Is this a UI-affecting change?
    │
    ├── NO (docs, config, tests, CI) → Skip verification, note why in completion message
    │
    └── YES → Continue to verification
    │
    ▼
2. RUN: Existing tests for affected areas
    │
    ├── Tests exist and PASS → Continue
    ├── Tests exist and FAIL → Fix issue, retry
    └── No tests exist → Continue (will create)
    │
    ▼
3. VERIFY: Live Playwright verification
    - Navigate to affected page/component
    - Interact with the change
    - Capture screenshots
    │
    ▼
4. GENERATE: Create/update test script
    │
    ├── STRICT MODE: Element lacks data-testid?
    │   └── Add data-testid to component first
    │
    └── Write test to tests/ui-verify/
    │
    ▼
5. EXECUTE: Run the new test
    │
    ├── PASS → Continue
    └── FAIL → Analyze and fix (loop back to step 4)
    │
    ▼
6. REVIEW: @quality-critic reviews generated test
    │
    ├── Approved → Continue
    └── Issues flagged → Address issues (may loop back)
    │
    ▼
7. COMMIT: Auto-commit test file
    │
    ▼
✅ VERIFICATION COMPLETE
   - Task marked complete
   - Screenshot captured
   - Test saved and committed
```

### Flaky Test Handling

```
Test fails intermittently (passes X/Y runs)
    │
    ▼
Builder receives flaky test notification
    │
    ▼
Analyze failure:
    - Review test code for timing issues
    - Check for animations/transitions
    - Look for race conditions
    │
    ▼
Delegate fix:
    │
    ├── Timing issue → @e2e-playwright: "Add proper waits"
    │
    └── Component issue → @developer: "Fix animation race condition"
    │
    ▼
Fixed test runs reliably (3/3 passes)
    │
    ▼
@quality-critic reviews fix
    │
    ▼
✅ Test stabilized, verification complete
```

### Files That Skip Verification

These file patterns do NOT require Playwright verification:

| Pattern | Example | Rationale |
|---------|---------|-----------|
| `*.md` | README.md, CHANGELOG.md | Documentation only |
| `.*rc` | .eslintrc, .prettierrc | Dev tooling config |
| `*.config.*` | jest.config.js, vite.config.ts | Build/tool config |
| `*.test.*` / `*.spec.*` | Button.test.tsx | Test files themselves |
| `.github/*` | workflows/ci.yml | CI/CD config |
| `tsconfig*.json` | tsconfig.json | TypeScript config |
| `package.json` (deps only) | Adding a package | No runtime UI change |

**Important:** When verification is skipped, Builder must note WHY:

```
✅ TASK COMPLETE

Summary: Updated ESLint configuration

Verification: ℹ️ SKIPPED
- Reason: Config file change (.eslintrc.js) — no UI impact
- Files changed: .eslintrc.js

Unit tests: 42 passed
```

### Completion Message Formats

**When verified:**
```
✅ TASK COMPLETE

Summary: Added user profile dropdown to header

Verification: ✅ VERIFIED
- Playwright tests: 4 passed
- Screenshot: ai-tmp/verification/screenshots/header-profile-dropdown-open.png
- Test saved: tests/ui-verify/header-profile-dropdown.spec.ts

Files changed: 4
Tests generated: 1
Components updated: 1 (added data-testid to ProfileDropdown)
```

**When verification incomplete (required mode):**
```
⚠️ TASK VERIFICATION INCOMPLETE

Summary: Added user profile dropdown to header

Verification: ⚠️ INCOMPLETE
- Status: Test failed on assertion
- Error: Expected dropdown to be visible, but it was not
- Screenshot: ai-tmp/verification/screenshots/header-profile-dropdown-FAILED.png

Next steps:
1. Investigating dropdown visibility issue...
2. Will fix and re-verify

(Task will not be marked complete until verification passes)
```

**When not applicable (no-ui mode):**
```
✅ TASK COMPLETE

Summary: Added rate limiting to API endpoint

Verification: ℹ️ NOT APPLICABLE
- Reason: Project configured as no-ui
- Backend tests: 5 passed

Files changed: 2
Tests added: 1
```

### Override Mechanism

Users can override verification requirements per-task:

```
User: mark complete without verification

Builder: ⚠️ OVERRIDE REQUESTED

Are you sure? This bypasses mandatory verification.
Reason required: [user must provide reason]

User: the component is behind a feature flag that's disabled

Builder: ⚠️ Marking complete WITHOUT Playwright verification.
         Reason: Component behind disabled feature flag (user override)
         Note: This bypasses the project's playwright-required setting.
         
         Recommendation: Verify manually when feature flag is enabled.
```

---

## Implementation Plan

### Phase 1: Infrastructure & Config

**Scope:** Set up configuration schema, directory structure, and gitignore patterns.

**Stories:** Partial Story 2, Story 4

**Files to modify:**
- `schemas/project.schema.json` — Add `agents.verification` and `agents.workingDir` config
- `skills/project-bootstrap/SKILL.md` — Set defaults based on `capabilities.ui`
- `data/stacks.yaml` — Add verification defaults per stack

**Deliverables:**
- [ ] Schema updated with all new config options
- [ ] Bootstrap skill creates `ai-tmp/` and adds to `.gitignore`
- [ ] Bootstrap skill creates `tests/ui-verify/` with README

### Phase 2: Verification Enforcement

**Scope:** Update Builder and workflows to enforce verification before completion.

**Stories:** Story 1, Story 6

**Files to modify:**
- `skills/test-flow/SKILL.md` — Return verification status, integrate with new flow
- `skills/adhoc-workflow/SKILL.md` — Check verification before completion
- `skills/prd-workflow/SKILL.md` — Check verification before story completion
- `agents/builder.md` — Handle verification-incomplete state, implement skip logic

**Deliverables:**
- [ ] Test-flow returns structured verification result
- [ ] Adhoc-workflow blocks completion without verification
- [ ] PRD-workflow blocks story completion without verification
- [ ] Builder handles all verification states

### Phase 3: Test Generation

**Scope:** Generate and save test scripts during verification.

**Stories:** Story 1, Story 2, Story 3

**Files to modify:**
- `agents/e2e-playwright.md` — Add test generation mode with documentation format
- `agents/quality-critic.md` — Add review criteria for generated verification tests
- `skills/test-flow/SKILL.md` — Integrate test generation into flow

**Deliverables:**
- [ ] @e2e-playwright can generate verification tests in standard format
- [ ] Tests include rich documentation header
- [ ] Strict mode adds `data-testid` when missing
- [ ] @quality-critic reviews generated tests

### Phase 4: Flaky Test Handling

**Scope:** Detect and resolve flaky tests.

**Stories:** Story 5

**Files to modify:**
- `agents/builder.md` — Add flaky test detection and escalation
- `skills/test-flow/SKILL.md` — Add retry logic and flakiness detection

**Deliverables:**
- [ ] Flaky tests detected (passes X/Y runs)
- [ ] Builder escalates to appropriate agent for fix
- [ ] Fixed tests verified as stable

### Phase 5: Completion Messages & Polish

**Scope:** Implement clear completion messaging and override mechanism.

**Stories:** Story 6 (finish)

**Files to modify:**
- `skills/adhoc-workflow/SKILL.md` — Update completion message templates
- `skills/prd-workflow/SKILL.md` — Update completion message templates
- `agents/builder.md` — Implement override detection and handling

**Deliverables:**
- [ ] All completion message formats implemented
- [ ] Override mechanism with reason capture
- [ ] Skip patterns with explicit messaging

---

## Success Metrics

1. **Verification coverage** — % of UI tasks with Playwright verification (target: 100% for required mode)
2. **Test accumulation** — Number of tests in `tests/ui-verify/` over time (should grow)
3. **False completions** — Tasks marked complete that later had UI bugs (target: decrease)
4. **Flaky test resolution** — % of flaky tests fixed vs ignored (target: 100% fixed)
5. **data-testid coverage** — % of interactive elements with `data-testid` (should increase in strict mode)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Slows down task completion | Override mechanism for edge cases; skip patterns for non-UI changes |
| Generated tests are low quality | @quality-critic reviews all generated tests |
| Flaky tests block progress | Detection + escalation flow ensures flakiness is fixed, not ignored |
| Too many data-testid changes | Strict mode is opt-out via `selectorStrategy: "flexible"` |
| ai-tmp/ clutters project | Gitignored by default; can be cleared anytime |

---

## Appendix A: Current State Analysis

### Current Verification Flow (test-flow/SKILL.md)

```
Activity Resolution → E2E Timing (immediate/deferred/skip) → Run Tests → Report Results
```

**Gap:** Results are informational, not enforced. Builder can proceed regardless. No test generation.

### Current Completion Flow (adhoc-workflow/SKILL.md)

```
Work Done → Run Tests → Show Completion Menu → User Chooses → Mark Complete
```

**Gap:** Completion menu offers E2E as option `[E]`, not mandatory step.

### Current PRD Flow (prd-workflow/SKILL.md)

```
Story Work → Tests → Mark Story Status → Update PRD
```

**Gap:** Story can be marked PASS without verification.

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **UI Verification** | Using Playwright to visually confirm a UI change works correctly |
| **Verification Test** | A saved Playwright test in `tests/ui-verify/` that can be re-run |
| **data-testid** | An HTML attribute (`data-testid="button"`) used as a stable test selector |
| **Flaky Test** | A test that sometimes passes and sometimes fails without code changes |
| **Strict Mode** | Selector strategy requiring `data-testid` on all tested elements |
| **ai-tmp/** | Project-local directory for temporary AI working files (gitignored) |

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-03-03 | @toolkit | Initial draft |
| 2026-03-03 | @toolkit | Added test generation, strict selector mode, flaky test handling, ai-tmp directory, test file format specification |
| 2026-03-03 | @toolkit | Removed playwright-optional mode — per-task override handles edge cases |
| 2026-03-03 | @toolkit | Marked READY for implementation |
