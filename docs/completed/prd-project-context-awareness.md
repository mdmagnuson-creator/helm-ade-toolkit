# PRD: Project Context Awareness & Git Workflow Enforcement

**Status:** Draft  
**Priority:** High  
**Created:** 2026-03-03  
**Author:** @toolkit

## Problem Statement

Primary agents (Builder, Planner, Developer, Toolkit) don't consistently read or enforce the rich project configuration that already exists in `project.json`. This causes:

1. **Wrong branch targets** — Agents push to `main` when `stagingBranch` exists, or create PRs to wrong branches
2. **Ignored relatedProjects** — Toolkit queued a website sync update to `helm-ade-website` instead of `opencode-toolkit-website` despite correct config
3. **Unused environments** — Builder doesn't know staging URL for test verification
4. **Context lost on compaction** — After OpenCode compacts conversation history, agents lose awareness of project config
5. **Conflicting schema fields** — `git.branchingStrategy` vs `agents.gitWorkflow` creates confusion
6. **Broken cross-computer updates** — Toolkit doesn't use the central registry, so schema migrations don't propagate reliably

### Evidence

**helm-ade/docs/project.json has conflicting config:**
```json
"git": {
  "branchModel": "trunk-based",
  "agentWorkflow": {
    "pushTo": "staging",
    "createPrTo": "main"
  }
},
"agents": {
  "gitWorkflow": "trunk",
  "trunkMode": "branchless"  // contradicts git.agentWorkflow
}
```

**Agents don't read the config they should:**
- Builder has some trunk mode logic but doesn't read `git.agentWorkflow`, `stagingBranch`, or `relatedProjects`
- Planner has NO git workflow, branching, or relatedProjects awareness
- Developer mentions git commit but doesn't read branch config
- Toolkit has `relatedProjects` logic but didn't follow it (leading to the bug)

**Cross-computer update system is broken:**
- `data/update-registry.json` exists but Toolkit has no instructions to use it
- `scripts/generate-project-updates.sh` exists but Toolkit doesn't know about it
- Toolkit only documents "Option A: Direct to Project" and "Option B: Legacy Location"
- Central registry (Option C) is undocumented, so schema migrations don't propagate

## Goals

1. **Single source of truth** — All git workflow config lives in `git` object; remove `agents.gitWorkflow`/`agents.trunkMode` entirely
2. **Project context awareness** — All four primary agents read git config, environments, and relatedProjects from `project.json`
3. **Git workflow enforcement** — BLOCK violations of branch targets (not warn)
4. **Compaction resilience** — Context survives OpenCode history compaction via state files (Builder) or re-reading (Planner/Developer)
5. **relatedProjects mandatory** — Cross-project operations MUST use relatedProjects lookup; fail if not configured
6. **Working cross-computer updates** — Toolkit uses central registry for schema migrations; all projects receive updates on next Builder/Planner run

## Non-Goals

- Changing how sub-agents work (they receive context from primary agents)
- Creating a separate `project-context.json` file (agents read from `project.json` directly)
- Supporting multiple git workflows in the same project
- Fallback behaviors — missing config should BLOCK and prompt user to define it

---

## Solution Overview

### Phase 1: Schema Cleanup

**Remove duplicate fields from `agents` object entirely:**

The migration update (US-009) will remove these fields from all projects:
- `agents.gitWorkflow` → replaced by `git.branchingStrategy`
- `agents.trunkMode` → replaced by `git.branchingStrategy`
- `agents.autoCommit` → replaced by `git.autoCommit`
- `agents.autoPush` → replaced by `git.teamSync.pushAfterCommit`

**Add `git.agentWorkflow` to schema:**

```json
"git": {
  "properties": {
    "agentWorkflow": {
      "type": "object",
      "description": "How agents interact with git branches. All operations to branches in requiresHumanApproval are BLOCKED.",
      "properties": {
        "workBranch": {
          "type": "string",
          "description": "Branch agents should work on (e.g., 'staging', 'develop'). Defaults to defaultBranch."
        },
        "pushTo": {
          "type": "string", 
          "description": "Branch to push changes to. Defaults to workBranch → defaultBranch."
        },
        "createPrTo": {
          "type": "string",
          "description": "Branch to create PRs against. Defaults to defaultBranch."
        },
        "requiresHumanApproval": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Branches that are BLOCKED for all agent operations (push, PR, merge). Agents cannot push to or create PRs targeting these branches directly."
        }
      }
    }
  }
}
```

**Default Resolution Cascade (documented in schema):**
1. `pushTo` defaults to `workBranch` if not set
2. `workBranch` defaults to `defaultBranch` if not set
3. `createPrTo` defaults to `defaultBranch` if not set

### Phase 2: Agent Context Loading

**All four primary agents read from `project.json` directly at startup:**

