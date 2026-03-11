---
name: pending-updates
description: "Process pending project updates from toolkit. Use when user selects [U] from the Planner or Builder dashboard."
---

# Pending Project Updates

Planner discovers pending updates from two sources:

1. **Project-local:** `<project>/docs/pending-updates/*.md` (committed to project, syncs via git)
2. **Central registry:** `$OPENCODE_CONFIG/data/update-registry.json` (committed to toolkit, syncs via git)

Updates are filtered against `<project>/docs/applied-updates.json` to skip already-applied updates.

Both Builder and Planner can apply ANY project update regardless of scope:
- Planning-scope updates (docs, PRD artifacts, metadata)
- Implementation-scope updates (src, tests, config)
- Mixed-scope updates (both)

## Processing Updates

1. **Discover pending updates:**
   - List files from project-local location
   - Read `$OPENCODE_CONFIG/data/update-registry.json` for central registry updates
   - Match registry updates to this project using affinity rules (see "Registry Matching" below)
   - Read `docs/applied-updates.json` to get applied IDs
   - Filter out updates whose ID is already in applied list
   - Merge remaining updates for processing

## Registry Matching

To check if a registry update applies to the current project:

1. Read the update's `affinityRule` (e.g., `desktop-apps`)
2. Look up the rule in `$OPENCODE_CONFIG/data/update-affinity-rules.json`
3. Evaluate the rule against `<project>/docs/project.json`:
   - `condition: "always"` → matches all projects
   - `condition: "equals"` → check `path` equals `value`
   - `condition: "contains"` → check if array at `path` contains `value`
   - `condition: "hasValueWhere"` → check if any object in `path` matches all `where` conditions
4. If matched AND not already applied → include in pending updates
5. Use `templatePath` from registry to read the update content

2. **Process each update:**
   - Read the update file and apply changes
   - No need to route to another agent — handle directly

3. **Todo tracking:**
   - Create one right-panel todo per update file
   - Mirror to `docs/planner-state.json` `uiTodos.items[]` with `flow: "updates"` and `refId: <update filename>`

4. **Record applied update (MANDATORY):**
   After successfully applying an update, record it in `docs/applied-updates.json`:
   ```json
   {
     "schemaVersion": 1,
     "applied": [
       {
         "id": "2026-02-28-add-desktop-app-config",
         "appliedAt": "2026-02-28T10:30:00Z",
         "appliedBy": "planner",
         "updateType": "schema"
       }
     ]
   }
   ```
   - Extract `updateType` from the update file's frontmatter (default: `schema`)
   - If `docs/applied-updates.json` doesn't exist, create it with `schemaVersion: 1`
   - Append to the `applied` array (preserve existing entries)

5. **Delete the update file (if applicable):**
   - If update came from `docs/pending-updates/`: delete the file
   - If update came from central registry: do NOT delete (registry is shared; tracking is via `applied-updates.json`)
   - If user defers or skips: keep the file (don't record in applied-updates.json)

6. **Post-apply verification:**
   - After deleting a completed update file, run a quick listing check for remaining updates
