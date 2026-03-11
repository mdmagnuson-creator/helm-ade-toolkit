# PRD: Prerequisite Failure Detection and Automated Fix Loop

**Status:** COMPLETE  
**Created:** 2026-03-03  
**Completed:** 2026-03-03  
**Author:** @toolkit (on behalf of user)

---

## Problem Statement

When a verification test fails, the current system assumes the failure is related to the feature being tested. However, tests often fail at **prerequisite steps** that are unrelated to the feature:

**Example scenario:**
1. User adds a new menu option nested deep in the UI
2. Playwright verification test tries to navigate to that menu
3. Test fails at the **login step** due to an auth bug
4. Current system treats this as "verification failed" and blocks the task

**What's wrong:**
- The menu feature might be perfectly fine
- The auth bug is a **separate, pre-existing issue**
- User is blocked from completing their feature work
- No clear path forward — fix auth first? Skip? Override?
- **No automation** — user has to manually orchestrate fixing the prerequisite

This creates confusion, false blockers, and unnecessary manual intervention.

---

## Goals

1. **Detect prerequisite failures** — Distinguish "login failed" from "menu option broken"
2. **Detect environment prerequisites** — Distinguish infrastructure issues from code issues
3. **Automated fix loop** — Automatically attempt to fix prerequisites, verify, and retry the original test
4. **Skill-based environment fixes** — Use existing skills for environment issues, queue skill creation when none exists
5. **3-pass verification** — Require 3 consecutive passes to confirm stability (catch transient issues)
6. **Clear reporting** — Tell user exactly what failed and what was attempted
7. **Bounded attempts** — Stop after 3 failed fix attempts on any single component
8. **Track blockers** — Log prerequisite failures and fix attempts for visibility
9. **Graceful degradation** — When automation fails, provide clear manual options

---

## Non-Goals

- Running partial verification (skipping login) — tests should be realistic
- Complex dependency graphs between tests
- Infinite fix loops — bounded to 3 attempts per component

---

## User Stories

### Story 1: Detect Prerequisite Failures

**As a** developer whose verification test failed at login  
**I want** Builder to recognize this is a prerequisite failure  
**So that** I understand the menu feature itself wasn't tested

**Acceptance Criteria:**
- [ ] Test failures are categorized as "prerequisite" vs "feature"
- [ ] Prerequisite failures identified by failure location (before reaching feature under test)
- [ ] Common prerequisites detected: login, navigation to page, page load, data setup
- [ ] Failure report clearly labels "PREREQUISITE FAILURE" vs "FEATURE FAILURE"

### Story 2: Automated Prerequisite Fix Loop

**As a** developer whose verification test failed at a prerequisite  
**I want** Builder to automatically attempt to fix the prerequisite and retry  
**So that** I don't have to manually orchestrate the fix

**Acceptance Criteria:**
- [ ] When prerequisite failure detected, check if existing test covers that prerequisite
- [ ] If test exists, run that test to confirm the issue
- [ ] Delegate fix to appropriate agent (@developer or @e2e-playwright)
- [ ] After fix, re-run the prerequisite test to verify
- [ ] If prerequisite now passes, retry original feature verification
- [ ] Loop continues until feature test passes OR 3 failed fix attempts on any component
- [ ] Each fix attempt is logged with: what was tried, result, time taken

### Story 3: Bounded Fix Attempts with Clear Stop Conditions

**As a** developer  
**I want** the automated fix loop to stop after reasonable attempts  
**So that** I don't wait forever on an unfixable issue

**Acceptance Criteria:**
- [ ] Max 3 fix attempts per component (prerequisite or feature)
- [ ] Stop immediately if same exact error occurs twice in a row (no progress)
- [ ] Track attempts per component separately (auth: 2/3, feature: 1/3)
- [ ] When stopped, log full situation to `verification-failures.json`
- [ ] Clear report to user: what was attempted, what failed, why stopped

### Story 4: Clear Failure Reporting (Manual Fallback)

**As a** developer when automation couldn't fix the issue  
**I want** a clear explanation of what happened and what was tried  
**So that** I can take over manually

**Acceptance Criteria:**
- [ ] Report shows: original feature, prerequisite that failed, fix attempts made
- [ ] Report explicitly states: "Automated fix failed after X attempts"
- [ ] Report includes: error messages, screenshots at each failure point
- [ ] Manual options provided: [M] Fix manually, [S] Skip with reason, [A] Abandon
- [ ] All fix attempt history preserved for debugging

### Story 5: Track Fix Attempts and Blockers

**As a** team lead reviewing test health  
**I want** to see patterns in prerequisite failures and fix success rates  
**So that** I can identify systemic issues

