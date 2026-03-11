# PRD: Builder Verification Architecture

**Status:** Ready  
**Priority:** High  
**Created:** 2026-03-04  
**Approved:** 2026-03-04  
**Source:** Consolidated from 4 pending updates:
- `2026-03-03-builder-mandatory-ui-verification.md` (HIGH)
- `2026-03-03-builder-app-type-detection-before-testing.md` (CRITICAL)
- `2026-03-04-electron-e2e-cleanup-patterns.md` (documentation)
- `2026-03-03-builder-test-documentation-sync.md` (HIGH)

---

## Problem Statement

Builder completes UI changes without proper verification, often attempting the wrong verification approach for the app architecture. This wastes significant time (10+ minutes observed) and leaves users with unverified changes.

### Observed Failures

1. **Wrong Platform Verification**
   - Builder showed `[V] Verify in browser` for an Electron app
   - Verification should be automatic BEFORE completion, not optional AFTER

2. **Wrong Deployment Model Assumptions**
   - Builder tried to start a localhost dev server for an Electron app that loads remote URLs
   - Wasted 10+ minutes trying approaches that could never work
   - Root cause: didn't check app architecture before attempting verification

3. **Zombie Processes from Failed E2E Tests**
   - Electron E2E tests leave zombie processes when they fail
   - Multiple dock icons appear on macOS
   - No cleanup patterns documented for Electron test teardown

4. **Stale Test Documentation After Behavior Changes**
   - Builder changed behavior (removed QR code as default sign-in for Electron)
   - Did not update corresponding test comments and docstrings
   - Left outdated documentation in 4 E2E test files
   - Test documentation serves as living docs; stale comments are worse than none

### Root Cause

**Builder doesn't understand app architecture before attempting verification.** The `project.json` schema lacks sufficient information about:
- How the app delivers web content (bundled vs remote)
- What verification method is appropriate
- What cleanup is needed after E2E tests

---

## Proposed Solution

### 1. Schema Enhancement: `webContent` Field

Add a `webContent` field to the `apps[]` schema in `project.json`:

```json
{
  "apps": [
    {
      "name": "desktop",
      "type": "desktop",
      "framework": "electron",
      "webContent": "remote",  // NEW FIELD
      "remoteUrl": "https://app.example.com"  // Required when webContent: "remote"
    }
  ]
}
```

**`webContent` values:**
| Value | Description | Verification Method |
|-------|-------------|---------------------|
| `bundled` | HTML/JS packaged with app (typical Electron) | Local dev or packaged app |
| `remote` | App loads content from deployed URL | Must deploy first, then verify |
| `hybrid` | Some local, some remote content | Context-dependent |
| *(omit)* | Web apps (default localhost dev server) | `npm run dev` + browser |

### 2. Mandatory Pre-Completion Verification Gate

Builder MUST run verification BEFORE showing completion prompt. The verification method depends on app architecture:

```
┌─────────────────────────────────────────────────────────────┐
│ UI Change Detected                                          │
├─────────────────────────────────────────────────────────────┤
│ 1. Check project.json → apps[].type + webContent            │
│ 2. Select verification method:                              │
│    - Web app → Screenshot localhost:PORT                    │
│    - Electron (bundled) → Run Electron E2E or manual        │
│    - Electron (remote) → Screenshot deployed URL            │
│ 3. Run verification automatically                           │
│ 4. Show results to user                                     │
│ 5. THEN show completion prompt                              │
└─────────────────────────────────────────────────────────────┘
```

**Key change:** Remove the generic `[V] Verify in browser` option. Replace with architecture-aware automatic verification.

### 3. Pre-Analysis Screenshots for Ad-Hoc Mode

**Ad-hoc requests ALWAYS get a screenshot before analysis.** This ensures Builder sees the actual current state, not just what the code suggests.

```
┌─────────────────────────────────────────────────────────────┐
│ Ad-Hoc Request Received                                     │
├─────────────────────────────────────────────────────────────┤
│ 1. Determine app type from project.json                     │
│ 2. Ensure app is running:                                   │
│    - Web app → Start dev server if not running              │
│    - Desktop app → Launch app if not running                │
│ 3. Take screenshot of current state                         │
│ 4. Perform code analysis                                    │
│ 5. Present BOTH screenshot AND code findings to user        │
│ 6. Wait for approval before implementing                    │
└─────────────────────────────────────────────────────────────┘
```

**Why this matters:**
- Code analysis alone misses CSS inheritance, runtime state, and visual bugs
- Screenshot reveals what the user actually sees
- Prevents "I'll fix the blue button" when the button is actually gray due to CSS override

**Analysis presentation with screenshot:**
```
═══════════════════════════════════════════════════════════════
                    ANALYSIS COMPLETE
═══════════════════════════════════════════════════════════════

📸 Current state: [screenshot attached]

Based on visual + code analysis:
- [Findings that reference both what's seen AND what's in code]
- [Any discrepancies between code and visual state]

Proposed changes:
- [List of changes]

[A] Approve  [R] Revise  [C] Cancel
═══════════════════════════════════════════════════════════════
```

