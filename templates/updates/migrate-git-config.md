# Migrate Git Configuration

This migration removes deprecated `agents.*` git fields and sets up the new `git.agentWorkflow` configuration.

## What to do

This is an **interactive migration**. The agent will guide you through configuration.

### Step 1: Remove deprecated fields

Remove these fields from `docs/project.json` if present:

```json
{
  "agents": {
    "gitWorkflow": "...",      // REMOVE
    "trunkMode": true,         // REMOVE
    "autoCommit": "...",       // REMOVE (keep git.autoCommit if present)
    "autoPush": true           // REMOVE
  }
}
```

### Step 2: Configure git.agentWorkflow (interactive)

If `git.agentWorkflow` is not already configured, ask the user these questions:

```
═══════════════════════════════════════════════════════════════════════
                    GIT WORKFLOW CONFIGURATION
═══════════════════════════════════════════════════════════════════════

This project needs git workflow configuration so agents know where to 
push changes and create PRs.

1. What branch do you work on for development?
   (This is where agents will create feature branches from)
   
   A. main
   B. develop
   C. staging
   D. Other: ___

2. Where should agents push changes?
   (Default: same as work branch)
   
   A. Same branch (direct push to work branch)
   B. Feature branches → [work branch]
   C. Feature branches → staging
   D. Other: ___

3. Where should PRs be created to?
   (Default: same as default branch)
   
   A. main
   B. develop
   C. Same as work branch
   D. Other: ___

4. Which branches require human approval for ALL operations?
   (Agents will BLOCK any push or PR to these branches)
   
   A. main only
   B. main and production
   C. None - agents can push anywhere
   D. Other: ___

═══════════════════════════════════════════════════════════════════════
```

### Step 3: Generate configuration

Based on answers, generate the `git.agentWorkflow` section:

**Example: Trunk-based (solo developer)**
```json
{
  "git": {
    "defaultBranch": "main",
    "agentWorkflow": {
      "workBranch": "main",
      "pushTo": "main",
      "createPrTo": "main",
      "requiresHumanApproval": []
    }
  }
}
```

**Example: Feature branch workflow**
```json
{
  "git": {
    "defaultBranch": "main",
    "agentWorkflow": {
      "workBranch": "develop",
      "pushTo": "develop",
      "createPrTo": "main",
      "requiresHumanApproval": ["main", "production"]
    }
  }
}
```

**Example: Staging-based workflow**
```json
{
  "git": {
    "defaultBranch": "main",
    "agentWorkflow": {
      "workBranch": "staging",
      "pushTo": "staging",
      "createPrTo": "main",
      "requiresHumanApproval": ["main"]
    }
  }
}
```

### Step 4: Present for verification

Show the user the generated config before writing:

```
═══════════════════════════════════════════════════════════════════════
                    PROPOSED GIT WORKFLOW CONFIG
═══════════════════════════════════════════════════════════════════════

Based on your answers, here's your git workflow configuration:

{
  "git": {
    "defaultBranch": "main",
    "agentWorkflow": {
      "workBranch": "staging",
      "pushTo": "staging",
      "createPrTo": "main",
      "requiresHumanApproval": ["main"]
    }
  }
}

This means:
  • Agents work on: staging branch
  • Changes pushed to: staging
  • PRs created to: main
  • Protected branches: main (agents cannot push or PR directly)

[Y] Apply this configuration
[E] Edit (re-answer questions)
[S] Skip (configure later)

> _
═══════════════════════════════════════════════════════════════════════
```

### Step 5: Write to project.json

After user confirms:

1. Read current `docs/project.json`
2. Remove any deprecated `agents.gitWorkflow`, `agents.trunkMode`, `agents.autoCommit`, `agents.autoPush` fields
3. Add/update `git.agentWorkflow` with the new config
4. Ensure `git.defaultBranch` is set
5. Write back to `docs/project.json`

## Files affected

- `docs/project.json`

## Why

The old `agents.*` git configuration fields have been replaced with a clearer `git.agentWorkflow` structure that:

- Explicitly defines branch targets (no implicit defaults)
- Separates push targets from PR targets
- Clearly marks protected branches
- Works consistently across all agents

Without this configuration, agents will BLOCK git operations and prompt you to configure.

## Verification

Run this command to verify the configuration:

```bash
jq '.git.agentWorkflow' docs/project.json
```

Expected output:
```json
{
  "workBranch": "...",
  "pushTo": "...",
  "createPrTo": "...",
  "requiresHumanApproval": [...]
}
```

Also verify deprecated fields are removed:

```bash
jq '.agents | keys | map(select(. == "gitWorkflow" or . == "trunkMode" or . == "autoCommit" or . == "autoPush"))' docs/project.json
```

Expected output: `[]` (empty array)