**Acceptance Criteria:**
- [ ] `verification-failures.json` tracks all automated fix attempts
- [ ] Each entry includes: feature, prerequisite, attempts, outcome, duration
- [ ] Aggregated view: "Auth login failed 5 times this week, 3 auto-fixed, 2 manual"
- [ ] Prerequisite health score: % of prerequisite failures that auto-resolve

### Story 6: Environment Prerequisite Detection and Skill-Based Fixes

**As a** developer whose test fails due to an environment issue (e.g., Electron instance conflict)  
**I want** Builder to recognize this as an environment prerequisite and use the appropriate skill  
**So that** infrastructure issues are fixed automatically without code changes

**Acceptance Criteria:**
- [ ] Environment prerequisites distinguished from application prerequisites
- [ ] Environment categories detected: process management, port conflicts, native app bootstrap, external services
- [ ] If matching skill exists, load and run skill's recovery procedure
- [ ] If no skill exists, stop auto-fix and offer skill creation request
- [ ] After skill created (by @toolkit), Builder can use it on retry

### Story 7: Skill Creation Request for Missing Environment Skills

**As a** developer encountering an environment issue with no existing skill  
**I want** Builder to queue a skill creation request for @toolkit  
**So that** the skill can be created with my verification and used for future fixes

**Acceptance Criteria:**
- [ ] Option [T] presented: "Queue skill creation for @toolkit"
- [ ] Request file created in `~/.config/opencode/pending-updates/`
- [ ] Request includes: detected pattern, suggested skill name, error context, screenshots
- [ ] User can switch to @toolkit, verify and create skill
- [ ] On retry, Builder checks if requested skill now exists and uses it
- [ ] Skill creation requires user verification (not fully autonomous)

### Story 8: 3-Pass Verification for Stability

**As a** developer completing a feature  
**I want** verification tests to pass 3 consecutive times before declaring success  
**So that** transient/flaky issues are caught before the feature is marked complete

**Acceptance Criteria:**
- [ ] After first pass, run test 2 more times
- [ ] All 3 passes required to declare "VERIFIED"
- [ ] If any of the 3 runs fail, enter fix loop
- [ ] After any fix is applied, reset pass counter to 0 (require fresh 3 passes)
- [ ] Progress shown: "Stability check: 2/3 passes"
- [ ] Configurable via `agents.verification.requiredPasses` (default: 3)

---

## Technical Specification

### Prerequisite Detection Logic

**How to detect a prerequisite failure:**

1. **Test structure analysis** — Verification tests have documented "how to reach" steps
2. **Failure location** — Did the test fail BEFORE reaching the feature assertions?
3. **Common patterns** — Login failures, 404s, timeouts on navigation, missing test data

**Detection heuristics:**

| Failure Pattern | Classification | Confidence |
|-----------------|----------------|------------|
| Login/auth error before feature test | Prerequisite | High |
| 404/500 on navigation to feature | Prerequisite | High |
| Timeout on page load (not on feature element) | Prerequisite | Medium |
| Missing test data (user, account, etc.) | Prerequisite | High |
| Element not found for feature under test | Feature | High |
| Assertion failed on feature behavior | Feature | High |
| Timeout on feature element specifically | Feature | High |

**Test file analysis:**

```typescript
/**
 * @verification-test
 * @component ProfileDropdown
 * @reach /dashboard → click user avatar
 * @prerequisites
 *   - User must be logged in
 *   - Dashboard page must load
 * @feature-assertions
 *   - Dropdown appears on click
 *   - Menu items are visible
 */
```

If failure occurs BEFORE `@feature-assertions`, it's a prerequisite failure.

### Automated Fix Loop Algorithm

**Core loop:**

```
Run feature verification test
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TEST RESULT?                                                         │
│                                                                     │
│ ├─── PASS ──► ✅ Feature verified, DONE                             │
│ │                                                                   │
│ └─── FAIL ──► Classify failure (prerequisite vs feature)           │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼ (FAIL)
┌─────────────────────────────────────────────────────────────────────┐
│ CLASSIFY FAILURE                                                     │
│                                                                     │
│ ├─── PREREQUISITE (e.g., login failed) ──► Fix prerequisite first  │
│ │                                                                   │
│ └─── FEATURE (e.g., menu item not found) ──► Fix feature           │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FIX LOOP (for failed component)                                      │
│                                                                     │
│ 1. Check: Is there an existing test for this component?             │
│    ├─── YES ──► Run that test to confirm the issue                  │
│    └─── NO ──► Use error message to guide fix                       │
│                                                                     │
│ 2. Delegate fix to appropriate agent:                               │
│    • @developer — for code/logic issues                             │
│    • @e2e-playwright — for test/selector issues                     │
│                                                                     │
│ 3. After fix, re-run the component's test                           │
│    ├─── PASS ──► Component fixed, retry original feature test       │
│    └─── FAIL ──► Increment attempt counter, check stop conditions   │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STOP CONDITIONS (check after each fix attempt)                       │
│                                                                     │
│ STOP if ANY of these are true:                                       │
│ • Component has 3 failed fix attempts                               │
│ • Same exact error occurred twice in a row (no progress)            │
│ • Total loop iterations > 10 (runaway prevention)                   │
│                                                                     │
│ If stopped ──► Log to verification-failures.json, report to user   │
└─────────────────────────────────────────────────────────────────────┘
```

