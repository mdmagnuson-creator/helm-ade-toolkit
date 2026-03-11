# Stack Advisor Skill

> Recommend technology stacks based on project requirements.

## Purpose

This skill takes a `RequirementsManifest` (from spec-analyzer) and recommends appropriate technology stacks. It:

1. **Scores** stack archetypes against requirements
2. **Ranks** options by fit
3. **Explains** trade-offs for each option
4. **Allows customization** if user wants to mix and match

## Input

Expects a `RequirementsManifest` JSON object (from spec-analyzer skill) or the path to one.

## Process

### Step 1: Load Stack Database

Read the stack database from: `~/.config/opencode/data/stacks.yaml`

This contains:
- **Frontends** — Next.js, Remix, Nuxt, SvelteKit, etc.
- **Backends** — Express, Fastify, Go Chi, FastAPI, Rails, etc.
- **Databases** — Supabase, Neon, PlanetScale, Postgres, etc.
- **Auth** — Supabase Auth, NextAuth, Clerk, Auth0, etc.
- **Archetypes** — Pre-configured stack combinations

### Step 2: Score Archetypes

For each archetype in `stacks.yaml`, calculate a fit score:

```
Base Score: 100

DEDUCTIONS (things that don't fit):
- Feature incompatibility: -10 to -30 per feature
- Scale mismatch: -20 to -40
- Constraint violation: -30 to -50
- Timeline mismatch: -10 to -20

BONUSES (things that fit well):
- Team expertise match: +10 per matching language/framework
- Feature built-in: +5 to +15 per feature
- Scale match: +10
- Best-for match: +15
```

### Step 3: Apply Scoring Rules

#### Feature Compatibility

| Requirement | If Missing | If Built-in |
|-------------|------------|-------------|
| `realtime.required: true` | -20 if not supported | +10 if built-in |
| `authentication.multiTenant: true` | -15 if no org support | +15 if orgs built-in |
| `authentication.methods: ["sso"]` | -25 if no SSO | +10 if SSO included |
| `payments.required: true` | -5 (all need integration) | +5 if starter included |
| `ai.required: true` | -10 if no vector DB | +10 if vector built-in |
| `fileStorage.required: true` | -5 (all need integration) | +10 if storage built-in |
| `search.type: "semantic"` | -15 if no vector | +10 if vector built-in |
| `offline.required: true` | -20 if no PWA support | +5 if PWA easy |

#### Scale Compatibility

| Requirement | Archetype Capability | Score Adjustment |
|-------------|---------------------|------------------|
| `target: "enterprise"` | `max_scale: "medium"` | -40 |
| `target: "enterprise"` | `max_scale: "enterprise"` | +10 |
| `target: "large"` | `max_scale: "small"` | -30 |
| `initial: "mvp"` | `setup_time: "slow"` | -15 |
| `initial: "mvp"` | `setup_time: "fast"` | +10 |

#### Constraint Compatibility

| Constraint | Incompatible | Score |
|------------|--------------|-------|
| `hosting: "self-hosted"` | Requires managed service | -50 (disqualify) |
| `compliance: ["hipaa"]` | No HIPAA support | -40 |
| `compliance: ["soc2"]` | No audit capabilities | -20 |
| `budget: "minimal"` | Expensive at scale | -15 |
| `timeline: "urgent"` | Slow setup | -20 |
| `timeline: "urgent"` | Fast setup | +15 |

#### Team Expertise

| Team Knows | Archetype Uses | Score |
|------------|----------------|-------|
| TypeScript | TypeScript | +15 |
| React | React-based | +10 |
| Go | Go backend | +15 |
| Python | Python backend | +15 |
| Vue | Vue-based | +10 |
| None specified | TypeScript | +5 (most common) |

#### Best-For Match

If the archetype's `best_for` includes the product type or features:

| Match | Score |
|-------|-------|
| Product type matches | +15 |
| Multiple features match | +10 |
| One feature matches | +5 |

#### Not-For Match

If the archetype's `not_for` includes the product type or constraints:

| Match | Score |
|-------|-------|
| Product type in not_for | -30 |
| Constraint in not_for | -25 |
| Feature in not_for | -15 |

### Step 4: Rank and Filter

1. Calculate final scores for all archetypes
2. Filter out any with score < 50 (poor fit)
3. Sort by score descending
4. Take top 3-4 options

### Step 5: Present Recommendations

