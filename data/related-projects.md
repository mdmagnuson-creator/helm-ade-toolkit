# Related Projects Helper Pattern

This document describes how agents should resolve related projects using the `relatedProjects` configuration in `project.json`.

## Overview

Projects can define relationships to companion projects (documentation sites, marketing sites, API backends, etc.) in their `docs/project.json` file. This enables agents to find related projects by relationship type instead of guessing based on project names.

## Schema

Each entry in the `relatedProjects` array has:

| Field | Required | Description |
|-------|----------|-------------|
| `projectId` | Yes | Project ID from `projects.json` registry |
| `relationship` | Yes | Relationship type (see conventions below) |
| `label` | No | Disambiguation label for multiple same-type relationships |
| `description` | No | Human-readable description |

## Relationship Conventions

| Relationship | Inverse | Description |
|--------------|---------|-------------|
| `documentation-site` | `documented-project` | This project is documentation for the other |
| `marketing-site` | `marketed-product` | This project markets the other |
| `api-backend` | `frontend-client` | This project is the API for the other |
| `admin-dashboard` | `managed-service` | This project manages the other |
| `shared-library` | `dependent-project` | This project is shared code for the other |
| `monorepo-sibling` | `monorepo-sibling` | Both are in the same monorepo |
| `test-harness` | `tested-system` | This project tests the other |

Custom relationship types are allowed. Use lowercase-kebab-case.

## Helper Function

Agents should use this pattern to find related projects:

```bash
# Find related project by relationship type
# Usage: get_related_project <relationship> [label]
# Returns: project path or empty string
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
```

## Usage Examples

### Find documentation site

```bash
DOC_SITE_PATH=$(get_related_project "documentation-site")
if [ -n "$DOC_SITE_PATH" ]; then
  echo "Documentation site at: $DOC_SITE_PATH"
else
  echo "No documentation site configured"
fi
```

### Find specific documentation site by label

```bash
# When multiple documentation sites exist with labels
USER_DOCS=$(get_related_project "documentation-site" "user-docs")
API_DOCS=$(get_related_project "documentation-site" "api-docs")
```

### Find API backend

```bash
API_PATH=$(get_related_project "api-backend")
```

## Inline Alternative

For simple one-off lookups without defining the function:

```bash
# Direct lookup (documentation-site example)
PROJECT_ID=$(jq -r '.relatedProjects[] | select(.relationship == "documentation-site") | .projectId' docs/project.json 2>/dev/null)
WEBSITE_PATH=$(jq -r --arg id "$PROJECT_ID" '.projects[] | select(.id == $id) | .path' ~/.config/opencode/projects.json)
```

## Fallback Pattern

When migrating from name-based lookups, use this pattern:

```bash
# Try relatedProjects first
PROJECT_ID=$(jq -r '.relatedProjects[] | select(.relationship == "documentation-site") | .projectId' docs/project.json 2>/dev/null)

if [ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "null" ]; then
  # Resolve via relatedProjects (preferred)
  WEBSITE_PATH=$(jq -r --arg id "$PROJECT_ID" '.projects[] | select(.id == $id) | .path' ~/.config/opencode/projects.json)
else
  # Fallback: search by name pattern (legacy)
  WEBSITE_PATH=$(jq -r '.projects[] | select(.id | contains("website")) | .path' ~/.config/opencode/projects.json | head -1)
  
  if [ -n "$WEBSITE_PATH" ]; then
    echo "Warning: Using fallback name match. Consider configuring relatedProjects."
  fi
fi
```

## Multiple Same-Type Relationships

When a project has multiple relationships of the same type (e.g., two documentation sites), use labels to distinguish them:

```json
{
  "relatedProjects": [
    {
      "projectId": "my-app-user-docs",
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

Query with label:
```bash
USER_DOCS=$(get_related_project "documentation-site" "user-docs")
API_DOCS=$(get_related_project "documentation-site" "api-docs")
```

Query without label (returns first match):
```bash
ANY_DOCS=$(get_related_project "documentation-site")
```

## Validation

Related project references should point to valid project IDs in the registry. Invalid references will return empty paths.

To check if a relationship is valid:

```bash
RELATED_PATH=$(get_related_project "documentation-site")
if [ -z "$RELATED_PATH" ]; then
  echo "Warning: documentation-site relationship not configured or invalid"
fi
```
