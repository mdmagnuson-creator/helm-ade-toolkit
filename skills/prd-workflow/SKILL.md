---
name: prd-workflow
description: "PRD mode workflow for Builder. Use when building features from PRDs, implementing user stories, or managing PRD state transitions. Triggers on: PRD mode, build PRD, implement stories, ship PRD."
---

# PRD Workflow

> Load this skill when: building features from PRDs, implementing user stories, managing PRD state transitions.

## Git Auto-Commit Enforcement

> ⛔ **CRITICAL: Check `git.autoCommit` setting before ANY commit operation**
>
> **Trigger:** Before running `git commit` at any step in this workflow.
>
> **Check:** `project.json` → `git.autoCommit`
> - If `true` (default): Proceed with commits normally
> - If `false`: **NEVER run `git commit`** — failure to comply violates project constraint
>
> **When autoCommit is disabled, replace commit steps with:**
> 1. Stage changes: `git add -A` (or specific files)
> 2. Report what would be committed:
>    ```
>    📋 READY TO COMMIT (manual commit required)
>    
>    Staged files:
>      [list of files]
>    
>    Suggested commit message:
>      feat: [summary from PRD]
>    
>    Run: git commit -m "feat: [summary from PRD]"
>    ```
> 3. **Do NOT run `git commit`** — wait for user to commit manually
> 4. Continue workflow only after user confirms commit was made
>
> **This applies to ALL commit steps in this workflow** (Step 3, story commits, etc.)

## Overview

PRD mode implements features defined in `docs/prds/prd-[name].json`. It operates in four phases:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  CLAIM PHASE    │ ──► │  BUILD PHASE    │ ──► │   SHIP PHASE    │ ──► │ CLEANUP PHASE   │
│                 │     │                 │     │                 │     │                 │
│ Check conflicts │     │ Implement each  │     │ Run tests, PR,  │     │ Archive PRD,    │
│ setup branch    │     │ story in order  │     │ merge queue     │     │ generate script │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Todo Sync Rules (PRD)

Use OpenCode right-panel todos as the live checklist, derived from `session.json` → `chunks[]`.

1. Create one todo per story/chunk when PRD work starts (`US-001`, `US-002`, ...).
2. Set current chunk to `in_progress`; keep remaining chunks `pending`.
3. When a chunk finishes and post-story checks pass, mark it `completed`.
4. Each chunk's status in `session.json` drives the right-panel todo state.
5. On session resume, rebuild right-panel todos from `session.json` → `chunks[]` before continuing.

## Post-Story Status Update (MANDATORY)

> ⛔ **After completing a story, you MUST update its status in the PRD JSON file.**
>
> **Failure behavior:** If you find yourself about to commit code for a completed story without first updating `docs/prd.json` with `status: "completed"`, `completedAt`, and `passes: true` — STOP and update the story status before committing.

After each story completes:

1. **Update the story in `docs/prd.json`:**
   ```json
   {
     "id": "US-001",
     "status": "completed",
     "completedAt": "2026-02-28T10:30:00Z",
     "passes": true,
     "notes": "Implemented with React component, added unit tests"
   }
   ```

2. **Update the PRD-level status in `docs/prd-registry.json`:**
   - If some stories complete: ensure `status: "in_progress"` 
   - If all stories complete: set `status: "pr_open"` (or later states)
   - Update `currentStory` to the next pending story (or null if done)

3. **Include these updates in the story commit** (or subsequent housekeeping commit)

**Why this matters:**
- **Resumability:** Interrupted sessions know exactly which stories are done
- **Visibility:** User can check PRD status and see accurate progress
- **Handoff:** Another agent or human can pick up where Builder left off
- **Audit trail:** `completedAt` timestamps provide implementation timeline

## PRD Lifecycle States

PRDs go through 5 states:

```
┌───────┐     ┌───────┐     ┌─────────────┐     ┌─────────┐     ┌───────────┐
│ draft │ ──▶ │ ready │ ──▶ │ in_progress │ ──▶ │ pr_open │ ──▶ │ completed │
└───────┘     └───────┘     └─────────────┘     └─────────┘     └───────────┘
    │                              │
    │         (skip for           │
    └─────────small PRDs)─────────┘
```

