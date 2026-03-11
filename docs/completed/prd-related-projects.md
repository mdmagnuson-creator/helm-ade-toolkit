# PRD: Related Projects Configuration

## Introduction

Add the ability to define relationships between projects in `project.json` so agents can automatically identify companion projects (e.g., app ↔ marketing website, api ↔ admin dashboard, toolkit ↔ documentation website). This solves the problem of agents needing to guess which "website" project to use when there are multiple, and enables cross-project workflows like syncing documentation updates.

## Goals

- Define explicit relationships between projects in `project.json`
- Enable agents to resolve "the documentation site for this project" unambiguously
- Support common relationship types with extensible naming conventions
- Allow multiple projects of the same relationship type (with labels)
- Support bidirectional relationships (project A knows about B, and B knows about A)
- Enable cross-project workflows (e.g., toolkit changes → queue website sync)

## User Stories

### US-001: Add relatedProjects schema to project.json

**Description:** As a developer, I want to define related projects in my project.json so that agents know which companion projects exist.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] New `relatedProjects` array added to project.json schema
- [ ] Each entry has required `projectId` (string, references projects.json id)
- [ ] Each entry has required `relationship` (string, extensible with conventions)
- [ ] Each entry has optional `label` (string, for multiple same-type relationships)
- [ ] Each entry has optional `description` (string)
- [ ] Schema validation works for all field types
- [ ] JSON schema file updated: `schemas/project.schema.json`

**Schema addition:**

```json
{
  "relatedProjects": {
    "type": "array",
    "description": "Companion projects related to this one",
    "items": {
      "type": "object",
      "required": ["projectId", "relationship"],
      "properties": {
        "projectId": {
          "type": "string",
          "description": "Project ID from projects.json registry"
        },
        "relationship": {
          "type": "string",
          "description": "Relationship type (e.g., documentation-site, api-backend)"
        },
        "label": {
          "type": "string",
          "description": "Optional label when multiple projects share the same relationship type"
        },
        "description": {
          "type": "string",
          "description": "Optional human-readable description"
        }
      }
    }
  }
}
```

**Recommended relationship conventions:**

| Relationship | Description | Inverse |
|--------------|-------------|---------|
| `documentation-site` | Documentation/docs website | `documented-project` |
| `marketing-site` | Public marketing/landing page | `marketed-product` |
| `admin-dashboard` | Admin/internal dashboard | `managed-service` |
| `api-backend` | Backend API consumed by this frontend | `frontend-client` |
| `mobile-app` | Mobile app companion | `web-counterpart` |
| `shared-library` | Shared code library | `dependent-project` |
| `monorepo-sibling` | Another app in same monorepo | `monorepo-sibling` |
| `test-harness` | Test/QA project | `tested-system` |

These are conventions, not enforced values. Users can use any string.

---

### US-002: Update project-bootstrap skill to prompt for related projects

**Description:** As a user bootstrapping a project, I want to be asked about related projects so the relationships are configured from the start.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] New step in project-bootstrap skill asks about related projects
- [ ] Shows list of existing registered projects from projects.json
- [ ] User can select one or more and assign relationship types
- [ ] User can add optional label for same-type disambiguation
- [ ] Selected relationships saved to project.json
- [ ] Offers to add inverse relationship to the other project's project.json
- [ ] Skip option for projects with no related projects

**Example prompt flow:**

```
═══════════════════════════════════════════════════════════════════════
                       RELATED PROJECTS
═══════════════════════════════════════════════════════════════════════

Does this project have related companion projects?

Registered projects:
  1. yo-go (AI toolkit)
  2. helm-ade (SaaS application)
  3. helm-api (Go API backend)

Select related projects (comma-separated numbers, or 'skip'):
> 1

Selected: yo-go

What is the relationship? (or type custom)
  Common types: documentation-site, marketing-site, admin-dashboard, 
                api-backend, mobile-app, shared-library, test-harness

> documented-project

Relationship: opencode-toolkit-website is the documented-project of yo-go

Add a label? (for multiple same-type relationships, or press Enter to skip)
> 

───────────────────────────────────────────────────────────────────────

Add inverse relationship to yo-go?

  This will add to yo-go/docs/project.json:
  { "projectId": "opencode-toolkit-website", "relationship": "documentation-site" }

  Add inverse? (y/n)
> y

✅ Updated yo-go/docs/project.json

───────────────────────────────────────────────────────────────────────

Add more related projects? (y/n)
> n
═══════════════════════════════════════════════════════════════════════
```

