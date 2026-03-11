# Design: Project Bootstrap v2

> Comprehensive redesign of project creation and agent generation for stack-agnostic AI toolkit.

**Status:** Draft  
**Author:** AI Assistant  
**Date:** 2026-02-19

---

## Executive Summary

This design introduces three major enhancements to the AI toolkit:

1. **Spec-Driven Project Creation** — New projects start with a spec/PRD, from which we extract requirements and recommend appropriate tech stacks
2. **Stack Advisor** — Intelligent recommendation engine that suggests technology choices based on project requirements
3. **Agent Template System** — Framework-specific agent templates that get instantiated per-project, reducing bloat and improving relevance

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Design Goals](#2-design-goals)
3. [System Architecture](#3-system-architecture)
4. [Spec-Driven Project Creation](#4-spec-driven-project-creation)
5. [Stack Advisor](#5-stack-advisor)
6. [Agent Template System](#6-agent-template-system)
7. [Project Scaffolding](#7-project-scaffolding)
8. [File Structure](#8-file-structure)
9. [Migration Plan](#9-migration-plan)
10. [Implementation Phases](#10-implementation-phases)
11. [Agent Authoring Conventions](#11-agent-authoring-conventions)

---

## 1. Problem Statement

### Current Issues

**For New Projects:**
- Bootstrap skill assumes existing code to detect
- No guidance on technology choices
- No way to start from a spec/idea
- Users must manually scaffold everything

**For Agent Coverage:**
- 44+ agents hardcoded in `$OPENCODE_CONFIG/agents/`
- Many framework-specific agents irrelevant to most projects (React agents useless for Go projects)
- Missing coverage for popular frameworks (Vue, Svelte, FastAPI, Django, Rails)
- No way to customize agents per-project
- Routers don't know which specialists are relevant

**For Project Context:**
- Agents load generic templates
- Project-specific patterns require manual CONVENTIONS.md editing
- No connection between detected stack and agent behavior

---

## 2. Design Goals

| Goal | Description |
|------|-------------|
| **Spec-First** | New projects start with requirements, not technology |
| **Intelligent Defaults** | Recommend stacks based on requirements, with explanations |
| **Right-Sized Agents** | Only generate agents relevant to project's stack |
| **Extensible** | Easy to add new framework templates |
| **Backwards Compatible** | Existing projects continue to work |
| **DRY** | Templates avoid duplication; project agents reference shared knowledge |

---

## 3. System Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER INPUT                                   │
│  "Create a project" / Spec document / Feature description          │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     SPEC ANALYZER                                   │
│  • Extract product type, features, scale, integrations             │
│  • Identify technical requirements                                  │
│  • Output: RequirementsManifest                                    │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     STACK ADVISOR                                   │
│  • Match requirements to technology options                        │
│  • Score and rank stack combinations                               │
│  • Present recommendations with trade-offs                         │
│  • Output: StackDecision                                           │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PROJECT SCAFFOLDER                               │
│  • Create directory structure                                       │
│  • Generate boilerplate code                                        │
│  • Set up configurations                                            │
│  • Create database schema (if applicable)                          │
│  • Output: Scaffolded project                                      │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   AGENT GENERATOR                                   │
│  • Select relevant agent templates                                  │
│  • Customize with project context                                   │
│  • Generate project-specific agents                                 │
│  • Output: docs/agents/*.md                                        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DOCUMENTATION                                    │
│  • Generate project.json                                            │
│  • Generate ARCHITECTURE.md                                         │
│  • Generate CONVENTIONS.md                                          │
│  • Generate initial PRD from spec                                  │
│  • Output: Complete project ready for development                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Interactions

```
$OPENCODE_CONFIG/
├── skills/
│   ├── project-bootstrap/     # Orchestrates the flow
│   ├── spec-analyzer/         # NEW: Extracts requirements from specs
│   ├── stack-advisor/         # NEW: Recommends technology stacks
│   └── project-scaffold/      # NEW: Generates boilerplate
├── agent-templates/           # NEW: Framework-specific templates
├── scaffolds/                 # NEW: Project boilerplate templates
├── schemas/
│   ├── project.schema.json    # Extended with new fields
│   └── requirements.schema.json  # NEW: Spec analysis output
└── agents/
    └── [core agents only]     # Reduced to framework-agnostic agents
```

---

## 4. Spec-Driven Project Creation

### 4.1 Input Methods

Users can provide specs in multiple formats:

| Method | Example |
|--------|---------|
| **Paste text** | Direct paste of requirements |
| **File path** | `/path/to/spec.md` or `~/Documents/prd.pdf` |
| **URL** | `https://notion.so/...` or `https://docs.google.com/...` |
| **Interactive** | Answer questions to build spec |

### 4.2 Spec Analyzer Skill

**Location:** `$OPENCODE_CONFIG/skills/spec-analyzer/SKILL.md`

**Purpose:** Extract structured requirements from unstructured specs.

**Output Schema:** `RequirementsManifest`

```json
{
  "$schema": "requirements.schema.json",
  
  "productType": "saas" | "api" | "cli" | "mobile" | "desktop" | "library" | "static",
  
  "businessModel": "b2b" | "b2c" | "b2b2c" | "internal" | "open-source",
  
  "scale": {
    "initial": "mvp" | "small" | "medium" | "large",
    "target": "small" | "medium" | "large" | "enterprise",
    "userEstimate": "<1k" | "1k-10k" | "10k-100k" | "100k-1M" | ">1M"
  },
  
  "features": {
    "authentication": {
      "required": true,
      "methods": ["email", "oauth", "sso"],
      "multiTenant": true
    },
    "payments": {
      "required": true,
      "model": "subscription" | "one-time" | "usage-based" | "marketplace"
    },
    "realtime": {
      "required": true,
      "type": "websocket" | "sse" | "polling"
    },
    "fileStorage": {
      "required": false
    },
    "ai": {
      "required": true,
      "type": "llm" | "ml" | "embeddings"
    },
    "email": {
      "required": true,
      "type": "transactional" | "marketing" | "both"
    },
    "search": {
      "required": false,
      "type": "basic" | "fulltext" | "semantic"
    },
    "analytics": {
      "required": false
    },
    "i18n": {
      "required": false
    },
    "offline": {
      "required": false
    }
  },
  
  "integrations": [
    { "name": "stripe", "purpose": "payments", "required": true },
    { "name": "openai", "purpose": "ai", "required": true }
  ],
  
  "constraints": {
    "compliance": ["gdpr", "hipaa", "soc2"],
    "hosting": "cloud" | "self-hosted" | "hybrid",
    "budget": "minimal" | "moderate" | "flexible",
    "timeline": "urgent" | "normal" | "flexible",
    "teamExpertise": ["typescript", "react", "go"]
  },
  
  "entities": [
    { "name": "User", "description": "System user with auth" },
    { "name": "Organization", "description": "Multi-tenant organization" },
    { "name": "Project", "description": "User-created project within org" }
  ],
  
  "userStories": [
    {
      "id": "US-001",
      "title": "User registration",
      "description": "As a user, I can register with email or OAuth"
    }
  ]
}
```

### 4.3 Extraction Rules

The spec analyzer uses these heuristics:

| Signal in Spec | Extracted Requirement |
|----------------|----------------------|
| "SaaS", "subscription", "monthly plan" | `productType: saas`, `payments.model: subscription` |
| "teams", "organizations", "workspaces" | `authentication.multiTenant: true` |
| "real-time", "live updates", "instant" | `realtime.required: true` |
| "upload files", "attachments", "images" | `fileStorage.required: true` |
| "AI", "GPT", "LLM", "chatbot" | `ai.required: true` |
| "MVP", "prototype", "proof of concept" | `scale.initial: mvp` |
| "enterprise", "Fortune 500", "large scale" | `scale.target: enterprise` |
| "HIPAA", "healthcare", "medical" | `constraints.compliance: [hipaa]` |
| "self-hosted", "on-premise" | `constraints.hosting: self-hosted` |

---

## 5. Stack Advisor

### 5.1 Overview

The Stack Advisor recommends technology choices based on the RequirementsManifest.

**Location:** `$OPENCODE_CONFIG/skills/stack-advisor/SKILL.md`

### 5.2 Decision Framework

#### 5.2.1 Stack Archetypes

Define common stack patterns that work well together:

```yaml
archetypes:
  nextjs-supabase:
    name: "Next.js + Supabase"
    description: "Full-stack TypeScript with managed backend"
    frontend: nextjs
    backend: nextjs-api  # API routes
    database: supabase
    auth: supabase-auth
    hosting: vercel
    strengths:
      - Fast development
      - Low ops burden
      - Great DX
      - Built-in realtime
    weaknesses:
      - Vendor lock-in
      - Cost at scale
      - Limited backend customization
    bestFor:
      - MVPs
      - Small teams
      - TypeScript-only teams
    notFor:
      - Complex backend logic
      - Self-hosted requirements
      - Very high scale
    
  nextjs-prisma-postgres:
    name: "Next.js + Prisma + PostgreSQL"
    description: "Full-stack TypeScript with more control"
    frontend: nextjs
    backend: nextjs-api
    database: postgres
    orm: prisma
    auth: nextauth
    hosting: vercel | aws | railway
    strengths:
      - More control than Supabase
      - Portable (no vendor lock-in)
      - Type-safe database access
    weaknesses:
      - More setup required
      - Manage your own DB
      - No built-in realtime
    bestFor:
      - Growing startups
      - Teams wanting portability
    notFor:
      - Rapid MVPs (more setup)
      
  nextjs-go-postgres:
    name: "Next.js + Go API + PostgreSQL"
    description: "React frontend with high-performance Go backend"
    frontend: nextjs
    backend: go-chi | go-gin
    database: postgres
    auth: custom | auth0
    hosting: vercel + aws | fly.io
    strengths:
      - Very high performance
      - Type-safe frontend and backend
      - Scales well
      - Low cloud costs
    weaknesses:
      - Two languages to maintain
      - More complex deployment
      - Longer initial setup
    bestFor:
      - Performance-critical apps
      - Teams with Go experience
      - High-scale applications
    notFor:
      - MVPs (overkill)
      - TypeScript-only teams
      
  remix-cloudflare:
    name: "Remix + Cloudflare"
    description: "Edge-first full-stack React"
    frontend: remix
    backend: remix
    database: d1 | turso
    auth: remix-auth
    hosting: cloudflare-pages
    strengths:
      - Edge performance
      - Low latency globally
      - Cost-effective at scale
    weaknesses:
      - Smaller ecosystem
      - Edge runtime limitations
    bestFor:
      - Global applications
      - Content-heavy sites
      
  api-only-go:
    name: "Go API Service"
    description: "Backend API without frontend"
    frontend: none
    backend: go-chi | go-gin
    database: postgres | dynamodb
    auth: jwt
    hosting: aws-lambda | ecs | k8s
    strengths:
      - High performance
      - Low resource usage
      - Simple deployment
    weaknesses:
      - No frontend included
    bestFor:
      - API services
      - Microservices
      - Backend for mobile apps
      
  python-fastapi:
    name: "FastAPI + PostgreSQL"
    description: "Python async API with ML capabilities"
    frontend: none | nextjs
    backend: fastapi
    database: postgres
    orm: sqlalchemy
    auth: fastapi-users
    hosting: aws | gcp | railway
    strengths:
      - Great for ML/AI workloads
      - Excellent documentation (auto-generated)
      - Async performance
    weaknesses:
      - Python typing less strict
      - Deployment more complex than Node
    bestFor:
      - ML/AI applications
      - Data-heavy backends
      - Teams with Python expertise
```

#### 5.2.2 Scoring Algorithm

For each archetype, calculate a fit score:

```python
def score_archetype(archetype, requirements):
    score = 100  # Start with perfect score
    reasons = []
    
    # Feature compatibility
    if requirements.realtime.required and not archetype.supports_realtime:
        score -= 20
        reasons.append("No built-in realtime support")
    
    # Scale compatibility
    if requirements.scale.target == "enterprise" and archetype.max_scale == "medium":
        score -= 30
        reasons.append("May not scale to enterprise level")
    
    # Constraint compatibility
    if "self-hosted" in requirements.constraints.hosting:
        if archetype.requires_managed_service:
            score -= 50
            reasons.append("Requires managed services, not self-hostable")
    
    # Team expertise boost
    for lang in requirements.constraints.teamExpertise:
        if lang in archetype.languages:
            score += 10
            reasons.append(f"Team knows {lang}")
    
    # Timeline compatibility
    if requirements.constraints.timeline == "urgent":
        score += archetype.setup_speed_score
        
    return score, reasons
```

#### 5.2.3 Presentation

Present top 3 options with trade-offs:

```
═══════════════════════════════════════════════════════════════════════
                        STACK RECOMMENDATIONS
═══════════════════════════════════════════════════════════════════════

Based on your requirements:
  • B2B SaaS with multi-tenant auth
  • Subscription payments
  • Real-time dashboard
  • AI/LLM features
  • MVP timeline, scaling to 10k users

───────────────────────────────────────────────────────────────────────

#1 RECOMMENDED: Next.js + Supabase                        Score: 92/100
───────────────────────────────────────────────────────────────────────

  Frontend:   Next.js 15 (App Router)
  Backend:    Next.js API Routes + Supabase Edge Functions
  Database:   Supabase (PostgreSQL)
  Auth:       Supabase Auth (supports orgs)
  Payments:   Stripe
  AI:         OpenAI + Supabase Vector
  Hosting:    Vercel + Supabase Cloud
  
  ✅ Why this fits:
     • Built-in multi-tenant auth with organizations
     • Real-time subscriptions out of the box
     • Vector database for AI features
     • Fastest path to MVP
     • Your team knows TypeScript
  
  ⚠️ Trade-offs:
     • Vendor lock-in (migration effort if you outgrow)
     • Costs increase at scale (~$500/mo at 10k users)
  
  💰 Estimated cost: $25/mo (MVP) → $500/mo (10k users)
  ⏱️ Time to MVP: 2-3 weeks

───────────────────────────────────────────────────────────────────────

#2 ALTERNATIVE: Next.js + Prisma + PostgreSQL             Score: 85/100
───────────────────────────────────────────────────────────────────────

  Frontend:   Next.js 15 (App Router)
  Backend:    Next.js API Routes
  Database:   PostgreSQL (Neon or Railway)
  Auth:       NextAuth.js
  Payments:   Stripe
  AI:         OpenAI + pgvector
  Hosting:    Vercel + Neon
  
  ✅ Why this fits:
     • More portable (no Supabase lock-in)
     • Lower cost at scale
     • Full control over auth logic
  
  ⚠️ Trade-offs:
     • More setup for auth, realtime
     • Need to implement organization logic yourself
     • ~1 week longer to MVP
  
  💰 Estimated cost: $20/mo (MVP) → $200/mo (10k users)
  ⏱️ Time to MVP: 3-4 weeks

───────────────────────────────────────────────────────────────────────

#3 SCALE-READY: Next.js + Go API + PostgreSQL             Score: 78/100
───────────────────────────────────────────────────────────────────────

  Frontend:   Next.js 15 (App Router)
  Backend:    Go (Chi framework)
  Database:   PostgreSQL (RDS or self-managed)
  Auth:       Custom JWT + Go middleware
  Payments:   Stripe
  AI:         OpenAI (Go client)
  Hosting:    Vercel + AWS ECS/Lambda
  
  ✅ Why this fits:
     • Scales to millions of users
     • Low operational cost at scale
     • High performance backend
  
  ⚠️ Trade-offs:
     • Two languages (TypeScript + Go)
     • More complex deployment
     • Significantly longer MVP time
     • Team needs to learn Go
  
  💰 Estimated cost: $50/mo (MVP) → $150/mo (10k users)
  ⏱️ Time to MVP: 5-6 weeks

═══════════════════════════════════════════════════════════════════════

Which would you like?

  1. Option 1 (Next.js + Supabase) - Recommended
  2. Option 2 (Next.js + Prisma)
  3. Option 3 (Next.js + Go)
  4. Show me more options
  5. I want to customize / specify my own

> _
═══════════════════════════════════════════════════════════════════════
```

### 5.3 Stack Database

Maintain a database of technology options:

**Location:** `$OPENCODE_CONFIG/data/stacks.yaml`

```yaml
# Frontend Frameworks
frontends:
  nextjs:
    name: "Next.js"
    type: "fullstack-react"
    languages: [typescript, javascript]
    features:
      - ssr
      - ssg
      - api-routes
      - app-router
    learning_curve: easy
    ecosystem_size: large
    
  remix:
    name: "Remix"
    type: "fullstack-react"
    languages: [typescript, javascript]
    features:
      - ssr
      - nested-routes
      - edge-ready
    learning_curve: medium
    ecosystem_size: medium
    
  vue-nuxt:
    name: "Nuxt"
    type: "fullstack-vue"
    languages: [typescript, javascript]
    features:
      - ssr
      - ssg
      - auto-imports
    learning_curve: easy
    ecosystem_size: medium
    
  sveltekit:
    name: "SvelteKit"
    type: "fullstack-svelte"
    languages: [typescript, javascript]
    features:
      - ssr
      - minimal-js
      - fast-builds
    learning_curve: easy
    ecosystem_size: small

# Backend Frameworks
backends:
  go-chi:
    name: "Chi (Go)"
    languages: [go]
    type: "api"
    features:
      - middleware
      - routing
      - lightweight
    performance: very-high
    learning_curve: medium
    
  go-gin:
    name: "Gin (Go)"
    languages: [go]
    type: "api"
    features:
      - middleware
      - validation
      - swagger
    performance: very-high
    learning_curve: medium
    
  fastapi:
    name: "FastAPI"
    languages: [python]
    type: "api"
    features:
      - async
      - auto-docs
      - validation
    performance: high
    learning_curve: easy
    
  express:
    name: "Express"
    languages: [typescript, javascript]
    type: "api"
    features:
      - middleware
      - large-ecosystem
    performance: medium
    learning_curve: easy
    
  fastify:
    name: "Fastify"
    languages: [typescript, javascript]
    type: "api"
    features:
      - fast
      - schema-validation
      - plugins
    performance: high
    learning_curve: easy

# Databases
databases:
  supabase:
    name: "Supabase"
    type: "postgres"
    managed: true
    features:
      - realtime
      - auth
      - storage
      - edge-functions
      - vector
    free_tier: true
    
  postgres:
    name: "PostgreSQL"
    type: "relational"
    managed: false
    features:
      - acid
      - json
      - full-text-search
    providers:
      - neon (serverless)
      - railway
      - aws-rds
      - self-hosted
      
  planetscale:
    name: "PlanetScale"
    type: "mysql"
    managed: true
    features:
      - branching
      - serverless
      - vitess
    free_tier: true
    
  mongodb:
    name: "MongoDB Atlas"
    type: "document"
    managed: true
    features:
      - flexible-schema
      - aggregation
      - atlas-search
    free_tier: true

# Auth Providers
auth:
  supabase-auth:
    name: "Supabase Auth"
    features: [email, oauth, magic-link, phone, organizations]
    requires: supabase
    
  nextauth:
    name: "NextAuth.js"
    features: [email, oauth, credentials]
    requires: nextjs
    
  clerk:
    name: "Clerk"
    features: [email, oauth, magic-link, organizations, user-management]
    managed: true
    free_tier: true
    
  auth0:
    name: "Auth0"
    features: [email, oauth, sso, mfa, organizations]
    managed: true
    enterprise: true
```

---

## 6. Agent Template System

### 6.1 Overview

Replace hardcoded framework-specific agents with a template system:

- **Core agents** remain in `$OPENCODE_CONFIG/agents/` (framework-agnostic)
- **Templates** live in `$OPENCODE_CONFIG/agent-templates/` (framework-specific)
- **Project agents** generated in `<project>/docs/agents/` (customized for project)

### 6.2 Core Agents (Always Present)

These agents are framework-agnostic and remain global:

```
$OPENCODE_CONFIG/agents/
├── coordinators/
│   ├── developer.md              # Main implementation coordinator
│   ├── overlord.md           # Multi-story coordinator
│   ├── builder.md            # Session manager
│   └── planner.md            # PRD refinement
├── routers/
│   ├── critic.md             # Routes to appropriate critics
│   ├── tester.md             # Routes to appropriate testers
│   └── qa.md                 # Routes to QA agents
├── utilities/
│   ├── felix.md              # PR watcher
│   ├── hammer.md             # Issue fixer
│   ├── wall-e.md             # Cleanup
│   ├── debugger.md           # Log investigation
│   └── session-status.md     # Dashboard
├── prd/
│   ├── prd.md                # PRD generation
│   └── prd-impact-analyzer.md
├── writers/
│   ├── docs-writer.md        # Detects system at runtime
│   ├── tools-writer.md       # Detects system at runtime
│   └── support-article-writer.md
└── generic-critics/
    ├── api-critic.md         # API design (framework-agnostic)
    ├── network-critic.md     # Network resilience
    ├── security-critic.md    # Security patterns
    ├── exploit-critic.md     # Adversarial review
    ├── prompt-critic.md      # AI prompt review
    ├── comment-critic.md     # Comment quality
    ├── dx-critic.md          # Developer experience
    ├── requirements-critic.md
    ├── copy-critic.md
    └── seo-critic.md
```

### 6.3 Agent Templates

Organized by category and framework:

```
$OPENCODE_CONFIG/agent-templates/
├── frontend/
│   ├── react.md              # React patterns (used by Next.js, CRA, Remix)
│   ├── vue.md                # Vue patterns
│   ├── svelte.md             # Svelte patterns
│   ├── angular.md            # Angular patterns
│   └── solid.md              # SolidJS patterns
├── backend/
│   ├── node-express.md       # Express patterns
│   ├── node-fastify.md       # Fastify patterns
│   ├── node-nextjs.md        # Next.js API routes
│   ├── go-chi.md             # Go Chi patterns
│   ├── go-gin.md             # Go Gin patterns
│   ├── python-fastapi.md     # FastAPI patterns
│   ├── python-django.md      # Django patterns
│   ├── ruby-rails.md         # Rails patterns
│   ├── java-spring.md        # Spring Boot patterns
│   └── java-netty.md         # Netty patterns
├── styling/
│   ├── tailwind.md           # Tailwind CSS patterns
│   ├── css-modules.md        # CSS Modules patterns
│   ├── styled-components.md  # Styled Components patterns
│   └── sass.md               # Sass/SCSS patterns
├── testing/
│   ├── jest-react.md         # Jest + RTL for React
│   ├── jest-node.md          # Jest for Node backends
│   ├── vitest.md             # Vitest testing
│   ├── go-test.md            # Go testing with testify
│   ├── pytest.md             # Python pytest
│   ├── rspec.md              # Ruby RSpec
│   ├── playwright.md         # Playwright E2E
│   └── cypress.md            # Cypress E2E
├── critics/
│   ├── typescript.md         # TypeScript-specific review
│   ├── go.md                 # Go-specific review
│   ├── python.md             # Python-specific review
│   ├── ruby.md               # Ruby-specific review
│   ├── java.md               # Java-specific review
│   └── rust.md               # Rust-specific review
└── infra/
    ├── docker.md             # Docker patterns
    ├── terraform.md          # Terraform patterns
    ├── cloudformation.md     # CloudFormation patterns
    ├── cdk.md                # AWS CDK patterns
    └── kubernetes.md         # K8s patterns
```

### 6.4 Template Structure

Each template contains:

1. **Base instructions** (framework-specific patterns)
2. **Placeholder sections** (filled with project context)
3. **Convention references** (points to CONVENTIONS.md)

Example template (`frontend/react.md`):

```markdown
---
template: frontend/react
description: React component development patterns
applies_to:
  frameworks: [react, nextjs, remix, gatsby]
generates: frontend-dev.md
---

# {{AGENT_NAME}} Agent Instructions

You are a specialized React development agent for {{PROJECT_NAME}}.

## Your Task

0. **Load Project Context (FIRST)**
   - **Read `docs/project.json`** — project configuration
   - **Read `docs/CONVENTIONS.md`** — coding patterns (authoritative)
   - Project context overrides generic guidance below.

## React Patterns

### Component Structure

{{#if CONVENTIONS.componentPattern}}
Follow the component pattern from CONVENTIONS.md:
```tsx
{{CONVENTIONS.componentPattern}}
```
{{else}}
Use functional components with TypeScript:
```tsx
import { type FC } from 'react'

interface {{ComponentName}}Props {
  // props
}

export const {{ComponentName}}: FC<{{ComponentName}}Props> = (props) => {
  return (...)
}
```
{{/if}}

### State Management

{{#if PROJECT.stateManagement}}
This project uses {{PROJECT.stateManagement}} for state management.
{{else}}
- Use `useState` for local component state
- Use `useReducer` for complex state logic
- Use context for cross-cutting concerns (auth, theme)
{{/if}}

### Hooks

{{#if CONVENTIONS.hookPatterns}}
Follow hook patterns from CONVENTIONS.md.
{{else}}
- Custom hooks go in `{{PROJECT.apps.web.structure.hooks || 'hooks/'}}`
- Prefix with `use`: `useAuth`, `useUser`, `useDebounce`
- Extract reusable logic into hooks
{{/if}}

### Styling

{{#if PROJECT.styling.framework == 'tailwind'}}
Use Tailwind CSS for styling:
- Direct utility classes preferred
- Use `cn()` for conditional classes
- Extract components for repeated patterns
{{else if PROJECT.styling.framework == 'css-modules'}}
Use CSS Modules:
- One `.module.css` per component
- Import as `styles`
- Use `styles.className` syntax
{{else}}
Follow project styling conventions from CONVENTIONS.md.
{{/if}}

### Data Fetching

{{#if PROJECT.apps.web.framework == 'nextjs'}}
Use Next.js data fetching patterns:
- Server Components for read operations
- Server Actions for mutations
- `use` hook for client-side data
{{else}}
Use the project's data fetching pattern from CONVENTIONS.md.
{{/if}}

## File Locations

- Components: `{{PROJECT.apps.web.structure.components || 'src/components/'}}`
- Pages/Routes: `{{PROJECT.apps.web.entryPoint || 'src/app/'}}`
- Hooks: `{{PROJECT.apps.web.structure.hooks || 'src/hooks/'}}`
- Utils: `{{PROJECT.apps.web.structure.lib || 'src/lib/'}}`

## Quality Checks

After making changes:
1. Run `{{PROJECT.commands.typecheck || 'npm run typecheck'}}`
2. Run `{{PROJECT.commands.lint || 'npm run lint'}}`
3. Run `{{PROJECT.commands.test || 'npm test'}}` if tests affected

## Stop Condition

After completing the implementation, reply with:
<promise>COMPLETE</promise>
```

### 6.5 Template Instantiation

When generating project agents:

```javascript
function generateProjectAgent(templatePath, projectConfig, conventions) {
  const template = readTemplate(templatePath);
  
  // Create context for template rendering
  const context = {
    PROJECT: projectConfig,
    CONVENTIONS: conventions,
    AGENT_NAME: deriveAgentName(templatePath, projectConfig),
    PROJECT_NAME: projectConfig.name,
  };
  
  // Render template with context
  const agentContent = renderTemplate(template, context);
  
  // Write to project's agents directory
  const outputName = template.frontmatter.generates;
  writeFile(`${projectConfig.path}/docs/agents/${outputName}`, agentContent);
}
```

### 6.6 Router Updates

Update routers to look in project's agents first:

```markdown
# critic.md (updated)

## Routing Logic

1. **Check project agents first:**
   - Read `docs/agents/` in the project directory
   - If a matching critic exists, use it
   
2. **Fall back to global critics:**
   - Use core critics from $OPENCODE_CONFIG/agents/

3. **Routing by file type:**
   | File Pattern | Project Agent | Fallback |
   |--------------|---------------|----------|
   | `*.tsx`, `*.jsx` | `docs/agents/frontend-critic.md` | None (skip) |
   | `*.go` | `docs/agents/backend-critic.md` | None (skip) |
   | `*.py` | `docs/agents/backend-critic.md` | None (skip) |
   | `*.ts` (API) | `docs/agents/api-critic.md` | `api-critic.md` |
   | Any | `security-critic.md` | Always run |
   | Any | `network-critic.md` | If has network calls |
```

---

## 7. Project Scaffolding

### 7.1 Overview

Generate project boilerplate based on selected stack.

**Location:** `$OPENCODE_CONFIG/skills/project-scaffold/SKILL.md`

### 7.2 Scaffold Templates

```
$OPENCODE_CONFIG/scaffolds/
├── nextjs-supabase/
│   ├── scaffold.yaml         # Scaffold configuration
│   ├── files/                # Template files
│   │   ├── package.json.hbs
│   │   ├── tsconfig.json
│   │   ├── next.config.ts.hbs
│   │   ├── tailwind.config.ts
│   │   ├── app/
│   │   │   ├── layout.tsx.hbs
│   │   │   ├── page.tsx.hbs
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   └── ui/
│   │   │       └── button.tsx
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts.hbs
│   │   │   │   └── server.ts.hbs
│   │   │   └── utils.ts
│   │   └── supabase/
│   │       └── migrations/
│   │           └── 00001_initial_schema.sql.hbs
│   └── post-scaffold.sh      # Post-generation script
├── nextjs-prisma/
│   ├── scaffold.yaml
│   ├── files/
│   └── post-scaffold.sh
├── go-chi-postgres/
│   ├── scaffold.yaml
│   ├── files/
│   │   ├── go.mod.hbs
│   │   ├── main.go.hbs
│   │   ├── cmd/
│   │   ├── internal/
│   │   └── Makefile
│   └── post-scaffold.sh
└── python-fastapi/
    ├── scaffold.yaml
    ├── files/
    └── post-scaffold.sh
```

### 7.3 Scaffold Configuration

Example `scaffold.yaml`:

```yaml
name: nextjs-supabase
description: Next.js 15 with Supabase backend

variables:
  - name: projectName
    prompt: "Project name"
    transform: kebab-case
  - name: description
    prompt: "Project description"
  - name: supabaseProjectId
    prompt: "Supabase project ID (or 'local' for local dev)"
    default: local

dependencies:
  production:
    - next@15
    - react@19
    - react-dom@19
    - "@supabase/supabase-js"
    - "@supabase/ssr"
    - tailwindcss@4
    - clsx
    - tailwind-merge
  development:
    - typescript
    - "@types/react"
    - "@types/node"
    - eslint
    - eslint-config-next
    - prettier
    - prettier-plugin-tailwindcss

conditionalDependencies:
  - if: features.payments
    add: [stripe, "@stripe/stripe-js"]
  - if: features.email
    add: [resend]
  - if: features.ai
    add: [openai, ai]

structure:
  - src/app/              # Next.js App Router
  - src/components/ui/    # Base UI components
  - src/components/       # Feature components
  - src/hooks/            # Custom hooks
  - src/lib/              # Utilities
  - src/lib/supabase/     # Supabase clients
  - supabase/migrations/  # Database migrations
  - docs/                 # Documentation

files:
  - template: package.json.hbs
    output: package.json
  - template: tsconfig.json
    output: tsconfig.json
  - template: next.config.ts.hbs
    output: next.config.ts
  # ... more files

postScaffold:
  - npm install
  - npx supabase init (if supabaseProjectId != 'skip')
  - git init && git add . && git commit -m "Initial scaffold"
```

### 7.4 Database Schema Generation

For specs with entities, generate initial schema:

```sql
-- Generated from spec entities
-- 00001_initial_schema.sql

-- Users table (from Supabase Auth)
-- Supabase creates auth.users automatically

-- Organizations (multi-tenant)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization members
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Add more tables based on spec entities...
{{#each entities}}
{{#unless (eq name "User")}}
{{#unless (eq name "Organization")}}

-- {{name}}: {{description}}
CREATE TABLE {{snakeCase name}}s (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  -- Add fields based on entity description
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE {{snakeCase name}}s ENABLE ROW LEVEL SECURITY;
{{/unless}}
{{/unless}}
{{/each}}
```

---

## 8. File Structure

### 8.1 Global Toolkit Structure (Updated)

```
$OPENCODE_CONFIG/
├── agents/                    # Core agents only (reduced)
│   ├── coordinators/
│   ├── routers/
│   ├── utilities/
│   ├── prd/
│   ├── writers/
│   └── generic-critics/
├── agent-templates/           # NEW: Framework templates
│   ├── frontend/
│   ├── backend/
│   ├── styling/
│   ├── testing/
│   ├── critics/
│   └── infra/
├── scaffolds/                 # NEW: Project boilerplate
│   ├── nextjs-supabase/
│   ├── nextjs-prisma/
│   ├── go-chi-postgres/
│   └── python-fastapi/
├── skills/
│   ├── project-bootstrap/     # Updated with new flow
│   ├── spec-analyzer/         # NEW
│   ├── stack-advisor/         # NEW
│   ├── project-scaffold/      # NEW
│   ├── prd/
│   ├── prd-to-json/
│   └── ...
├── templates/
│   ├── ARCHITECTURE.md
│   └── CONVENTIONS.md
├── schemas/
│   ├── project.schema.json
│   └── requirements.schema.json  # NEW
├── data/
│   └── stacks.yaml            # NEW: Stack database
└── projects.json
```

### 8.2 Project Structure (With Generated Agents)

```
my-project/
├── src/                       # Source code (scaffolded)
├── docs/
│   ├── project.json           # Project manifest
│   ├── ARCHITECTURE.md        # System design
│   ├── CONVENTIONS.md         # Coding patterns
│   ├── agents/                # NEW: Project-specific agents
│   │   ├── frontend-dev.md    # Generated from react.md
│   │   ├── backend-dev.md     # Generated from node-nextjs.md
│   │   ├── frontend-critic.md # Generated from typescript.md + react
│   │   ├── backend-critic.md  # Generated from typescript.md
│   │   ├── styling-critic.md  # Generated from tailwind.md
│   │   ├── unit-tester.md     # Generated from jest-react.md
│   │   └── playwright-tester.md # Generated from playwright.md
│   ├── prds/
│   │   └── prd-mvp.md         # Generated from spec
│   ├── prd-registry.json
│   └── session-locks.json
└── AGENTS.md
```

---

## 9. Migration Plan

### 9.1 Phase 1: Restructure Agents

1. Create `agent-templates/` directory structure
2. Move framework-specific agents to templates:
   - `react-dev.md` → `agent-templates/frontend/react.md`
   - `go-dev.md` → `agent-templates/backend/go-chi.md`
   - etc.
3. Keep core agents in `agents/`
4. Update routers to check project agents first

### 9.2 Phase 2: Create New Skills

1. Create `spec-analyzer` skill
2. Create `stack-advisor` skill
3. Create `project-scaffold` skill
4. Update `project-bootstrap` to orchestrate

### 9.3 Phase 3: Create Scaffolds

1. Create scaffold for most common stack (Next.js + Supabase)
2. Add scaffolds for other popular stacks
3. Test end-to-end flow

### 9.4 Phase 4: Fill Coverage Gaps

1. Add missing framework templates (Vue, Svelte, FastAPI, etc.)
2. Add missing testing templates (Vitest, pytest, etc.)
3. Add missing critic templates

### 9.5 Backwards Compatibility

- Existing projects continue to work (no `docs/agents/` = use global)
- Existing `project.json` files remain valid
- Can run new bootstrap on existing projects to generate project agents

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1) ✅ COMPLETE
- [x] Create requirements.schema.json
- [x] Create stacks.yaml database
- [x] Create spec-analyzer skill
- [x] Create stack-advisor skill
- [x] Update project-bootstrap to orchestrate new flow

### Phase 2: Agent Templates (Week 2) ✅ COMPLETE
- [x] Create agent-templates/ directory structure
- [x] Create frontend templates (react.md, vue.md, svelte.md)
- [x] Create backend templates (go-chi.md, node-express.md, python-fastapi.md)
- [x] Create styling templates (tailwind.md)
- [x] Create testing templates (jest-react.md, go-test.md, pytest.md, playwright.md)
- [x] Create critic templates (typescript.md, go.md, python.md)
- [x] Update routers (critic.md, tester.md) to check project agents first
- [x] Add agent generation step to project-bootstrap skill

### Phase 3: Scaffolding (Week 3) ✅ COMPLETE
- [x] Create scaffolds/ directory structure
- [x] Create project-scaffold skill
- [x] Create nextjs-supabase scaffold (37 files)
- [x] Create nextjs-prisma scaffold (27 files)
- [x] Create go-chi-postgres scaffold (23 files)
- [ ] Update project-bootstrap to invoke project-scaffold skill
- [ ] Test end-to-end new project flow

### Phase 3.5: Agent Governance ✅ COMPLETE
- [x] Create agent-onboard skill for onboarding new agents
- [x] Create agent-audit skill for compliance checking
- [x] Enhance router agents with explicit project registry loading
- [x] Document agent authoring conventions (Section 11)
- [x] Add prompt fields to opencode.json for planner and builder

### Phase 4: Coverage Expansion (Week 4+)
- [ ] Add Vue/Nuxt templates
- [ ] Add Svelte/SvelteKit templates
- [ ] Add FastAPI templates
- [ ] Add Django templates
- [ ] Add Rails templates
- [ ] Add Vitest, pytest, RSpec testing templates
- [ ] Add more scaffold options

---

## Appendix A: Spec Analyzer Prompts

### A.1 Product Type Detection

```
Analyze the following spec and determine the product type:

Categories:
- saas: Web application with user accounts, usually subscription-based
- api: Backend API service without frontend
- cli: Command-line tool
- mobile: Mobile application
- desktop: Desktop application
- library: Reusable code library/package
- static: Static website (marketing, docs)

Spec:
"""
{{SPEC}}
"""

Product type and reasoning:
```

### A.2 Feature Extraction

```
Extract required features from this spec:

Features to check for:
- Authentication (user accounts, login, registration)
- Multi-tenant (organizations, teams, workspaces)
- Payments (subscriptions, one-time, marketplace)
- Real-time (live updates, WebSockets, notifications)
- File storage (uploads, images, documents)
- AI/LLM (chatbots, embeddings, ML)
- Email (transactional, marketing)
- Search (basic, full-text, semantic)
- Analytics (tracking, dashboards)
- Internationalization (multiple languages)
- Offline support

Spec:
"""
{{SPEC}}
"""

For each feature, indicate: required (yes/no), details, evidence from spec.
```

---

## Appendix B: Stack Compatibility Matrix

| Requirement | Next.js+Supabase | Next.js+Prisma | Next.js+Go | Remix | SvelteKit |
|-------------|------------------|----------------|------------|-------|-----------|
| SSR | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auth | ✅ Built-in | 🔧 NextAuth | 🔧 Custom | 🔧 remix-auth | 🔧 lucia |
| Multi-tenant | ✅ Orgs | 🔧 Manual | 🔧 Manual | 🔧 Manual | 🔧 Manual |
| Realtime | ✅ Built-in | 🔧 Pusher/etc | 🔧 Custom | 🔧 Manual | 🔧 Manual |
| Payments | 🔧 Stripe | 🔧 Stripe | 🔧 Stripe | 🔧 Stripe | 🔧 Stripe |
| Scale | Medium | High | Very High | High | Medium |
| Self-host | ❌ | ✅ | ✅ | ✅ | ✅ |
| Setup time | Fast | Medium | Slow | Medium | Medium |

---

## Appendix C: Example End-to-End Flow

### User Input
```
I want to build a project management tool for small agencies.
Teams can create projects, add tasks, and track time.
Need Stripe for subscriptions and Slack integration.
```

### Spec Analysis Output
```json
{
  "productType": "saas",
  "businessModel": "b2b",
  "scale": { "initial": "mvp", "target": "small" },
  "features": {
    "authentication": { "required": true, "multiTenant": true },
    "payments": { "required": true, "model": "subscription" }
  },
  "integrations": [
    { "name": "stripe", "purpose": "payments" },
    { "name": "slack", "purpose": "notifications" }
  ],
  "entities": [
    { "name": "Organization", "description": "Agency" },
    { "name": "Project", "description": "Client project" },
    { "name": "Task", "description": "Work item" },
    { "name": "TimeEntry", "description": "Tracked time" }
  ]
}
```

### Stack Recommendation
```
#1: Next.js + Supabase (Score: 94)
- Built-in orgs for multi-tenant
- Fast to build
- Good for small scale

#2: Next.js + Prisma (Score: 86)
- More portable
- Lower cost at scale
```

### Generated Files
```
agency-pm/
├── src/app/
│   ├── (auth)/login/page.tsx
│   ├── (auth)/register/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── projects/
│   │   └── time/
│   └── api/webhooks/stripe/route.ts
├── supabase/migrations/
│   └── 00001_initial_schema.sql  # organizations, projects, tasks, time_entries
├── docs/
│   ├── project.json
│   ├── agents/
│   │   ├── frontend-dev.md
│   │   ├── backend-dev.md
│   │   └── tester.md
│   └── prds/
│       └── prd-mvp.md  # 12 user stories extracted
└── AGENTS.md
```

---

## 11. Agent Authoring Conventions

### 11.1 Overview

All agents in the AI toolkit must be **project-context aware**. This ensures agents adapt their behavior based on each project's technology stack, coding conventions, and specific requirements.

### 11.2 Compliance Requirements

Every agent must include a **Project Context** section that loads project configuration before performing any work.

#### Required for All Agents

| Criterion | Description |
|-----------|-------------|
| Project Registry Check | Load `$OPENCODE_CONFIG/projects.json` to find active project |
| Project Config Loading | Load `<project>/docs/project.json` for stack configuration |
| Conventions Loading | Load `<project>/docs/CONVENTIONS.md` for coding standards |

#### Additional Requirements by Agent Type

| Agent Type | Additional Requirements |
|------------|------------------------|
| **Primary** (planner, builder) | Full startup sequence with project selection |
| **Router** (critic, tester) | Check project-specific agents before global, inject context |
| **Specialist** (react-dev, go-tester) | Load and apply project conventions |
| **Utility** (session-status, wall-e) | Minimal — may be exempt |

### 11.3 Standard Project Context Block

All agents should include this section (customize based on agent type):

#### For Primary Agents

```markdown
## Startup

**CRITICAL: You must load project context before doing ANYTHING else.**

1. **Read the project registry:**
   ```bash
   cat $OPENCODE_CONFIG/projects.json
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
   cat $OPENCODE_CONFIG/projects.json
   ```

2. **Check for project-specific agents:**
   - First check `<project>/docs/agents/` for project-specific versions
   - Fall back to global agents in `$OPENCODE_CONFIG/agents/`

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
   cat $OPENCODE_CONFIG/projects.json
   ```

2. **If `activeProject` is set:**
   - Load `<project>/docs/project.json` for stack-specific settings
   - Load `<project>/docs/CONVENTIONS.md` for coding standards

3. **Apply project conventions** to all code you write or review.
```

### 11.4 Agent Onboarding Process

When creating or modifying agents, use the `agent-onboard` skill to ensure compliance:

```
/agent-onboard $OPENCODE_CONFIG/agents/my-new-agent.md
```

This skill will:
1. Analyze the agent file
2. Determine the agent type (primary, router, specialist, utility)
3. Add the appropriate Project Context section
4. Validate the changes

### 11.5 Agent Audit Process

Periodically audit all agents for compliance:

```
/agent-audit
```

This skill will:
1. Scan all agents in `$OPENCODE_CONFIG/agents/`
2. Check each agent for project context compliance
3. Generate a report with remediation recommendations
4. Optionally auto-fix non-compliant agents with `--fix`

### 11.6 Agent Template Requirements

All templates in `$OPENCODE_CONFIG/agent-templates/` must include:

1. **Project Context section** with template variables
2. **CONVENTIONS.md references** for customizable patterns
3. **Conditional blocks** for stack-specific behavior

Example template structure:

```markdown
# {{AGENT_NAME}} Agent Instructions

## Project Context

Before starting work, load the project context:

1. **Read `$OPENCODE_CONFIG/projects.json`** to find active project
2. **Load `<project>/docs/project.json`** for stack configuration
3. **Load `<project>/docs/CONVENTIONS.md`** for coding standards

Apply all project conventions to your work.

## Stack-Specific Patterns

{{#if PROJECT.stack.frontend.framework == 'react'}}
Use React patterns from CONVENTIONS.md.
{{/if}}

{{#if PROJECT.stack.backend.framework == 'go-chi'}}
Use Go Chi patterns from CONVENTIONS.md.
{{/if}}

## Your Task

[Agent-specific instructions here]
```

### 11.7 Exemptions

Some agents are exempt from full project context requirements:

| Agent | Reason |
|-------|--------|
| `session-status` | Reads project state but doesn't generate code |
| `wall-e` | Cleanup utility, operates at workspace level |
| Pure utility agents | No code generation or project-specific behavior |

### 11.8 Context Injection by Routers

Router agents (critic, tester, qa) are responsible for injecting project context into specialist agents. When dispatching to a specialist:

```markdown
## When Delegating to Specialists

Include in the task prompt:
1. **Project path**: `The project is at <path>`
2. **Stack summary**: `Stack: Next.js 15 + Supabase + Tailwind`
3. **Relevant conventions**: Key patterns from CONVENTIONS.md
4. **Test commands**: From project.json
5. **File locations**: From project.json structure

Example delegation:
```
Task: Write tests for UserProfile component

Project: /Users/dev/my-app
Stack: Next.js 15 + Supabase + Tailwind + Jest

Conventions:
- Components use `interface Props {}` pattern
- Tests go in `__tests__/` directories
- Use data-testid for selectors

Test command: npm test
```

This ensures specialist agents have full context even if they don't load it themselves.

---

*End of Design Document*
