---
id: prd-electron-build-deploy
title: Electron Build-Deploy Cycle Automation
status: ready
priority: high
createdAt: 2026-03-07T00:00:00Z
---

# PRD: Electron Build-Deploy Cycle Automation

## Problem

When Builder completes implementation work on Electron desktop projects, it declares "TASK COMPLETE" without rebuilding the app or deploying to the installed test app. The user's verification path for Electron projects requires:

```
Source changes → Build app → Deploy to test app → Relaunch → Verify
```

But Builder only does:

```
Source changes → Commit → Push → "TASK COMPLETE"
```

This means:
1. The user must manually rebuild and redeploy to see changes
2. Playwright E2E tests (which launch the installed app) test stale code
3. Any "pass" from Playwright is meaningless because it's verifying old code

The information needed to automate this already exists in `project.json` (`environments`, `apps.desktop.testing`, `postChangeWorkflow`), but Builder and test-flow don't use it.

## Root Cause

1. **No semantic build-deploy config:** `postChangeWorkflow` is a generic workaround but doesn't express "build Electron app, deploy to test location" as a first-class concept
2. **test-flow has no build-deploy gate:** Step 3.5 says "Desktop + bundled → Build + relaunch Electron" but provides no mechanism to actually do it (no build command, output path, or deploy target)
3. **Verification state was also skipped** (separate fix already shipped in `e942c76` — stale `verificationContract` caused test-flow to be skipped entirely)

## Solution

Add `apps.desktop.buildDeploy` to the project schema as a first-class configuration section, and update test-flow to use it as a build-deploy gate before Playwright verification for desktop projects.

---

## Functional Requirements

### FR-1: Schema — `apps.desktop.buildDeploy` configuration

Add to `project.schema.json` under `apps.desktop`:

```json
"buildDeploy": {
  "buildCommand": "pnpm build",
  "buildOutputApp": "apps/desktop/dist/mac-universal/Helm.app",
  "testApp": "/Applications/Helm Preview.app",
  "autoDeployAfterStory": true,
  "triggerPaths": [
    "apps/desktop/electron/**",
    "packages/ui/src/**",
    "apps/desktop/package.json"
  ]
}
```

The schema declares **what** (paths) and the agent handles **how** (kill → copy → relaunch). No `deployCommand` or custom interpolation — the deploy step for a macOS `.app` bundle is always the same operation, and the agent can construct it from `buildOutputApp` and `testApp`.

### FR-2: test-flow — Build-deploy gate via `electron-build-deploy` skill

When `project.json` contains `apps.desktop.buildDeploy`:
1. After typecheck/lint/unit-tests pass
2. Check if any changed files match `buildDeploy.triggerPaths`
3. If matched, load the `electron-build-deploy` skill
4. Skill executes: build → kill running app → copy to test location → relaunch
5. Block Playwright until the skill reports success
6. On failure, treat as test-flow failure (fix loop, max 3 attempts)

### FR-3: test-flow — Skip build-deploy for remote webContent

When `apps.desktop.webContent.source` is `"remote"`, the desktop app loads a remote URL. UI-only source changes don't need an Electron rebuild — only main process / preload changes do. The trigger path check (FR-2 step 2) handles this naturally if `triggerPaths` only includes Electron-specific paths.

### FR-4: Builder — Post-task build-deploy awareness

After all stories complete (ad-hoc or PRD), if `buildDeploy.autoDeployAfterStory` is true and the build-deploy gate ran during test-flow, Builder should include build/deploy status in the completion report.

### FR-5: Build timeout handling

`pnpm build` with electron-builder can take 2+ minutes. test-flow should:
- Report "Building Electron app..." before starting the build
- Use a configurable timeout (default: 5 minutes)
- If build fails, treat as test-flow failure (not a silent skip)

---

## User Stories

### US-001: Add buildDeploy to project.schema.json
**As** a project maintainer, **I want** a `buildDeploy` section under `apps.desktop` in the project schema, **so that** the Electron build-deploy cycle is declaratively configured.