1. **Load at startup** — Read `<project>/docs/project.json`
2. **Extract relevant context:**
   - `git.*` — branching strategy, workflow, autoCommit
   - `environments.*` — URLs for dev/staging/production
   - `relatedProjects` — sibling projects
3. **Validate before git operations** — Check branch targets before `git push` or `gh pr create`
4. **BLOCK if context missing** — If `git.agentWorkflow` is not defined, prompt user to configure it

**Context Loading by Agent:**

| Agent | State File | Compaction Recovery |
|-------|-----------|---------------------|
| Builder | `builder-state.json` with `projectContext` | Read from state file |
| Planner | None | Re-read `project.json` each time |
| Developer | None | Re-read `project.json` each time |
| Toolkit | `toolkit-state.json` (existing) | Re-read `project.json` each time |

**Builder State File Structure:**
```json
{
  "projectContext": {
    "loadedAt": "2026-03-03T10:00:00Z",
    "git": {
      "defaultBranch": "main",
      "workBranch": "staging",
      "pushTo": "staging",
      "createPrTo": "main",
      "branchingStrategy": "trunk-based",
      "requiresHumanApproval": ["main"],
      "autoCommit": "onStoryComplete"
    },
    "environments": {
      "staging": { "url": "https://staging.example.com" },
      "production": { "url": "https://app.example.com" }
    },
    "relatedProjects": [
      { "projectId": "example-website", "relationship": "documentation-site" }
    ]
  }
}
```

### Phase 3: Git Workflow Enforcement

**Enforcement is BLOCKING — no fallbacks:**

```
Git Validation Protocol (all primary agents)

Before ANY git push:
1. Read project.json → git.agentWorkflow
2. If git.agentWorkflow not defined: BLOCK (see Missing Config Error below)
3. If target branch in requiresHumanApproval: BLOCK (see Protected Branch Error below)
4. If target branch ≠ pushTo: BLOCK (see Wrong Target Error below)
5. Proceed only if all checks pass

Before gh pr create:
1. Read project.json → git.agentWorkflow  
2. If git.agentWorkflow not defined: BLOCK
3. If --base branch in requiresHumanApproval: BLOCK
4. If --base branch ≠ createPrTo: BLOCK
5. Proceed only if all checks pass
```

**Missing Config Error:**

```
⛔ GIT WORKFLOW NOT CONFIGURED

This project requires git workflow configuration before I can perform git operations.

Please describe your git workflow:
1. What branch do you work on? (e.g., main, staging, develop)
2. Where should I push changes? (e.g., same branch, staging branch)
3. Where should PRs be created to? (e.g., main)
4. Which branches require human approval? (e.g., main, production)

I'll generate the configuration for your review.
```

**Protected Branch Error:**

```
⛔ PROTECTED BRANCH — HUMAN APPROVAL REQUIRED

Attempted: git push origin main
Branch 'main' is in requiresHumanApproval — all agent operations are blocked.

This project's workflow:
  - Work on: staging
  - Push to: staging  
  - Create PRs to: main (requires human approval)

To proceed:
  1. Push to staging: git push origin staging
  2. Create PR: gh pr create --base main
  3. Get human approval and merge

Source: docs/project.json → git.agentWorkflow.requiresHumanApproval
```

**Wrong Target Error:**

```
⛔ GIT WORKFLOW VIOLATION

Attempted: git push origin develop
Configured target: staging (from git.agentWorkflow.pushTo)

This project's workflow:
  - Work on: staging
  - Push to: staging
  - Create PRs to: main

To proceed correctly:
  git push origin staging

Source: docs/project.json → git.agentWorkflow
```

### Phase 4: Cross-Project Operations

**relatedProjects is mandatory — no guessing:**

When an agent needs to perform a cross-project operation (e.g., Toolkit queuing website sync, Planner creating cross-project PRD):

1. Read `project.json` → `relatedProjects`
2. Find entry matching the required `relationship` type
3. If not found: BLOCK and prompt user to configure

**Missing relatedProjects Error:**

```
⛔ RELATED PROJECT NOT CONFIGURED

I need to [queue a website sync update / create a cross-project PRD], but the related project is not configured.

Please describe the relationship:
1. What is the related project's name/path?
2. What is the relationship? (documentation-site, marketing-site, api-backend, etc.)

I'll generate the relatedProjects configuration for your review.
```

**Planner Cross-Project PRD Behavior:**

When Planner identifies that a PRD affects a related project:
1. Look up related project via `relatedProjects`
2. Create a pending PRD in that project's `docs/pending-prds/` directory
3. Builder in the other project will discover it on next run

### Phase 5: Fix Cross-Computer Updates

**Add "Option C: Central Registry" to Toolkit:**

