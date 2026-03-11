# PRD: Enhanced Pending Updates System

## Introduction

Enhance the project-updates system so that schema changes automatically flag affected projects, updates are tracked across machines, and Builder/Planner can seamlessly detect and apply pending updates.

Currently, when @toolkit makes schema changes (e.g., adding `executablePath` to support Electron testing), the maintainer must:
1. Manually identify which projects are affected
2. Manually create update files in `project-updates/{project-id}/`
3. Hope the same machine runs @builder/@planner to apply them (updates are gitignored)
4. Accept that applied updates leave no trace (file is deleted)

This PRD addresses three gaps:
- **Manual detection** — No automatic project→schema affinity detection
- **Local-only tracking** — `project-updates/` is gitignored; updates don't sync across machines
- **No applied-update history** — When an update is deleted after application, there's no record it was ever applied

## Goals

- Automatically detect which projects are affected by schema changes using JSONPath-based affinity rules
- Track applied updates in each project repository via `docs/applied-updates.json` (committed)
- Enable any machine to know which updates have been applied vs pending
- Reduce manual work when releasing schema updates
- Maintain backward compatibility with existing `project-updates/` location during transition
- Design for future extensibility (CVE scanning, cross-project dependencies)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Affinity detection | JSONPath-based rules | Precise targeting (e.g., "desktop apps missing executablePath") |
| Tracking location | `docs/applied-updates.json` per project | Syncs via git, project-scoped |
| Update ID format | Filename-based (`YYYY-MM-DD-description`) | Human-readable, sortable, unique |
| Scope | Schema→project updates (extensible) | Solves immediate pain, future-proof for CVE/deps |
| Discovery | Local project + remote sync | Best of both: git sync + toolkit registry |

---

## User Stories

### US-001: Track applied updates in project repository

**Description:** As a developer working on multiple machines, I want applied updates to be tracked in the project repo so that pulling the project shows me what's already been applied.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] When Builder/Planner applies an update, record it in `docs/applied-updates.json`
- [ ] Applied-updates file is committed alongside the update changes
- [ ] On startup, Builder/Planner reads applied-updates to skip already-applied updates
- [ ] Format:
  ```json
  {
    "schemaVersion": 1,
    "applied": [
      {
        "id": "2026-02-28-add-desktop-app-config",
        "appliedAt": "2026-02-28T10:30:00Z",
        "appliedBy": "builder",
        "updateType": "schema"
      }
    ]
  }
  ```
- [ ] Include `schemaVersion` for future format evolution
- [ ] Include `updateType` field for extensibility (`schema`, `dependency`, `cve` in future)

### US-002: Store pending updates in project repositories

**Description:** As a toolkit maintainer, I want project-specific updates stored in each project's repo so they sync across machines via git.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] @toolkit creates updates in `<project>/docs/pending-updates/*.md`
- [ ] Pending updates are NOT gitignored (committed to project repo)
- [ ] Builder/Planner reads from `docs/pending-updates/` as primary source
- [ ] Backward compatibility: also check `~/.config/opencode/project-updates/[project-id]/` as fallback
- [ ] When update is applied: delete the `.md` file and record in `applied-updates.json`
- [ ] Update file format includes `updateType: schema` in frontmatter

### US-003: Define affinity rules for schema changes

**Description:** As a toolkit maintainer, I want to define JSONPath-based rules that identify which projects are affected by a schema change.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Create `data/update-affinity-rules.json` to store reusable affinity rules
- [ ] Rule format:
  ```json
  {
    "rules": [
      {
        "id": "desktop-apps",
        "description": "Projects with desktop applications",
        "match": "apps[*].type == 'desktop'"
      },
      {
        "id": "electron-without-testing",
        "description": "Electron apps without E2E testing configured",
        "match": "apps[*].framework == 'electron' && !apps[*].testing.framework"
      }
    ]
  }
  ```
- [ ] Support simple equality checks: `field == 'value'`
- [ ] Support existence checks: `!field` (field missing)
- [ ] Support array element matching: `apps[*].type == 'desktop'`
- [ ] @toolkit can reference rules by ID when generating updates

### US-004: Auto-generate update files for affected projects

**Description:** As a toolkit maintainer, I want to run a command that generates pending-update files in all affected projects based on affinity rules.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Create `scripts/generate-project-updates.sh` 
- [ ] Usage: `./scripts/generate-project-updates.sh --rule <rule-id> --name <update-name> --template <template-file>`
- [ ] Script reads `projects.json` to enumerate all projects with `hasAgentSystem: true`
- [ ] For each project, evaluate affinity rule against `docs/project.json`
- [ ] Generate `docs/pending-updates/YYYY-MM-DD-{update-name}.md` in matching projects
- [ ] Include proper frontmatter:
  ```yaml
  ---
  createdBy: toolkit
  date: YYYY-MM-DD
  priority: normal
  updateType: schema
  affinityRule: desktop-apps
  ---
  ```
