---
name: agent-audit
description: "Audit AI toolkit agents for compliance and coverage gaps. Use when you need to check if agents follow conventions, or find missing agents for a project's stack. Triggers on: audit agents, agent compliance, toolkit gaps, missing agents, stack coverage."
---

# Agent Audit Skill

Scan all agents in the AI toolkit for project-context compliance and toolkit coverage gaps. Generate reports with remediation recommendations.

**Two modes:**
1. **Compliance Audit** (default) — Check if agents follow project-context conventions
2. **Gap Analysis** (`--gaps`) — Check if toolkit has agents/skills for your project's stack

## Purpose

Ensures all agents in `~/.config/opencode/agents/` follow the established conventions for:
1. Loading project context on startup
2. Checking for project-specific overrides
3. Respecting project conventions and stack choices

## Triggers

- User runs `/agent-audit` — compliance audit
- User runs `/agent-audit --fix` — auto-remediate compliance issues
- User runs `/agent-audit --gaps` — toolkit gap analysis for current project
- User runs `/agent-audit --gaps --all` — gap analysis for all registered projects
- Periodic maintenance check
- After bulk agent updates
- When Builder/Developer/Project Planner detect potential gaps (they can invoke this skill)

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `path` | No | Path to scan (default: `~/.config/opencode/agents/`) |
| `fix` | No | Automatically fix non-compliant agents (default: false) |
| `report` | No | Output format: `table`, `json`, `markdown` (default: table) |
| `include_templates` | No | Also scan agent-templates/ (default: false) |
| `gaps` | No | Run gap analysis instead of compliance audit (default: false) |
| `all` | No | With --gaps, analyze all registered projects (default: false) |
| `project` | No | With --gaps, analyze specific project path (default: current directory) |

## Compliance Criteria

### Required for All Agents

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Project Registry Check | Required | References `~/.config/opencode/projects.json` |
| Project Config Loading | Required | References `docs/project.json` |
| Conventions Loading | Required | References `docs/CONVENTIONS.md` |

### Required for Router Agents

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Project Agent Check | Required | Checks `<project>/docs/agents/` before global agents |
| Context Injection | Required | Passes project context to dispatched agents |

### Required for Primary Agents

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Startup Section | Required | Has explicit "Startup" or "Project Context" section |
| Active Project Check | Required | Verifies `activeProject` is set |

### Exemptions

Some agents are exempt from project context requirements:

| Agent | Reason |
|-------|--------|
| `session-status` | Utility that reads project state but doesn't need context injection |
| `wall-e` | Cleanup utility, operates at workspace level |

## Workflow

### Step 1: Discover Agents

```bash
# List all agent files
ls -la ~/.config/opencode/agents/*.md
```

Build a list of all agents to audit.

### Step 2: Classify Each Agent

For each agent, determine its type by analyzing content:

**Primary Agent Indicators:**
- Contains "entry point" or "starting point" language
- Has "Startup" section
- References session management
- Examples: `planner.md`, `builder.md`

**Router Agent Indicators:**
- Contains "dispatch", "route", or "delegate" language
- References multiple other agents
- Has agent selection logic
- Examples: `critic.md`, `tester.md`

**Specialist Agent Indicators:**
- Has specific technology focus
- Contains implementation instructions
- Examples: `react-dev.md`, `go-tester.md`

**Utility Agent Indicators:**
- Performs helper functions
- No code generation
- Examples: `session-status.md`, `wall-e.md`

### Step 3: Check Compliance

For each agent, check all applicable criteria:

```
Scanning: react-dev.md
  Type: Specialist
  
  Checking criteria:
    [ ] Project Registry Check    - NOT FOUND
    [ ] Project Config Loading    - NOT FOUND  
    [ ] Conventions Loading       - NOT FOUND
    
  Result: ❌ NON-COMPLIANT (0/3 criteria met)
```

### Step 4: Generate Report

**Table Format (default):**

