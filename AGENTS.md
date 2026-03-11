# Global Agent Guardrails

## Protected System Resources

> ⛔ **CRITICAL: Never access protected macOS resources**
>
> Do NOT access anything that would trigger a macOS permission prompt.
> These operations block automated workflows and require user intervention.

**Never access:**
- `~/Desktop/`, `~/Documents/`, `~/Downloads/`
- `~/Library/`
- Contacts, Calendar, Reminders, Photos, Mail
- Screen recording or accessibility APIs
- Other applications via AppleScript/osascript
- Clipboard (`pbcopy`/`pbpaste`) in automated scripts
- Keychain or credential stores
- System notifications

**Safe alternatives:**
- Store files in the project directory or `<project>/.tmp/` (never system `/tmp/`)
- Use environment variables for secrets
- Write output to files instead of clipboard
- Log to files instead of system notifications

If a command requires system access, stop and tell the user to run it manually.

## Temporary Files

> ⛔ **CRITICAL: Never use system temp directories**
>
> Do NOT write to `/tmp/`, `/var/folders/`, or any system temporary directory.
> This includes debug scripts, diagnostic files, log output, and any transient artifacts.

Use project-local `.tmp/` for temporary artifacts.

**Why this matters:**
- Scripts in `/tmp/` cannot resolve project dependencies (`node_modules`, Go modules, etc.) — they will fail with `ERR_MODULE_NOT_FOUND`
- `/tmp/` is outside OpenCode's allowed paths and triggers permission prompts
- macOS maps `/tmp/` to `/private/tmp/`, adding further confusion

Rules:
- Use `.tmp/` in the project root for all temporary files
- Create subdirectories as needed (`.tmp/screenshots/`, `.tmp/logs/`, `.tmp/scripts/`)
- Ensure `.tmp/` is listed in `.gitignore`
- Clean up temp files when no longer needed

## Global Coding Behavior

- Do not over-comment; add comments only for non-obvious logic
- Exported functions/classes must include language-standard doc comments
- When using external libraries, use a documentation lookup tool if available
- If a docs tool is not available, use primary upstream docs and project source references as fallback

## AWS CLI Sessions

If a command fails due to expired AWS credentials or requires `aws sso login`, stop and tell the user to refresh credentials manually.

## Project Memory

Use `docs/memory/` to capture non-obvious lessons:
- gotchas/footguns
- hidden config constraints
- workarounds and rationale

Do not store obvious code facts, temporary notes, or duplicate docs.

## Cross-Service Blast Radius Checks

Before changing APIs, message schemas, shared contracts, or inter-service integrations:
- Use semantic code search tooling if configured
- If unavailable, fall back to repository-native search (`grep`, project indexes, dependency maps)
- Do not assume blast radius; verify it

## Visual Verification for UI Changes

Any user-visible UI change must be visually verified before committing.

Minimum checks:
1. Capture a screenshot (qa-explorer or screenshot workflow)
2. Review result directly
3. Check key states (hover/active/disabled/loading/error/empty)
4. Check edge cases (long text, dense data, small viewports)

## Git Auto-Commit Enforcement

> ⛔ **CRITICAL: Check `git.autoCommit` setting before ANY commit operation**
>
> **Trigger:** Before running `git commit`, `git add && git commit`, or any commit delegation.
>
> **Check:** Read `project.json` → `git.autoCommit`
>
> **Failure behavior:** Running `git commit` when autoCommit is `manual` or `false` violates a harsh project constraint.

### Auto-Commit Modes

| Value | Behavior |
|-------|----------|
| `onStoryComplete` | (default) Commit after each completed PRD story or ad-hoc task |
| `onFileChange` | Commit after each file modification — more granular history |
| `manual` | Stage changes but do NOT run `git commit` (see protocol below) |
| `true` | (legacy) Same as `onStoryComplete` |
| `false` | (legacy) Same as `manual` |

### When `manual` or `false`:

