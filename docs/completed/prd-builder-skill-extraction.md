# PRD: Builder Skill Extraction (Phase 2)

**Status:** Ready
**Priority:** Medium
**Created:** 2026-03-05
**Author:** @toolkit

---

## Problem Statement

### Builder Remains Oversized After First Refactor

The `prd-toolkit-agent-organization` refactor (completed 2026-03-01) reduced `builder.md` from 2,255 to ~1,312 lines by extracting duplicated patterns to `AGENTS.md` and creating 6 new skills. However, Builder has since grown back to **2,082 lines** (83.7 KB) due to accumulated shared infrastructure.

The `prd-token-optimization` PRD (status: ready) targets **different sections** — CLI reference (~100 lines), Visual Debugging Escalation (~80 lines), Environment diagnosis (~80 lines), and Dev Server Management (~150 lines). Those extractions are complementary to this PRD and do not overlap.

### Analysis: Why Not Split Builder by Mode?

A detailed analysis of Builder's 2,082 lines reveals:

| Category | Lines | % of Total |
|----------|-------|------------|
| **Shared infrastructure** (used by both PRD + ad-hoc) | ~1,500 | ~72% |
| **PRD-specific** logic | ~150 | ~7% |
| **Ad-hoc-specific** logic | ~100 | ~5% |
| **Already delegated to skills** (stubs/refs) | ~330 | ~16% |

Splitting Builder into `builder-prd.md` and `builder-adhoc.md` would **duplicate ~1,500 lines** across two files (total ~3,250 lines), making the problem worse. The actual mode-specific logic already lives in skills: `adhoc-workflow` (1,637 lines) and `prd-workflow` (1,071 lines).

The real opportunity is extracting the **shared infrastructure sections** that are self-contained and rarely need to be in the main agent context.

### Sections Targeted for Extraction

| Section | Lines in builder.md | Size | Extract To |
|---------|---------------------|------|------------|
| Verification-Incomplete Handling (1053-1145) | ~93 | Self-contained status handling, override mechanism, state updates | `builder-verification` skill |
| Never Use curl/wget (1147-1175) | ~29 | As-user verification rules and table | `builder-verification` skill |
| Prerequisite Failure Detection (1177-1227) | ~51 | Classification table, detection method, handling flow | `builder-verification` skill |
| Environment Prerequisite Handling (1229-1275) | ~47 | Environment categories, recovery flow, prompt | `builder-verification` skill |
| Skill Creation Request Flow (1277-1396) | ~120 | Full flow for requesting new skills from @toolkit | `builder-verification` skill |
| Skill ref stubs: 3-Pass, Fix Loop, Failure, Blocker, Flaky (1397-1462) | ~66 | Already skill refs with quick-reference summaries | Trim to 1-line refs |
| Deferred E2E Test Flow (1463-1476) | ~14 | Already a skill ref | Trim to 1-line ref |
| Resume Dashboard (1493-1535) | ~43 | Dashboard template | `builder-dashboard` skill |
| Fresh Dashboard (1536-1635) | ~100 | Dashboard template + vectorization logic | `builder-dashboard` skill |
| Error Recovery + Loop Detection (352-455) | ~104 | Transient error patterns, sub-agent failures, loop detection | `builder-error-recovery` skill |

**Total extractable:** ~667 lines
**Target builder.md size after extraction:** ~1,415 lines

### Combined Impact with Token Optimization PRD

| PRD | Sections | Est. Reduction |
|-----|----------|----------------|
| `prd-token-optimization` US-003 | CLI reference, Visual Debugging, Environment diagnosis, Dev Server | ~410 lines |
| **This PRD** | Verification handling, Dashboards, Error recovery | ~667 lines |
| **Combined** | All of the above | ~1,077 lines |

**Combined target:** builder.md at ~1,000-1,100 lines (from 2,082), well within the 800-1,500 line guideline.

---

## Goals