**Acceptance Criteria:**
- `apps.desktop.buildDeploy` added to `project.schema.json` with all fields from FR-1
- Schema validates correctly with `buildDeploy` present and absent
- All fields have descriptions and appropriate types
- `triggerPaths` description includes guidance for remote webContent apps: "If `webContent.source` is remote, only include main process paths (e.g., `apps/desktop/electron/**`) — UI-only changes don't require a rebuild"

### US-002: Add triggerPaths detection to test-flow
**As** test-flow, **I want** to check changed files against `buildDeploy.triggerPaths` before deciding whether to rebuild, **so that** unnecessary rebuilds are avoided.

**Acceptance Criteria:**
- test-flow reads `buildDeploy.triggerPaths` from project.json
- If no changed files match trigger paths, build-deploy gate is skipped
- If any changed file matches, gate proceeds to build

### US-003: Create `electron-build-deploy` skill
**As** test-flow, **I want** a dedicated skill that handles the full build → kill → copy → relaunch sequence, **so that** Playwright verifies newly-built code, not stale code.

**Acceptance Criteria:**
- `skills/electron-build-deploy/SKILL.md` created with explicit, numbered command sequence
- Skill includes kill → copy → relaunch steps with literal commands (not prose descriptions)
- Each step marked as CRITICAL/required to prevent Builder from skipping
- Error handling: build failure, copy failure, and launch failure all stop the pipeline
- test-flow Step 3.5 updated to load this skill as first priority when `buildDeploy` is configured
- Build failure = test-flow failure (pipeline stops)
- Deploy failure = test-flow failure (pipeline stops)
- Build + deploy success = proceed to Playwright

### US-004: Add build timeout handling
**As** test-flow, **I want** a configurable build timeout, **so that** hung builds don't block indefinitely.

**Acceptance Criteria:**
- Default timeout: 5 minutes (300000ms)
- Optional `buildDeploy.buildTimeoutMs` field in schema
- Progress indicator: "Building Electron app..." shown before build starts
- Timeout triggers test-flow failure with clear message

### US-005: Include build-deploy status in completion report
**As** Builder, **I want** the completion report to show build-deploy status, **so that** the user knows their test app is up to date.

**Acceptance Criteria:**
- Completion report includes "Build & Deploy" section when `buildDeploy` was used
- Shows: build command, build time, deploy target
- Shows "✅ Test app updated" or "⚠️ Build skipped (no trigger paths matched)"

### US-006: Add configure-electron-build-deploy update template
**As** @toolkit, **I want** an update template for existing Electron projects to configure `buildDeploy`, **so that** the migration is discoverable.

**Acceptance Criteria:**
- Update template created in `data/update-templates/`
- Registered in `data/update-registry.json` with affinity rule `electron-apps`
- Template walks user through configuring build command, output path, test app path, trigger paths

---

## Resolved Questions

1. ~~**Should `deployCommand` support multi-step commands?**~~ **Resolved:** No `deployCommand` in schema. The agent owns the deploy lifecycle (kill → copy → relaunch) using `buildOutputApp` and `testApp` paths. See FR-1.

2. ~~**Should there be a `relaunchCommand`?**~~ **Resolved:** Relaunch is part of the agent's deploy responsibility. The agent kills the running app before copy and relaunches after. No user configuration needed.

3. ~~**Cross-platform support:**~~ **Resolved:** macOS only for v1. `testApp` is a single string path to a `.app` bundle. The `electron-build-deploy` skill uses macOS-specific commands (`killall`, `cp -R`, `open`). Linux and Windows support can be added later by extending `testApp` to a platform map and adding platform-specific deploy logic to the skill.

---

## Non-Goals

- This PRD does NOT address code signing or notarization
- This PRD does NOT address CI/CD build pipelines — only local development builds
- This PRD does NOT address the verification state reset bug (already fixed in `e942c76`)

## Dependencies

- Verification state reset fix (`e942c76`) — already shipped
- `testVerifySettings` as sole Playwright gate (`prd-test-mechanics-cleanup`) — already complete

## References

- Schema: `schemas/project.schema.json` → `apps.desktop`
- test-flow Step 3.5: `skills/test-flow/SKILL.md`
- Build-deploy skill: `skills/electron-build-deploy/SKILL.md`
- Affinity rule: `data/update-affinity-rules.json` → `electron-apps`
