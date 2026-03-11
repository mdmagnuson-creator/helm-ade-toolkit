# Git Workflow is Project-Specific

## The Problem

The Builder agent was creating feature branches (`feature/...`) even when the project wanted trunk-based development (commit directly to `main`).

## The Fix

**Always read the project's AGENTS.md FIRST** to determine the git workflow before creating branches or PRs.

### Look for these patterns:

**Trunk-based (commit to main):**
- "Commit directly to `main`"
- "Do NOT create feature branches"
- "trunk-based workflow"

**Branch-based (feature branches → PRs):**
- "Create feature branches from `develop`"
- "Open PRs targeting..."
- Mentions of `develop`, `release/*` branches

### Default behavior if no guidance:

If the project has no git workflow specified, **ask the user** before assuming a workflow.

## Example AGENTS.md section

```markdown
## Git Workflow

**This project uses trunk-based development. Commit directly to `main`.**

- Do NOT create feature branches
- Do NOT create pull requests for normal development
- Commit directly to `main` after each story passes
- Push to `origin main` after committing

The `branchName` field in `docs/prd.json` is ignored. All work happens on `main`.
```

## Affected agents

- Builder (coordinator) - decides whether to create branches
- prd-to-json skill - generates `branchName` field (can be ignored if trunk-based)
- Developer - commits changes (doesn't create branches, just commits)