**State tracking during loop:**

```json
{
  "verificationLoop": {
    "originalFeature": "tests/ui-verify/profile-dropdown-settings.spec.ts",
    "startedAt": "2026-03-03T10:30:00Z",
    "totalIterations": 0,
    "components": {
      "auth-login": {
        "type": "prerequisite",
        "testFile": "tests/e2e/auth.spec.ts",
        "attempts": [
          {
            "attemptNumber": 1,
            "error": "Timeout waiting for '[data-testid=\"login-submit\"]'",
            "fixAgent": "@developer",
            "fixDescription": "Fixed missing data-testid on login button",
            "result": "pass",
            "duration": "45s"
          }
        ],
        "status": "fixed"
      },
      "profile-dropdown-settings": {
        "type": "feature",
        "testFile": "tests/ui-verify/profile-dropdown-settings.spec.ts",
        "attempts": [],
        "status": "pending"
      }
    }
  }
}
```

**Finding existing tests for prerequisites:**

When a prerequisite fails (e.g., "login"), search for existing tests:

1. Check `tests/e2e/` for files matching the prerequisite name (auth.spec.ts, login.spec.ts)
2. Check test manifests or indexes if they exist
3. If no dedicated test exists, use the error context to guide the fix

**Example flow — Auth failure blocks menu feature:**

```
Iteration 1:
  Run: profile-dropdown-settings.spec.ts
  Result: FAIL at login step
  Classification: PREREQUISITE (auth-login)
  
  → Found existing test: tests/e2e/auth.spec.ts
  → Run auth.spec.ts to confirm issue
  → Result: FAIL — confirms auth is broken
  → Delegate to @developer: "Fix login timeout issue"
  → @developer fixes: adds missing data-testid to login button
  → Re-run auth.spec.ts
  → Result: PASS — auth fixed
  
Iteration 2:
  Run: profile-dropdown-settings.spec.ts (retry original)
  Result: FAIL at feature assertion
  Classification: FEATURE (profile-dropdown-settings)
  
  → Delegate to @developer: "Fix missing settings menu item"
  → @developer fixes: adds Settings option to dropdown
  → Re-run profile-dropdown-settings.spec.ts
  → Result: PASS
  
✅ FEATURE VERIFIED (after 2 iterations, 1 prerequisite fix, 1 feature fix)
```

**Example flow — Unfixable issue after 3 attempts:**

```
Iteration 1-3:
  Run: profile-dropdown-settings.spec.ts
  Result: FAIL at login step each time
  
  Attempts on auth-login:
    1. @developer: Added data-testid → still fails
    2. @developer: Fixed form submit handler → still fails  
    3. @developer: Updated auth API call → still fails
  
  STOP: auth-login has 3 failed attempts
  
❌ AUTOMATED FIX FAILED

Logged to verification-failures.json
Report to user with full history
```

### Failure Report Format

**During automated fix (progress update):**

```
═══════════════════════════════════════════════════════════════════════
              🔄 AUTO-FIXING PREREQUISITE FAILURE
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: Fixing prerequisite...

Prerequisite that failed:
  ❌ Login: "Timeout waiting for '[data-testid="login-submit"]'"

Action in progress:
  → Running existing test: tests/e2e/auth.spec.ts (confirming issue)
  → Will delegate fix to @developer
  → Will retry feature test after fix

Progress: Attempt 1/3 on auth-login
═══════════════════════════════════════════════════════════════════════
```

**After successful auto-fix:**

```
═══════════════════════════════════════════════════════════════════════
              ✅ VERIFICATION PASSED (Auto-Fixed)
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: VERIFIED

Auto-fix summary:
  ✅ auth-login: Fixed in 1 attempt (added data-testid to login button)
  ✅ profile-dropdown-settings: Fixed in 1 attempt (added Settings option)

Total time: 2m 15s
Iterations: 2

Tests updated:
  • tests/e2e/auth.spec.ts (prerequisite)
  • tests/ui-verify/profile-dropdown-settings.spec.ts (feature)
═══════════════════════════════════════════════════════════════════════
```

