---
title: Migrate to postChangeActions for downstream propagation
updateType: schema
interactive: true
---

# Migrate to `postChangeActions`

## What changed

The toolkit now uses `postChangeActions` in `project.json` for downstream propagation after commits. This replaces:

- **Story-level flags** (`supportArticleRequired`, `toolsRequired`, `marketingRequired` in PRD stories)
- **`conditionalSteps`** in `workflows` (custom `runWhen`/`agent`/`requires` format)
- **Workflow step enum values** `support-article`, `tools`, `marketing` (removed from `workflows.prd`/`workflows.adhoc`)

Post-change actions run **after commit** (not during the quality pipeline), firing once per commit to propagate changes to related projects, invoke specialist agents, run commands, or notify users.

## What to do

### 1. Remove old workflow overrides (if present)

If your `workflows.prd` or `workflows.adhoc` arrays include `"support-article"`, `"tools"`, or `"marketing"`, remove them:

```json
// BEFORE
"workflows": {
  "prd": ["build", "critic", "tester", "typecheck", "lint", "test", "support-article", "tools", "marketing", "visual-verify", "commit"]
}

// AFTER
"workflows": {
  "prd": ["build", "critic", "tester", "typecheck", "lint", "test", "visual-verify", "commit"]
}
```

### 2. Remove custom conditionalSteps (if present)

If your project has a custom `conditionalSteps` section in `workflows`, remove it entirely. Its functionality is now covered by `postChangeActions`.

### 3. Add postChangeActions (interactive)

Based on your project's capabilities, add a `postChangeActions` array. Ask the user which downstream propagation they need:

**For projects with `capabilities.supportDocs: true`:**
```json
{
  "type": "agent",
  "name": "update-support-articles",
  "trigger": { "condition": "user-facing-change" },
  "agent": "@support-article-writer",
  "prompt": "Review changed files and create/update support articles as needed."
}
```

**For projects with `capabilities.ai: true` and `capabilities.aiTools` configured:**
```json
{
  "type": "agent",
  "name": "update-ai-tools",
  "trigger": { "condition": "feature-change" },
  "agent": "@tools-writer",
  "prompt": "Review changed files and update AI tool definitions as needed."
}
```

**For projects with `capabilities.marketing: true` or `relatedProjects` with `documentation-site`:**
```json
{
  "type": "pending-update",
  "name": "sync-marketing-site",
  "trigger": { "condition": "feature-change" },
  "targetProject": "<related-project-id>",
  "template": "Sync documentation for changes in {changedFiles}"
}
```

**For projects with native app builds (`relatedProjects` with `native-app`):**
```json
{
  "type": "command",
  "name": "rebuild-native-app",
  "trigger": { "condition": "files-changed-in", "pathPatterns": ["src/shared/**", "src/api/**"] },
  "command": "cd <native-app-path> && xcodebuild ...",
  "failureMode": "warn"
}
```

### 4. Remove story-level flags from PRD templates (if used)

If your project's PRD templates include `supportArticleRequired`, `toolsRequired`, or `marketingRequired` on stories, these flags are no longer checked. You can remove them from future PRDs (existing PRDs don't need migration — the flags are simply ignored).

## Why

The old approach scattered downstream propagation across three mechanisms:
1. Story flags checked in prd-workflow (lines 349-352)
2. `conditionalSteps` in workflow-defaults.json
3. Custom project-level workflow hacks (e.g., flooringsoft-scheduler's `doc-verify-loop`)

`postChangeActions` unifies these into one configurable, project-defined mechanism that:
- Runs after commit (correct timing — propagation should happen after code is committed)
- Uses trigger conditions (no need for story-level flags)
- Supports multiple action types (pending-update, agent, command, notify)
- Is fully schema-validated

## Verification

Run: `jq '.postChangeActions' docs/project.json` — should return array of actions (or null if project doesn't need downstream propagation)

Verify old fields are removed:
- `jq '.workflows.prd | map(select(. == "support-article" or . == "tools" or . == "marketing"))' docs/project.json` — should return `[]`
- Check that no `conditionalSteps` key exists in `workflows`

## What happens if you don't apply this

- Story-level flags (`supportArticleRequired`, etc.) are no longer checked — support articles/tools/marketing won't auto-run
- If you had custom `conditionalSteps`, they are no longer processed
- No breakage in the quality pipeline — typecheck/lint/test/critic/e2e continue to work normally
