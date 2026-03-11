# PRD: Integration Skill Gaps

**Status:** In Progress  
**Priority:** Medium  
**Source:** Gaps from `integration-provisioning-automation.md` (mostly complete)

## Introduction

The integration skill provisioning workflow is 90% implemented. This PRD covers the two remaining gaps:

1. **Auto-promotion:** Developer/Builder should queue toolkit pending updates when creating new integration skills
2. **Supabase database patterns:** Auth skills exist, but database/RLS patterns are missing

## Problem Statement

1. **No auto-promotion loop** — When Developer creates a project-specific skill via meta-skill generator, the pattern stays local. Toolkit doesn't learn from it automatically.

2. **Supabase auth ≠ Supabase database** — We have `auth-supabase-otp` and `auth-supabase-password`, but agents still get corrected on:
   - RLS policy patterns
   - Supabase client usage (server vs browser)
   - Realtime subscriptions
   - Edge function patterns

## User Stories

### US-001: Auto-Promote Generated Skills to Toolkit

**Description:** As a toolkit maintainer, I want Developer to automatically queue a toolkit pending update when it creates a new project skill, so patterns flow back to the toolkit for potential generalization.

**Acceptance Criteria:**

- [x] After Developer generates a skill via meta-skill generator (Phase 3B.1), queue promotion update
- [x] Create `~/.config/opencode/pending-updates/YYYY-MM-DD-promote-[skill-name].md`
- [x] Update includes: skill name, meta-skill used, project path, generated skill path
- [x] This is automatic — no user prompt required
- [x] Skip if promotion update for same skill already exists (avoid duplicates)

**Files to modify:**
- `agents/developer.md` — Add Step 6.5 after skill generation in Phase 3B.1

**Implementation:**

Add after Phase 3B.1 Step 6 (commit):

