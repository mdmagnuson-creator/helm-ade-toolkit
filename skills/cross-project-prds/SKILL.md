---
name: cross-project-prds
description: "Create and manage PRDs that span multiple related projects. Use when creating a PRD that affects related projects listed in project.json."
---

# Cross-Project PRDs

When a PRD affects multiple projects, use `relatedProjects` from `project.json` to coordinate.

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

## Creating Pending PRDs in Related Projects

When a feature in project A requires work in related project B:

1. **Create a pending PRD** in the related project:
   ```
   <related-project>/docs/pending-prds/YYYY-MM-DD-<brief-name>.md
   ```

2. **Use this format:**
   ```markdown
   ---
   createdBy: planner
   sourceProject: <current-project-id>
   sourcePrd: prd-<name>
   date: YYYY-MM-DD
   priority: normal
   ---
   
   # Pending PRD: [Title]
   
   ## Context
   
   This PRD was created from [source-project] while working on [source-prd].
   
   ## Scope
   
   [What needs to be done in this related project]
   
   ## Stories
   
   [Draft stories for this project]
   
   ## Dependencies
   
   - Depends on: [source-project]/[source-prd] completion
   - Or: Can be done in parallel
   ```

3. **Commit to the related project:**
   ```bash
   cd "$RELATED_PATH" && git add docs/pending-prds/ && git commit -m "docs(prd): add pending PRD from [source-project]"
   ```

4. **Update source PRD** with cross-project reference:
   ```markdown
   ## Related Work
   
   - [ ] [related-project]: docs/pending-prds/YYYY-MM-DD-<name>.md
   ```

## Relationship Types

| Relationship | When to create pending PRD |
|--------------|---------------------------|
| `documentation-site` | Feature needs docs updates, marketing copy |
| `shared-backend` | Feature needs API changes in shared service |
| `mobile-app` | Feature needs mobile implementation |
| `admin-dashboard` | Feature needs admin UI |
| `shared-library` | Feature needs library updates |

## Constraints

- ❌ Do NOT modify source code in related projects — only create pending PRDs
- ❌ Do NOT assume related project structure — verify via `project.json` first
- ✅ You may create `docs/pending-prds/` directory if it doesn't exist
- ✅ You may commit pending PRDs to related projects (planning artifacts only)