**After automated fix fails (manual fallback):**

```
═══════════════════════════════════════════════════════════════════════
              ❌ AUTOMATED FIX FAILED
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: BLOCKED (could not auto-fix)

Component that couldn't be fixed:
  ❌ auth-login: 3 attempts, still failing
  
Fix attempts made:
  1. @developer: Added data-testid to login button
     Result: FAIL — same timeout error
  2. @developer: Fixed form submit handler async issue
     Result: FAIL — same timeout error
  3. @developer: Updated auth API endpoint call
     Result: FAIL — same timeout error

Last error: "Timeout waiting for '[data-testid="login-submit"]'"
Screenshot: ai-tmp/verification/screenshots/auth-attempt-3.png

This has been logged to verification-failures.json

Options:
  [M] Fix manually, then type "retry"
  [S] Skip verification (override with reason)
  [A] Abandon task

> _
═══════════════════════════════════════════════════════════════════════
```

**Prerequisite failure (legacy format, shown only if auto-fix disabled):**

```
═══════════════════════════════════════════════════════════════════════
              ⚠️ VERIFICATION BLOCKED (Prerequisite Failure)
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: NOT TESTED (blocked by prerequisite)

Prerequisite that failed:
  ❌ Login: "Timeout waiting for '[data-testid="login-submit"]'"
  
  This appears to be an auth/login issue, not a problem with your feature.
  Your menu option change was NOT tested.

Screenshot: ai-tmp/verification/screenshots/login-failure.png

Options:
  [F] Fix auth issue first (creates new task)
  [R] Retry verification (in case transient)
  [B] Mark complete as "verification blocked" (tracks blocker)
  [S] Skip verification (override with reason)

> _
═══════════════════════════════════════════════════════════════════════
```

**Feature failure (for contrast):**

```
═══════════════════════════════════════════════════════════════════════
                    ❌ VERIFICATION FAILED (Feature Issue)
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: FAILED

Feature assertion that failed:
  ❌ Element [data-testid="settings-menu-item"] not found
  
  The test reached the dropdown but could not find your new menu item.
  This suggests an issue with the feature implementation.

Screenshot: ai-tmp/verification/screenshots/dropdown-open-no-settings.png

Options:
  [D] Debug with @developer
  [R] Retry verification
  [S] Skip verification (adds to test debt)

> _
═══════════════════════════════════════════════════════════════════════
```

### test-debt.json Structure

```json
{
  "prerequisiteBlockers": [
    {
      "id": "auth-login-timeout",
      "prerequisite": "login",
      "error": "Timeout waiting for '[data-testid=\"login-submit\"]'",
      "firstSeen": "2026-03-03T10:30:00Z",
      "affectedFeatures": [
        {
          "story": "US-005",
          "feature": "Add Settings menu option",
          "blockedAt": "2026-03-03T10:30:00Z"
        },
        {
          "story": "US-007", 
          "feature": "Add Logout confirmation",
          "blockedAt": "2026-03-03T11:15:00Z"
        }
      ],
      "status": "open"
    }
  ],
  "featureFailures": [
    // ... existing structure for actual feature failures
  ]
}
```

### "Verification Blocked" Status

When user chooses `[B] Mark complete as "verification blocked"`:

1. Task/story marked complete with special status
2. Completion message shows:
   ```
   ✅ STORY US-005 COMPLETE (verification blocked)
   
   Summary: Added Settings menu option to profile dropdown
   
   Verification: ⚠️ BLOCKED
     Reason: Login prerequisite failed (auth issue)
     Blocker ID: auth-login-timeout
     
   When auth is fixed, run: verify-blocked US-005
   ```
3. Story completion notes include: `"verificationBlocked": "auth-login-timeout"`
4. Feature is tracked for re-verification when blocker is resolved

### Bulk Re-verification

When a prerequisite blocker is fixed:

```
User: auth is fixed

Builder: Found 3 features blocked by auth-login-timeout:
  - US-005: Add Settings menu option
  - US-007: Add Logout confirmation  
  - US-012: Add Profile edit link

Run verification for all? [Y/N]
```

### Environment Prerequisites

Environment prerequisites are infrastructure/configuration issues that cannot be fixed by changing application code. They require running commands, scripts, or specialized setup procedures.

**Environment vs Application Prerequisites:**

| Type | Examples | Fix Method |
|------|----------|------------|
| **Application** | Login bug, missing element, API error | Code change via @developer |
| **Environment** | Process conflict, port in use, native app bootstrap | Skill-based recovery |