| State | Meaning |
|-------|---------|
| `draft` | PRD exists but not ready for implementation |
| `ready` | PRD approved, waiting to be picked up |
| `in_progress` | Implementation actively happening |
| `pr_open` | PR created, awaiting review/merge |
| `completed` | PR merged, Playwright tests passed (or skipped via testVerifySettings), work done |

### State Migration

If you encounter PRDs with legacy states, migrate them automatically:
- `committed` → `in_progress` (work not yet pushed)
- `pushed` → `in_progress` (no PR yet)
- `merged` → `completed` (legacy state)
- `awaiting_e2e` → `completed` (legacy state — E2E deferral removed)

## Git Execution Mode (PRD)

Resolve git behavior from `docs/project.json`:

1. `agents.gitWorkflow`
2. If `trunk`, resolve `agents.trunkMode` (default: `branchless`)
3. Resolve default branch from `git.defaultBranch` (fallback: `main`)

Rules:
- `trunk + branchless`:
  - Execute directly on default branch
  - Do not create/checkout feature branches
  - Treat PRD `branchName` as metadata only
  - Skip PR creation/merge-queue flow unless user explicitly overrides
- `trunk + pr-based` or non-trunk workflows:
  - Use existing branch + PR flow in this skill

---

## Phase 1: Claim PRD

When user selects a PRD to build:

### Step 1: Check for Conflicts

- Read `docs/prd-registry.json` for `conflictsWith` and `conflictRisk`
- If HIGH conflict risk with an active session, warn and get confirmation
- If MEDIUM conflict risk, note it but proceed if user confirms

### Step 2: Credential Readiness Check

Before copying the PRD to the working location, inspect credential metadata in `docs/prds/prd-[name].json`:

- Read top-level `credentialRequirements[]` (if present).
- For each entry with `requestTiming: "upfront"`, ask for credential readiness before starting story execution.
- If user does not have a credential yet, mark it `deferred` and continue only with stories that do not depend on it.
- Persist statuses in `session.json` under the session-level `credentials` field with `pending|provided|deferred`.
- Never ask users to paste actual secrets into chat; request secure local setup via environment variables/secrets manager.

If no credential requirements are listed, continue normally.

### Step 3: Copy PRD to Working Location

Copy `docs/prds/prd-[name].json` to `docs/prd.json`. This is where @developer reads the current work.

### Step 4: Update PRD Registry Status

Update `docs/prd-registry.json`:
- Set `status: "in_progress"`
- Set `startedAt: <now>`
- Store `currentStory` as work progresses

### Step 5: Create Session Lock

Create/update entry in `docs/session-locks.json`:

```json
{
  "sessions": [
    {
      "sessionId": "builder-abc123",
      "prdId": "prd-error-logging",
      "currentStory": "US-001",
      "status": "in_progress",
      "startedAt": "2026-02-19T16:30:00Z",
      "heartbeat": "2026-02-19T16:30:00Z"
    }
  ]
}
```

### Step 6: Set Execution Branch

If `trunk + branchless`:

```bash
git checkout <default-branch>
```

If not branchless trunk mode, create branch from PRD `branchName`:

```bash
git checkout -b <branchName> <default-branch>
```

### Step 8: Initialize Architecture Automation Baseline

Before story execution begins, ensure architecture automation assets exist and are current:

1. **Architecture guardrails** (generate when missing):
   - import boundary rules
   - layer constraints (UI/app/domain/data)
   - restricted direct access patterns
2. **Bounded-context docs** (generate when missing):
   - `docs/architecture/bounded-contexts.md`
   - optional `docs/architecture/contexts/*.md`
3. Persist initialization status in `session.json` under session-level `architecture` field.

Default policy:
- `guardrails.strictness`: `standard`
- `boundedContexts.policy`: `strict`

Only prompt users for policy overrides, not routine generation/refresh.

### Step 9: Story List Review (with Flow Chart Option)

Before starting story execution, show the story list and offer the flow chart option:

```
═══════════════════════════════════════════════════════════════════════
                        STARTING PRD EXECUTION
═══════════════════════════════════════════════════════════════════════

PRD: {prd-title}
Stories: {total count}

  US-001: {description}
  US-002: {description}
  US-003: {description}
  ...

Pipeline per story: implement → test-flow → commit → postChangeActions

[G] Go — start executing stories
[F] Show implementation flow chart

> _
═══════════════════════════════════════════════════════════════════════
```