```markdown
#### Option C: Central Registry (Best for Schema Migrations)

Use when a change affects multiple projects based on configuration.

1. **Create update template:**
   ```
   data/update-templates/YYYY-MM-DD-{name}.md
   ```
   
2. **Add to registry:**
   Edit `data/update-registry.json`:
   ```json
   {
     "id": "2026-03-03-migrate-git-config",
     "description": "Migrate git config from agents.* to git.*",
     "affinityRule": "all-projects",
     "priority": "normal",
     "updateType": "schema",
     "createdAt": "2026-03-03",
     "templatePath": "data/update-templates/2026-03-03-migrate-git-config.md"
   }
   ```

3. **Commit and push toolkit repo**

4. **Builder/Planner discover automatically** on next run
```

**When to use which option:**

| Scenario | Use |
|----------|-----|
| Schema change affecting multiple projects | **Option C** (Central Registry) |
| One-off update for a single project | **Option A** (Direct to Project) |
| Website sync update | **Option A** (Direct to Project) |
| Legacy/backward compatibility | **Option B** (Legacy Location) |

---

## User Stories

### US-001: Schema cleanup — remove duplicate fields

**Description:** Remove `agents.gitWorkflow`, `agents.trunkMode`, `agents.autoCommit`, `agents.autoPush` from the schema entirely. These are replaced by `git` object fields.

**Acceptance Criteria:**
- [ ] `project.schema.json` removes these fields from `agents` object
- [ ] Each removed field has a note in migration update template explaining replacement
- [ ] Schema validates without these fields

**Files affected:**
- `schemas/project.schema.json`

**Test intensity:** Low (schema change only)

---

### US-002: Add git.agentWorkflow to schema

**Description:** Add `git.agentWorkflow` object with `workBranch`, `pushTo`, `createPrTo`, `requiresHumanApproval` fields. Branches in `requiresHumanApproval` are BLOCKED for all operations.

**Acceptance Criteria:**
- [ ] `git.agentWorkflow` defined in schema with all fields
- [ ] Default cascade documented: `pushTo` → `workBranch` → `defaultBranch`
- [ ] `requiresHumanApproval` description clarifies it blocks ALL operations (push, PR, merge)
- [ ] Example in schema description

**Files affected:**
- `schemas/project.schema.json`

**Test intensity:** Low (schema change only)

---

### US-003: Update Builder to load and cache project context

**Description:** Builder reads git config, environments, and relatedProjects from `project.json` at startup and caches in `builder-state.json` for compaction resilience.

**Acceptance Criteria:**
- [ ] Builder always re-reads `project.json` at startup (fresh load)
- [ ] Extracts `git`, `environments`, `relatedProjects` into `projectContext`
- [ ] Stores `projectContext` in `builder-state.json`
- [ ] On compaction recovery, reads context from state file
- [ ] Passes relevant context subset to Developer when delegating (e.g., `git` config for commit tasks)
- [ ] If `git.agentWorkflow` missing: BLOCK with Missing Config Error

**Files affected:**
- `agents/builder.md`
- `schemas/builder-state.schema.json`

**Test intensity:** Medium (agent behavior change)

---

### US-004: Update Planner to load project context

**Description:** Planner reads project context for PRD scoping and cross-project impact. No state file — re-reads each time.

**Acceptance Criteria:**
- [ ] Planner reads `project.json` at startup (no caching)
- [ ] Uses `environments` when scoping PRDs (knows which URLs exist)
- [ ] Uses `relatedProjects` for cross-project impact analysis
- [ ] When PRD affects related project: creates pending PRD in that project's `docs/pending-prds/`
- [ ] Passes context to Builder in handoff
- [ ] If `git.agentWorkflow` missing: BLOCK with Missing Config Error

**Files affected:**
- `agents/planner.md`

**Test intensity:** Medium (agent behavior change)

---

### US-005: Update Developer to load project context

**Description:** Developer reads project context for git operations. No state file — re-reads each time. Missing context = BLOCK.

**Acceptance Criteria:**
- [ ] Developer reads `project.json` directly at startup
- [ ] Checks `git.agentWorkflow.pushTo` before any push
- [ ] Checks `git.agentWorkflow.requiresHumanApproval` — blocks all operations to listed branches
- [ ] Checks `git.autoCommit` before committing
- [ ] If `git.agentWorkflow` missing: BLOCK with Missing Config Error (no fallback)

**Files affected:**
- `agents/developer.md`

**Test intensity:** Medium (agent behavior change)

---

### US-006: Update Toolkit to enforce relatedProjects

**Description:** Toolkit MUST use relatedProjects lookup for cross-project operations. No guessing, no fallback.

**Acceptance Criteria:**
- [ ] Step 3 (website sync) requires relatedProjects lookup
- [ ] If relatedProjects not configured: BLOCK with Missing relatedProjects Error
- [ ] Remove name-based fallback that caused the helm-ade-website bug
- [ ] Error prompts user to describe the setup
- [ ] Agent generates relatedProjects config based on user's description
- [ ] User verifies config, agent writes to project.json

