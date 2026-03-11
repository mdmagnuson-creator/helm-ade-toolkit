# Helm ADE Toolkit

AI agent toolkit for Helm ADE — the autonomous development environment for macOS.

This repo contains the agents, skills, schemas, and scaffolds that power Helm's AI capabilities. Helm auto-clones this repo on first launch and keeps it updated via `git pull`.

## What's Inside

| Directory | Description |
|-----------|-------------|
| `agents/` | Autonomous agents for planning, implementation, testing, review, and operations |
| `skills/` | Reusable skills for workflow guidance and generation |
| `schemas/` | JSON schemas for manifests and workflow artifacts |
| `scaffolds/` | Project scaffold templates |
| `scripts/` | Utility scripts used by agents |
| `data/` | Reference data (update registry, affinity rules, skill mappings) |
| `templates/` | Project templates |

## How Helm Uses This

1. **First launch**: Helm clones this repo into its application support directory
2. **Every launch**: Helm runs `git pull` to check for updates
3. **Runtime**: Helm sets `XDG_CONFIG_HOME` so opencode reads agents/skills from the local clone
4. **Isolation**: Each Helm installation has its own config (mutable state like `applied-updates.json` is not in this repo)

## Manual Update Check

Helm includes a "Check for Toolkit Updates" button in Settings. This triggers a `git pull` on the local clone.