**Environment prerequisite categories:**

| Category | Examples | Detection Patterns |
|----------|----------|-------------------|
| Process management | Electron single-instance, zombie processes | "EADDRINUSE", "already running", "single instance" |
| Port/service availability | Dev server port conflict, database not running | "ECONNREFUSED", "port in use", connection timeout |
| Native app bootstrap | Electron app launch, desktop app initialization | Platform-specific launch errors |
| External services | Auth service down, API rate limited | 503, 429, "service unavailable" |
| File system | Missing permissions, locked files | "EACCES", "EBUSY", "EPERM" |

**Environment fix flow:**

```
Environment prerequisite detected
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ CHECK FOR MATCHING SKILL                                             │
│                                                                     │
│ Search skills/ for matching environment skill:                       │
│   • electron-testing (for Electron process issues)                  │
│   • start-dev-server (for port/server issues)                       │
│   • auth-* skills (for auth service issues)                         │
│                                                                     │
│ ├─── SKILL FOUND ──► Load skill, run recovery procedure             │
│ │                                                                   │
│ └─── NO SKILL ──► Stop auto-fix, offer skill creation request       │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼ (SKILL FOUND)
┌─────────────────────────────────────────────────────────────────────┐
│ RUN SKILL RECOVERY                                                   │
│                                                                     │
│ 1. Load skill via skill tool                                        │
│ 2. Execute skill's environment setup/recovery steps                 │
│ 3. Retry the original test                                          │
│    ├─── PASS ──► Continue to stability check (3 passes)             │
│    └─── FAIL ──► Classify new failure, continue fix loop            │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼ (NO SKILL)
┌─────────────────────────────────────────────────────────────────────┐
│ SKILL CREATION REQUEST                                               │
│                                                                     │
│ Cannot auto-fix: Environment issue requires a skill that doesn't   │
│ exist yet.                                                          │
│                                                                     │
│ Detected pattern: "Electron single-instance conflict"              │
│ Suggested skill: electron-testing                                   │
│                                                                     │
│ Options:                                                            │
│   [T] Queue skill creation for @toolkit (creates pending-update)   │
│   [M] Fix manually, then retry                                     │
│   [S] Skip verification                                            │
│                                                                     │
│ After skill is created and verified, re-run this verification.     │
└─────────────────────────────────────────────────────────────────────┘
```

**Skill creation request format:**

When user selects [T], Builder creates:

```
~/.config/opencode/pending-updates/2026-03-03-new-skill-electron-testing.md
```

```markdown
---
requestedBy: builder
date: 2026-03-03
priority: high
type: new-skill
---

# New Skill Request: electron-testing

## Detected Pattern

Environment prerequisite failure during verification test.

**Error:** "Error: another instance is already running"
**Context:** Playwright could not connect to Electron app
**Project:** my-electron-app

## Suggested Skill

**Name:** electron-testing
**Purpose:** Handle Electron single-instance conflicts during E2E testing

**Recovery steps needed:**
1. Kill any existing Electron processes for this app
2. Wait for process termination
3. Start fresh Electron instance
4. Connect Playwright to the new instance

## Screenshots

- ai-tmp/verification/screenshots/electron-conflict.png

## Source Test

- tests/ui-verify/settings-page.spec.ts
- Failed at: app launch (before any assertions)
```

**Skill hot-reload on retry:**

When user returns to Builder and types "retry":

1. Builder checks if the requested skill now exists:
   ```
   skill("electron-testing") → exists?
   ```
2. If skill exists: Load and run it, then retry test
3. If skill doesn't exist: Show same options again

**State tracking for pending skill requests:**

```json
{
  "verificationLoop": {
    "pendingSkillRequest": {
      "skillName": "electron-testing",
      "requestedAt": "2026-03-03T10:45:00Z",
      "requestFile": "~/.config/opencode/pending-updates/2026-03-03-new-skill-electron-testing.md"
    }
  }
}
```

### 3-Pass Stability Verification

To catch transient/flaky issues, verification requires 3 consecutive passes before declaring success.

**Configuration:**

```json
{
  "agents": {
    "verification": {
      "mode": "strict",
      "requiredPasses": 3,
      "autoFixLoop": true,
      "fixAttemptTimeoutMinutes": 5,
      "runBroaderTestsAfterFix": true
    }
  }
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `requiredPasses` | number | 3 | Consecutive passes required for stability |
| `autoFixLoop` | boolean | true | Enable automated fix loop (true when missing) |
| `fixAttemptTimeoutMinutes` | number | 5 | Timeout per fix attempt in minutes (5 when missing) |
| `runBroaderTestsAfterFix` | boolean | true | Run broader test suite after each fix to catch regressions |

**Flow:**

```
Feature test passes (1/3)
    │
    ▼