---

### US-003: Create helper function to resolve related projects

**Description:** As an agent, I need a reliable way to find related projects by relationship type so I don't have to guess based on project names.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Helper pattern documented for agents in agent instructions
- [ ] Input: relationship type, optional label
- [ ] Output: project path (or null if not found)
- [ ] Reads from current project's project.json
- [ ] Resolves projectId to path via projects.json registry
- [ ] If multiple matches and no label specified, returns first with warning
- [ ] If label specified, filters to matching label

**Helper pattern for agents:**

```bash
# Find related project by relationship type
# Usage: get_related_project <relationship> [label]
get_related_project() {
  local relationship="$1"
  local label="$2"
  
  # Read from current project's project.json
  local project_id
  if [ -n "$label" ]; then
    project_id=$(jq -r --arg rel "$relationship" --arg lbl "$label" \
      '.relatedProjects[] | select(.relationship == $rel and .label == $lbl) | .projectId' \
      docs/project.json 2>/dev/null)
  else
    project_id=$(jq -r --arg rel "$relationship" \
      '.relatedProjects[] | select(.relationship == $rel) | .projectId' \
      docs/project.json 2>/dev/null | head -1)
  fi
  
  if [ -z "$project_id" ] || [ "$project_id" == "null" ]; then
    echo ""
    return 1
  fi
  
  # Resolve to path via projects.json
  jq -r --arg id "$project_id" \
    '.projects[] | select(.id == $id) | .path' \
    ~/.config/opencode/projects.json
}

# Example usage:
DOC_SITE_PATH=$(get_related_project "documentation-site")
API_PATH=$(get_related_project "api-backend" "v2")  # with label
```

---

### US-004: Update toolkit.md to use relatedProjects for website sync

**Description:** As the toolkit agent, I need to use relatedProjects to find the correct documentation website instead of guessing based on project name.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Toolkit post-change workflow updated to read relatedProjects
- [ ] Looks for `relationship: "documentation-site"` in yo-go's project.json
- [ ] Falls back to current behavior (search for "toolkit-website" in id) if not configured
- [ ] Clear warning message if no documentation site configured and fallback fails
- [ ] Works with the helper pattern from US-003

**Updated Step 3a in toolkit.md:**

```bash
# Get documentation site for this toolkit
DOC_SITE_PATH=$(jq -r '.relatedProjects[] | select(.relationship == "documentation-site") | .projectId' docs/project.json 2>/dev/null)

if [ -n "$DOC_SITE_PATH" ] && [ "$DOC_SITE_PATH" != "null" ]; then
  # Resolve project ID to path
  WEBSITE_PATH=$(jq -r --arg id "$DOC_SITE_PATH" '.projects[] | select(.id == $id) | .path' ~/.config/opencode/projects.json)
else
  # Fallback: search for toolkit-website in project id (legacy behavior)
  WEBSITE_PATH=$(jq -r '.projects[] | select(.id | contains("toolkit-website")) | .path' ~/.config/opencode/projects.json | head -1)
  
  if [ -n "$WEBSITE_PATH" ] && [ "$WEBSITE_PATH" != "null" ]; then
    echo "⚠️ Using fallback: found $WEBSITE_PATH by name match."
    echo "   Consider adding relatedProjects to docs/project.json for explicit configuration."
  fi
fi

if [ -z "$WEBSITE_PATH" ] || [ "$WEBSITE_PATH" == "null" ]; then
  echo "⚠️ No documentation-site found in relatedProjects and fallback failed."
  echo "   Skipping website sync. Add relatedProjects to docs/project.json to enable."
  # Continue without failing - website sync is optional
fi
```

---

### US-005: Verify toolkit post-change workflow works

**Description:** As a validation step, verify that the toolkit post-change workflow correctly finds the documentation site using the new relatedProjects configuration.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Run toolkit post-change workflow after US-004 and US-007 are complete
- [ ] Workflow correctly resolves opencode-toolkit-website path
- [ ] Pending update file created in correct location
- [ ] No fallback warning message appears (direct lookup succeeds)

---

### US-006: Support multiple same-type relationships with labels

**Description:** As a developer with multiple documentation sites (e.g., user docs and API docs), I want to distinguish them with labels.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Labels work in project.json schema
- [ ] Helper function accepts optional label parameter
- [ ] Bootstrap prompts for label when adding same-type relationship that already exists
- [ ] Clear documentation on label usage

