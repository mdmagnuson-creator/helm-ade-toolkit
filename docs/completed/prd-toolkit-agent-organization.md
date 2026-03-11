# PRD: Toolkit-Wide Agent Organization Refactor

**Status:** Ready  
**Priority:** High  
**Created:** 2026-03-01  
**Updated:** 2026-03-01  
**Author:** @toolkit

## Problem Statement

Builder has grown to **2,255 lines** — more than **2x larger** than the next largest agent. But the real problem isn't size — it's **poor organization**. Builder contains self-contained, reusable patterns that are inlined instead of extracted to skills.

Additionally, analysis of all 64 agents reveals **widespread duplication**:
- 15 agents have identical "Requesting Toolkit Updates" sections
- 6 agents have identical "Test Failure Output Policy" sections
- 3 agents have identical "Git Auto-Commit Enforcement" sections
- 3 agents duplicate "Right-Panel Todo Contract" and "Rate Limit Handling"

This PRD addresses both:
1. **Builder-specific extraction** — Move Builder's reusable patterns to skills
2. **Toolkit-wide deduplication** — Consolidate repeated patterns across all agents
3. **Prevention** — Add guidance to Toolkit to prevent future disorganization

### Current Size Comparison (Top 10)

| Agent | Lines | Organization Issues |
|-------|-------|---------------------|
| **builder.md** | 2,255 | 9 extractable sections identified |
| tester.md | 958 | Duplicated sections from other agents |
| toolkit.md | 957 | Some duplication with builder/planner |
| planner.md | 926 | Duplicated sections with builder |
| e2e-playwright.md | 742 | Quality patterns could be skill |
| jest-tester.md | 735 | Domain expertise could be template |
| developer.md | 623 | Duplicated toolkit request section |
| go-tester.md | 599 | Domain expertise could be template |
| go-dev.md | 580 | Domain expertise could be template |
| playwright-dev.md | 553 | Auth patterns duplicated |

## Goals

1. **Extract reusable patterns from Builder** into skills other agents can share
2. **Deduplicate identical sections** across all agents
3. **Reduce maintenance burden** — change once, apply everywhere
4. **Add prevention guidance** to Toolkit to avoid future disorganization
5. **Preserve all existing functionality** — no behavior changes

## Non-Goals

