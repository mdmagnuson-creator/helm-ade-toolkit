# PRD: Token Optimization for Large Agents and Skills

**Status:** READY  
**Created:** 2026-03-04  
**Author:** @toolkit

---

## Problem Statement

### Context Limit Exhaustion

Builder sessions are hitting context limits (128K tokens) too quickly due to:

1. **Oversized agent files** — `builder.md` is 2,887 lines (113KB, ~28K tokens)
2. **Monolithic skills** — `test-flow` skill is 133KB (~33K tokens alone)
3. **Large registry files** — `prd-registry.json` grows unbounded with project history

**Observed impact:**
- New Builder session + project selection + "ad-hoc mode" = 97K tokens consumed
- Context compaction triggered within 2-3 user interactions
- After compaction, behavioral guardrails can be lost

### Root Causes

1. **builder.md includes inline documentation** that could be extracted to skills
2. **test-flow skill includes all verification workflows** when most sessions use 1-2
3. **prd-registry.json retains full history** including completed PRD details that are rarely needed

---

## Proposed Solution

### 1. Split test-flow Skill into 7 Focused Skills (HIGH IMPACT)

Current: Single 133KB file (3,417 lines) covering all test-related functionality.

**Proposed 7-skill split:**

| New Skill | Contents | Est. Lines | Est. Size |
|-----------|----------|------------|-----------|
| `test-activity-resolution` | Overview, Automatic Activity Resolution, Test Execution Mode, Escape Hatches | ~450 | ~18KB |
| `test-verification-loop` | 3-Pass Stability, Automated Fix Loop, Fix Loop Algorithm, Failure Reporting, State Updates | ~550 | ~22KB |
| `test-prerequisite-detection` | Prerequisite Failure Detection, Environment Prerequisites, Blocker Tracking, Bulk Re-verification | ~550 | ~22KB |
| `test-e2e-flow` | Running E2E Tests, PRD Mode Test Flow, Ad-hoc Mode Test Flows, Deferred E2E, E2E Auditor | ~700 | ~28KB |
| `test-ui-verification` | UI Verification (Playwright Required Mode) — architecture detection, flaky tests | ~520 | ~21KB |
| `test-quality-checks` | Per-Task Quality Checks, Quality Checks, Full-Site Visual Audit | ~200 | ~8KB |
| `test-failure-handling` | Failure Logging, Manual Fallback Options, Verification Contract Integration | ~250 | ~10KB |

**Orchestrator:** Keep `test-flow` as a slim (~3KB) orchestrator that routes to appropriate sub-skills.

**Loading strategy:**
- Always start with `test-activity-resolution` — determines what to run
- Load additional skills as needed based on resolved activities
- Never load all 7 at once — max 2-3 skills per operation

### 2. Extract Builder Inline Documentation (MEDIUM IMPACT)

Current: builder.md has extensive inline documentation sections that are loaded every session but rarely consulted.

**Candidates for extraction:**

| Section | Lines | Extract to |
|---------|-------|------------|
| CLI Triggers/Commands reference | ~100 lines | `skill: cli-reference` |
| Visual Debugging Escalation | ~80 lines | Already references `browser-debugging` skill |
| Environment Context diagnosis | ~80 lines | `skill: environment-diagnosis` |
| Dev Server Management | ~150 lines | `skill: dev-server` (already exists as `start-dev-server`) |

**Target:** Reduce builder.md from 2,887 to ~2,000 lines (30% reduction)

### 3. Archive Completed PRDs — Keep Only 5 Recent (MEDIUM IMPACT)

Current: `prd-registry.json` contains full history including detailed metadata for every PRD ever created.

**Proposed:**

1. **Active registry** (`prd-registry.json`) — Contains only:
   - PRDs with status: `ready`, `in_progress`, `awaiting_e2e`
   - **Last 5 completed PRDs** (rolling window for recent context)
   - Minimal fields: `id`, `name`, `status`, `estimatedStories`, `storiesCompleted`

2. **Archive file** (`prd-archive.json`) — Contains:
   - All completed/abandoned PRDs with full details
   - Read only when needed (e.g., "show me PRD history")

**Auto-archive behavior:**
- When a PRD completes, if there are already 5 completed PRDs in the registry:
  - Archive the oldest completed PRD to `prd-archive.json`
  - Keep only 5 most recently completed in active registry
- No manual intervention required — happens automatically

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Tokens at Builder startup | ~60K | <25K |
| builder.md lines | 2,887 | <2,200 |
| test-flow skill size | 133KB | Largest chunk <28KB |
| prd-registry.json typical size | 50KB | <10KB |
| Completed PRDs in active registry | Unbounded | Max 5 |

---

## User Stories

### US-001: Split test-flow into 7 focused skills

**As** a Builder session  
**I want** test-related skills loaded only when needed  
**So that** I don't consume 33K tokens for unused verification workflows

**Acceptance Criteria:**
- [ ] test-flow split into 7 smaller skills per the proposed structure
- [ ] Each skill <30KB (largest is `test-e2e-flow` at ~28KB)
- [ ] `test-flow` remains as slim orchestrator (~3KB) for backward compatibility
- [ ] No functionality lost — all current test-flow features preserved
- [ ] Skills cross-reference each other where needed

**Skill Structure:**