When user selects `[F]`, show the implementation flow chart (same format as adhoc-workflow → Step 0.2a) adapted to the PRD's stories using `US-XXX` prefixes. After viewing, return to this dashboard.

> ℹ️ The flow chart format and adaptation rules are defined in `adhoc-workflow` → Step 0.2a. Both modes use the same pipeline (see `builder.md` → Story Processing Pipeline).

---

## Phase 2: Build Stories

For each story in priority order:

### Per-Story Quality Checks (MANDATORY)

> 📚 **SKILL: test-flow** → "Skip Gate → Activity Resolution → Quality Check Pipeline"
>
> Load the `test-flow` skill for the complete quality check pipeline that runs after every story completion.
> It includes skip-gate logic, activity resolution, typecheck/lint/test/rebuild/critic/Playwright,
> and the completion prompt. **No prompts, no skipping** — test-flow runs automatically.
>
> **PRD-specific context to pass:**
> - `mode: "prd"` — 5-attempt Playwright retry strategy (vs ad-hoc's 3-attempt)
 > - `storyId` and `prdId` from `session.json` → `currentChunk` and session metadata
> - `storyChangedFiles` for story-scoped Playwright test selection
>
> **PRD-specific behaviors (defined in test-flow):**
> - **Story-scoped Playwright:** Tests are scoped to changed files + 1-hop consumers (not full suite)
> - **5-attempt retry:** On Playwright failure, retry up to 5 times with progressive fix delegation
> - **Skip and log:** After 5 failures, skip Playwright and log to the chunk's `playwrightSkips` in `chunk.json`, then continue to next story
 > - **Playwright install check:** One-time per session check, cached in `builder-config.json`
>
> **Failure behavior:** Steps 1-4 (typecheck/lint/test/critic): max 3 attempts, then STOP and report to user.
> Step 5 (Playwright): max 5 attempts, then skip and log, continue to next story.

### UI Verification Enforcement

> 📚 **SKILL: test-ui-verification** → "Verification Flow"
>
> Load the `test-ui-verification` skill for the full UI verification flow including:
> - Playwright verification execution and status handling
> - Skip patterns (docs, config, test files, CI/CD, non-UI extensions)
> - Override mechanism (user can force-verify or force-skip with reason)
> - Verification status: `verified`, `unverified` (BLOCKS completion), `skipped` (logs to test-debt.json)
>
> **PRD-specific behavior:** If verification status is `unverified`, the story remains `in_progress`
> until verified or explicitly skipped. Skipped verifications are logged to `test-debt.json`.

**After all checks pass**, Builder continues to the next story (or shows completion prompt if E2E is offered).

### Step 1: Implement the Story

0. **Generate verification contract BEFORE delegation:**
   
   Before delegating to @developer, generate a verification contract (see `builder.md` → "Verification Contracts"):
   
   ```
   Contract generation for story US-003:
   1. Parse story description for advisory/skip patterns
   2. Identify expected file changes from story context
   3. Generate criteria based on file patterns
    4. Store contract in the current `chunk.json` → `verification.contract`
   ```
   
   **Include contract in specialist prompt:**
   
   When delegating to @developer, include the verification contract in a human-readable format:
   
   ```markdown
   ## Verification Contract
   
   Your work will be verified by:
   1. **Typecheck** — No type errors
   2. **Lint** — No lint errors
   3. **Unit tests** — Tests for [component/module name] must pass
   4. **E2E test** — [If applicable] Page behavior test (runs immediately/deferred)
   
   Write your implementation knowing these criteria will be checked.
   ```
   
   This gives the specialist clear targets and helps them write testable code.

0.5. **Credential gate before implementation:**
   - Check story `requiredCredentials[]` (if present).
   - If any required credential is still `pending`/`deferred`, prompt at the story boundary.
   - For `requestTiming: "after-initial-build"`, this is the first required prompt point.
   - If credential is still unavailable, skip to the next unblocked story and clearly report the block.

1. **Run the workflow steps** from `workflows.prd`:

   ```
   For each step in workflows.prd:
       Execute the step
       If step fails:
           Attempt to fix (run @developer with error context)
           If still fails after 2 attempts:
               Report and ask user
   ```

2. **Post-change actions** run automatically after commit (see `builder.md` → Story Processing Pipeline → Step 4.5, and `test-flow` → Section 5.5):
   - `postChangeActions` in `project.json` defines downstream propagation (support articles, AI tools, marketing pages, pending updates)
   - These fire after the per-story commit in Step 2.5 as part of Pipeline Step 4.5, not during the quality pipeline
   - No story-level flags needed — trigger conditions in `postChangeActions` determine what runs

3. **Update heartbeat** periodically in session lock

4. **Update story todo state (BEFORE commit):**
   - Before implementation: mark current chunk `in_progress` via `todowrite` and update `session.json`
   - After implementation + required checks: mark chunk `completed` in both places
   - **⚠️ This must happen BEFORE Step 2.5 (commit)** to ensure state is included in the commit

5. **Handle developer failures:**
   - If developer fails more than once on a story, analyze the PRD
   - Update `docs/prd.json` with clarifications if needed
   - If developer struggles with cleanup, run @wall-e

### Step 2: Automatic Testing After Story (US-003)

> ⚠️ **Quality checks (including postChangeWorkflow pipeline) already ran above. This step handles additional E2E test generation and deferral.**

Use `test-flow` as the canonical source for all test behavior.

1. Read effective story intensity from `session.json` (`chunks[]` for current chunk).
2. Execute **PRD Mode Test Flow (US-003)** from `test-flow` for any remaining E2E handling.
3. Do not duplicate test logic here. Follow `test-flow` for:
   - E2E test generation based on story intensity
   - E2E deferral to PRD completion (when intensity allows deferral)
   - Retry/fix loops and failure handling
   - `chunk.json` updates for queued tests
4. After test-flow completes for the story, update chunk status in `session.json` to `completed` and continue.

### Step 2.5: Update State & Commit After Each Story

> ⛔ **CRITICAL: Update state files BEFORE committing so they are included in the commit.**
>
> State updates that happen after the commit will be lost if the session ends.
>
> **Failure behavior:** If you find yourself about to run `git commit` without first updating `docs/prd.json` (story status + `passes: true`), `session.json`, `chunk.json`, and `docs/prd-registry.json` — STOP and update those files before committing.

After a story completes and post-story checks pass:

**1. Update all state files FIRST:**

- **`docs/prd.json`** — update the completed story:
  - Set `status: "completed"`
  - Set `completedAt: <ISO timestamp>`
  - Set `passes: true`
  - Add `notes` with brief completion summary (e.g., "Implemented with 3 components, added unit tests")
- **`session.json` + `chunk.json`:**
   - Update current chunk status to `completed` in `session.json`
   - Set `currentChunk` to next chunk (or null if done)
   - Chunk's `chunk.json` already records verification results
   - Update story status in current chunk to `completed`
- **`docs/prd-registry.json`** — update `currentStory` field and increment completed count

**2. Then commit (including state files):**

- Follow **Git Auto-Commit Enforcement** above (respect `git.autoCommit`)
- Use a per-story commit message format:
  - `feat: [prd-summary] (US-00X)`

```bash
# Verify state files are staged before committing
git add -A  # includes prd.json, session.json, chunk.json, prd-registry.json
git status  # confirm state files are in staged changes
git commit -m "feat: [summary from PRD] (US-00X)"
```

**Why this order matters:** If you commit before updating state, and the session ends (crash, rate limit, context compaction), the committed code and PRD state will be out of sync — git will show all stories implemented, but `passes: false` everywhere.

### Step 3: Repeat for All Stories

Continue Steps 1-2 for each story until all are complete.

### Step 4: Boundary Drift Detection During Build

After each story, detect boundary-impacting changes and refresh docs/guardrails as needed:

1. Detect drift signals:
   - new/renamed domain modules
   - cross-layer imports violating policy
   - context ownership changes
2. If drift detected:
   - refresh guardrail artifacts
   - refresh bounded-context docs
3. Record a short change summary in `session.json` (session-level `architecture.boundaryChanges[]`).

### Critic Batching

When to run @critic depends on the configured `criticMode`:

| Mode | When Critic Runs |
|------|------------------|
| `strict` | After every story |
| `balanced` | After story 2, then every 3 stories (5, 8, 11...) |
| `fast` | Only at PRD completion |

**Configuration cascade** (highest priority first):
1. CLI flag: `--critic-mode=strict`
2. Project: `project.json` → `agents.criticMode`
3. Fallback: `balanced`

> ℹ️ **Note:** Rigor profiles are deprecated. Critic mode is now configured directly in `project.json` or via CLI flag. The system automatically determines which critics to run based on file changes (see test-flow skill for activity resolution).

**Balanced mode details:**
- If PRD has ≤2 stories, behave like `fast` (one critic run at end)
- Always run critic at PRD completion regardless of mode

---

## Phase 3: Ship

After all stories are complete, ship the work:

### Step 1: Run Quality Gates

Use commands from `docs/project.json`:

```bash
# Example - actual commands come from project.json
# CI=true prevents watch mode for test runners
npm run typecheck && CI=true npm run test && npm run build
```

### Step 1.5: Run Architecture Guardrail Checks

Run guardrail validation in the same pre-ship gate path:

```bash
# Example commands; use project-defined equivalents when available
npm run lint:architecture || npm run guardrails:check
```

If violations exist:
- attempt auto-fix/update where safe
- re-run checks
- if still failing, stop and report explicit remediation guidance

### Step 1.75: Refresh Bounded-Context Docs if Needed

If boundary-impacting changes were detected during the PRD:

1. Regenerate `docs/architecture/bounded-contexts.md`
2. Regenerate/refresh `docs/architecture/contexts/*.md` if used
3. Include a concise boundary delta summary in ship output

### Step 2: Run ALL Queued E2E Tests

First, gather all queued E2E tests from completed chunks' `chunk.json` files:
- All tests in `pendingTests.e2e.generated[]`
- This includes story E2E tests AND any ad-hoc E2E tests deferred to PRD completion

If no E2E tests are queued (for example, `testing.autoGenerate: false` and no manually added tests), skip this step and continue to Step 2.5.

Start dev server if needed (see Dev Server Management).

Run queued E2E execution and failure handling using `test-flow` retry semantics (max attempts, @developer fix loop, and stop conditions).

### Step 2.5: Run Quality Checks (if enabled) (US-008)

Check `project.json → testing.qualityChecks`:

```json
{
  "testing": {
    "qualityChecks": true  // default: false
  }
}
```

**If `qualityChecks: true`:**

Run @quality-critic with context:
```
Run @quality-critic with:
  devServerUrl: http://localhost:{devPort}  # Get devPort from ~/.config/opencode/projects.json
  changedFiles: [files changed in this PRD/session]
  mode: comprehensive  // for PRD completion
```

@quality-critic will check:
- Accessibility (axe-core) — WCAG 2.1 AA compliance
- Layout Shift (CLS) — cumulative layout shift detection
- Visual Regression — screenshot comparison with baselines
- Performance — FCP, LCP, TTI metrics

**Handle quality check results:**

- If no critical issues → Continue to step 3
- If critical issues → Show prompt with [F]ix / [S]kip options

### Step 3: Commit Final Changes

Commit all remaining changes:

If per-story commits are enabled, ensure there are no uncommitted changes before this step.

```bash
git add -A
git commit -m "feat: [summary from PRD]"
```

### Step 3.5: Generate PRD Completion Report Artifact

Before final completion/archival, generate:

- `docs/completed/[prd-id]/completion-report.md`

Support report modes:
- `detailed` (default)
- `compact` (if configured in project config)

Required report sections:

1. PRD metadata (id, name, completion timestamp)
2. Story-to-acceptance mapping (what shipped)
3. Files and system areas changed
4. Data/migration impact
5. API changes and auth/permission notes
6. UI/UX changes
7. Verification evidence (commands + pass/fail)
8. Deferred items / known issues / follow-ups

Always reference this report path in final Builder completion output.

### Step 4: Push and PR (Git Completion Workflow)

> ⚓ **AGENTS.md: Git Completion Workflow**
>
> This step follows the canonical Git Completion Workflow defined in AGENTS.md.
> Both PRD mode and ad-hoc mode use the same workflow for consistency.

**4a. Validate Configuration (Fail Fast)**

Read `project.json` → `git.agentWorkflow`:

```json
{
  "git": {
    "agentWorkflow": {
      "pushTo": "staging",
      "createPrTo": "main",
      "requiresHumanApproval": ["main", "production"]
    }
  }
}
```

**If `git.agentWorkflow` is not defined:** STOP with Missing Config Error (see AGENTS.md).

**4b. Push to Configured Branch**

Push to the `pushTo` branch:

```bash
git push origin {git.agentWorkflow.pushTo}
```

**4c. Prompt for PR Creation**

**If `createPrTo` differs from `pushTo`**, prompt the user:

```
═══════════════════════════════════════════════════════════════════════
                         PUSH COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ PRD "{prd-name}" pushed to origin/{pushTo}

Your workflow is configured to create PRs to '{createPrTo}'.

[P] Create PR to {createPrTo}
[S] Stay on {pushTo} (no PR yet)

> _
═══════════════════════════════════════════════════════════════════════
```

**If `createPrTo` equals `pushTo`**, skip PR creation (work is already on target branch).

### Step 5: Create PR (if user chooses [P])

Create the PR:

```bash
gh pr create --base {createPrTo} --title "feat: {description from prd.json}" --body "{PR body with story list}"
```

**Update registry status to `pr_open`:**
- Set `status: "pr_open"`
- Store `prNumber` and `prUrl` from `gh pr create` output

**Check if target branch requires human approval:**

| `createPrTo` in `requiresHumanApproval`? | Action |
|------------------------------------------|--------|
| Yes | Report "✅ PR #{number} created. Human approval required to merge." |
| No | Proceed to merge handling (Step 6) |

### Step 6: Handle Merge (if auto-merge allowed)

**If `createPrTo` NOT in `requiresHumanApproval`:**

Check `docs/project.json` → `agents.mergeQueue.enabled` (default: true).

**If merge queue is enabled:**

1. Read `~/.config/opencode/merge-queue.json`

2. Get list of files changed in this branch:
   ```bash
   git diff --name-only origin/<defaultBranch>...HEAD
   ```

3. Check for conflict risk with existing queue entries

4. Create queue entry:
   ```json
   {
     "id": "entry-<random>",
     "projectId": "<current-project-id>",
     "prdId": "<prd-id or null>",
     "branch": "<branch-name>",
     "prNumber": <pr-number>,
     "prUrl": "<pr-url>",
     "status": "queued",
     "priority": "<from prd priority or 'normal'>",
     "queuedAt": "<now>",
     "sessionId": "<session-id>",
     "filesChanged": ["<list of changed files>"],
     "conflictRisk": ["<conflicting entry IDs>"]
   }
   ```

5. Add to `queue` array and save `merge-queue.json`

6. Report: "PR #{number} added to merge queue."

**If merge queue is disabled:**

Merge immediately after CI passes (or call @felix for CI wait).

### Step 7: Report Completion and Update Session

Report the final state:

| Outcome | Message |
|---------|---------|
| Pushed only (no PR) | "Changes pushed to {pushTo}. Create PR when ready. Status: `in_progress`" |
| PR created, awaiting human | "PR #{number} created. Human approval required to merge. Status: `pr_open`" |
| PR created and merged | "PR #{number} merged to {createPrTo}. Status: `completed` (pending cleanup)" |
| PR created, in queue | "PR #{number} added to merge queue. Status: `pr_open`" |

Update session lock to appropriate status based on outcome.

---

## Phase 4: Cleanup (runs on next Builder startup)

When Builder starts, check for PRs that need cleanup:

### Step 1: Check PR Status

Read `docs/prd-registry.json` for PRDs with status `pr_open`.

For each:
- Check if PR was merged: `gh pr view <PR-NUMBER> --json state`

### Step 2: Handle Merged PRs

If `state: "MERGED"`:

1. **Automatic PRD Completion Playwright Execution:**
   
   Check `testVerifySettings.prdUIVerify_PRDCompletionTest` (default: `true` if absent):
   
   - If `true` → Run holistic Playwright tests automatically covering the full PRD's changes. Fix loop continues until pass (max 20 attempts per issue). On exhaustion, STOP and report:
     ```
     ⛔ PLAYWRIGHT FIX LOOP EXHAUSTED
     
     Attempted 20 fixes for the following issue without success:
       [issue description]
     
     Files affected: [list]
     Last error: [error summary]
     ```
   - If `false` → Skip silently with: `⏭️ Skipping PRD completion Playwright tests: testVerifySettings.prdUIVerify_PRDCompletionTest is false`
   
   After Playwright passes (or is skipped), proceed automatically to step 2.

2. **Generate human testing script** (see template below)

3. **Archive the PRD (with rolling window):**
   - Create folder: `docs/completed/[prd-id]/`
   - Move PRD JSON and MD files to archive folder
   - Move the generated `human-testing-script.md` to archive folder
   - **Update registry with rolling window enforcement:**
   
   ```
   PRD completes
       │
       ▼
   Count completed PRDs in registry
       │
       ├─── <5 completed ──► Add to completed[], done
       │
       └─── 5 completed ──► Archive oldest to archived[], add new to completed[]
                            (maintains rolling window of 5)
   ```
   
   **Rolling window steps:**
   1. Read current `completed` array length
   2. If `completed.length >= 5`:
      - Find oldest entry (earliest `completedAt`)
      - Move oldest entry to `archived` array
      - Update `archiveStats` (totalArchived++, update dates)
   3. Add new PRD entry to `completed` array:
      - Set `status: "completed"`, `completedAt: <now>`
      - If E2E was skipped, add `e2eSkipped: true` and `e2eSkipReason: "user-requested"`
   
   **Example jq command for rolling window:**
   ```bash
   # Move oldest from completed to archived when completing prd-123
   jq --arg id "prd-123" --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
     # Find the entry to add
     .prds |= map(if .id == $id then . + {status: "completed", completedAt: $now} else . end)
     | .newEntry = (.prds[] | select(.id == $id))
     | .prds |= map(select(.id != $id))
     
     # Handle rolling window
     | if (.completed | length) >= 5 then
         .oldest = (.completed | sort_by(.completedAt) | first)
         | .archived = ((.archived // []) + [.oldest])
         | .completed = (.completed | map(select(.id != .oldest.id)))
         | .archiveStats.totalArchived = ((.archiveStats.totalArchived // 0) + 1)
         | .archiveStats.newestArchivedAt = .oldest.completedAt
         | if .archiveStats.oldestArchivedAt == null then .archiveStats.oldestArchivedAt = .oldest.completedAt else . end
         | del(.oldest)
       else . end
     
     # Add new entry
     | .completed += [.newEntry]
     | del(.newEntry)
   ' docs/prd-registry.json > docs/prd-registry.json.tmp && mv docs/prd-registry.json.tmp docs/prd-registry.json
   ```

5. **Clear E2E queue from chunk files:**
   - Clear `pendingTests.e2e` from each chunk's `chunk.json`
   - Clear `deferredTo` flag

   > ℹ️ **No top-level verification reset needed.** Per-chunk verification isolation in `chunk.json` means
   > each chunk owns its own `verification.contract` and `verification.results`. When a new task starts,
   > it gets a fresh chunk with clean verification state — no cross-contamination is possible.

6. **Run @prd-impact-analyzer:**
   - Check if completed work unblocks other PRDs
   - Check if conflict risks have changed
   - Update registry accordingly

7. **Remove session lock** from `docs/session-locks.json`

8. **Report and offer to open:**
   ```
   ✅ Cleaned up merged PRD: [prd-name]
   
   📋 Human testing script ready:
      docs/completed/[prd-id]/human-testing-script.md
   
   Would you like me to open it? (y/n)
   ```

### Step 3: Handle Other States

- **If `state: "OPEN"`:** Keep current state, report: "⏳ PR still open"
- **If `state: "CLOSED"` (not merged):** Warn and ask user what to do

### Step 4: Check for Stale Sessions

- `in_progress` with no heartbeat for > 1 hour → warn: "PRD [name] may be abandoned (no heartbeat)"
- `pr_open` for > 24 hours → suggest checking PR status

### Step 5: Check Merge Queue Status

If queued entries exist for this project, show queue status and offer to process.

---

## Handling Ad-hoc Requests During PRD Mode

If user makes an ad-hoc request while a PRD is checked out:

1. **Determine if it's PRD-related:**
   - If the request relates to the current PRD's scope → treat as part of PRD work
   - If it's unrelated → run as ad-hoc (separate from PRD)

2. **For unrelated ad-hoc requests:**
   - Run the `workflows.adhoc` steps
   - **⚠️ PRD PROTECTION: Do NOT modify `docs/prd.json` during ad-hoc work**
   - Commit separately from PRD work
   - Generate an ad-hoc report
   - Return to PRD work when done

3. **Example:**
   ```
   [Working on prd-error-logging]
   
   User: "Oh also, can you fix the typo in the footer?"
   
   Builder: "That's outside the current PRD scope. I'll handle it as ad-hoc.
          Running ad-hoc workflow..."
   
   [Runs adhoc workflow, generates adhoc-2026-02-20-fix-footer-typo.md]
   
   Builder: "✅ Fixed footer typo.
          
          📋 Ad-hoc report: docs/completed/adhoc/adhoc-2026-02-20-fix-footer-typo.md
          
          Continuing with prd-error-logging..."
   ```

---

## Human Testing Script Template

When archiving a completed PRD, generate `human-testing-script.md`:

**Audience:** Non-technical PMs and QA testers.

```markdown
# Testing Script: [Feature Name]

**Feature:** [Human-readable feature name]  
**Completed:** [Date]  
**Tested by:** _________________  
**Test date:** _________________

---

## What Was Built

[2-3 sentences describing what the user can now do]

---

## Before You Start

- [ ] Make sure you're logged into the application
- [ ] [Any setup needed]

---

## Test Scenarios

### Scenario 1: [User goal]

**Starting point:** [Where the user begins]

**Steps:**
1. [Action in plain language]
2. [Next action]
3. [Next action]

**What should happen:**
- [Expected outcome]

**Result:** ☐ Pass  ☐ Fail

---

## Edge Cases to Try

| Try this | Expected behavior |
|----------|-------------------|
| [Edge case] | [What should happen] |

---

## Things That Should Still Work

- [ ] [Related feature 1]
- [ ] [Related feature 2]

---

## Final Check

- [ ] All scenarios passed
- [ ] Edge cases behave correctly  
- [ ] Existing features still work

**Overall result:** ☐ Ready to ship  ☐ Needs fixes
```

---

## PRD History Command

Users can request full PRD history with "show PRD history" or similar phrases.

**Trigger phrases:**
- "show PRD history"
- "show all completed PRDs"
- "list archived PRDs"
- "PRD archive"

**Response format:**

```
═══════════════════════════════════════════════════════════════════════
                        PRD HISTORY
═══════════════════════════════════════════════════════════════════════

Recent (last 5):
  ✅ prd-error-logging        Completed: 2026-03-02
  ✅ prd-user-profile         Completed: 2026-02-28
  ✅ prd-auth-flow            Completed: 2026-02-25
  ✅ prd-dashboard            Completed: 2026-02-20
  ✅ prd-settings             Completed: 2026-02-15

Archived (15 total):
  📦 prd-onboarding           Completed: 2026-02-10
  📦 prd-notifications        Completed: 2026-02-05
  📦 prd-search               Completed: 2026-01-30
  ... (12 more)

View full archive: jq '.archived' docs/prd-registry.json
View PRD details: cat docs/completed/[prd-id]/prd-[id].json
═══════════════════════════════════════════════════════════════════════
```

**Implementation:**

```bash
# Show recent completed (from active registry)
jq -r '.completed[] | "  ✅ \(.id | ljust(25)) Completed: \(.completedAt[:10])"' docs/prd-registry.json

# Show archived summary
ARCHIVED_COUNT=$(jq '.archiveStats.totalArchived // (.archived | length) // 0' docs/prd-registry.json)
echo "Archived ($ARCHIVED_COUNT total):"
jq -r '.archived[:3][] | "  📦 \(.id | ljust(25)) Completed: \(.completedAt[:10])"' docs/prd-registry.json
if [ "$ARCHIVED_COUNT" -gt 3 ]; then
  echo "  ... ($((ARCHIVED_COUNT - 3)) more)"
fi
```

This keeps startup reads minimal (only `completed` array) while allowing full history access on demand.
