# PRD: Agent Model Tiering System

## Introduction

Implement a centralized configuration system for agent model assignments. Currently, each agent has a hardcoded `model:` field in its frontmatter, requiring manual edits across 60+ files to change model assignments. This PRD introduces a tiered system where agents are tagged with a tier (primary, tier1, tier2), and model assignments are managed from a single configuration file.

## Problem Statement

1. **No centralized control** — Changing which model sub-agents use requires editing each agent file individually
2. **UI model selection doesn't propagate** — When you change the model in OpenCode's UI, sub-agents ignore it because they have hardcoded models
3. **Experimentation is tedious** — Testing "what if all critics used Sonnet?" requires editing 20+ files
4. **Cost optimization is manual** — No easy way to downgrade less-critical agents to cheaper models

## Goals

- Centralize model configuration in a single file (`config/agent-models.yaml`)
- Tag each agent with a tier in its frontmatter (`tier: primary | tier1 | tier2`)
- Allow tier1 agents to inherit the UI-selected model (by omitting `model:` field)
- Provide a sync script to apply configuration changes to all agents
- Enable quick model experiments without touching agent logic

## User Stories

### US-001: Create agent tiers configuration file

**Description:** As a toolkit maintainer, I want a single configuration file that defines which model each tier uses, so I can change model assignments in one place.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Create `config/agent-models.yaml` with tier definitions
- [ ] Support `null` value meaning "inherit from caller / use UI selection"
- [ ] Support explicit model strings like `github-copilot/claude-sonnet-4`
- [ ] Include comments explaining each tier's purpose
- [ ] File validates against a schema (optional: add JSON schema)

### US-002: Add tier field to all agent frontmatter

**Description:** As a toolkit maintainer, I want each agent tagged with its tier, so the sync script knows which model to assign.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] All 63 agents have `tier:` field in frontmatter
- [ ] Primary agents tagged as `tier: primary`
- [ ] Complex sub-agents (implementation, security, debugging) tagged as `tier: tier1`
- [ ] Simple sub-agents (checklist critics, testers, simple devs) tagged as `tier: tier2`
- [ ] Tier assignments follow the audit recommendations from this conversation

### US-003: Create sync script for model assignments

**Description:** As a toolkit maintainer, I want a script that reads the config and updates all agent `model:` fields, so I can apply changes with one command.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Create `scripts/sync-agent-models.ts` (Node.js/TypeScript)
- [ ] Script reads `config/agent-models.yaml`
- [ ] For each agent, reads its `tier:` from frontmatter
- [ ] If agent has no `tier:` field, default to `tier1`
- [ ] If tier's model is `null`, removes the `model:` line from frontmatter
- [ ] If tier's model is set, updates/adds the `model:` line
- [ ] Script reports what it changed (e.g., "Updated 21 agents")
- [ ] Script is idempotent (running twice produces same result)
- [ ] Lint passes

### US-004: Update toolkit-structure.json with tier metadata

**Description:** As a toolkit maintainer, I want the toolkit manifest to include tier information, so it's visible in documentation and audits.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Each agent entry in `toolkit-structure.json` includes `tier` field
- [ ] Add `agentModels` section showing current tier-to-model mapping
- [ ] Update the post-change workflow to regenerate tier info

### US-005: Integrate sync into post-change workflow

**Description:** As a toolkit maintainer, I want the model sync to run automatically after toolkit changes, so tier assignments stay consistent without manual intervention.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Update `agents/toolkit.md` post-change workflow to include sync step
- [ ] Sync runs after Step 1 (toolkit-structure.json update)
- [ ] If sync makes changes, those changes are included in the commit
- [ ] Post-change completion report includes sync status

### US-006: Document the tiering system

**Description:** As a toolkit user, I want documentation explaining how agent model tiering works, so I know how to customize it.