**App startup behavior:**

| App Type | If Not Running |
|----------|----------------|
| Web app | Start dev server (`npm run dev` or configured command), wait for ready |
| Desktop (bundled) | Launch app (`npm run start` or configured command) |
| Desktop (remote) | Screenshot the deployed URL directly (no local app needed) |

**Note:** This applies to ad-hoc mode only. PRD mode has structured requirements and doesn't need pre-analysis screenshots.

### 4. Electron E2E Cleanup Patterns

Add `globalSetup.ts` pattern to `e2e-electron` skill (or create if missing):

```typescript
// playwright/globalSetup.ts
import { execSync } from 'child_process';

export default async function globalSetup() {
  // Kill any zombie Electron processes from previous runs
  if (process.platform === 'darwin') {
    try {
      execSync('pkill -9 -f "Electron" || true', { stdio: 'ignore' });
      execSync('killall -9 "YourAppName" || true', { stdio: 'ignore' });
      // Brief delay to ensure processes are fully terminated
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch {
      // Ignore errors - processes may not exist
    }
  }
}
```

**Integration with test-flow skill:**
- Add Electron zombie detection to environment prerequisite checks
- Warn if multiple Electron processes detected before test run
- Auto-cleanup option when detected

### 5. Test Documentation Sync

After ANY code change, Builder MUST search for and update related test comments and docstrings. This runs **before commit**.

```
┌─────────────────────────────────────────────────────────────┐
│ Code Change Ready to Commit                                 │
├─────────────────────────────────────────────────────────────┤
│ 1. Analyze diff to extract "old behavior" keywords:         │
│    - Removed/changed variable names                         │
│    - Removed/changed string literals                        │
│    - Removed/changed comments in source                     │
│    - Changed function/component names                       │
│                                                             │
│ 2. Expand keywords semantically:                            │
│    showQRCode → "QR code", "QR-code", "qrcode", "device auth"│
│                                                             │
│ 3. Search test files:                                       │
│    grep -rn "<keywords>" tests/ e2e/ --include="*.ts"       │
│                                                             │
│ 4. Handle matches based on count:                           │
│    0 matches    → Proceed to commit                         │
│    1-5 matches  → Auto-update, include in commit            │
│    6-15 matches → Show grouped by file, ask "Update all?"   │
│    16+ matches  → Narrow search or ask user which files     │
│                                                             │
│ 5. Prioritize comments in files already touched this change │
│                                                             │
│ 6. Verify no stale references remain, then commit           │
└─────────────────────────────────────────────────────────────┘
```

**Keyword extraction from diff:**

| Diff Element | Extracted Keywords |
|--------------|-------------------|
| Removed `showQRCode()` | "QR code", "QR", "qrcode" |
| Removed `"Scan QR code"` | "Scan QR code", "scan" |
| Changed `DeviceAuth` → `EmailAuth` | "device auth", "DeviceAuth" |
| Removed comment `// QR is default` | "QR", "default" |

**Safety rules:**
- Never auto-update comments outside `tests/` or `e2e/`
- Never update comments in `node_modules/` or generated files
- If match looks unrelated (fuzzy), skip or ask

**Verification before commit:**
```bash
# No references to old behavior should remain
grep -rn "<old behavior keywords>" tests/ e2e/ | wc -l
# Should return 0
```

---

## User Stories

### Story 1: Architecture-Aware Verification Selection
**As** Builder  
**When** I complete a UI change  
**I should** automatically select the correct verification method based on `project.json` app configuration  
**So that** I don't waste time trying approaches that can't work

**Acceptance Criteria:**
- [ ] Builder reads `apps[].type`, `apps[].framework`, and `apps[].webContent` before verification
- [ ] Web apps → localhost dev server + screenshot
- [ ] Electron (bundled) → Electron E2E or skip with user confirmation
- [ ] Electron (remote) → Check deployed URL + screenshot
- [ ] Unknown architecture → Ask user before attempting

### Story 2: Mandatory Pre-Completion Verification
**As** a user  
**When** Builder completes a UI change  
**I should** see verification results BEFORE the completion prompt  
**So that** I know the change actually works

**Acceptance Criteria:**
- [ ] Verification runs automatically before completion prompt
- [ ] User sees screenshot or test results
- [ ] `[V] Verify` option removed from completion prompt (verification already done)
- [ ] If verification fails, Builder reports failure instead of claiming completion

### Story 3: Pre-Analysis Screenshots for Ad-Hoc Requests
**As** a user making an ad-hoc request  
**When** Builder analyzes my request  
**I should** see a screenshot of the current state alongside the code analysis  
**So that** Builder and I are looking at the same thing and discrepancies are caught early

