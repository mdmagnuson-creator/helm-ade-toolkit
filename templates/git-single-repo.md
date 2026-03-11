# Git Workflow: Single Project Repo

## Branches and Environments

| Branch | Environment |
|---|---|
| `main` | Dev, Test, Stage, Production |

## Workflow

1. Create short-lived feature branches from `main`.
2. Open PRs targeting `main`.
3. Keep branches small and merge quickly after checks pass.
4. Deploy from `main`.

## Autodeploy

Commits pushed to designated branches trigger automatic deployment. Do not push directly to `main` — always use a PR.