```markdown
### Phase 3B.2: Queue Toolkit Skill Promotion

After generating a project skill, queue a promotion request so toolkit can consider generalizing it.

1. **Check if promotion already queued:**
   ```bash
   ls ~/.config/opencode/pending-updates/*promote*[skill-name]*.md 2>/dev/null
   ```
   If file exists, skip.

2. **Create promotion request:**
   ```bash
   cat > ~/.config/opencode/pending-updates/$(date +%Y-%m-%d)-promote-[skill-name].md << 'EOF'
   ---
   createdBy: developer
   date: YYYY-MM-DD
   priority: low
   updateType: skill-promotion
   ---

   # Promote Skill: [skill-name]

   ## Context

   A project-specific skill was generated that may be useful as a toolkit default.

   - **Skill name:** [skill-name]
   - **Generated from:** [meta-skill-generator]
   - **Project:** [project-id]
   - **Skill path:** [project-path]/docs/skills/[skill-name]/SKILL.md

   ## Action Required

   Review the generated skill and consider:
   1. Is this pattern reusable across projects?
   2. Should it become a toolkit default skill?
   3. Should the meta-skill generator be updated to produce better output?

   ## Options

   - **Promote:** Copy patterns to toolkit `skills/` directory
   - **Update generator:** Improve the meta-skill generator based on this output
   - **Dismiss:** This is project-specific, no toolkit changes needed
   EOF
   ```

3. **This step is silent** — no user notification needed
```

**Verification:**
- Generate a skill in a test project
- Confirm `~/.config/opencode/pending-updates/` contains promotion request
- Confirm @toolkit sees it at session start

---

### US-002: Supabase Database Skill Generator

**Description:** As a developer, I want a `supabase-skill-generator` that documents database patterns for Supabase projects, so agents don't repeat RLS and client usage mistakes.

**Acceptance Criteria:**

- [x] Create `skills/meta/supabase-skill-generator/SKILL.md`
- [x] Add trigger to `data/meta-skill-triggers.json` under `integrationTriggers.supabase`
- [x] Generator analyzes: Supabase client setup, RLS policies, table structure
- [x] Generates `docs/skills/supabase/SKILL.md` with project-specific patterns
- [x] Covers:
  - [x] Server client creation (`createClient` from `@supabase/ssr`)
  - [x] Browser client creation (if applicable)
  - [x] RLS policy patterns (authenticated, owner, org-scoped)
  - [x] Common query patterns with TypeScript types
  - [x] Realtime subscription patterns (if `capabilities.realtime: true`)
- [x] References auth skills — does NOT duplicate auth patterns

**Files to create:**
- `skills/meta/supabase-skill-generator/SKILL.md`

**Files to modify:**
- `data/meta-skill-triggers.json` — Add `supabase` to `integrationTriggers`

**Implementation:**

1. **Add to `data/meta-skill-triggers.json`:**
   ```json
   "integrationTriggers": {
     "stripe": { ... },
     "supabase": {
       "metaSkill": "supabase-skill-generator",
       "generates": "supabase-patterns",
       "description": "Supabase database, RLS, and client patterns"
     }
   }
   ```

2. **Create `skills/meta/supabase-skill-generator/SKILL.md`:**
   
   Follow the pattern of `stripe-skill-generator`:
   - Step 1: Read project context
   - Step 2: Analyze existing Supabase implementation
   - Step 3: Ask clarifying questions
   - Step 4: Generate the skill
   - Step 5: Update project.json

   **Key analysis commands:**
   ```bash
   # Find Supabase client files
   find . -type f -name "*.ts" | xargs grep -l "createClient.*supabase\|@supabase" | grep -v node_modules
   
   # Find RLS policies (if supabase/ directory exists)
   find ./supabase -name "*.sql" | xargs grep -i "policy\|rls" 2>/dev/null
   
   # Find realtime usage
   grep -r "\.subscribe\|realtime\|channel(" --include="*.ts" | grep -v node_modules | head -10
   
   # Find table definitions
   cat supabase/migrations/*.sql 2>/dev/null | grep -i "create table" | head -20
   ```

   **Generated skill template sections:**
   - Quick Reference (client creation, common queries)
   - Architecture (server vs browser client, RLS approach)
   - Key Files (client paths, migration paths)
   - Server Client Usage
   - Browser Client Usage (if applicable)
   - Query Patterns (select, insert, update, delete with types)
   - RLS Policy Patterns (by access level)
   - Realtime Subscriptions (if used)
   - Auth Reference (link to auth skills, don't duplicate)
   - Environment Variables
   - Checklist (for adding new tables/queries)

**Verification:**
- Run generator on a Supabase project
- Confirm skill covers client creation patterns
- Confirm skill covers RLS patterns specific to project
- Confirm auth patterns are referenced, not duplicated

---

## Functional Requirements

1. Developer must queue promotion updates after generating skills via meta-skill generators
2. Supabase skill generator must cover database/RLS patterns distinct from auth
3. Both stories are independent — can be implemented in any order

## Non-Goals

- Real-time sync between project skills and toolkit (manual promotion is fine)
- Automatic merging of promoted skills (toolkit maintainer reviews)
- Supabase Edge Functions patterns (add later if needed)

## Technical Considerations

- **Pending update location:** `~/.config/opencode/pending-updates/` (toolkit's inbox)
- **Skill trigger:** Add to `data/meta-skill-triggers.json` after creating generator
- **Non-duplication:** Supabase database skill should reference auth skills via link, not copy content
- **Priority:** Promotion updates are `low` priority — toolkit maintainer handles at convenience

## Dependencies

- Existing meta-skill generator pattern (`skills/meta/*/SKILL.md`)
- Existing `data/meta-skill-triggers.json` structure
- Developer Phase 3B.1 skill generation flow

## Success Metrics

- Every project-created skill generates a promotion request in `pending-updates/`
- Supabase database/RLS correction prompts reduced
- Toolkit maintainer receives promotion requests and can act on them

## Definition of Done

- [x] US-001: Developer Phase 3B.2 added for auto-promotion
- [ ] US-001: Test shows promotion request created after skill generation
- [x] US-002: `supabase-skill-generator` exists in `skills/meta/`
- [x] US-002: Trigger added to `data/meta-skill-triggers.json`
- [ ] US-002: Generator produces useful skill for a real Supabase project

## Credential & Service Access Plan

No external credentials required for this PRD.
