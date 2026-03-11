# Agent Onboard Skill

Onboard new or modified agents to ensure they are project-context aware and follow the established conventions for the AI toolkit.

## Purpose

When users create or modify agents in `~/.config/opencode/agents/`, this skill ensures the agent:
1. Loads project context on startup (`docs/project.json`, `docs/CONVENTIONS.md`)
2. Respects project-specific agent overrides in `<project>/docs/agents/`
3. Follows the established conventions for multi-project support
4. Optionally creates a template version for stack-agnostic reuse

## Triggers

- User creates a new agent file
- User modifies an existing agent
- User explicitly requests `/agent-onboard <agent-name>`
- Agent audit identifies non-compliant agents

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `agent_path` | Yes | Path to the agent file (e.g., `~/.config/opencode/agents/my-agent.md`) |
| `create_template` | No | Whether to also create an agent template (default: false) |
| `force` | No | Overwrite existing project context section (default: false) |

## Workflow

### Step 1: Validate Agent File

```bash
# Check the agent file exists
cat <agent_path>
```

Verify:
- File exists and is readable
- File is a markdown file with agent instructions
- File has a clear structure (headers, sections)

### Step 2: Analyze Current State

Check if the agent already has project context awareness:

**Look for these indicators of project awareness:**
- References to `docs/project.json`
- References to `docs/CONVENTIONS.md`
- References to `~/.config/opencode/projects.json`
- A "Project Context" or "Startup" section
- Loading project-specific configurations

**Classify the agent:**
- ✅ **Compliant**: Has full project context loading
- ⚠️ **Partial**: Has some project awareness but incomplete
- ❌ **Non-compliant**: No project context awareness

### Step 3: Determine Agent Type

Analyze the agent to determine its type:

| Type | Characteristics | Action |
|------|-----------------|--------|
| **Primary** | Entry point agent (planner, builder) | Add full startup sequence |
| **Router** | Dispatches to other agents (critic, tester) | Add project agent check + context injection |
| **Specialist** | Does specific work (react-dev, go-tester) | Add project context loading |
| **Utility** | Helper functions (session-status) | Minimal or no changes needed |

### Step 4: Generate Project Context Section

Based on agent type, generate the appropriate section:

#### For Primary Agents

```markdown
## Startup

**CRITICAL: You must load project context before doing ANYTHING else.**

1. **Read the project registry:**
   ```bash
   cat ~/.config/opencode/projects.json
   ```

2. **If `activeProject` is set, load project context:**
   - Read `<project>/docs/project.json` for stack configuration
   - Read `<project>/docs/CONVENTIONS.md` for coding standards
   - Check `<project>/docs/agents/` for project-specific agent overrides

3. **Adapt your behavior** based on the loaded context:
   - Use project-specific patterns and conventions
   - Respect the technology stack choices
   - Follow the established coding standards
```

#### For Router Agents

```markdown
## Project Context Loading

Before dispatching to any specialist agent:

1. **Load project context:**
   ```bash
   cat ~/.config/opencode/projects.json
   ```

2. **Check for project-specific agents:**
   - First check `<project>/docs/agents/` for project-specific versions
   - Fall back to global agents in `~/.config/opencode/agents/`

3. **Inject project context** into the dispatched agent's prompt:
   - Include relevant sections from `docs/project.json`
   - Include applicable conventions from `docs/CONVENTIONS.md`
```

#### For Specialist Agents

```markdown
## Project Context

Before starting work, load the project context:

1. **Read project configuration:**
   ```bash
   cat ~/.config/opencode/projects.json
   ```

2. **If `activeProject` is set:**
   - Load `<project>/docs/project.json` for stack-specific settings
   - Load `<project>/docs/CONVENTIONS.md` for coding standards

3. **Apply project conventions** to all code you write or review.
```

### Step 5: Insert Section into Agent

Insert the generated section after the agent's title/description but before its main instructions.

**Placement rules:**
1. After the `# Agent Title` header
2. After any brief description paragraph
3. Before `## Capabilities`, `## Workflow`, or similar sections
4. If no clear structure, add after the first paragraph

### Step 6: Validate Changes

After modification, verify:
- [ ] Agent file is still valid markdown
- [ ] No duplicate sections were created
- [ ] The section is properly integrated with existing content
- [ ] Agent's core functionality is preserved

### Step 7: Create Template (Optional)

If `create_template` is true and the agent is framework-agnostic:

1. Copy the agent to `~/.config/opencode/agent-templates/<agent-name>.md.hbs`
2. Replace hardcoded values with template variables:
   - Framework references → `{{PROJECT.stack.frontend.framework}}`
   - Language references → `{{PROJECT.stack.language}}`
   - Database references → `{{PROJECT.stack.database.type}}`
3. Add conditional sections for stack-specific behavior

### Step 8: Report Results

Output a summary:

```
═══════════════════════════════════════════════════════════════════════
                      AGENT ONBOARDING COMPLETE
═══════════════════════════════════════════════════════════════════════

  Agent:     my-agent.md
  Type:      Specialist
  Status:    ✅ Now project-aware

  Changes Made:
    ✓ Added Project Context section
    ✓ Added project.json loading
    ✓ Added CONVENTIONS.md loading

  Template:  ❌ Not created (use --create-template to generate)

═══════════════════════════════════════════════════════════════════════
```

## Standard Project Context Block

All agents should include this minimal block (customize based on agent type):

```markdown
## Project Context

This agent is project-context aware. On startup:

1. Load `~/.config/opencode/projects.json` to find the active project
2. Load `<project>/docs/project.json` for stack configuration  
3. Load `<project>/docs/CONVENTIONS.md` for coding standards
4. Check `<project>/docs/agents/` for project-specific overrides

Apply all project conventions to your work.
```

## Examples

### Example 1: Onboard a New Specialist Agent

```
/agent-onboard ~/.config/opencode/agents/vue-dev.md
```

**Before:**
```markdown
# Vue.js Developer Agent

Implements Vue.js components and features.

## Capabilities
- Create Vue 3 components with Composition API
- Implement Pinia stores
...
```

**After:**
```markdown
# Vue.js Developer Agent

Implements Vue.js components and features.

## Project Context

Before starting work, load the project context:

1. **Read project configuration:**
   ```bash
   cat ~/.config/opencode/projects.json
   ```

2. **If `activeProject` is set:**
   - Load `<project>/docs/project.json` for stack-specific settings
   - Load `<project>/docs/CONVENTIONS.md` for coding standards

3. **Apply project conventions** to all code you write or review.

## Capabilities
- Create Vue 3 components with Composition API
- Implement Pinia stores
...
```

### Example 2: Onboard and Create Template

```
/agent-onboard ~/.config/opencode/agents/api-dev.md --create-template
```

Creates both the updated agent AND `~/.config/opencode/agent-templates/api-dev.md.hbs`.

## Error Handling

| Error | Resolution |
|-------|------------|
| Agent file not found | Verify path and try again |
| Agent already compliant | Report status, no changes needed |
| Cannot determine agent type | Ask user to specify type |
| Template variable conflicts | Manual review required |

## Related Skills

- `agent-audit` - Scan all agents for compliance
- `project-bootstrap` - Set up new projects with agent support