```
skills/
├── test-flow/SKILL.md              # Slim orchestrator (~3KB)
├── test-activity-resolution/SKILL.md    # ~18KB
├── test-verification-loop/SKILL.md      # ~22KB
├── test-prerequisite-detection/SKILL.md # ~22KB
├── test-e2e-flow/SKILL.md               # ~28KB
├── test-ui-verification/SKILL.md        # ~21KB
├── test-quality-checks/SKILL.md         # ~8KB
└── test-failure-handling/SKILL.md       # ~10KB
```

### US-002: Update Builder skill loading protocol

**As** a Builder agent  
**I want** to load test skills incrementally based on current operation  
**So that** I minimize token consumption during test execution

**Acceptance Criteria:**
- [ ] Builder updated to load test sub-skills instead of monolithic test-flow
- [ ] Skill loading map added to Builder (trigger → skill)
- [ ] All 18 test-flow references in builder.md updated
- [ ] Typical test scenarios load max 2-3 skills (~60KB max)

**Loading Map:**

| Trigger | Load Skill | Size |
|---------|------------|------|
| Any test execution starts | `test-activity-resolution` | ~18KB |
| Verification loop begins | `test-verification-loop` | ~22KB |
| Test failure detected | `test-failure-handling` | ~10KB |
| Prerequisite failure pattern | `test-prerequisite-detection` | ~22KB |
| UI verification required | `test-ui-verification` | ~21KB |
| E2E tests to run | `test-e2e-flow` | ~28KB |
| Quality checks phase | `test-quality-checks` | ~8KB |

**Typical Scenarios:**

| Scenario | Skills Loaded | Total |
|----------|---------------|-------|
| Simple unit test pass | `test-activity-resolution` | ~18KB |
| Unit test failure + fix | `test-activity-resolution` + `test-failure-handling` | ~28KB |
| UI verification | `test-activity-resolution` + `test-ui-verification` + `test-verification-loop` | ~61KB |
| E2E with prereq failure | `test-activity-resolution` + `test-e2e-flow` + `test-prerequisite-detection` | ~68KB |

### US-003: Extract Builder inline docs to skills

**As** a Builder agent definition  
**I want** rarely-used documentation sections extracted to loadable skills  
**So that** I load lean and fast for common workflows

**Acceptance Criteria:**
- [ ] CLI reference extracted to skill (loaded when CLI operations detected)
- [ ] Environment diagnosis extracted (loaded when environment errors detected)
- [ ] builder.md reduced to <2,200 lines
- [ ] All extracted content accessible via skill loading when needed

### US-004: Implement PRD archive system with 5-item rolling window

**As** a project with extensive PRD history  
**I want** completed PRDs auto-archived to keep only 5 recent in active registry  
**So that** startup reads a minimal registry

**Acceptance Criteria:**
- [x] Archive file format defined (using `archived` array in prd-registry.json with archiveStats)
- [x] Auto-archive triggers when 6th PRD completes (archives oldest)
- [x] Active registry always has ≤5 completed PRDs (schema enforces maxItems: 5)
- [x] Dashboard shows recent completed from active registry
- [x] Full history accessible via "show PRD history" command
- [x] No manual archive command needed (fully automatic)

**Archive Behavior:**

```
PRD completes
    │
    ▼
Count completed PRDs in registry
    │
    ├─── ≤4 completed ──► Add to registry, done
    │
    └─── 5 completed ──► Archive oldest, add new one
                         (maintains rolling window of 5)
```

---

## Technical Considerations

### Skill Dependencies

When splitting test-flow, some skills will need to load others:
- `test-verification-loop` may need patterns from `test-e2e-flow`
- `test-prerequisite-detection` may trigger `test-verification-loop`

**Solution:** Use skill cross-references:
```markdown
> 📚 **SKILL: test-e2e-flow** → "E2E Test Patterns"
>
> Load the `test-e2e-flow` skill for Playwright patterns if not already loaded.
```

### Backward Compatibility

- `test-flow` remains as slim orchestrator — existing references work
- Orchestrator routes to appropriate sub-skill based on operation
- No breaking changes to Builder or other agents

### Token Calculation Reference

Rough conversion: 4 characters ≈ 1 token
- 133KB file ≈ 33K tokens
- 28KB file ≈ 7K tokens
- 10KB file ≈ 2.5K tokens

### Naming Conventions

New skills follow `test-*` pattern. Verified no conflicts with existing skills:
- `test-url-resolution` — unrelated (resolves base URLs)
- `test-user-cleanup` — unrelated (cleans up test users)

---

## Out of Scope

- Reducing model context window (fixed at 128K for claude-opus-4.5)
- Changing skill loading mechanism in OpenCode (use existing skill tool)
- Optimizing planner agent (~12K tokens, within acceptable bounds)
- Optimizing developer agent (separate PRD if needed)

---

## Dependencies

- None — this is internal toolkit optimization

---

## Risks

| Risk | Mitigation |
|------|------------|
| Skill split introduces bugs | Thorough testing of each split skill |
| Over-fragmentation makes skills hard to maintain | Keep splits logical (7 is manageable), document cross-references |
| Archive query slow | Index archive by status for fast filtering |
| Builder skill loading logic complex | Clear loading map, document in Builder |

---

## Timeline Estimate

| Story | Estimate |
|-------|----------|
| US-001 (test-flow split into 7 skills) | 4-5 hours |
| US-002 (Builder skill loading protocol) | 1-2 hours |
| US-003 (Builder inline doc extraction) | 2-3 hours |
| US-004 (PRD archive with 5-item window) | 1-2 hours |
| **Total** | 8-12 hours |