**Documentation:** Yes (new: agent-model-tiering)

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Add section to toolkit README explaining the tiering system
- [ ] Document how to change tier assignments
- [ ] Document how to run the sync script manually
- [ ] Explain the inheritance behavior (null = use UI selection)
- [ ] Include examples of common customizations

## Functional Requirements

- FR-1: Create `config/agent-models.yaml` with structure:
  ```yaml
  # Agent Model Tiers
  # 
  # primary: Used by user-invokable agents (builder, planner, toolkit)
  #          Set to null to use UI-selected model
  # tier1:   Complex sub-agents that need strong reasoning
  #          Set to null to inherit from caller
  # tier2:   Simple sub-agents doing pattern-matching/checklist work
  #          Typically set to a cheaper/faster model
  
  primary: null
  tier1: null
  tier2: github-copilot/claude-sonnet-4
  ```

- FR-2: Valid `tier:` values are `primary`, `tier1`, `tier2`

- FR-3: When `model:` is omitted from frontmatter, OpenCode uses the UI-selected model (this is existing behavior we're leveraging)

- FR-4: The sync script must preserve all other frontmatter fields and agent content

- FR-5: The sync script must handle agents that don't have a `tier:` field by defaulting to `tier1`

## Tier Assignments

Based on the audit performed in this conversation:

### Primary (3 agents)
User-invokable orchestration agents:
- builder
- planner
- toolkit

### Tier 1 (~30 agents)
Complex sub-agents needing strong reasoning:
- developer, overlord, hammer, debugger
- All backend-critic-* agents
- security-critic, exploit-critic
- prd, qa, qa-explorer
- All language-specific devs (go-dev, java-dev, python-dev, react-dev, aws-dev)
- frontend-critic, requirements-critic, quality-critic, aesthetic-critic
- dx-critic, api-critic, network-critic, public-page-critic
- e2e-playwright, felix, prompt-critic

### Tier 2 (~26 agents)
Simple pattern-matching / checklist sub-agents:
- comment-critic, oddball-critic, tailwind-critic, seo-critic
- update-schema-critic, workflow-enforcement-critic, handoff-contract-critic, policy-testability-critic
- semantic-critic, copy-critic, cloudformation-critic, ansible-critic
- jest-tester, go-tester, react-tester
- docker-dev, terraform-dev, playwright-dev
- docs-writer, tools-writer, support-article-writer, screenshot-maintainer
- wall-e, merge-coordinator, session-status, prd-impact-analyzer
- critic (router), tester (router), e2e-reviewer

## Non-Goals

- No runtime model switching (config is applied at sync time)
- No per-project model overrides (all projects use the same tiers)
- No automatic tier detection based on agent complexity
- No changes to how OpenCode invokes sub-agents

## Technical Considerations

- **Config format:** YAML for readability and comments
- **Script language:** Node.js/TypeScript (proper YAML parsing, fits existing toolkit stack)
- **Dependencies:** `js-yaml` for YAML parsing, `gray-matter` for frontmatter parsing/serialization
- **Frontmatter handling:** Use `gray-matter` to parse/serialize without corrupting content
- **Idempotency:** Script must be safe to run repeatedly
- **Default tier:** Agents without `tier:` field default to `tier1`
- **Post-change integration:** Sync runs automatically as part of toolkit post-change workflow

## Success Metrics

- Model changes require editing only 1 file (`config/agent-models.yaml`) + running sync
- UI model selection propagates to tier1 sub-agents
- Cost reduction visible when tier2 agents use cheaper model

## Open Questions

1. ~~Should the sync script be part of the post-change workflow (auto-run)?~~ **Resolved: Yes, auto-run**
2. ~~Should we add a `--dry-run` flag to preview changes?~~ **Resolved: No, just show what changed**
3. Should tier be validated against an enum in a JSON schema?
4. ~~What happens if an agent has no `tier:` field — error, warn, or skip?~~ **Resolved: Default to tier1**

## Credential & Service Access Plan

No external credentials required for this PRD.