- Extract 3 self-contained skill files from Builder's shared infrastructure sections
- Reduce builder.md by ~667 lines (from ~2,082 to ~1,415)
- Preserve all existing functionality via skill loading
- Trim existing skill-reference stubs from multi-line summaries to single-line references
- Complement (not overlap with) `prd-token-optimization` US-003

## Non-Goals

- Splitting Builder into separate PRD-mode and ad-hoc-mode agents (analysis showed this is counterproductive)
- Changing any external behavior or delegation contracts
- Modifying the sections targeted by `prd-token-optimization` US-003
- Creating new agents
- Reducing mode-specific logic (already in workflow skills)

---

## Relationship to Other PRDs

| PRD | Relationship | Overlap |
|-----|--------------|---------|
| `prd-token-optimization` (ready) | **Complementary** — targets different Builder sections (CLI, env diagnosis, dev server) | None — this PRD explicitly excludes those sections |
| `prd-toolkit-agent-organization` (completed) | **Continuation** — first phase reduced Builder from 2,255 to 1,312; this is phase 2 after Builder re-grew | None — org refactor extracted different patterns (AGENTS.md guardrails, 6 skills) |
| `prd-session-unification` (draft) | **Adjacent** — may simplify dashboard templates and remove solo/multi branching from builder.md | None — this PRD keeps the Solo Mode section inline; unification would modify it later |

---

## User Stories

### US-001: Extract Verification Handling to `builder-verification` Skill

**Description:** As a Builder session, I want verification-related infrastructure loaded only when verification is needed, so that non-UI tasks don't carry 340 lines of verification handling overhead.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] New skill `skills/builder-verification/SKILL.md` created
- [ ] Skill contains: Verification-Incomplete Handling (status table, blocked prompt, skip handling, override mechanism, state updates)
- [ ] Skill contains: Never Use curl/wget for As-User Verification (rules table, what requires Playwright verification)
- [ ] Skill contains: Prerequisite Failure Detection (classification table, detection method, handling flow)
- [ ] Skill contains: Environment Prerequisite Handling (categories, recovery flow, prompt)
- [ ] Skill contains: Skill Creation Request Flow (no-skill prompt, pending-update creation, state tracking, retry/hot-reload)
- [ ] builder.md lines 1053-1396 replaced with single skill reference block (~5-8 lines)
- [ ] Skill reference includes essential triggers: "When verification-incomplete, as-user verification needed, prerequisite failure, or environment issue"
- [ ] All instances of "browser verification" / "browser-verified" within the extracted skill use "as-user verification" / "as-user verified" instead
- [ ] No functionality lost — all current flows preserved in the skill
- [ ] builder.md net reduction: ~335 lines

### US-002: Trim Existing Skill Reference Stubs

**Description:** As a Builder agent definition, I want skill reference stubs reduced from multi-line quick-reference summaries to minimal 1-2 line references, so that I don't load redundant summaries for content that lives in skills.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] 3-Pass Stability Verification (1397-1409): Reduced from ~13 lines to ~2 lines (skill ref + trigger only)
- [ ] Automated Fix Loop (1410-1421): Reduced from ~12 lines to ~2 lines
- [ ] Failure Logging and Manual Fallback (1423-1434): Reduced from ~12 lines to ~2 lines
- [ ] Blocker Tracking and Bulk Re-verification (1436-1447): Reduced from ~12 lines to ~2 lines
- [ ] Flaky Test Handling (1448-1460): Reduced from ~13 lines to ~2 lines
- [ ] Deferred E2E Test Flow (1463-1476): Reduced from ~14 lines to ~2 lines
- [ ] Each stub retains: skill name, section anchor, and essential trigger description
- [ ] No quick-reference content duplicated (the skill is the source of truth)
- [ ] builder.md net reduction: ~60 lines

### US-003: Extract Dashboard Templates to `builder-dashboard` Skill