- Changing any agent's external behavior or API
- Reducing agent sizes arbitrarily (size isn't the problem, organization is)
- Creating new agents
- Changing the delegation model

---

## Design Decisions

### Decision 1: AGENTS.md Guardrail Enforcement

**Decision:** Mixed enforcement

- **Mandatory (CRITICAL):** Git Auto-Commit Enforcement — safety issue, could spam repos
- **Advisory:** Test Failure Output Policy, Requesting Toolkit Updates — important but not dangerous

### Decision 2: Agent-Specific Variations

**Decision:** Minimal per-agent anchor (~3 lines)

AGENTS.md gets the full explanation of format, rules, and template. Each agent keeps only a brief anchor to prevent hallucination:

```markdown
## Requesting Toolkit Updates

See AGENTS.md for format. Your filename prefix: `YYYY-MM-DD-builder-`
```

This achieves ~85% line reduction while anchoring the agent's identity.

### Decision 3: Skill Loading Pattern

**Decision:** On-demand via `skill()` tool

Skills like `verification-contracts`, `dynamic-reassignment`, `self-correction` are needed for specific workflows, not every session. Agents load them when entering the relevant workflow, matching existing patterns like `test-flow` and `builder-state`.

### Decision 4: Right-Panel Todos Skill Scope

**Decision:** All state persistence together in one skill

The skill `session-state` (or `right-panel-todos`) will include:
- Right-panel todo contract
- Rate limit handling
- currentTask compaction recovery

These are tightly coupled — all about session state persistence.

### Decision 5: Builder Target Size

**Decision:** No arbitrary target — measure actual results

Remove "900-1100 lines" language. The goal is better organization, not hitting a number. We'll measure actual line reduction after extraction.

### Decision 6: Implementation Order

**Decision:** As written (AGENTS.md → skills → refs), with 5 grouped commits

Single session implementation with logical commit groupings:
1. AGENTS.md updates + remove duplicates from all agents
2. All new skills created
3. All agent references updated + skill merges
4. Prevention guidance added to toolkit.md
5. Validation + fixes

### Decision 7: Testing Approach

**Decision:** Manual checklist + automated validator

- **Checklist:** Key workflows verified manually (Builder startup, Developer skill loading, etc.)
- **Validator:** Script to verify all skill references and AGENTS.md references are valid

---

## Part 1: Toolkit-Wide Duplication Analysis

### Identical Sections Found Across Agents

#### 1. "Requesting Toolkit Updates" — 15 agents

**Agents:** builder, critic, developer, e2e-playwright, felix, go-tester, jest-tester, planner, playwright-dev, qa-browser-tester, qa-explorer, qa, react-tester, session-status, tester

**Current:** Each agent has ~25 identical lines explaining how to write toolkit update requests.

**Solution:** Move full template to AGENTS.md, keep 3-line anchor in each agent.

**Lines saved:** ~330 lines (22 × 15)

#### 2. "Test Failure Output Policy" — 6 agents

**Agents:** e2e-playwright, go-tester, jest-tester, qa-browser-tester, react-tester, tester

**Current:** Each agent has ~12 identical lines about never truncating test output.

**Solution:** Move to AGENTS.md as advisory guardrail for testing agents.

**Lines saved:** ~60 lines (10 × 6)

#### 3. "Git Auto-Commit Enforcement" — 3 agents

**Agents:** builder, developer, tester

**Current:** Each has the critical block about checking `git.autoCommit`.

**Solution:** Move to AGENTS.md as CRITICAL mandatory guardrail.

**Lines saved:** ~24 lines (8 × 3)

#### 4. "Right-Panel Todo Contract" — 3 agents

**Agents:** builder, planner, toolkit

**Current:** Each has ~50 lines about syncing todos with state file.

**Solution:** Extract to `session-state` skill.

**Lines saved:** ~100 lines (50 × 2)

#### 5. "Rate Limit Handling" — 3 agents

**Agents:** builder, planner, toolkit

**Current:** Each has ~30 lines about detecting and handling 429 errors.

**Solution:** Include in `session-state` skill with todo contract.

**Lines saved:** ~60 lines (30 × 2)

### Summary of Deduplication Opportunity

| Pattern | Agents | Lines Each | Total Savings |
|---------|--------|------------|---------------|
| Requesting Toolkit Updates | 15 | ~22 | ~330 lines |
| Test Failure Output Policy | 6 | ~10 | ~60 lines |
| Git Auto-Commit Enforcement | 3 | ~8 | ~24 lines |
| Right-Panel Todo Contract | 3 | ~50 | ~100 lines |
| Rate Limit Handling | 3 | ~30 | ~60 lines |
| **Total** | | | **~574 lines** |

---

## Part 2: Builder-Specific Extraction

Builder contains these self-contained sections that should be skills:

### Sections to Extract (New Skills)

| Section | Lines | Proposed Skill | Consumers |
|---------|-------|----------------|-----------|
| Verification Contracts | ~120 | `verification-contracts` | builder, developer, overlord |
| Dynamic Reassignment | ~170 | `dynamic-reassignment` | builder, developer |
| Loop Detection & Bulk Fix | ~80 | `self-correction` | builder, developer, overlord |
| Authentication Config Check | ~130 | `auth-config-check` | builder, qa-explorer, e2e-playwright |
| Critic Batching | ~50 | `critic-dispatch` | builder, developer |
| Deferred E2E Flow | ~180 | (merge into `test-flow`) | builder, tester |
| Checkpoint Management | ~140 | (merge into `builder-state`) | builder |

**Total extractable from Builder:** ~870 lines

### Sections to Keep in Builder (Core Identity)

| Section | Lines | Why Keep |
|---------|-------|----------|
| Startup / Dashboard | ~200 | Core UX, Builder-specific |
| Project Selection | ~100 | Builder-specific UX |
| Pending Updates | ~80 | Builder orchestration |
| Session Lock (multi-session) | ~50 | Builder coordination |
| Planning Detection (redirect) | ~70 | Core routing |
| What You Never Do | ~80 | Builder-specific restrictions |
| Sub-Agent Delegation | ~100 | Builder orchestration |
| Skills Reference table | ~30 | Index of skills |

**Total to keep:** ~710 lines + shared patterns via skill reference

---

## Part 3: Other Agents with Extractable Patterns

### e2e-playwright.md (742 lines)

| Section | Lines | Recommendation |
|---------|-------|----------------|
| Quality-Beyond-Correctness Testing | ~150 | Already has `e2e-quality` skill — verify no duplication |
| Authentication Handling | ~120 | Merge with proposed `auth-config-check` skill |

### Tester Agents (jest-tester, go-tester, react-tester)

| Section | Lines | Recommendation |
|---------|-------|----------------|
| Domain Expertise | 200-300 each | Keep — this IS the agent's value |
| Running Tests (CI Mode) | ~30 each | Could be shared, but minimal benefit |

**Verdict:** Tester agents are appropriately organized. Their "domain expertise" sections ARE the point of these agents.

### Developer.md (623 lines)

| Section | Lines | Recommendation |
|---------|-------|----------------|
| Root Cause Analysis | ~60 | Could be shared with overlord |
| Band-Aid Pattern Detection | ~20 | Could be shared |
| Browser Testing | ~10 | Reference, don't duplicate |

**Verdict:** Developer is reasonably organized. Minor deduplication possible.

---

## Part 4: Prevention — Toolkit Inline Guidance

Add this section to `toolkit.md` to prevent future disorganization:

```markdown
## Before Adding Content to Agents

When adding a new section to an agent, check:

- [ ] **Could another agent use this?** → Extract to skill
- [ ] **Is it self-contained with its own trigger?** → Extract to skill
- [ ] **Does similar logic exist in other agents?** → Extract to shared skill or AGENTS.md
- [ ] **Is it only needed for specific workflows?** → Extract to skill, load conditionally

If none apply → Inline is acceptable.
```

---

## Proposed Solution

### Phase 1: Update AGENTS.md with Shared Guardrails

Move these to `AGENTS.md`:
1. Git Auto-Commit Enforcement (CRITICAL — mandatory)
2. Test Failure Output Policy (advisory)
3. Requesting Toolkit Updates template (advisory)

Update affected agents to replace full sections with 3-line anchors.

**Estimated savings:** ~414 lines across 15+ agents

### Phase 2: Extract Shared Skills

Create new skills:
1. `verification-contracts` — contract generation and verification
2. `dynamic-reassignment` — fallback chains and failure handling
3. `self-correction` — loop detection and bulk fix
4. `auth-config-check` — authentication configuration checking
5. `critic-dispatch` — critic batching configuration
6. `session-state` — todo contract, rate limit handling, currentTask tracking

Update existing skills:
- `builder-state` — absorb checkpoint management
- `test-flow` — absorb deferred E2E flow

### Phase 3: Update Agents to Reference Skills

Replace inline sections with skill references in:
- builder.md
- planner.md
- toolkit.md
- developer.md
- overlord.md
- qa-explorer.md
- e2e-playwright.md

### Phase 4: Add Prevention Guidance

Add "Before Adding Content to Agents" checklist to `toolkit.md`.

---

## User Stories

### US-001: Move shared guardrails to AGENTS.md

**As a** toolkit maintainer  
**I want** common guardrails in AGENTS.md  
**So that** agents don't duplicate identical content

**Acceptance Criteria:**
- [ ] Add "Git Auto-Commit Enforcement" to AGENTS.md as CRITICAL rule
- [ ] Add "Test Failure Output Policy" to AGENTS.md as advisory guideline
- [ ] Add "Requesting Toolkit Updates" template to AGENTS.md
- [ ] Replace full sections in 15+ agents with 3-line anchors
- [ ] Verify anchors include agent-specific filename prefix

### US-002: Extract verification contracts to skill

**As a** toolkit maintainer  
**I want** verification contract logic in a separate skill  
**So that** developer and overlord can use the same pattern

**Acceptance Criteria:**
- [ ] Create `skills/verification-contracts/SKILL.md`
- [ ] Move contract generation algorithm from builder.md
- [ ] Move contract types from builder.md
- [ ] Move verification on completion from builder.md
- [ ] Update builder.md to load skill on-demand
- [ ] Document trigger patterns for developer.md and overlord.md

### US-003: Extract dynamic reassignment to skill

**As a** toolkit maintainer  
**I want** dynamic reassignment logic in a separate skill  
**So that** developer agent can handle specialist failures consistently

**Acceptance Criteria:**
- [ ] Create `skills/dynamic-reassignment/SKILL.md`
- [ ] Move fallback chain lookup from builder.md
- [ ] Move failure detection patterns from builder.md
- [ ] Move alternative selection algorithm from builder.md
- [ ] Update builder.md to load skill on-demand
- [ ] Document trigger patterns for developer.md

### US-004: Extract self-correction to skill

**As a** toolkit maintainer  
**I want** loop detection and bulk fix logic in a separate skill  
**So that** developer and overlord can avoid repetitive fix patterns

**Acceptance Criteria:**
- [ ] Create `skills/self-correction/SKILL.md`
- [ ] Move detection triggers from builder.md
- [ ] Move self-check protocol from builder.md
- [ ] Move bulk fix protocol from builder.md
- [ ] Update builder.md to load skill on-demand
- [ ] Document trigger patterns for developer.md and overlord.md

### US-005: Extract auth config check to skill

**As a** toolkit maintainer  
**I want** authentication configuration checking in a skill  
**So that** qa-explorer and e2e-playwright can use the same logic

**Acceptance Criteria:**
- [ ] Create `skills/auth-config-check/SKILL.md`
- [ ] Move check flow from builder.md
- [ ] Move detection patterns from builder.md
- [ ] Consolidate with e2e-playwright auth handling section
- [ ] Update builder.md, qa-explorer.md, e2e-playwright.md to load skill on-demand

### US-006: Extract critic dispatch to skill

**As a** toolkit maintainer  
**I want** critic batching configuration in a skill  
**So that** developer can use the same dispatch logic

**Acceptance Criteria:**
- [ ] Create `skills/critic-dispatch/SKILL.md`
- [ ] Move critic modes from builder.md
- [ ] Move balanced mode logic from builder.md
- [ ] Update builder.md to load skill on-demand
- [ ] Document trigger patterns for developer.md

### US-007: Extract session state to skill

**As a** toolkit maintainer  
**I want** session state management in a skill  
**So that** builder, planner, and toolkit share one implementation

**Acceptance Criteria:**
- [ ] Create `skills/session-state/SKILL.md`
- [ ] Include right-panel todo contract
- [ ] Include rate limit handling
- [ ] Include currentTask compaction recovery tracking
- [ ] Update builder.md, planner.md, toolkit.md to load skill on startup

### US-008: Merge deferred E2E into test-flow skill

**As a** toolkit maintainer  
**I want** deferred E2E test flow merged into test-flow skill  
**So that** all test-related flows are in one place

**Acceptance Criteria:**
- [ ] Add deferred E2E section to `skills/test-flow/SKILL.md`
- [ ] Include runtime check, source identification, execution
- [ ] Include PRD status update on completion
- [ ] Remove deferred E2E section from builder.md
- [ ] Reference test-flow skill from builder.md

### US-009: Merge checkpoint management into builder-state skill

**As a** toolkit maintainer  
**I want** checkpoint management in builder-state skill  
**So that** all state management is in one place

**Acceptance Criteria:**
- [ ] Add checkpoint creation/update logic to `skills/builder-state/SKILL.md`
- [ ] Add checkpoint size management
- [ ] Add context overflow protection
- [ ] Remove checkpoint section from builder.md
- [ ] Reference builder-state skill from builder.md

### US-010: Add prevention guidance to Toolkit

**As a** toolkit maintainer  
**I want** a checklist in toolkit.md for when to extract vs inline  
**So that** future additions don't recreate disorganization

**Acceptance Criteria:**
- [ ] Add "Before Adding Content to Agents" section to toolkit.md
- [ ] Include 4-item checklist (reusable? self-contained? duplicated? conditional?)
- [ ] Position near top of agent modification guidance

### US-011: Validate organization improvements

**As a** toolkit maintainer  
**I want** to verify the refactor achieved its goals  
**So that** we know the effort was worthwhile

**Acceptance Criteria:**
- [ ] Measure builder.md line reduction (record before/after)
- [ ] Measure total lines saved across toolkit
- [ ] Run manual verification checklist (see Testing section)
- [ ] Run automated reference validator
- [ ] All new skills documented in toolkit-structure.json

---

## Testing

### Manual Verification Checklist

After refactoring, verify these workflows still function:

- [ ] **Builder startup:** Shows dashboard, loads project context
- [ ] **Builder skill loading:** Loads `verification-contracts` when completing story
- [ ] **Builder reassignment:** Loads `dynamic-reassignment` when sub-agent fails
- [ ] **Developer skill loading:** Loads `self-correction` when detecting loop
- [ ] **Planner session state:** Loads `session-state` on startup, persists todos
- [ ] **Toolkit session state:** Loads `session-state` on startup, handles rate limits
- [ ] **Tester deferred E2E:** Loads `test-flow` skill, finds and runs deferred tests
- [ ] **Agent AGENTS.md reference:** Agents correctly reference Git Auto-Commit rule

### Automated Reference Validator

Create `scripts/validate-agent-refs.sh` to verify:

- [ ] Every `skill("name")` call references an existing skill in `skills/`
- [ ] Every "See AGENTS.md" reference points to an existing section
- [ ] Every agent anchor (e.g., `Your filename prefix: YYYY-MM-DD-builder-`) uses correct agent name

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| builder.md lines | 2,255 | Measured after |
| Duplicated "Toolkit Updates" sections | 15 | 0 (3-line anchors) |
| Duplicated "Test Failure Policy" sections | 6 | 0 (reference AGENTS.md) |
| New shared skills | 0 | 6 |
| Updated existing skills | 0 | 2 |
| Total lines saved | 0 | Measured after |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing workflows | Medium | High | Manual checklist + automated validator |
| AGENTS.md becomes too large | Low | Medium | Keep only truly universal guardrails |
| Skill loading adds latency | Low | Low | Skills already load conditionally |
| Agent hallucination (wrong name) | Low | Medium | 3-line anchors with explicit agent name |
| Over-extraction | Low | Medium | Use the new prevention checklist |

---

## Commit Strategy

Single session with 5 logical commits:

1. **Commit 1:** AGENTS.md updates + remove duplicates from all 15+ agents
2. **Commit 2:** All 6 new skills created
3. **Commit 3:** All agent references updated + builder-state/test-flow merges
4. **Commit 4:** Prevention guidance added to toolkit.md
5. **Commit 5:** Validation script + results + any fixes

---

## Related Documents

- `AGENTS.md` — Global agent guardrails
- `agents/builder.md` — Primary refactor target
- `skills/builder-state/SKILL.md` — Existing state management skill
- `skills/test-flow/SKILL.md` — Existing test flow skill
- `docs/drafts/prd-agent-reputation.md` — Related (dynamic reassignment could use reputation)