Display recommendations with explanations:

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
  • Team knows TypeScript + React

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
  Testing:    Vitest + Playwright
  
  ✅ Why this fits:
     • Built-in multi-tenant auth with organizations (+15)
     • Real-time subscriptions out of the box (+10)
     • Vector database for AI features (+10)
     • Fastest path to MVP — urgent timeline (+15)
     • Team knows TypeScript + React (+25)
  
  ⚠️ Trade-offs:
     • Vendor lock-in (migration effort if you outgrow)
     • Costs increase at scale (~$500/mo at 10k users)
  
  💰 Estimated cost: $25/mo (MVP) → $500/mo (10k users)
  ⏱️ Time to MVP: 2-3 weeks
  📦 Setup time: 1-2 days

───────────────────────────────────────────────────────────────────────

#2 ALTERNATIVE: Next.js + Prisma + PostgreSQL             Score: 85/100
───────────────────────────────────────────────────────────────────────

  Frontend:   Next.js 15 (App Router)
  Backend:    Next.js API Routes
  Database:   PostgreSQL (Neon)
  ORM:        Prisma
  Auth:       NextAuth.js
  Payments:   Stripe
  AI:         OpenAI + pgvector
  Hosting:    Vercel + Neon
  Testing:    Vitest + Playwright
  
  ✅ Why this fits:
     • More portable — no Supabase lock-in (+10)
     • Lower cost at scale (+10)
     • Team knows TypeScript + React (+25)
     • Full control over auth logic
  
  ⚠️ Trade-offs:
     • More setup for auth, realtime (-10)
     • Need to implement organization logic yourself (-15)
     • ~1 week longer to MVP
  
  💰 Estimated cost: $20/mo (MVP) → $200/mo (10k users)
  ⏱️ Time to MVP: 3-4 weeks
  📦 Setup time: 2-3 days

───────────────────────────────────────────────────────────────────────

#3 SCALE-READY: Next.js + Go API + PostgreSQL             Score: 72/100
───────────────────────────────────────────────────────────────────────

  Frontend:   Next.js 15 (App Router)
  Backend:    Go (Chi framework)
  Database:   PostgreSQL (RDS or Fly)
  Auth:       Custom JWT + Go middleware
  Payments:   Stripe
  AI:         OpenAI (Go client)
  Hosting:    Vercel + Fly.io
  Testing:    Vitest + Playwright (frontend), Go test (backend)
  
  ✅ Why this fits:
     • Scales to millions of users (+10)
     • Low operational cost at scale (+15)
     • High performance backend
  
  ⚠️ Trade-offs:
     • Two languages (TypeScript + Go) — team needs to learn Go (-15)
     • More complex deployment (-10)
     • Significantly longer MVP time — doesn't fit urgent timeline (-20)
  
  💰 Estimated cost: $30/mo (MVP) → $100/mo (10k users)
  ⏱️ Time to MVP: 5-6 weeks
  📦 Setup time: 3-5 days

═══════════════════════════════════════════════════════════════════════

Which would you like?

  1. Option 1 (Next.js + Supabase) — Recommended
  2. Option 2 (Next.js + Prisma)
  3. Option 3 (Next.js + Go)
  4. Show me more options
  5. I want to customize / specify my own stack
  6. Compare options side-by-side

> _
═══════════════════════════════════════════════════════════════════════
```

### Step 6: Handle User Choice

#### Option 1-3: Select a Stack

Record the selected stack and proceed to scaffolding:

```json
{
  "selectedArchetype": "nextjs-supabase",
  "stack": {
    "frontend": "nextjs",
    "backend": "nextjs-api",
    "database": "supabase",
    "auth": "supabase-auth",
    "payments": "stripe",
    "hosting": {
      "frontend": "vercel",
      "database": "supabase"
    },
    "styling": "tailwind",
    "testing": {
      "unit": "vitest",
      "e2e": "playwright"
    }
  }
}
```

Invoke project-scaffold skill with this stack decision.

#### Option 4: More Options

Show additional archetypes that scored above 50:

```
═══════════════════════════════════════════════════════════════════════
                      MORE OPTIONS
═══════════════════════════════════════════════════════════════════════

#4 Remix + Cloudflare                                     Score: 68/100
   Edge-first with global performance, but smaller ecosystem

#5 SvelteKit + Supabase                                   Score: 65/100
   Minimal bundle size, but team would need to learn Svelte

#6 Nuxt + Supabase                                        Score: 58/100
   Vue-based alternative, but team knows React not Vue

───────────────────────────────────────────────────────────────────────

Want details on any of these, or go back to top 3?

> _
═══════════════════════════════════════════════════════════════════════
```

#### Option 5: Custom Stack

Let user specify their own preferences:

```
═══════════════════════════════════════════════════════════════════════
                      CUSTOM STACK
═══════════════════════════════════════════════════════════════════════