1. Stage changes: `git add <files>`
2. Report what would be committed:
   ```
   📋 READY TO COMMIT (manual commit required)
   
   Staged files:
     - src/components/Button.tsx
     - src/styles/button.css
   
   Suggested commit message:
     feat: add Button component with hover states
   
   Run: git commit -m "feat: add Button component with hover states"
   ```
3. **Do NOT run `git commit`** — wait for user to commit manually

## Git Workflow Enforcement

> ⛔ **CRITICAL: Validate branch targets before ANY git push or PR operation**
>
> **Trigger:** Before running `git push`, `gh pr create`, or any auto-merge.
>
> **Check:** Read `project.json` → `git.agentWorkflow`
>
> **Failure behavior:** BLOCK the operation and show the appropriate error. No fallbacks, no warnings — hard stop.

### Validation Protocol

**Before `git push [branch]`:**
1. Read `project.json` → `git.agentWorkflow`
2. If `git.agentWorkflow` not defined: BLOCK (Missing Config Error)
3. If target branch in `requiresHumanApproval`: BLOCK (Protected Branch Error)
4. If target branch ≠ `pushTo`: BLOCK (Wrong Target Error)
5. Proceed only if all checks pass

**Before `gh pr create --base [branch]`:**
1. Read `project.json` → `git.agentWorkflow`
2. If `git.agentWorkflow` not defined: BLOCK (Missing Config Error)
3. If `--base` branch ≠ `createPrTo`: BLOCK (Wrong Target Error)
4. If `--base` branch in `requiresHumanApproval`: ALLOW PR creation, but do NOT auto-merge (see below)
5. Proceed only if all checks pass

**Before auto-merge (`gh pr merge`):**
1. If target branch in `requiresHumanApproval`: BLOCK (human must merge)
2. Report: "PR created. Human approval required to merge."

> ⚠️ **Important distinction:**
> - **Direct push** to protected branch → BLOCKED
> - **Create PR** to protected branch → ALLOWED
> - **Auto-merge PR** to protected branch → BLOCKED (human must approve and merge)

### Default Cascade

When fields are not explicitly set:
- `pushTo` defaults to `workBranch`
- `workBranch` defaults to `defaultBranch`
- `createPrTo` defaults to `defaultBranch`

### Error Formats

**Missing Config Error:**
```
⛔ GIT WORKFLOW NOT CONFIGURED

This project requires git workflow configuration before I can perform git operations.

Please describe your git workflow:
1. What branch do you work on? (e.g., main, staging, develop)
2. Where should I push changes? (e.g., same branch, staging branch)
3. Where should PRs be created to? (e.g., main)
4. Which branches require human approval? (e.g., main, production)

I'll generate the configuration for your review.
```

**Protected Branch Error:**
```
⛔ PROTECTED BRANCH — HUMAN APPROVAL REQUIRED

Attempted: git push origin main
Branch 'main' is in requiresHumanApproval — all agent operations are blocked.

This project's workflow:
  - Work on: staging
  - Push to: staging
  - Create PRs to: main (requires human approval)

To proceed:
  1. Push to staging: git push origin staging
  2. Create PR: gh pr create --base main
  3. Get human approval and merge

Source: docs/project.json → git.agentWorkflow.requiresHumanApproval
```

**Wrong Target Error:**
```
⛔ GIT WORKFLOW VIOLATION

Attempted: git push origin develop
Configured target: staging (from git.agentWorkflow.pushTo)

This project's workflow:
  - Work on: staging
  - Push to: staging
  - Create PRs to: main

To proceed correctly:
  git push origin staging

Source: docs/project.json → git.agentWorkflow
```

## Git Completion Workflow

> ⚓ **Canonical workflow for shipping completed work**
>
> Both PRD mode and ad-hoc mode MUST follow this exact workflow.
> This ensures consistent behavior regardless of how work was initiated.

This workflow runs after all implementation and testing is complete. It handles commit, push, and PR creation according to project settings.

