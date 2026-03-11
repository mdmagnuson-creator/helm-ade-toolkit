# Context Protocol v1

This document defines the standard format for passing project context from primary agents to sub-agents.

## Purpose

Primary agents (`@builder`, `@planner`) read project configuration files once at startup. Instead of sub-agents re-reading these files, primary agents pass a structured context block in the prompt. This reduces redundant file reads and ensures all agents in a chain see consistent context.

## Context Block Format

Context is passed as a YAML block wrapped in `<context>` tags:

```yaml
<context>
version: 1
project:
  path: /Users/dev/code/my-app
  stack: nextjs-prisma
  commands:
    dev: npm run dev
    test: npm test
    build: npm run build
    lint: npm run lint
conventions:
  summary: |
    TypeScript strict mode. Tailwind CSS with shadcn/ui components.
    API routes in app/api/. Server actions in lib/actions/.
    Prisma for database. Zod for validation.
  fullPath: /Users/dev/code/my-app/docs/CONVENTIONS.md
currentWork:
  prd: Add dark mode support
  story: Create theme toggle component
  branch: feature/dark-mode
</context>
```

## Fields

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | number | Protocol version (currently `1`) |
| `project.path` | string | Absolute path to project root |
| `project.stack` | string | Stack identifier from `project.json` |
| `conventions.summary` | string | 2-5 sentence summary of key conventions |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `project.commands.*` | string | Commands from `project.json` |
| `conventions.fullPath` | string | Path to full CONVENTIONS.md for deeper reads |
| `currentWork.prd` | string | Current PRD name (if in PRD mode) |
| `currentWork.story` | string | Current story being implemented |
| `currentWork.branch` | string | Current git branch |

## Guidelines

### For Primary Agents (Context Senders)

1. **Read context files once** at session start
2. **Generate summary** — Extract the most relevant conventions for the current task
3. **Include file paths** — Sub-agents may need to read full files for edge cases
4. **Keep summaries concise** — Target 50-100 tokens, max 200 tokens
5. **Place context block first** — Put `<context>` at the start of the sub-agent prompt

### For Sub-Agents (Context Receivers)

1. **Look for `<context>` block** at the start of the prompt
2. **If present:** Use provided values, avoid re-reading files
3. **If missing:** Fall back to reading `project.json` and `CONVENTIONS.md` directly
4. **If summary insufficient:** Read full file from `conventions.fullPath`

### Conventions Summary Guidelines

The `conventions.summary` should include:
- Language/framework version requirements
- Primary UI library or component system
- Directory structure conventions
- Key patterns (error handling, state management, API design)
- Testing approach

**Do not include:**
- Full lists of all patterns
- Detailed code examples
- Information not relevant to the current task

## Example: Builder Delegating to Developer

```markdown
<context>
version: 1
project:
  path: /Users/dev/code/project
  stack: nextjs-prisma
  commands:
    test: npm test
    lint: npm run lint
conventions:
  summary: |
    TypeScript strict. Tailwind + shadcn/ui. App Router.
    Server components by default. Use 'use client' only when needed.
    Prisma ORM. Zod validation on all inputs.
  fullPath: /Users/dev/code/project/docs/CONVENTIONS.md
currentWork:
  prd: print-templates
  story: US-003 Add print preview modal
  branch: feature/print-templates
</context>

Implement US-003: Add print preview modal

The print preview should show a modal with the template rendered at actual size.
Use the existing Modal component from components/ui/modal.tsx.
```

## Example: Critic Delegating to Security Critic

```markdown
<context>
version: 1
project:
  path: /Users/dev/code/project
  stack: nextjs-prisma
  commands:
    test: npm test
conventions:
  summary: |
    Auth via NextAuth.js with JWT sessions. CSRF protection via SameSite cookies.
    All API routes require authentication middleware.
    Prisma for DB queries (parameterized by default).
  fullPath: /Users/dev/code/project/docs/CONVENTIONS.md
</context>

Review the following files for security issues:
- app/api/admin/users/route.ts
- lib/auth/middleware.ts
```

## Versioning

The `version` field allows for future protocol changes. Sub-agents should:
- Accept `version: 1` (current)
- Fall back to file reads for unknown versions
- Not fail on missing version (treat as v1)

## Fallback Behavior

Sub-agents must handle missing context gracefully:

```markdown
## Receiving Context

1. Parse prompt for `<context>` block
2. If found and version supported:
   - Use `project.path` as working directory
   - Use `conventions.summary` for guidance
   - Skip reading project.json and CONVENTIONS.md
3. If not found OR version unsupported:
   - Read `<cwd>/docs/project.json`
   - Read `<cwd>/docs/CONVENTIONS.md`
   - Continue with standard behavior
4. If summary insufficient for current task:
   - Read full file from `conventions.fullPath`
```