Let's build your custom stack. For each layer, choose an option:

───────────────────────────────────────────────────────────────────────

FRONTEND
  1. Next.js (React, recommended for your requirements)
  2. Remix (React, edge-focused)
  3. Nuxt (Vue)
  4. SvelteKit (Svelte)
  5. Vite + React (SPA only)
  6. None (API only)

> _

───────────────────────────────────────────────────────────────────────
```

Continue through:
- **Backend** — Based on frontend choice
- **Database** — Based on features needed
- **Auth** — Based on requirements
- **Hosting** — Based on stack choices

#### Option 6: Side-by-Side Comparison

```
═══════════════════════════════════════════════════════════════════════
                    COMPARISON TABLE
═══════════════════════════════════════════════════════════════════════

                      │ Supabase │ Prisma   │ Go       │
──────────────────────┼──────────┼──────────┼──────────┤
Score                 │ 92       │ 85       │ 72       │
Time to MVP           │ 2-3 wk   │ 3-4 wk   │ 5-6 wk   │
Setup Time            │ 1-2 days │ 2-3 days │ 3-5 days │
──────────────────────┼──────────┼──────────┼──────────┤
Cost (MVP)            │ $25/mo   │ $20/mo   │ $30/mo   │
Cost (10k users)      │ $500/mo  │ $200/mo  │ $100/mo  │
──────────────────────┼──────────┼──────────┼──────────┤
Realtime              │ Built-in │ Add-on   │ Custom   │
Multi-tenant Auth     │ Built-in │ DIY      │ DIY      │
Vector DB (AI)        │ Built-in │ pgvector │ pgvector │
──────────────────────┼──────────┼──────────┼──────────┤
Vendor Lock-in        │ High     │ Low      │ None     │
Scalability           │ Medium   │ High     │ Very High│
Team Learning         │ Low      │ Low      │ High     │
──────────────────────┴──────────┴──────────┴──────────┘

Which would you like to proceed with?

> _
═══════════════════════════════════════════════════════════════════════
```

---

## Detailed Scoring Example

Given these requirements:

```json
{
  "productType": "saas",
  "businessModel": "b2b",
  "scale": {
    "initial": "mvp",
    "target": "medium",
    "userEstimate": "1k-10k"
  },
  "features": {
    "authentication": {
      "required": true,
      "multiTenant": true
    },
    "payments": { "required": true },
    "realtime": { "required": true },
    "ai": { "required": true }
  },
  "constraints": {
    "timeline": "urgent",
    "teamExpertise": ["typescript", "react"]
  }
}
```

### Scoring: nextjs-supabase

```
Base Score:                                    100

FEATURES:
  + Multi-tenant auth built-in                 +15
  + Realtime built-in                          +10
  + Vector DB for AI built-in                  +10
  + Payments (Stripe) easy integration          +5
                                              ────
  Feature subtotal:                            +40

SCALE:
  + Initial MVP, setup is fast                 +10
  + Target medium, can handle                   +5
                                              ────
  Scale subtotal:                              +15

CONSTRAINTS:
  + Urgent timeline, fast setup                +15
  + Team knows TypeScript                      +15
  + Team knows React                           +10
                                              ────
  Constraint subtotal:                         +40

BEST-FOR MATCH:
  + "saas" in best_for                         +15
  + "small-teams" in best_for                   +5
                                              ────
  Best-for subtotal:                           +20

NOT-FOR PENALTIES:
  - "complex backend" somewhat applicable       -5
                                              ────
  Not-for subtotal:                             -5

DEDUCTIONS:
  - Vendor lock-in concern                     -10
  - Cost at scale concern                       -8
                                              ────
  Deduction subtotal:                          -18