**Description:** As a Builder session, I want dashboard rendering templates loaded as a skill, so that the main agent context stays focused on decision logic rather than display templates.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] New skill `skills/builder-dashboard/SKILL.md` created
- [ ] Skill contains: Resume Dashboard template (full template with sections: vectorization, in-progress PRD, other options, pending ad-hoc work)
- [ ] Skill contains: Fresh Dashboard template (full template with sections: vectorization, awaiting E2E, ready PRDs, completed PRDs, pending updates)
- [ ] Skill contains: Vectorization Status Logic (the 4-state decision tree)
- [ ] Skill contains: Dashboard section descriptions (what each section shows and when)
- [ ] builder.md lines 1493-1635 replaced with skill reference block (~5-8 lines)
- [ ] Skill reference includes: "Load `builder-dashboard` skill when rendering startup dashboard (fresh or resume)"
- [ ] No functionality lost — dashboard templates identical in the skill
- [ ] builder.md net reduction: ~135 lines

### US-004: Extract Error Recovery to `builder-error-recovery` Skill

**Description:** As a Builder session, I want error recovery patterns loaded only when errors occur, so that normal execution paths don't carry 104 lines of error handling logic.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] New skill `skills/builder-error-recovery/SKILL.md` created
- [ ] Skill contains: Tool Error Recovery section (transient error patterns table, recovery flow diagram, retry logic)
- [ ] Skill contains: Sub-agent Failures section (partial work detection, resume strategy with context block, 2-failure limit)
- [ ] Skill contains: Never Stop Silently section (unexpected error prompt template)
- [ ] Skill contains: Loop Detection and Bulk Fix (self-correction skill reference, detection triggers)
- [ ] builder.md lines 352-455 replaced with skill reference block (~5-8 lines)
- [ ] Skill reference includes essential triggers: "When tool call fails, sub-agent fails, or repetitive fix pattern detected"
- [ ] Rate Limit Handling stub preserved in builder.md (1-2 lines, references session-state skill) — this is critical enough to stay inline
- [ ] No functionality lost — all recovery flows preserved in the skill
- [ ] builder.md net reduction: ~95 lines

### US-005: Post-Change Workflow and Validation

**Description:** As a toolkit maintainer, I want the post-change workflow completed after all extractions, ensuring toolkit-structure.json, README, and website sync are updated.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] toolkit-structure.json updated with 3 new skills (builder-verification, builder-dashboard, builder-error-recovery)
- [ ] toolkit-structure.json skill count updated
- [ ] README.md skill count updated if changed
- [ ] Website sync update queued to documentation site's `docs/pending-updates/`
- [ ] All 4 governance validators run (toolkit-postchange, handoff-contracts, project-updates, policy-testability)
- [ ] Final builder.md line count is ~1,415 lines or fewer (down from 2,082)

---

## Functional Requirements

- FR-1: Each extracted skill must be self-contained — loadable independently without requiring builder.md context
- FR-2: builder.md skill references must include the trigger condition so Builder knows when to load each skill
- FR-3: Skills must preserve all prompt templates (dashboard templates, error prompts, override flows) exactly as they appear in builder.md today
- FR-4: The `builder-verification` skill must be loadable by both Builder and Tester agents (shared verification infrastructure)
- FR-5: Skill reference stubs in builder.md must follow the existing pattern: blockquote with skill name, section anchor, and 1-line trigger description
- FR-6: Rate Limit Handling (lines 358-362) must remain inline in builder.md — it's a 5-line critical reference that should always be in context
- FR-7: All dashboard section logic (what to show, where to read data) must move with the templates — no logic/template separation

## Non-Goals (Out of Scope)

- Extracting Token Budget Management (lines 130-172) — small, always needed, stays inline
- Extracting Skills Reference table (lines 174-214) — always needed for routing decisions
- Extracting Planning Request Detection (lines 464-534) — critical guardrail, stays inline
- Extracting Startup flow (lines 606-942) — core orchestration, stays inline
- Extracting any section targeted by `prd-token-optimization` US-003 (Visual Debugging 216-289, Environment Diagnosis 290-341, Dev Server 1636-1679)
- Creating or modifying any agent other than builder.md
- Changing Builder's external behavior or delegation model

