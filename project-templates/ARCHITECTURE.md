# Architecture

> This document describes the high-level architecture of {{PROJECT_NAME}}.
> It helps AI agents and new developers understand how the codebase is organized.

## Overview

{{DESCRIPTION}}

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              {{PROJECT_NAME}}                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│  │   Client    │────▶│   Server    │────▶│  Database   │               │
│  │  (Browser)  │     │   (API)     │     │             │               │
│  └─────────────┘     └─────────────┘     └─────────────┘               │
│                                                                         │
│  <!-- Update this diagram to reflect your actual architecture -->       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
{{PROJECT_ROOT}}/
├── {{STRUCTURE}}
```

<!-- 
BOOTSTRAP NOTE: The structure above was auto-detected. 
Please expand with descriptions of what each directory contains.
Example:

├── app/                    # Next.js App Router pages and layouts
│   ├── (auth)/            # Auth-required route group
│   ├── (marketing)/       # Public marketing pages
│   └── api/               # API route handlers
├── components/            # Reusable React components
│   ├── ui/               # Base UI components (buttons, inputs, etc.)
│   └── features/         # Feature-specific components
├── lib/                   # Shared utilities and helpers
├── hooks/                 # Custom React hooks
└── types/                 # TypeScript type definitions
-->

## Core Modules

### {{MODULE_1_NAME}}

**Location:** `{{MODULE_1_PATH}}`

**Purpose:** {{MODULE_1_DESCRIPTION}}

**Key files:**
- `{{FILE_1}}` - {{FILE_1_DESCRIPTION}}
- `{{FILE_2}}` - {{FILE_2_DESCRIPTION}}

<!-- 
BOOTSTRAP NOTE: Add a section for each major module/package.
Describe its responsibility and key files.
-->

## Data Flow

### Request Lifecycle

1. **Client Request** → User action triggers a request
2. **{{STEP_2}}** → {{STEP_2_DESCRIPTION}}
3. **{{STEP_3}}** → {{STEP_3_DESCRIPTION}}
4. **Response** → Data returned to client

<!-- 
BOOTSTRAP NOTE: Describe how data flows through your application.
Examples:

For a Next.js app:
1. User action triggers Server Action or API call
2. Server Action validates input with Zod
3. Database query via Supabase/Prisma
4. Response returned, React state updated

For an API:
1. Request received by router
2. Middleware validates auth/permissions
3. Handler processes business logic
4. Repository layer accesses database
5. Response serialized and returned
-->

## Database Schema

**Type:** {{DATABASE_TYPE}}
**Client:** {{DATABASE_CLIENT}}
**Migrations:** `{{MIGRATIONS_PATH}}`

### Key Tables/Collections

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| {{TABLE_1}} | {{TABLE_1_PURPOSE}} | {{TABLE_1_RELATIONS}} |
| {{TABLE_2}} | {{TABLE_2_PURPOSE}} | {{TABLE_2_RELATIONS}} |

<!-- 
BOOTSTRAP NOTE: List your main database tables and their relationships.
This helps agents understand the data model without reading all migrations.
-->

## Authentication & Authorization

**Provider:** {{AUTH_PROVIDER}}

**Session Strategy:** {{SESSION_STRATEGY}}

**Key Concepts:**
- {{AUTH_CONCEPT_1}}
- {{AUTH_CONCEPT_2}}

<!-- 
BOOTSTRAP NOTE: Describe your auth system.
Examples:
- "Supabase Auth with Row Level Security (RLS)"
- "NextAuth.js with JWT sessions stored in cookies"
- "Custom JWT with refresh token rotation"
-->

## External Services

| Service | Purpose | Configuration |
|---------|---------|---------------|
| {{SERVICE_1}} | {{SERVICE_1_PURPOSE}} | `{{SERVICE_1_CONFIG}}` |
| {{SERVICE_2}} | {{SERVICE_2_PURPOSE}} | `{{SERVICE_2_CONFIG}}` |

<!-- 
BOOTSTRAP NOTE: List external APIs and services your app depends on.
Examples:
- Stripe for payments
- Resend for email
- OpenAI for AI features
- S3 for file storage
-->

## Deployment

**Platform:** {{DEPLOYMENT_PLATFORM}}
**Environment Variables:** `{{ENV_EXAMPLE_PATH}}`

### Environments

| Environment | URL | Branch |
|-------------|-----|--------|
| Production | {{PROD_URL}} | `main` |
| Staging | {{STAGING_URL}} | `staging` |
| Development | `localhost:{{DEV_PORT}}` | feature branches |

<!-- 
BOOTSTRAP NOTE: Describe your deployment setup.
Include CI/CD pipeline if applicable.
-->

## Key Architectural Decisions

### {{DECISION_1_TITLE}}

**Context:** {{DECISION_1_CONTEXT}}

**Decision:** {{DECISION_1_DECISION}}

**Consequences:** {{DECISION_1_CONSEQUENCES}}

<!-- 
BOOTSTRAP NOTE: Document important architectural decisions.
This helps agents understand WHY things are built a certain way.
Use ADR (Architecture Decision Record) format:

Example:
### Server Components by Default

**Context:** Need to balance performance with interactivity

**Decision:** Use React Server Components by default, add 'use client' only when needed for interactivity

**Consequences:** 
- Smaller bundle sizes
- Better SEO
- Must be intentional about client/server boundary
- Data fetching happens on server
-->

## Performance Considerations

- {{PERF_CONSIDERATION_1}}
- {{PERF_CONSIDERATION_2}}

<!-- 
BOOTSTRAP NOTE: Note any performance-critical areas.
Examples:
- "Calendar view must handle 500+ events efficiently - uses virtualization"
- "API responses must be < 200ms for real-time feel"
- "Images lazy-loaded and served via CDN"
-->

## Security Considerations

- {{SECURITY_CONSIDERATION_1}}
- {{SECURITY_CONSIDERATION_2}}

<!-- 
BOOTSTRAP NOTE: Document security-critical areas.
Examples:
- "All database access uses Row Level Security (RLS)"
- "API routes validate input with Zod before processing"
- "Sensitive operations require re-authentication"
-->

---

*Last updated: {{DATE}}*
*Auto-generated by project-bootstrap, please expand with project-specific details.*