- [ ] Support `--dry-run` flag to preview without writing files
- [ ] Report: "Generated updates for: helm-ade (1 matched, 2 skipped)"
- [ ] Skip projects where update ID already exists in `applied-updates.json`

### US-005: Update Builder/Planner startup to use new locations

**Description:** As a Builder/Planner agent, I want to read pending updates from the project's repo and skip already-applied updates.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] On startup, check `<project>/docs/pending-updates/*.md` for pending updates
- [ ] Read `<project>/docs/applied-updates.json` to get list of applied IDs
- [ ] Filter out any pending updates whose ID matches an applied ID
- [ ] Also check legacy location `~/.config/opencode/project-updates/[project-id]/` 
- [ ] Merge results and show combined pending count in dashboard
- [ ] Update `builder.md` and `planner.md` with new file paths
- [ ] When applying update from legacy location, still record in `docs/applied-updates.json`

### US-006: Create update registry for remote sync

**Description:** As a toolkit maintainer, I want a central registry of available updates so projects can discover updates even if not yet generated locally.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Create `data/update-registry.json` in toolkit repo
- [ ] Format:
  ```json
  {
    "schemaVersion": 1,
    "updates": [
      {
        "id": "2026-02-28-add-desktop-app-config",
        "description": "Add executablePath for Electron E2E testing",
        "affinityRule": "desktop-apps",
        "priority": "normal",
        "updateType": "schema",
        "templatePath": "templates/updates/add-desktop-app-config.md"
      }
    ]
  }
  ```
- [ ] Builder/Planner can fetch this registry to discover updates not yet in project
- [ ] On discovery, generate the pending-update file locally from template
- [ ] Include `templatePath` pointing to update instructions in toolkit

### US-007: Migrate existing project-updates

**Description:** As a toolkit maintainer, I want a migration script to move existing updates from the toolkit to project repos.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Create `scripts/migrate-project-updates.sh`
- [ ] For each file in `~/.config/opencode/project-updates/[project-id]/`:
  - Copy to `<project>/docs/pending-updates/`
  - Add `updateType: schema` to frontmatter if missing
  - Commit the file in the project repo
- [ ] Delete original files from toolkit after successful migration
- [ ] Report: "Migrated 3 updates across 2 projects"
- [ ] Handle case where `docs/pending-updates/` doesn't exist (create it)

---

## Functional Requirements

- FR-1: Applied updates tracked per-project in `docs/applied-updates.json` (committed)
- FR-2: Pending updates stored in `docs/pending-updates/*.md` (committed)
- FR-3: Affinity rules defined in `data/update-affinity-rules.json` using JSONPath-like syntax
- FR-4: Auto-generation script supports `--dry-run` mode
- FR-5: Builder/Planner check both new and legacy locations (backward compatible)
- FR-6: Update application records: update ID, timestamp, appliedBy, updateType
- FR-7: All formats include `schemaVersion` for future evolution
- FR-8: Include `updateType` field for extensibility to CVE/dependency updates

## Non-Goals

- Real-time push notifications when updates are available
- Automatic application without user confirmation
- Project-to-project dependency updates (future scope — design supports it)
- External CVE scanning (future scope — design supports it)
- Complex JSONPath features (just basic equality/existence checks for now)

## Technical Considerations

- **Storage format:** JSON for tracking (machine-readable), Markdown for instructions (human-readable)
- **Backward compatibility:** Legacy `project-updates/` supported during transition period
- **Git workflow:** Updates in project repos sync via normal git pull/push
- **Extensibility:** `updateType` field allows future types without schema changes
- **Script language:** Bash for portability (no Node/Python dependency)

## File Structure After Implementation

```
# Toolkit (yo-go)
data/
  update-affinity-rules.json    # Reusable affinity rules
  update-registry.json          # Central update registry
templates/
  updates/                      # Update instruction templates
    add-desktop-app-config.md
scripts/
  generate-project-updates.sh   # Auto-generate updates
  migrate-project-updates.sh    # Migration helper

# Each Project
docs/
  pending-updates/              # Pending updates (committed)
    2026-02-28-add-desktop-app-config.md
  applied-updates.json          # Applied update history (committed)
  project.json                  # Existing manifest
```

## Success Metrics

- Zero manual "which projects need this update?" investigation
- Cross-machine consistency: pulling a repo shows correct pending/applied state
- < 30 seconds to generate updates for all affected projects after schema change
- 100% of applied updates have audit trail in `applied-updates.json`

## Open Questions

- Should we support "required" vs "optional" updates (block PRD work until required updates applied)?
- Should updates have expiration dates (auto-dismiss stale updates)?
- Should we integrate with `toolkit-structure.json` changelog for audit trail?

## Credential & Service Access Plan

No external credentials required for this PRD.