**Example with labels:**

```json
{
  "relatedProjects": [
    {
      "projectId": "my-app-docs",
      "relationship": "documentation-site",
      "label": "user-docs",
      "description": "End-user documentation"
    },
    {
      "projectId": "my-app-api-docs",
      "relationship": "documentation-site",
      "label": "api-docs",
      "description": "API reference documentation"
    }
  ]
}
```

**Usage:**

```bash
# Get specific documentation site by label
USER_DOCS=$(get_related_project "documentation-site" "user-docs")
API_DOCS=$(get_related_project "documentation-site" "api-docs")

# Get first documentation site (no label = first match)
ANY_DOCS=$(get_related_project "documentation-site")
```

---

### US-007: Configure existing project relationships

**Description:** As part of this PRD, configure the two known project relationships so the system works immediately after implementation.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] yo-go ↔ opencode-toolkit-website relationship configured (both directions)
- [ ] helm-ade ↔ helm-ade-website relationship configured (both directions)
- [ ] All four project.json files updated with relatedProjects section
- [ ] Toolkit post-change workflow tested and working

**Relationships to configure:**

| Project | Related Project | Relationship |
|---------|-----------------|--------------|
| yo-go | opencode-toolkit-website | documentation-site |
| opencode-toolkit-website | yo-go | documented-project |
| helm-ade | helm-ade-website | marketing-site |
| helm-ade-website | helm-ade | marketed-product |

**File updates:**

1. **yo-go/docs/project.json:**
```json
{
  "relatedProjects": [
    {
      "projectId": "opencode-toolkit-website",
      "relationship": "documentation-site",
      "description": "Public documentation website for the AI toolkit"
    }
  ]
}
```

2. **opencode-toolkit-website/docs/project.json:**
```json
{
  "relatedProjects": [
    {
      "projectId": "yo-go",
      "relationship": "documented-project",
      "description": "The AI toolkit this site documents"
    }
  ]
}
```

3. **helm-ade/docs/project.json:**
```json
{
  "relatedProjects": [
    {
      "projectId": "helm-ade-website",
      "relationship": "marketing-site",
      "description": "Public marketing website for Helm ADE"
    }
  ]
}
```

4. **helm-ade-website/docs/project.json:**
```json
{
  "relatedProjects": [
    {
      "projectId": "helm-ade",
      "relationship": "marketed-product",
      "description": "The Helm ADE application this site markets"
    }
  ]
}
```

---

## Functional Requirements

- FR-1: Add `relatedProjects` array to project.json schema with projectId, relationship, label, description
- FR-2: Relationship types are extensible strings with documented conventions
- FR-3: Labels allow multiple projects of the same relationship type
- FR-4: Project-bootstrap skill prompts for related projects during setup
- FR-5: Bootstrap offers to add inverse relationship to the other project
- FR-6: Helper pattern documented for agents to resolve related projects
- FR-7: Toolkit agent uses relatedProjects for website sync with fallback
- FR-8: Only registered projects can be linked (validated against projects.json)
- FR-9: Existing project relationships configured (yo-go ↔ toolkit-website, helm-ade ↔ helm-website)

## Non-Goals

- No storage in projects.json registry (single source of truth is project.json)
- No CLI command for managing relationships (edit manually or re-bootstrap)
- No automatic relationship detection
- No cross-project code sharing or imports (just metadata)
- No relationship-based build ordering

## Technical Considerations

- **Schema location:** `schemas/project.schema.json`
- **Registry location:** `~/.config/opencode/projects.json` (for path resolution only)
- **Bootstrap skill:** `skills/project-bootstrap/SKILL.md`
- **Toolkit agent:** `agents/toolkit.md`
- Relationships stored as project IDs, resolved to paths via registry
- Inverse relationships are stored independently in each project's project.json
- If a related project is deleted from registry, the relationship becomes orphaned (no automatic cleanup)

## Success Metrics

- Toolkit correctly syncs to opencode-toolkit-website without name guessing
- New projects can configure related projects during bootstrap
- Agents can find related projects by relationship type reliably
- Zero ambiguity when multiple "website" projects exist
- Multiple same-type relationships work with labels

## Open Questions

- Should orphaned relationships (projectId not in registry) trigger a warning on project load?
- Should we validate relationships on bootstrap refresh?

## Credential & Service Access Plan

No external credentials required for this PRD.