---

## Technical Considerations

### Skill Loading Map Updates

After extraction, Builder's Skills Reference table (lines 174-214) needs 3 new entries:

| Trigger | Skill | When |
|---------|-------|------|
| Verification incomplete/failed | `builder-verification` | After quality checks, when UI verification needed |
| Startup dashboard rendering | `builder-dashboard` | During fresh or resume dashboard display |
| Tool/sub-agent failure | `builder-error-recovery` | When any tool call or sub-agent fails |

### Skill Naming Convention

New skills follow `builder-*` pattern to indicate they are Builder-specific infrastructure (not shared testing skills like `test-*`). Exception: `builder-verification` may be useful to Tester agent in the future.

### Dependency on Existing Skills

The `builder-verification` skill will reference these existing skills:
- `test-ui-verification` — for the actual Playwright verification flow
- `test-verification-loop` — for 3-pass stability
- `test-prerequisite-detection` — for prerequisite failure patterns
- `test-failure-handling` — for failure logging

These are references (not imports) — Builder loads them separately when needed.

### Ordering

Stories should be implemented in order (US-001 through US-005) because:
1. US-001 is the largest extraction and validates the pattern
2. US-002 depends on understanding what US-001's skill reference looks like
3. US-003 and US-004 follow the same pattern established by US-001
4. US-005 is the post-change workflow that validates the final state

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| builder.md line count | 2,082 | ~1,415 |
| Verification section lines in builder.md | ~343 | ~8 (skill ref) |
| Dashboard template lines in builder.md | ~143 | ~8 (skill ref) |
| Error recovery lines in builder.md | ~104 | ~8 (skill ref) |
| Skill ref stub lines | ~80 | ~14 |
| New skills created | 0 | 3 |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Builder forgets to load skill when needed | Medium | High | Clear trigger conditions in skill reference blocks |
| Over-extraction makes Builder too thin | Low | Medium | Keep all orchestration logic inline; only extract self-contained blocks |
| Skill-reference stubs too minimal, losing context | Medium | Medium | Keep trigger description in each stub — 1 line is enough |
| Conflict with `prd-token-optimization` execution | Low | Low | No section overlap; can be implemented in any order |

---

## Timeline Estimate

| Story | Estimate |
|-------|----------|
| US-001 (builder-verification skill) | 2-3 hours |
| US-002 (trim stubs) | 30 min |
| US-003 (builder-dashboard skill) | 1-2 hours |
| US-004 (builder-error-recovery skill) | 1-2 hours |
| US-005 (post-change workflow) | 30 min |
| **Total** | **5-8 hours** |

---

## Credential & Service Access Plan

No external credentials required for this PRD.

---

## Resolved Questions

1. **Should `builder-dashboard` include the Solo Mode vs Multi-Session Mode section?**
   **Decision: No.** Keep it inline in builder.md — it's a behavioral mode switch, not a dashboard template. The solo/multi-session distinction is being evaluated for unification in a separate PRD (`prd-session-unification`).

2. **Should `builder-verification` also be referenced by the Tester agent?**
   **Decision: Builder-specific initially.** Adding Tester references is a one-line change later. Validate the skill works for Builder first before widening its audience.

3. **Terminology: "browser verification" → "as-user verification"**
   **Decision: Rename.** The term "browser verification" is misleading — Playwright also drives Electron desktop apps, not just browsers. All occurrences of "browser verification" and "browser-verified" within the extracted skill and the builder.md replacements should use **"as-user verification"** (meaning: testing the UI as a user would, via Playwright). The broader `builder-verification` skill name stays as-is since it covers more than just as-user verification (also prerequisite failures, environment issues, skill creation requests).
   **Note:** A toolkit-wide rename of "browser verification" → "as-user verification" across all 12 affected files (22 occurrences) is out of scope for this PRD but should be tracked as a follow-up task.