```
═══════════════════════════════════════════════════════════════════════
                         AGENT AUDIT REPORT
═══════════════════════════════════════════════════════════════════════

  Scanned: 56 agents
  Compliant: 12 (21%)
  Partial: 8 (14%)
  Non-compliant: 34 (61%)
  Exempt: 2 (4%)

───────────────────────────────────────────────────────────────────────
  AGENT                  TYPE        STATUS      MISSING
───────────────────────────────────────────────────────────────────────
  planner.md             Primary     ✅ Pass     -
  builder.md             Primary     ✅ Pass     -
  critic.md              Router      ✅ Pass     -
  tester.md              Router      ✅ Pass     -
  react-dev.md           Specialist  ❌ Fail     registry, config, conventions
  go-dev.md              Specialist  ❌ Fail     registry, config, conventions
  vue-dev.md             Specialist  ❌ Fail     registry, config, conventions
  session-status.md      Utility     ⊘ Exempt   -
  ...

───────────────────────────────────────────────────────────────────────
  RECOMMENDED ACTIONS
───────────────────────────────────────────────────────────────────────
  
  Run the following to fix non-compliant agents:
  
    /agent-onboard ~/.config/opencode/agents/react-dev.md
    /agent-onboard ~/.config/opencode/agents/go-dev.md
    /agent-onboard ~/.config/opencode/agents/vue-dev.md
    ...
  
  Or run with --fix to auto-remediate all:
  
    /agent-audit --fix

═══════════════════════════════════════════════════════════════════════
```

**JSON Format:**

```json
{
  "summary": {
    "total": 56,
    "compliant": 12,
    "partial": 8,
    "nonCompliant": 34,
    "exempt": 2
  },
  "agents": [
    {
      "name": "react-dev.md",
      "type": "specialist",
      "status": "non-compliant",
      "missing": ["registry", "config", "conventions"],
      "fixCommand": "/agent-onboard ~/.config/opencode/agents/react-dev.md"
    }
  ]
}
```

### Step 5: Auto-Fix (if --fix)

If `--fix` flag is provided:

1. For each non-compliant agent:
   - Invoke the `agent-onboard` skill
   - Track success/failure
   
2. Generate fix report:

```
═══════════════════════════════════════════════════════════════════════
                         AUTO-FIX RESULTS
═══════════════════════════════════════════════════════════════════════

  Attempted: 34 agents
  Fixed: 32 agents
  Failed: 2 agents

  ✅ Fixed:
    - react-dev.md
    - go-dev.md
    - vue-dev.md
    ...

  ❌ Failed (manual review required):
    - custom-agent.md (parse error)
    - legacy-agent.md (no clear structure)

═══════════════════════════════════════════════════════════════════════
```

## Compliance Patterns

### Pattern: Project Context Section

Look for this pattern or similar:

```markdown
## Project Context

- References to `~/.config/opencode/projects.json`
- References to `docs/project.json`
- References to `docs/CONVENTIONS.md`
```

### Pattern: Startup Section (Primary Agents)

```markdown
## Startup

1. Read project registry
2. Load project context
3. Check for project-specific overrides
```

### Pattern: Router Context Injection

```markdown
## Routing

1. Check `<project>/docs/agents/` first
2. Fall back to `~/.config/opencode/agents/`
3. Inject project context into agent prompt
```

## Search Patterns

Use these regex patterns to check compliance:

| Criterion | Pattern |
|-----------|---------|
| Registry Check | `projects\.json` |
| Config Loading | `docs/project\.json` or `project\.json` |
| Conventions | `CONVENTIONS\.md` |
| Project Agents | `docs/agents/` |
| Startup Section | `^## (Startup|Project Context)` |

## Examples

### Example 1: Basic Audit

```
/agent-audit
```

Outputs a table showing compliance status of all agents.

### Example 2: JSON Report

```
/agent-audit --report json
```

Outputs machine-readable JSON for CI/CD integration.

### Example 3: Auto-Fix All

```
/agent-audit --fix
```

Automatically adds project context sections to all non-compliant agents.

### Example 4: Audit Templates Too

```
/agent-audit --include-templates
```

Also scans `~/.config/opencode/agent-templates/` for compliance.

## Integration with CI/CD

For automated compliance checking, add to your workflow:

```yaml
- name: Audit Agent Compliance
  run: |
    opencode --agent planner --message "/agent-audit --report json" > audit.json
    if jq '.summary.nonCompliant > 0' audit.json; then
      echo "Non-compliant agents found!"
      exit 1
    fi
```

## Related Skills

- `agent-onboard` - Fix individual non-compliant agents
- `project-bootstrap` - Set up new projects with agent support

---