Run again (2/3)
    │
    ▼
Run again (3/3)
    │
    ▼
All 3 pass? ──► ✅ VERIFIED (stable)
    │
Any fail? ──► Enter fix loop (reset pass counter)
```

**Pass counter behavior:**

| Event | Pass Counter |
|-------|--------------|
| Test passes | Increment (+1) |
| Test fails | Reset to 0, enter fix loop |
| Fix applied | Reset to 0, require fresh 3 passes |
| All 3 pass | Verification complete |

**Why reset after fix?**

After any code or environment change, the system must verify stability from scratch. A fix might:
- Introduce new flakiness
- Only work sometimes
- Break something else intermittently

Fresh 3-pass requirement ensures the fix is actually stable.

**Progress reporting:**

```
═══════════════════════════════════════════════════════════════════════
              🔄 STABILITY CHECK IN PROGRESS
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: Verifying stability...

Progress: ✓ Pass 1/3 ✓ Pass 2/3 ○ Pass 3/3

Running test 3 of 3...
═══════════════════════════════════════════════════════════════════════
```

**After 3 passes:**

```
═══════════════════════════════════════════════════════════════════════
              ✅ VERIFICATION PASSED (Stable)
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: VERIFIED

Stability: ✓ 3/3 passes (no transient failures)

Total time: 45s
═══════════════════════════════════════════════════════════════════════
```

**Failure during stability check:**

```
═══════════════════════════════════════════════════════════════════════
              ⚠️ STABILITY CHECK FAILED
═══════════════════════════════════════════════════════════════════════

Feature: Add "Settings" option to profile dropdown
Status: Transient failure detected

Progress: ✓ Pass 1/3 ✓ Pass 2/3 ✗ Fail 3/3

Error on run 3:
  "Timeout waiting for '[data-testid="settings-item"]'"