**Acceptance Criteria:**
- [ ] Ad-hoc requests ALWAYS trigger a screenshot before analysis
- [ ] If app not running, Builder starts it automatically (dev server or desktop app)
- [ ] Screenshot is attached to analysis presentation
- [ ] Analysis references both visual state and code findings
- [ ] Desktop (remote) apps screenshot the deployed URL directly

### Story 4: Electron Zombie Process Cleanup
**As** a developer running Electron E2E tests  
**When** tests fail or are interrupted  
**I should** not accumulate zombie Electron processes  
**So that** my system stays clean and subsequent tests work correctly

**Acceptance Criteria:**
- [ ] `globalSetup.ts` pattern documented in Electron E2E skill
- [ ] Cleanup runs before each test suite
- [ ] Platform-specific cleanup (macOS pkill patterns)
- [ ] test-flow skill detects zombie processes as environment issue

### Story 5: Test Documentation Sync
**As** a user  
**When** Builder makes any code change  
**I should** have all related test comments and docstrings updated automatically  
**So that** test documentation stays accurate and useful

**Acceptance Criteria:**
- [ ] Runs before commit (not after implementation)
- [ ] Keywords extracted automatically from diff (removed/changed names, literals, comments)
- [ ] Keywords expanded semantically (e.g., `showQRCode` → "QR code", "QR-code", "qrcode")
- [ ] Match handling: 0=proceed, 1-5=auto-update, 6-15=ask, 16+=narrow search
- [ ] Prioritizes files already touched in this change
- [ ] Never updates outside `tests/` or `e2e/`, never touches `node_modules/`
- [ ] Verification grep confirms no stale references remain before commit
- [ ] Applies to ALL code changes, not just UI/behavior changes

---

## Files to Modify

| File | Changes |
|------|---------|
| `skills/test-flow/SKILL.md` | Add platform/architecture detection, pre-completion verification gate, test doc sync requirement |
| `skills/adhoc-workflow/SKILL.md` | Add pre-analysis screenshot requirement, enforce verification before completion |
| `skills/e2e-electron/SKILL.md` | Add globalSetup cleanup patterns (create new skill) |
| `skills/start-dev-server/SKILL.md` | Ensure it handles desktop app startup (not just web dev servers) |
| `agents/builder.md` | Remove generic `[V]` option, add architecture-aware verification logic, add test doc sync to post-implementation checklist |
| `agents/developer.md` | Add test doc sync to implementation workflow |
| `schemas/project.schema.json` | Add `webContent` field to `apps[]` schema |
| `skills/project-bootstrap/SKILL.md` | Document `webContent` field during project setup |

---

## Out of Scope

- Automatic deployment for Electron remote apps (user must deploy manually)
- Windows/Linux Electron cleanup patterns (macOS only for now)
- Hybrid webContent detection heuristics (user must specify)

---

## Decisions

1. **`webContent` is required for desktop apps**
   - Must be specified when `apps[].type: "desktop"`
   - Prevents wrong verification assumptions at the cost of one config field during setup

2. **Allow override when verification fails but code is correct**
   - Builder can allow user to mark complete even if verification fails
   - Requires explicit user confirmation
   - Warning logged for audit trail

3. **Create new `e2e-electron` skill**
   - Electron testing has unique concerns (zombie processes, app packaging, IPC)
   - Follows existing pattern (`e2e-playwright` is a specialist)
   - `test-flow` remains the router, delegates to `e2e-electron` for Electron apps

4. **Pre-analysis screenshots are ALWAYS taken for ad-hoc requests**
   - Automatic, not opt-in
   - App is started automatically if not running
   - Applies to ad-hoc mode only (not PRD mode)

5. **Test documentation sync configuration**
   - **When:** Before commit (not after implementation)
   - **Keyword detection:** Diff analysis + semantic expansion (auto, don't ask user)
   - **Match thresholds:** 0=proceed, 1-5=auto-update, 6-15=confirm, 16+=narrow
   - **Scope:** ALL code changes (not just UI/behavior changes)

---

## Success Metrics

- Zero instances of "tried localhost for Electron remote app"
- Zero post-completion verification prompts (all pre-completion)
- No zombie Electron processes after test runs
- Time-to-verification reduced (no wasted attempts)
- Ad-hoc analysis always includes screenshot (100% coverage)
- Zero "code said X but UI showed Y" surprises during implementation
- Zero stale test comments after behavior changes

---

## Consolidation Notes

This PRD consolidates 4 related pending updates that all stem from the same root issue. After implementation:

1. Delete `pending-updates/2026-03-03-builder-mandatory-ui-verification.md`
2. Delete `pending-updates/2026-03-03-builder-app-type-detection-before-testing.md`
3. Delete `pending-updates/2026-03-04-electron-e2e-cleanup-patterns.md`
4. Delete `pending-updates/2026-03-03-builder-test-documentation-sync.md`

All four issues are addressed by understanding app architecture before verification and ensuring complete verification (including documentation) before declaring done.