# Gap Analysis Mode (`--gaps`)

Analyzes whether the toolkit has appropriate agents and skills for a project's stack and capabilities. This is the **deep on-demand analysis** complement to the lightweight startup checks in Builder/Developer/Project Planner.

## When to Use

- After bootstrapping a new project
- When adding new technologies to an existing project
- Periodic health check of toolkit coverage
- When startup gap detection flags potential issues

## How It Works

### Step 1: Load Project Context

```bash
# Read project manifest
cat <project>/docs/project.json

# Read project capabilities (if separate from stack)
# Check for any custom project agents
ls <project>/docs/agents/ 2>/dev/null
```

Extract:
- `stack.languages[]` — programming languages
- `stack.framework` — primary framework
- `testing.unit.framework` — unit testing tool
- `testing.e2e.framework` — E2E testing tool
- `styling.framework` — CSS framework
- `styling.darkMode.enabled` — dark mode support
- `database.type` — database type
- `infrastructure.*` — cloud/infra tools
- `capabilities[]` — feature capabilities
- `integrations[]` — third-party integrations

### Step 2: Inventory Available Toolkit Resources

Scan the toolkit for available coverage:

```bash
# List all agents
ls ~/.config/opencode/agents/*.md

# List all agent templates (organized by category)
ls ~/.config/opencode/agent-templates/*/*.md

# List all skills
ls ~/.config/opencode/skills/*/SKILL.md

# Read agent template metadata
for f in ~/.config/opencode/agent-templates/*/*.md; do
  head -20 "$f"  # Extract frontmatter with applies_to
done
```

### Step 3: Match Stack to Required Coverage

Map each stack element to required toolkit coverage:

| Stack Element | Required Coverage | Check For |
|---------------|-------------------|-----------|
| `languages: [typescript]` | TypeScript critics | `backend-critic-ts.md` |
| `languages: [go]` | Go critics/testers | `backend-critic-go.md`, `go-tester.md`, `go-dev.md` |
| `languages: [python]` | Python devs | `python-dev.md` |
| `languages: [java]` | Java critics | `backend-critic-java.md`, `java-dev.md` |
| `framework: next.js` | React/Next specialists | `react-dev.md`, `frontend-critic.md` |
| `framework: express` | Node/Express coverage | `backend-critic-ts.md` |
| `testing.unit.framework: jest` | Jest testers | `jest-tester.md` |
| `testing.unit.framework: go` | Go testers | `go-tester.md` |
| `testing.e2e.framework: playwright` | Playwright specialists | `ui-tester-playwright.md` |
| `styling.framework: tailwind` | Tailwind critics | `tailwind-critic.md` |
| `styling.darkMode.enabled: true` | Aesthetic critics | `aesthetic-critic.md` |
| `infrastructure.cloudformation` | CFN specialists | `cloudformation-critic.md`, `aws-dev.md` |
| `infrastructure.terraform` | Terraform specialists | `terraform-dev.md` |
| `infrastructure.docker` | Docker specialists | `docker-dev.md` |

### Step 4: Check Agent Template Applicability

Agent templates have `applies_to` frontmatter indicating when they should be installed:

```yaml
---
name: jest-react-tester
applies_to:
  - framework: react
  - framework: next.js
  - testing.unit.framework: jest
---
```

For each template, check if the project stack matches any `applies_to` condition.

### Step 5: Generate Gap Report