**Files affected:**
- `agents/toolkit.md`

**Test intensity:** Medium (agent behavior change)

---

### US-007: Add git validation protocol to AGENTS.md

**Description:** Add "Git Workflow Enforcement" section to AGENTS.md as a shared guardrail for all primary agents.

**Acceptance Criteria:**
- [ ] AGENTS.md has "Git Workflow Enforcement" section
- [ ] Documents validation before push, PR create, auto-merge
- [ ] Specifies BLOCK behavior (no fallbacks, no warnings)
- [ ] Includes exact error message formats (Missing Config, Protected Branch, Wrong Target)
- [ ] Individual agents reference this section: `> ⚓ See AGENTS.md § Git Workflow Enforcement`

**Files affected:**
- `AGENTS.md`
- `agents/builder.md` (add anchor reference)
- `agents/planner.md` (add anchor reference)
- `agents/developer.md` (add anchor reference)
- `agents/toolkit.md` (add anchor reference)

**Test intensity:** Low (documentation/guardrail)

---

### US-008: Add central registry instructions to Toolkit

**Description:** Add "Option C: Central Registry" to Toolkit's "Queue Project Updates" section so schema migrations propagate across computers.

**Acceptance Criteria:**
- [ ] Toolkit has "Option C: Central Registry" with step-by-step instructions
- [ ] Documents when to use each option (registry vs direct vs legacy)
- [ ] Template location: `data/update-templates/`
- [ ] Includes example of adding to `update-registry.json`
- [ ] Documents affinity rules (reference `data/update-affinity-rules.json`)
- [ ] Documents that Builder/Planner discover and apply automatically

**Files affected:**
- `agents/toolkit.md`

**Test intensity:** Low (documentation)

---

### US-009: Create migration update for all projects

**Description:** After all other stories complete, add an entry to `update-registry.json` that triggers all projects to migrate. Migration is interactive — agent asks user questions and generates config.

**Acceptance Criteria:**
- [ ] Create `data/update-templates/migrate-git-config.md` with migration instructions
- [ ] Add entry to `data/update-registry.json` with `affinityRule: "all-projects"`
- [ ] Template instructs agent to:
  1. Remove deprecated `agents.*` fields
  2. Ask user about their git workflow if `git.agentWorkflow` not present
  3. Generate `git.agentWorkflow` config based on answers
  4. Present config for user verification
  5. Write to project.json
- [ ] Include verification: `jq '.git.agentWorkflow' docs/project.json`
- [ ] Commit to toolkit repo

**Files affected:**
- `data/update-templates/migrate-git-config.md` (new)
- `data/update-registry.json`

**Test intensity:** Low (configuration)

**Note:** This is the final step. When users run @builder or @planner on any project, they'll see the pending migration and the agent will walk them through configuration.

---

## Decisions Log

Resolved during story review:

| Topic | Decision |
|-------|----------|
| Deprecation vs removal | Remove fields entirely in migration (not just deprecate) |
| `agentWorkflow` naming | Keep as-is |
| Default cascade | Document in schema |
| `requiresHumanApproval` scope | Blocks ALL operations to listed branches (push AND PR) |
| Builder context loading | Always re-read `project.json` on startup |
| Context passing to Developer | Pass relevant subset only |
| Planner state file | None — re-read each time |
| Planner cross-project PRDs | Create pending PRD in related project's `docs/pending-prds/` |
| Developer context source | Read `project.json` directly |
| Missing context behavior | BLOCK and prompt user to define (no fallback) |
| relatedProjects fallback | None — BLOCK if not configured |
| relatedProjects error UX | Prompt user to describe setup, agent generates JSON, user verifies |
| Anchor format | `> ⚓ See AGENTS.md § Section Name` |
| Template location | `data/update-templates/` |
| Migration approach | Interactive — agent asks questions, generates config |
| Implementation timing | US-009 runs last, after all other stories complete |

---

## Implementation Order

1. **US-001, US-002** — Schema changes (remove old, add new)
2. **US-007** — AGENTS.md guardrail (foundation for agent changes)
3. **US-008** — Toolkit central registry instructions (enables US-009)
4. **US-003, US-004, US-005, US-006** — Agent updates (can be parallelized)
5. **US-009** — Create migration update in central registry (final step)

---

## Success Metrics

- [ ] No more "wrong website" bugs in cross-project operations
- [ ] All primary agents read project context at startup
- [ ] Git operations BLOCK when targeting wrong/protected branches
- [ ] Missing git config prompts user to configure (not silent fallback)
- [ ] Context survives OpenCode compaction (Builder recovers from state file)
- [ ] Deprecated fields removed via interactive migration
- [ ] Schema migrations propagate to all computers via central registry