═══════════════════════════════════════════════
FINAL SCORE: 100 + 40 + 15 + 40 + 20 - 5 - 18 = 92
═══════════════════════════════════════════════
```

---

## Output

### Stack Decision JSON

Save to: `<project-path>/docs/stack-decision.json`

```json
{
  "$schema": "https://opencode.ai/stack-decision.schema.json",
  "selectedAt": "2026-02-19T10:45:00Z",
  "archetype": "nextjs-supabase",
  "score": 92,
  "stack": {
    "frontend": {
      "framework": "nextjs",
      "version": "15",
      "router": "app"
    },
    "backend": {
      "framework": "nextjs-api",
      "additional": ["supabase-edge-functions"]
    },
    "database": {
      "provider": "supabase",
      "type": "postgres",
      "features": ["realtime", "vector", "rls"]
    },
    "auth": {
      "provider": "supabase-auth",
      "features": ["email", "oauth", "organizations"]
    },
    "payments": {
      "provider": "stripe",
      "model": "subscription"
    },
    "ai": {
      "provider": "openai",
      "vectorDb": "supabase"
    },
    "hosting": {
      "frontend": "vercel",
      "database": "supabase-cloud"
    },
    "styling": {
      "framework": "tailwind",
      "version": "4"
    },
    "testing": {
      "unit": "vitest",
      "e2e": "playwright",
      "componentTesting": true
    }
  },
  "estimates": {
    "setupTime": "1-2 days",
    "timeToMvp": "2-3 weeks",
    "costs": {
      "mvp": "$25/month",
      "small": "$100/month",
      "medium": "$500/month"
    }
  },
  "tradeoffs": {
    "strengths": [
      "Built-in multi-tenant auth with organizations",
      "Real-time subscriptions out of the box",
      "Vector database for AI features",
      "Fastest path to MVP"
    ],
    "weaknesses": [
      "Vendor lock-in to Supabase",
      "Costs increase at scale"
    ]
  },
  "alternativesConsidered": [
    {
      "archetype": "nextjs-prisma",
      "score": 85,
      "whyNot": "More setup required, longer MVP time"
    },
    {
      "archetype": "nextjs-go",
      "score": 72,
      "whyNot": "Team would need to learn Go, much longer setup"
    }
  ]
}
```

---

## Integration

### With spec-analyzer

Receives `RequirementsManifest` from spec-analyzer:

```markdown
[spec-analyzer completes]
↓
[stack-advisor receives requirements.json]
↓
[stack-advisor presents recommendations]
↓
[user selects stack]
↓
[stack-advisor outputs stack-decision.json]
```

### With project-scaffold

Passes stack decision to project-scaffold:

```markdown
[stack-advisor completes with stack-decision.json]
↓
[project-scaffold receives stack decision]
↓
[project-scaffold generates project from scaffold template]
```

---

## Edge Cases

### No Good Matches

If no archetype scores above 50:

```
═══════════════════════════════════════════════════════════════════════
                    UNUSUAL REQUIREMENTS
═══════════════════════════════════════════════════════════════════════

Your requirements are unique! None of our standard stacks are a great fit.

Challenging requirements:
  • Self-hosted + Real-time + HIPAA compliance
  • This combination is rare

Options:
  1. 🔧 Build a custom stack — I'll help you choose each component
  2. 🎯 Relax constraints — Which requirements are flexible?
  3. 💡 Get consultation — These requirements may need custom architecture

> _
═══════════════════════════════════════════════════════════════════════
```

### Conflicting Requirements

If requirements conflict with each other:

```
═══════════════════════════════════════════════════════════════════════
                    REQUIREMENT CONFLICT
═══════════════════════════════════════════════════════════════════════

Some of your requirements conflict:

  ⚠️ "Urgent MVP" + "Enterprise scale" + "Self-hosted"
     
     Fast MVPs typically use managed services (Vercel, Supabase)
     Self-hosted + enterprise scale requires significant setup time
     
     These don't fit together well.

Which is most important?
  1. Speed (MVP fast, use managed services, migrate later)
  2. Self-hosted (takes longer, but no vendor lock-in)
  3. Let's discuss trade-offs

> _
═══════════════════════════════════════════════════════════════════════
```

### Missing Requirements

If key information is missing from the manifest:

```
═══════════════════════════════════════════════════════════════════════
                    NEED MORE CONTEXT
═══════════════════════════════════════════════════════════════════════

To give good recommendations, I need to know:

  ❓ Scale — How many users do you expect?
     A. < 1,000 users
     B. 1,000 - 10,000 users
     C. 10,000 - 100,000 users
     D. > 100,000 users

  ❓ Timeline — How fast do you need this?
     A. ASAP (2-4 weeks)
     B. Normal (1-2 months)
     C. Flexible (quality over speed)

> _
═══════════════════════════════════════════════════════════════════════
```

---

## Maintenance

### Adding New Archetypes

To add a new stack archetype:

1. Add entry to `~/.config/opencode/data/stacks.yaml` under `archetypes:`
2. Include all required fields:
   - `name`, `description`
   - `frontend`, `backend`, `database`, `auth`, `hosting`
   - `strengths`, `weaknesses`, `best_for`, `not_for`
   - `estimated_costs`, `setup_time`, `time_to_mvp`

### Adding New Technologies

To add a new technology option:

1. Add entry to appropriate section in `stacks.yaml`
2. Include compatibility information
3. Update any archetypes that should use it

### Updating Scoring Weights

Scoring weights are defined in this skill file. Adjust based on:
- User feedback on recommendations
- New technology capabilities
- Market trends