```
═══════════════════════════════════════════════════════════════════════
                        TOOLKIT GAP ANALYSIS
═══════════════════════════════════════════════════════════════════════

  Project: example-scheduler
  Path: ~/code/example-scheduler
  
  Stack: TypeScript, Next.js, Tailwind, Playwright, PostgreSQL

───────────────────────────────────────────────────────────────────────
  COVERAGE STATUS
───────────────────────────────────────────────────────────────────────
  
  ✅ Covered:
     • TypeScript → backend-critic-ts.md
     • Next.js → react-dev.md, frontend-critic.md
     • Tailwind → tailwind-critic.md
     • Playwright → ui-tester-playwright.md
  
  ⚠️ Partial Coverage:
     • PostgreSQL → No dedicated postgres agent (using generic backend critics)
  
  ❌ Gaps Detected:
     • Dark mode enabled but no aesthetic-critic.md in project agents
     • Has auth capability but no auth-specific patterns

───────────────────────────────────────────────────────────────────────
  RECOMMENDED TEMPLATES
───────────────────────────────────────────────────────────────────────
  
  The following templates match your stack but aren't installed:
  
  1. testing/jest-react.md
     Applies to: React + Jest
     Action: Copy to ~/code/example-scheduler/docs/agents/
  
  2. styling/aesthetic-react.md (if exists)
     Applies to: React + Dark Mode
     Action: Copy to ~/code/example-scheduler/docs/agents/

───────────────────────────────────────────────────────────────────────
  SUGGESTED ACTIONS
───────────────────────────────────────────────────────────────────────
  
  Option A: Install recommended templates
    Run: @planner to generate project-specific agents
  
  Option B: Create custom agents for gaps
    Request: @toolkit to create postgres-dev.md agent
  
  Option C: Create pending update for toolkit
    This will notify @toolkit to add missing coverage

═══════════════════════════════════════════════════════════════════════
```

### Step 6: Multi-Project Analysis (`--all`)

When `--all` is specified, analyze all registered projects:

```bash
# Get all registered projects
cat ~/.config/opencode/projects.json
```

For each project:
1. Run gap analysis
2. Aggregate results

Output summary:

```
═══════════════════════════════════════════════════════════════════════
                   TOOLKIT GAP ANALYSIS (ALL PROJECTS)
═══════════════════════════════════════════════════════════════════════

  Projects Analyzed: 5
  Fully Covered: 2
  Partial Coverage: 2
  Gaps Detected: 1

───────────────────────────────────────────────────────────────────────
  PROJECT SUMMARY
───────────────────────────────────────────────────────────────────────
  
  example-scheduler          ⚠️ Partial    Missing: aesthetic-critic
  example-portal             ✅ Covered    -
  yo-go                 ✅ Covered    -
  internal-api               ⚠️ Partial    Missing: go-tester template
  mobile-app                 ❌ Gaps       Missing: react-native support

───────────────────────────────────────────────────────────────────────
  TOOLKIT-WIDE GAPS
───────────────────────────────────────────────────────────────────────
  
  The following capabilities appear across projects but lack toolkit support:
  
  • React Native (1 project) — No react-native agents exist
  • GraphQL (2 projects) — No graphql-critic agent exists
  
  Consider creating:
    ~/.config/opencode/pending-updates/react-native-support.md
    ~/.config/opencode/pending-updates/graphql-critic.md

═══════════════════════════════════════════════════════════════════════
```

## Creating Pending Updates from Gap Analysis

When gaps are identified, the skill can generate pending update requests:

```markdown
---
createdBy: agent-audit
date: 2026-02-20
priority: normal
type: agent-request
---

# Add React Native Support

## Context

Gap analysis found 1 project using React Native with no toolkit coverage:
- mobile-app (~/code/mobile-app)

## Requested

1. Create `react-native-dev.md` agent for implementing React Native components
2. Create `react-native-critic.md` for reviewing React Native code
3. Add React Native to stack detection in `project-bootstrap` skill

## Stack Details

From mobile-app/docs/project.json:
- Framework: React Native + Expo
- Testing: Jest + React Native Testing Library
- Styling: NativeWind (Tailwind for RN)

## Priority

Normal — affects 1 project, workarounds exist (using generic react-dev)
```

## Examples

### Example 1: Analyze Current Project

```
/agent-audit --gaps
```

Analyzes the project in the current working directory.

### Example 2: Analyze Specific Project

```
/agent-audit --gaps --project ~/code/example-scheduler
```

### Example 3: Analyze All Projects

```
/agent-audit --gaps --all
```

### Example 4: JSON Output for CI

```
/agent-audit --gaps --all --report json
```

## Integration with Other Agents

### Builder/Developer/Project Planner

These agents perform **lightweight startup checks** that may detect potential gaps:

```
⚠️ Potential toolkit gap: Project uses GraphQL but no graphql-critic found.
   Run `/agent-audit --gaps` for full analysis.
```

The `agent-audit` skill provides the **deep analysis** when requested.

### Toolkit Agent

When gap analysis identifies missing toolkit coverage, it can:
1. Create pending update requests in `~/.config/opencode/pending-updates/`
2. Suggest @toolkit commands to create new agents
3. Identify agent templates that should be created