This appears to be a flaky test or transient issue.
Entering fix loop to investigate...
═══════════════════════════════════════════════════════════════════════
```

---

## Implementation Plan

### Phase 1: Test Structure Markers

**Files to modify:**
- `agents/e2e-playwright.md` — Add `@prerequisites` and `@feature-assertions` markers to verification test format

**Deliverables:**
- [ ] Test file JSDoc format with @prerequisites and @feature-assertions sections
- [ ] Documentation on how markers are used for failure classification
- [ ] Example test file structure

### Phase 2: Prerequisite Detection Logic

**Files to modify:**
- `skills/test-flow/SKILL.md` — Add prerequisite failure detection algorithm

**Deliverables:**
- [ ] Failure classification logic (prerequisite vs feature)
- [ ] Detection heuristics table (login failures, 404s, timeouts, etc.)
- [ ] Parse @prerequisites/@feature-assertions markers from test files
- [ ] Screenshot capture at failure point with classification label

### Phase 3: Environment Prerequisite Detection

**Files to modify:**
- `skills/test-flow/SKILL.md` — Add environment prerequisite detection
- `agents/builder.md` — Add skill lookup before code-fix loop

**Deliverables:**
- [ ] Environment vs application prerequisite classification
- [ ] Detection patterns for each environment category (process, port, native app, external service)
- [ ] Skill lookup logic: search skills/ for matching environment skill
- [ ] Skill-based recovery flow when skill exists

### Phase 4: Skill Creation Request Flow

**Files to modify:**
- `agents/builder.md` — Add skill creation request generation
- `agents/toolkit.md` — Add skill creation request handling (if not already present)

**Deliverables:**
- [ ] [T] option in failure menu: "Queue skill creation for @toolkit"
- [ ] Request file format in pending-updates/
- [ ] State tracking for pending skill requests
- [ ] On retry: check if requested skill now exists

### Phase 5: 3-Pass Stability Verification

**Files to modify:**
- `skills/test-flow/SKILL.md` — Add stability check loop
- `agents/builder.md` — Add pass counter and reset logic

**Deliverables:**
- [ ] requiredPasses configuration (default: 3)
- [ ] Pass counter with reset on any failure or fix
- [ ] Progress reporting: "2/3 passes"
- [ ] Stability check UI (distinct from fix loop)

### Phase 6: Automated Fix Loop

**Files to modify:**
- `skills/test-flow/SKILL.md` — Add automated fix loop workflow
- `agents/builder.md` — Add fix loop orchestration and state tracking

**Deliverables:**
- [ ] Fix loop algorithm with state tracking (verificationLoop object)
- [ ] Finding existing tests for prerequisites (search tests/e2e/)
- [ ] Delegation to @developer or @e2e-playwright for fixes
- [ ] Component-level attempt tracking (auth: 2/3, feature: 1/3)
- [ ] Stop conditions: 3 attempts per component, same error twice, >10 iterations
- [ ] Progress report format during fix loop

### Phase 7: Failure Logging & Manual Fallback

**Files to modify:**
- `skills/test-flow/SKILL.md` — Add verification-failures.json logging
- `agents/builder.md` — Add manual fallback options after auto-fix failure

**Deliverables:**
- [ ] verification-failures.json structure and write logic
- [ ] Full failure report with fix attempt history
- [ ] Manual options: [M] Fix manually, [S] Skip with reason, [A] Abandon
- [ ] Screenshot preservation for all failure states

### Phase 8: Blocker Tracking & Bulk Re-verification

**Files to modify:**
- `agents/builder.md` — Add blocker resolution command and bulk re-verification
- `skills/test-flow/SKILL.md` — Add blocker status management

**Deliverables:**
- [ ] test-debt.json prerequisiteBlockers section
- [ ] "Verification blocked" completion status
- [ ] Bulk re-verification when blocker fixed (verify-blocked command)
- [ ] Blocker status updates (open → resolved)
- [ ] Affected features list and batch re-run

---

## Open Questions

*All questions resolved — see Resolved Questions table below.*

---

## Resolved Questions

| Question | Resolution |
|----------|------------|
| Confidence in prerequisite detection | Use @prerequisites/@feature-assertions markers — failure location determines classification |
| What if prerequisite is flaky | 3-pass stability check catches transient issues |
| Should we diagnose WHY prerequisite failed | Yes — error message + screenshot provided; @developer gets full context |
| "Verification blocked" as tech debt | Tracked in test-debt.json separately as prerequisiteBlockers |
| How many passes required | 3 consecutive passes required (configurable via requiredPasses) |
| Reset counter after fix | Yes — require fresh 3 passes after any code/environment change |
| Will Builder see new skills | Yes — skills loaded dynamically via skill tool; Builder checks on retry |
| Who creates environment skills | @toolkit only — Builder queues request, user verifies, @toolkit creates |
| How should Builder route fixes | Same as any other fix — Builder uses its normal delegation logic; only ask user if no way to delegate or determine next step |
| Auto-fix disable per project | Yes — `agents.verification.autoFixLoop: boolean` (default: true when missing or not set) |
| What if fix breaks something else | Run broader test suite after each fix to catch regressions |
| Long-running fix attempts | Per-attempt timeout via `agents.verification.fixAttemptTimeoutMinutes` (default: 5 minutes when missing or not set) |
| Environment skill naming convention | Naming pattern `{category}-testing` (e.g., `electron-testing`, `docker-testing`) |

---

## Edge Case Handling

These additional edge cases have been analyzed and resolved:

### 1. Cascading Prerequisites (Deep Dependency Chains)

**Scenario:** A test fails at login, which depends on database connection, which depends on container startup.

**Resolution:** The iteration limit should scale with prerequisite depth, not be a fixed 10. For each prerequisite level discovered, add 3 to the maximum iterations.

```
Base limit: 10 iterations
+ 3 per prerequisite depth level discovered

