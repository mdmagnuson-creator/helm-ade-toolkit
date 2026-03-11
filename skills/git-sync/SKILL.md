---
name: git-sync
description: "Team synchronization for multi-machine collaboration. Provides pull/push protocols for keeping repos in sync across team members. Load this skill when git.teamSync.enabled is true in project.json."
---

# Git Sync Skill

> ⚠️ **Team Sync Check**
>
> Before using this skill, check `project.json` → `git.teamSync.enabled`.
> - If `false` or missing: **Skip this skill entirely** — no team sync needed.
> - If `true`: Continue with team synchronization protocols.

> ⛔ **Auto-Commit Check**
>
> If `project.json` → `git.autoCommit` is `false`, this skill must NOT run any `git commit` commands.
> When autoCommit is disabled, only perform `git pull` and `git push` operations on user-committed changes.

This skill provides git pull/push protocols for teams working on the same repository from different machines.

## Overview

When team sync is enabled, agents will:
1. **Pull** latest changes at session start and before/after commits
2. **Push** after commits (with user confirmation if configured)
3. **Stop and alert** on conflicts (safest default)

## Configuration

In `project.json` → `git.teamSync`:

```json
{
  "git": {
    "teamSync": {
      "enabled": true,
      "pullBeforeWork": true,
      "pushAfterCommit": true,
      "confirmBeforePush": true,
      "pushRetries": 3,
      "conflictBehavior": "stop-and-alert"
    }
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `false` | Master switch for team sync |
| `pullBeforeWork` | `true` | Pull at session start and around commits |
| `pushAfterCommit` | `true` | Push after each commit |
| `confirmBeforePush` | `true` | Ask user before pushing |
| `pushRetries` | `3` | Retry count for network failures |
| `conflictBehavior` | `stop-and-alert` | How to handle conflicts |

---

## Sync Points by Agent

| Agent | When to Pull | When to Push |
|-------|--------------|--------------|
| **Planner** | Session start, before PRD read | After PRD create/modify/move (auto-commit) |
| **Builder** | Session start, before/after implementation commits | After implementation commits |
| **Toolkit** | Session start | After toolkit changes |

---

## Pull Protocol

Run this protocol at sync points. Returns one of: `synced`, `conflict`, `error`.

### Step 1: Fetch Remote

```bash
git fetch origin
```

### Step 2: Check Status

```bash
# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Count commits behind
BEHIND=$(git rev-list HEAD..origin/$BRANCH --count 2>/dev/null || echo "0")

# Check for local changes
LOCAL_CHANGES=$(git status --porcelain)
```

### Step 3: Sync Decision Tree

```
If BEHIND = 0:
  → Already up to date, return "synced"

If BEHIND > 0 AND LOCAL_CHANGES is empty:
  → Safe to fast-forward
  → Run: git pull --ff-only origin $BRANCH
  → Return "synced"

If BEHIND > 0 AND LOCAL_CHANGES is not empty:
  → Conflict scenario, check conflictBehavior setting
```

### Step 4: Handle Conflicts (when local changes exist)

Based on `git.teamSync.conflictBehavior`:

**`stop-and-alert` (default, safest):**
```
⚠️ GIT SYNC CONFLICT

Your branch is behind origin by {BEHIND} commits, but you have local changes.

Local changes:
{git status --short}

Options:
1. Stash changes, pull, then reapply: git stash && git pull && git stash pop
2. Commit local changes first, then merge: git add -A && git commit -m "WIP" && git pull
3. Discard local changes and pull: git checkout . && git pull

Please resolve manually and restart the session.
```
Return `conflict` and **STOP** — do not continue the workflow.

**`auto-merge`:**
```bash
git stash
git pull --rebase origin $BRANCH
git stash pop
```
If merge conflict occurs during rebase or stash pop, fall back to `stop-and-alert`.

**`stash-and-alert`:**
```bash
git stash -m "Auto-stash before sync $(date +%Y%m%d-%H%M%S)"
git pull --ff-only origin $BRANCH
```
Alert user: "Local changes stashed. Run `git stash pop` to restore."
Return `synced`.

---

## Push Protocol

Run this protocol after commits. Returns one of: `pushed`, `conflict`, `error`.

### Step 1: Pre-Push Pull

Always pull before pushing to minimize conflicts:

```bash
git fetch origin
BEHIND=$(git rev-list HEAD..origin/$BRANCH --count 2>/dev/null || echo "0")

if [ "$BEHIND" -gt 0 ]; then
  git pull --rebase origin $BRANCH
fi
```

If rebase conflicts occur:
```
⚠️ REBASE CONFLICT

Cannot automatically merge remote changes. 

Please resolve manually:
1. Fix conflicts in the listed files
2. Run: git add . && git rebase --continue
3. Or abort: git rebase --abort

Then restart the session.
```
Return `conflict` and **STOP**.

### Step 2: Confirm (if configured)

If `git.teamSync.confirmBeforePush` is `true`:

```
Ready to push to origin/{BRANCH}:

{git log origin/$BRANCH..HEAD --oneline}

Push these commits? (y/n)
```

Wait for user confirmation. If `n`, return without pushing but don't treat as error.

### Step 3: Push with Retries

```bash
RETRIES=3  # from git.teamSync.pushRetries
ATTEMPT=1