### Prerequisites

Before starting this workflow:
- All tests have passed (unit, E2E, quality checks as configured)
- All changes are ready to commit
- `project.json` → `git.agentWorkflow` is configured (see fail-fast below)

### Step 1: Validate Configuration (Fail Fast)

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

**If `git.agentWorkflow` is not defined:** STOP immediately with Missing Config Error (see Git Workflow Enforcement above).

### Step 2: Commit Changes

Check `project.json` → `git.autoCommit` (see Git Auto-Commit Enforcement above):

| Mode | Action |
|------|--------|
| `onStoryComplete`, `onFileChange`, `true` | Run `git add -A && git commit -m "[message]"` |
| `manual`, `false` | Stage only, report suggested commit message, wait for user |

### Step 3: Push to Configured Branch

Push to the `pushTo` branch:

```bash
git push origin {git.agentWorkflow.pushTo}
```

If push fails due to conflicts or rejected push, report the error and stop.

### Step 4: Prompt for PR Creation

**If `createPrTo` differs from `pushTo`**, prompt the user:

```
═══════════════════════════════════════════════════════════════════════
                         PUSH COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ Pushed to origin/{pushTo}

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
gh pr create --base {createPrTo} --title "[title]" --body "[body]"
```

**Check if target branch requires human approval:**

| `createPrTo` in `requiresHumanApproval`? | Action |
|------------------------------------------|--------|
| Yes | Create PR, report "PR created. Human approval required to merge.", do NOT auto-merge |
| No | Create PR, auto-merge is allowed (per project merge settings) |

### Step 6: Handle Merge (if applicable)

If auto-merge is allowed (target NOT in `requiresHumanApproval`):

| Project Setting | Action |
|----------------|--------|
| Merge queue enabled | Add to merge queue |
| No merge queue | Merge immediately after CI passes |

If auto-merge is blocked (target in `requiresHumanApproval`):

```
✅ PR #{number} created: {url}

Human approval required to merge to '{createPrTo}'.
```

### Step 7: Report Completion

Report the final state:

| Outcome | Message |
|---------|---------|
| Pushed only (no PR) | "Changes pushed to {pushTo}. Create PR when ready." |
| PR created, awaiting human | "PR #{number} created. Human approval required to merge." |
| PR created and merged | "PR #{number} merged to {createPrTo}." |
| PR created, in queue | "PR #{number} added to merge queue." |

---

## Test Failure Output Policy

> ⛔ **IMPORTANT: Never truncate test failure output**
>
> When tests fail, show the **complete failure output** — every failing test, every error message, every stack trace.
> Do not summarize, truncate, or omit failure details.
>
> - Successful test runs: summarize (e.g., "42 tests passed")
> - Failed test runs: show full output, no truncation
>
> Truncating test failures defeats the purpose of running tests.

## Requesting Toolkit Updates

If you discover a needed toolkit change (agent bug, missing capability, etc.), **do not modify toolkit files directly**. Instead:

1. Write a request file to `~/.config/opencode/pending-updates/`:
   ```
   ~/.config/opencode/pending-updates/YYYY-MM-DD-{agent-name}-description.md
   ```

2. Use this format:
   ```markdown
   ---
   requestedBy: {agent-name}
   date: YYYY-MM-DD
   priority: normal
   ---
   
   # Update Request: [Brief Title]
   
   ## What to change
   
   [Describe the change in detail]
   
   ## Files affected
   
   - `agents/{agent-name}.md` — [change description]
   
   ## Why
   
   [Why this change is needed]
   ```

3. Tell the user: "I've queued a toolkit update request. Next time you run @toolkit, it will offer to apply it."

## Instruction Ownership

This root file defines universal guardrails only.

- Specialist implementation rules belong to implementation agents/templates
- Specialist review criteria belong to critic agents
- Project-specific behavior belongs in each project's `docs/CONVENTIONS.md`