Example: 
- Feature (depth 0) → base 10
- Login depends on feature (depth 1) → +3 = 13
- Database depends on login (depth 2) → +3 = 16
```

**Maximum cap:** 25 iterations (prevent runaway regardless of depth)

### 2. Circular Dependencies

**Scenario:** Fix for component A requires component B to pass, but B's fix requires A to pass.

**Resolution:**
1. Track "error seen before in this loop" — not just consecutive same-error detection
2. If the same error signature appears a second time (anywhere in the loop, not just back-to-back), the loop is circular
3. Stop auto-fix and redelegate to Builder as a "different issue pattern" — this needs human-level architectural thinking

**Error signature:** Hash of (test file + error message + failure location)

### 3. Fix Timeout Handling

**Scenario:** A fix attempt times out at 5 minutes — the delegated agent didn't complete.

**Resolution:**
1. Treat timeout as a failed attempt (increment attempt counter)
2. For partial fixes (agent made some changes before timeout):
   - Run the test anyway to see if partial fix helped
   - If test passes, count as success
   - If test fails, log the partial changes in attempt history
3. Add `fixAttemptTimeoutBehavior` config option: `"retry"` | `"fail"` | `"test-partial"` (default: `"test-partial"`)

### 4. Broader Test Failures After Fix

**Scenario:** Fix for login breaks the logout flow (discovered by broader test suite).

**Resolution:**
1. If the broken test is **not blocking** the original feature (different prerequisite chain):
   - Log to `verification-failures.json` as a regression
   - Add to project status as "incomplete test requiring attention"
   - Continue with original verification
2. If the broken test **is blocking** the original feature (same prerequisite chain):
   - Enter fix loop for the newly broken test
   - Track as a regression in attempt history

### 5. Skill Recovery Fails

**Scenario:** An environment skill exists but fails to recover the environment.

**Resolution:** Same process as "no skill exists":
1. Stop auto-fix
2. Offer option [T] to queue skill update request for @toolkit
3. Request includes: existing skill name, what it tried, why it failed, suggested improvements
4. After skill is updated, retry

### 6. User Abandons Mid-Loop

**Scenario:** User closes session while fix loop is in progress.

**Resolution:**
1. All loop state is already persisted to `builder-state.json` after each step
2. On next Builder session startup:
   - Check for `verificationLoop.status === "in_progress"`
   - Show in project status: "⚠️ Verification loop interrupted — [X] iterations, last working on [component]"
3. Offer options:
   - [R] Resume from where it left off
   - [C] Clear and start fresh
   - [S] Skip verification

### 7. Test File Invalid (Syntax Error, Missing Import)

**Scenario:** The verification test itself has a syntax error or broken import.

**Resolution:**
1. Classify as distinct category: **"TEST_INVALID"** (not prerequisite, not feature)
2. Delegate to @e2e-playwright specifically (not @developer)
3. @e2e-playwright is the test specialist — it should fix test file issues
4. Same 3-attempt limit applies

**Detection heuristics:**
- "SyntaxError" in error message
- "Cannot find module" / "Module not found"
- "is not defined" for test-specific variables
- Test file stack trace points to test file itself (not application code)

### 8. External API Down

**Scenario:** Test fails because a third-party API (Stripe, SendGrid, etc.) is down or rate-limiting.

**Resolution:**
1. Detect external service failures via patterns:
   - HTTP 503 from known external domains
   - "service unavailable" + external hostname
   - HTTP 429 rate limit from external service
2. **Do not attempt automated fix** — no code change or skill can fix this
3. Immediately offer manual options:
   ```
   ⚠️ EXTERNAL SERVICE UNAVAILABLE
   
   The test failed due to an external service issue:
     Service: api.stripe.com
     Error: 503 Service Unavailable
   
   This cannot be automatically fixed. Options:
     [W] Wait and retry in 5 minutes
     [M] Use mock/stub for this service
     [S] Skip verification
   ```

### 9. Multiple Prerequisites Fail Simultaneously

**Scenario:** First test run fails at login AND shows database connection error in the same run.

**Resolution:**
1. Fix prerequisites in dependency order (bottom-up)
2. Database is likely a prerequisite for login, so fix database first
3. If no clear dependency order, fix in order of appearance in test output
4. Track all detected prerequisites and mark as "pending" until each is addressed

### 10. Non-Localhost Testing (Out of Scope)

**Scenario:** Project has `devPort: null` and tests should run against staging/Vercel preview.

**Resolution:** This is **out of scope for this PRD**. Non-localhost testing will be addressed in a separate PRD covering:
- Test environment selection (`testEnvironment` config)
- Vercel preview URL detection
- Supabase preview branch handling
- Dynamic URL resolution

This PRD assumes a running local dev server (the existing prerequisite check for `devPort: null` applies — those projects skip E2E entirely until the non-localhost PRD is implemented).

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-03-03 | @toolkit | Initial draft based on user question about auth failures blocking feature verification |
| 2026-03-03 | @toolkit | Added automated fix loop algorithm, state tracking, implementation phases, resolved open questions |
| 2026-03-03 | @toolkit | Added environment prerequisites with skill-based fixes and skill creation request flow |
| 2026-03-03 | @toolkit | Added 3-pass stability verification requirement with reset after fix |
| 2026-03-03 | @toolkit | Added Stories 6-8 for environment skills and stability checks; expanded to 8 implementation phases |
| 2026-03-03 | @toolkit | Moved to READY status |
| 2026-03-03 | @toolkit | Resolved all open questions: fix routing (use normal delegation), autoFixLoop config (default true), broader tests after fix, fixAttemptTimeoutMinutes (default 5), skill naming ({category}-testing) |
| 2026-03-03 | @toolkit | Added Edge Case Handling section: 10 edge cases with resolutions (cascading prerequisites, circular deps, timeout handling, broader test failures, skill recovery, session abandonment, invalid tests, external APIs, multiple prerequisites, non-localhost scope) |
