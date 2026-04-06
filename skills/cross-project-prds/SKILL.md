---
name: cross-project-prds
description: "Create and manage PRDs that span multiple related projects. Use when creating a PRD that affects related projects listed in project.json."
---

# Cross-Project PRDs

When a PRD affects multiple projects, use `relatedProjects` from `project.json` to coordinate.

## Prerequisites

> ⛔ **CRITICAL: This skill requires MCP PRD tools.**
>
> Before performing any PRD operations, verify the `prd_*` and `query_prds` tools are available.
> If tools are not available, STOP and report:
> ```
> ⛔ MCP PRD tools not available. Cannot perform PRD operations 
> without Supabase connection. Ensure the MCP server is running and 
> HELM_SUPABASE_URL is set.
> ```
>
> **Do NOT fall back to file I/O** — if the tools fail, stop.

## Resolving Related Projects

1. Read current project's `project.json` → `relatedProjects`
2. For each related project needed:
   - Extract `path` from the relationship entry
   - Verify project exists and has agent system (`docs/project.json` present)

```bash
# Example: Find documentation site for current project
RELATED_PATH=$(jq -r '.relatedProjects[] | select(.relationship == "documentation-site") | .path' docs/project.json)
# Verify the related project exists
ls "$RELATED_PATH/docs/project.json"
```

> **Note:** In Helm ADE, `relatedProjects` entries must include the absolute `path` to each related project. There is no central project registry.

## Querying PRDs Across Projects

Since Supabase is the single source of truth, you can query PRDs across all projects in the same org:

```
# List all PRDs (spans all projects in org)
query_prds({ limit: 100 })

# Get a specific PRD from any project
query_prds({ prdId: "prd-[name]" })
query_prd_stories({ prdId: "prd-[name]" })
```

This eliminates the need to read PRD files from related project directories.

## Creating Dependent PRDs in Related Projects

When a feature in project A requires work in related project B:

1. **Create a dependent PRD** in Supabase for the related project:
   ```
   prd_create({
     prdId: "prd-[related-feature-name]",
     title: "[Title]",
     status: "draft",
     contentMarkdown: "...",
     notes: "{\"sourceProject\": \"[project-a-id]\", \"sourcePrd\": \"prd-[name]\", \"dependency\": true}"
   })
   ```

2. **Link the PRDs** by updating the source PRD:
   ```
   prd_updateContent({
     prdId: "prd-[name]",
     notes: "{\"relatedPrds\": [\"prd-[related-feature-name]\"]}"
   })
   ```

3. **Commit configuration to the related project** (if needed):
   ```bash
   cd "$RELATED_PATH" && git add docs/ && git commit -m "docs(prd): link dependent PRD from [source-project]"
   ```

## Relationship Types

| Relationship | When to create dependent PRD |
|--------------|---------------------------|
| `documentation-site` | Feature needs docs updates, marketing copy |
| `shared-backend` | Feature needs API changes in shared service |
| `mobile-app` | Feature needs mobile implementation |
| `admin-dashboard` | Feature needs admin UI |
| `shared-library` | Feature needs library updates |

## Constraints

- ❌ Do NOT modify source code in related projects — only create dependent PRDs
- ❌ Do NOT assume related project structure — verify via `project.json` first
- ✅ You may create dependent PRDs via `prd_create`
- ✅ You may commit planning configuration to related projects