while [ $ATTEMPT -le $RETRIES ]; do
  if git push origin $BRANCH; then
    echo "✅ Pushed successfully"
    return "pushed"
  fi
  
  echo "Push failed (attempt $ATTEMPT/$RETRIES), retrying in 5s..."
  sleep 5
  ATTEMPT=$((ATTEMPT + 1))
done

# All retries exhausted
echo "❌ Push failed after $RETRIES attempts"
```

### Step 4: Handle Push Failure

After all retries exhausted:

```
⚠️ PUSH FAILED

Could not push to origin/{BRANCH} after {RETRIES} attempts.

Possible causes:
- Network connectivity issues
- Remote rejected the push (force push required?)
- Authentication expired

Your commits are saved locally. Please push manually when connectivity is restored:
  git push origin {BRANCH}

Continuing with local work...
```

Return `error` but **do not stop** — the work is saved locally.

---

## Planner PRD Auto-Commit

When Planner creates or modifies PRD artifacts, it should auto-commit and push.

### Files to Auto-Commit

| Path Pattern | Trigger |
|--------------|---------|
| `docs/drafts/*.md` | PRD draft created/modified |
| `docs/drafts/*.json` | PRD draft JSON created/modified |
| `docs/prds/*.md` | PRD moved to ready |
| `docs/prds/*.json` | PRD JSON moved to ready |
| `docs/bugs/*.md` | Bug PRD created/modified |
| `docs/bugs/*.json` | Bug PRD JSON created/modified |
| `docs/completed/*` | PRD archived |
| `docs/abandoned/*` | PRD abandoned |
| `docs/prd-registry.json` | Registry updated |

### Commit Message Format

```
docs(prd): {action} {prd-name}

Examples:
- docs(prd): create draft user-authentication
- docs(prd): refine draft user-authentication  
- docs(prd): move user-authentication to ready
- docs(prd): archive completed user-authentication
- docs(prd): create bug login-redirect-loop
```

### Auto-Commit Flow

```
1. Stage PRD files:
   git add docs/drafts/ docs/prds/ docs/bugs/ docs/completed/ docs/abandoned/ docs/prd-registry.json

2. Check if anything staged:
   git diff --cached --quiet && echo "Nothing to commit" && exit

3. Commit:
   git commit -m "docs(prd): {action} {prd-name}"

4. Run Push Protocol (with confirmation if configured)
```

---

## Builder Sync Integration

Builder should sync at these points:

### Session Start
1. Run Pull Protocol
2. If `conflict` returned, stop and show resolution instructions
3. If `synced`, continue to project selection

### Before Each Commit
1. Run Pull Protocol (to minimize merge conflicts)
2. If `conflict`, stop and alert

### After Each Commit
1. Run Push Protocol
2. If `error` (network), continue working (commits are local)
3. If `conflict`, stop and alert

---

## Toolkit Sync Integration

Toolkit already pushes after changes. With team sync:

### Session Start
1. Run Pull Protocol for yo-go repository
2. If `conflict`, stop and alert

### After Toolkit Changes
1. Commit (existing behavior)
2. Run Push Protocol
3. If `error`, alert but changes are committed locally

---

## Troubleshooting

### "Your branch is behind" but no local changes

Safe to fast-forward:
```bash
git pull --ff-only
```

### "Your branch has diverged"

Branches have diverged (both local and remote have new commits):
```bash
# Option 1: Rebase local on top of remote
git pull --rebase

# Option 2: Merge (creates merge commit)
git pull

# Option 3: See what diverged
git log HEAD..origin/main --oneline  # Remote commits
git log origin/main..HEAD --oneline  # Local commits
```

### Push rejected (non-fast-forward)

Remote has commits you don't have:
```bash
git pull --rebase
git push
```

### Authentication expired

```bash
# For HTTPS with credential helper
git credential reject https://github.com

# For SSH, check agent
ssh-add -l
ssh-add ~/.ssh/id_ed25519

# Re-authenticate
git push  # Will prompt for credentials
```

---

## Example: Full Planner Session with Sync

```
1. Session start
   ├─ git fetch origin
   ├─ Check: 2 commits behind, no local changes
   ├─ git pull --ff-only origin main
   └─ ✅ Synced

2. User creates new PRD draft
   ├─ Write docs/drafts/prd-user-auth.md
   ├─ Update docs/prd-registry.json
   ├─ git add docs/drafts/ docs/prd-registry.json
   ├─ git commit -m "docs(prd): create draft user-auth"
   ├─ Confirm push? (y)
   ├─ git push origin main
   └─ ✅ Pushed

3. User refines PRD
   ├─ Edit docs/drafts/prd-user-auth.md
   ├─ git add docs/drafts/prd-user-auth.md
   ├─ git commit -m "docs(prd): refine draft user-auth"
   ├─ Confirm push? (y)
   ├─ git push origin main
   └─ ✅ Pushed

4. User moves PRD to ready
   ├─ git mv docs/drafts/prd-user-auth.md docs/prds/
   ├─ Update docs/prd-registry.json status
   ├─ git add -A
   ├─ git commit -m "docs(prd): move user-auth to ready"
   ├─ Confirm push? (y)
   ├─ git push origin main
   └─ ✅ Pushed
```
