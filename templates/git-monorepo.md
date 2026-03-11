# Git Workflow: Monorepo

## Branches

- **`main`** — The primary integration branch.
- **`release/{shortcode}-{major.minor.patch}`** — Release branches scoped to a specific package or service (e.g. `release/jn-2.1.0`).

## Working in a Release Branch

When a release branch exists for the work you are doing:

1. Create your feature branch **from the release branch**, not from `main`.
2. Your PR **must target the release branch**, not `main`.
3. Do not merge release branch changes into `main` yourself. That is handled by the release process.

## Autodeploy

Commits pushed to designated branches trigger automatic deployment. Do not push directly to `main` or release branches — always use a PR.
