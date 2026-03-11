# PRD: Session Unification (Always-On Coordination)

**Status:** Ready
**Priority:** Low
**Created:** 2026-03-05
**Author:** @toolkit

---

## Problem Statement

Builder and Developer currently branch on `project.json` → `agents.multiSession` (default: `false`) to choose between "Solo Mode" (no coordination) and "Multi-Session Mode" (session locks, heartbeat, merge queue). This creates:

1. **Unnecessary complexity** — 14 references in builder.md alone, plus branching in developer.md, builder-state skill, and multi-session skill, all checking the same flag and diverging behavior
2. **False safety** — A solo developer can still open multiple Builder sessions accidentally, with no coordination to prevent conflicts
3. **Configuration burden** — Users must know to flip `multiSession: true` before running parallel sessions, but the consequence of forgetting is silent PRD conflicts

### Current Overhead Analysis

The multi-session operations and their cost when running solo (no other sessions exist):

| Operation | Cost When Solo | Can Be Made Zero-Cost? |
|-----------|---------------|----------------------|
| Generate session ID | Negligible (one `openssl rand`) | Already negligible |
| Read `session-locks.json` | Negligible (empty file or `{"sessions":[]}`) | Already negligible |
| Check for stale sessions | Zero (empty array loop) | Already zero |
| Claim PRD (write lock + commit + push) | **1 extra git commit+push** | Yes — skip push if only session |
| Heartbeat (stash→checkout main→update→commit→push→checkout branch→pop) | **1 round-trip per story** — the expensive operation | Yes — skip entirely if only session |
| Release lock on completion | Bundled with completion commit | Already bundled |
| Dashboard session info | Shows "no other sessions" | Already negligible |

**The only real cost is heartbeat**, and it can be eliminated by checking `sessions.length === 1` before doing the stash/checkout/push cycle.

### Current Ownership Split

Session coordination logic is currently spread across multiple locations:

| Location | What it does |
|----------|-------------|
| `multi-session` skill (lines 93-113) | Claim PRD: read locks, find available PRD, write lock entry, commit+push to main, create branch |
| `multi-session` skill (lines 115-131) | Heartbeat: stash, checkout main, update lock, commit+push, return to branch |
| `multi-session` skill (lines 133-149) | Release lock: merge branch, archive PRD, remove lock, delete branch |
| `developer.md` Phase 0B (lines 105-120) | Gate: check multiSession → load skill → claim + checkout |
| `builder.md` (lines 1486, 2048-2065) | Documents the lock format and solo/multi comparison |

The `multi-session` skill (265 lines) covers the **full lifecycle** in a single file: claim, heartbeat, release, abandon, stale detection, conflict resolution, error handling, merge queue. This monolithic structure doesn't map well to the unified model where setup is always-on but coordination is conditional.

---

## Proposed Solution

Remove the `agents.multiSession` flag and always run coordination, but make the expensive operations **lazy** — only pay the cost when other sessions actually exist.

### Skill Split: `session-setup` (new) + `multi-session` (trimmed)

Split the current monolithic `multi-session` skill into two skills with a clean boundary:

```
session-setup (NEW)                 multi-session (EXISTING, trimmed)
─────────────────────               ──────────────────────────────────
Always runs on startup.             Loaded only when sessions.length > 1.

• Generate session ID               • Heartbeat updates (git round-trip)
• Read/create session-locks.json     • Stale session detection
• Write own session entry            • Conflict risk levels
• Create/checkout feature branch     • Merge queue coordination
• Rebase from default branch         • Release lock + branch cleanup
• Detect other active sessions       • Abandon PRD flow
  (return session count)             • Push rejection recovery
```

Developer always loads `session-setup`, which returns the active session count. Developer then:
- `sessions === 1` → proceed, no further coordination needed
- `sessions > 1` → load `multi-session` skill for heartbeat + coordination

### Always Do (Zero Cost)

- Generate session ID at startup
- Read/create `session-locks.json` (created lazily on first Builder run)
- Claim PRDs via lock entry
- Create/checkout feature branch
- Show session info in dashboard
- Release lock on completion

### Lazy (Only When Others Present)

- **Heartbeat push cycle:** Before doing stash→checkout→push, check if `sessions` array has >1 entry. If you're the only session, update the JSON locally but skip the git round-trip.
- **Merge queue:** Only coordinate merges if other sessions have completed work targeting the same branch.
- **Conflict risk analysis:** Only compute if >1 session is active.

---

## Goals

- Remove `agents.multiSession` configuration flag (always-on coordination)
- Extract session setup to a new `session-setup` skill (always-run)
- Trim `multi-session` skill to coordination-only (loaded conditionally)
- Eliminate all solo/multi branching logic from builder.md, developer.md, builder-state skill
- Make heartbeat zero-cost when running as the only session
- Preserve full coordination when multiple sessions exist

## Non-Goals

- Changing the session lock format or merge queue protocol
- Adding new coordination features
- Changing `git.agentWorkflow` or `git.autoCommit` behavior
- Moving PRD claiming ownership from Developer to Builder (Developer keeps it — all git coordination stays in one agent)

---

## Affected Files

| File | Current Solo/Multi Branching | Change |
|------|------------------------------|--------|
| `agents/builder.md` | 14 references — startup detection (789-792), dashboard mode (903), comparison table (1477-1489), dashboard solo notes (1627-1633), session lock section guard (2048-2050) | Remove all branching; always run coordination |
| `agents/developer.md` | Step 3 mode detection (101-103), Phase 0B guard (105-113), heartbeat skip (198-199), multi-session note (670) | Remove mode detection; always run Phase 0B (loads `session-setup` always, `multi-session` conditionally) |
| `skills/multi-session/SKILL.md` | "Solo Mode Check" guard at top (8-12); full lifecycle (265 lines) | Remove guard; trim to coordination-only (~150 lines); setup logic extracted to `session-setup` |
| `skills/builder-state/SKILL.md` | "Solo vs Multi-Session Mode" section (206-211) | Remove; always active |
| `schemas/project.schema.json` | `agents.multiSession` field (line 1519) | Deprecate field (ignore if present) |

---

## Resolved Questions

1. **Heartbeat frequency:** Per-story. At 2-10 minutes per story, the 5-10 second heartbeat round-trip is 1-8% overhead when multi-session, zero when solo (local-only update). Acceptable.

2. **Migration path for existing projects:** Register a central update via `data/update-registry.json` with `affinityRule: "all-projects"`. Applied on next Builder run. Removes deprecated `agents.multiSession` field, verifies `session-locks.json` exists, informs user that coordination is now always-on.

3. **session-locks.json creation:** Lazily on first Builder run. Creates `{"sessions":[]}` if missing. Not at bootstrap (avoids clutter), not on second session start (too late — Builder needs it for its own session tracking from the start, useful for resume/recovery even solo).

4. **Developer agent Phase 0B:** Always run full Phase 0B. Claiming a PRD and creating a feature branch are cheap local git ops. The expensive heartbeat round-trip is already covered by the lazy heartbeat answer. This simplifies Developer from "detect mode → maybe run Phase 0B" to just "run Phase 0B" — removing the branching logic entirely.

5. **Claiming ownership:** Developer keeps PRD claiming. All git coordination (lock, branch, heartbeat, release) lives in Developer + session skills. Builder picks which PRD; Developer formalizes it via `session-setup`. No change needed.

---

## User Stories

### US-001: Extract session setup to `session-setup` skill

**Description:** As a Developer agent, I want a dedicated skill for session initialization that always runs, separate from multi-session coordination that only runs when other sessions are present.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] New skill `skills/session-setup/SKILL.md` created
- [ ] Skill contains: Generate Session ID (using `openssl rand -hex 3`)
- [ ] Skill contains: Read or create `session-locks.json` (create `{"sessions":[]}` if missing)
- [ ] Skill contains: Write own session entry to `sessions` array (sessionId, prdId, currentStory, status, startedAt, heartbeat)
- [ ] Skill contains: Create or checkout feature branch (`feature/{prd-name}`)
- [ ] Skill contains: Rebase from default branch
- [ ] Skill contains: Return active session count (so caller knows whether to load `multi-session`)
- [ ] Skill does NOT contain: heartbeat push cycle, stale detection, merge queue, abandon flow, conflict risk analysis
- [ ] `multi-session` skill trimmed: claim workflow, branch creation, session ID generation removed (moved to `session-setup`)
- [ ] `multi-session` skill retains: heartbeat updates, stale session detection, conflict risk levels, merge queue, release lock, abandon PRD, push rejection recovery
- [ ] `multi-session` skill "Solo Mode Check" guard removed (skill is loaded conditionally by caller based on session count, not by self-check)
- [ ] No functionality lost — all current flows preserved across the two skills

### US-002: Make coordination always-on in Builder

**Description:** As a Builder session, I want coordination to always be active so that parallel sessions are automatically detected and coordinated without requiring manual configuration.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] builder.md: All 14 solo/multi branching references removed
- [ ] builder.md: Startup flow always generates session ID and reads session locks
- [ ] builder.md: Dashboard always shows session info section (no "simplified" solo variant)
- [ ] builder.md: Solo Mode vs Multi-Session Mode comparison table (lines 1477-1489) removed
- [ ] builder.md: Session Lock Format section (lines 2048-2065) guard removed — always applies
- [ ] builder.md: Skills Reference table updated with `session-setup` entry
- [ ] builder.md: `session-locks.json` created lazily on first run if missing (`{"sessions":[]}`)
- [ ] No reference to `agents.multiSession` remains in builder.md

### US-003: Implement lazy heartbeat

**Description:** As a Developer agent, I want heartbeat to skip the expensive git round-trip when I'm the only active session, so that solo developers pay zero coordination overhead.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] `multi-session` skill heartbeat section updated: check `sessions.length` before git round-trip
- [ ] When `sessions.length === 1`: update `heartbeat` timestamp in local `session-locks.json` only (no stash/checkout/push cycle)
- [ ] When `sessions.length > 1`: full git round-trip (stash → checkout main → pull → update → commit → push → checkout branch → pop) — same as today
- [ ] Developer loads `multi-session` skill only when `session-setup` reports `sessions > 1`
- [ ] Solo developer sees zero git overhead from heartbeat per story
- [ ] Story completion time not impacted for solo developers (2-10 min story implementation not slowed by coordination)

### US-004: Make coordination always-on in Developer

**Description:** As a Developer agent, I want to always run session setup without checking a configuration flag, simplifying my startup flow.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] developer.md: Step 3 "Detect Operation Mode" (lines 99-103) removed entirely
- [ ] developer.md: Phase 0B guard (lines 105-113) removed — always runs
- [ ] developer.md: Phase 0B loads `session-setup` skill (always) instead of `multi-session` skill (conditionally)
- [ ] developer.md: Phase 0B loads `multi-session` skill only when `session-setup` returns `sessions > 1`
- [ ] developer.md: Heartbeat skip note (line 198-199) removed — heartbeat laziness handled inside `multi-session` skill
- [ ] developer.md: Multi-session note (line 670) removed
- [ ] No reference to `agents.multiSession` remains in developer.md

### US-005: Deprecate `agents.multiSession` schema field and notify projects

**Description:** As a toolkit maintainer, I want the `agents.multiSession` field deprecated and all existing projects notified of the change.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] `schemas/project.schema.json`: `agents.multiSession` marked deprecated (add `"deprecated": true` and description noting always-on coordination)
- [ ] `schemas/project.schema.json`: Field kept for backward compatibility (not removed)
- [ ] builder-state skill: "Solo vs Multi-Session Mode" section (lines 206-211) removed
- [ ] Central update registered in `data/update-registry.json` with `affinityRule: "all-projects"`
- [ ] Update template created in `data/update-templates/` with instructions to:
  - Remove `agents.multiSession` from `project.json` (field is ignored)
  - Verify `session-locks.json` exists or will be created on next Builder run
  - Inform user: "Coordination is now always active. No configuration needed."
- [ ] Projects see the update on next Builder/Planner run

### US-006: Update builder-state skill

**Description:** As a Builder session resuming from a previous state, I want state management to work without solo/multi branching.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] `skills/builder-state/SKILL.md`: "Solo vs Multi-Session Mode" section (lines 206-211) removed
- [ ] State file always includes session tracking fields (no conditional inclusion)
- [ ] Resume flow always checks `session-locks.json` for stale sessions
- [ ] No reference to `agents.multiSession` remains in builder-state skill

### US-007: Post-change workflow and validation

**Description:** As a toolkit maintainer, I want the post-change workflow completed after all changes, ensuring toolkit-structure.json, README, and website sync are updated.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] toolkit-structure.json updated with new `session-setup` skill
- [ ] toolkit-structure.json skill count updated
- [ ] README.md skill count updated if changed
- [ ] Website sync update queued to documentation site's `docs/pending-updates/`
- [ ] All 4 governance validators run (toolkit-postchange, handoff-contracts, project-updates, policy-testability)
- [ ] No remaining references to `agents.multiSession` in any agent or skill (verify with grep)

---

## Ordering

Stories should be implemented in this order:

1. **US-001** (session-setup skill) — Foundation: creates the new skill and trims multi-session
2. **US-002** (Builder always-on) — Uses the new skill split
3. **US-003** (Lazy heartbeat) — Implements the performance optimization
4. **US-004** (Developer always-on) — Uses session-setup + conditional multi-session loading
5. **US-005** (Schema deprecation + project notification) — Cleanup after behavior changes
6. **US-006** (Builder-state skill) — Small cleanup
7. **US-007** (Post-change workflow) — Validates final state

---

## Functional Requirements

- FR-1: `session-setup` skill must be self-contained — loadable without requiring `multi-session` skill context
- FR-2: `session-setup` must return session count to caller so they can decide whether to load `multi-session`
- FR-3: `multi-session` skill must remain independently loadable for coordination operations (heartbeat, release, abandon)
- FR-4: All existing multi-session coordination behavior preserved when 2+ sessions active
- FR-5: Zero git round-trip overhead for solo developers (heartbeat local-only)
- FR-6: `session-locks.json` created lazily on first Builder run — not at bootstrap, not on second session
- FR-7: Deprecated `agents.multiSession` field silently ignored (no errors for existing projects)

## Non-Goals (Out of Scope)

- Changing the session lock JSON format
- Moving PRD claiming from Developer to Builder
- Adding new coordination features (e.g., real-time session discovery)
- Modifying merge queue protocol
- Changing `git.agentWorkflow` or `git.autoCommit` behavior

---

## Relationship to Other PRDs

| PRD | Relationship |
|-----|-------------|
| `prd-builder-skill-extraction` (ready) | **Adjacent** — extraction keeps Solo Mode section inline; this PRD removes/simplifies it. No conflict — can be implemented in either order. |
| `prd-token-optimization` (ready) | **Independent** — no overlap |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Existing projects break with `multiSession: true` | Low | Medium | Silently ignore the flag — backward compatible |
| session-locks.json conflicts on shared repos | Low | Medium | Already handled by multi-session skill's push rejection + retry |
| Overhead for users who never run parallel sessions | Low | Low | Lazy heartbeat makes cost near-zero |
| Skill split creates confusion about which skill to load | Medium | Low | Clear contract: `session-setup` always, `multi-session` only when `sessions > 1` |
| Second session starts between setup and heartbeat check | Low | Low | Next heartbeat cycle detects it; no data loss |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| References to `agents.multiSession` in agents/ | 18+ | 0 |
| Solo/multi branching points in builder.md | 14 | 0 |
| Solo/multi branching points in developer.md | 4 | 0 |
| Git round-trips per story (solo developer) | 0 (coordination skipped) | 0 (coordination active, heartbeat lazy) |
| Git round-trips per story (multi-session) | 1 (heartbeat) | 1 (heartbeat) — unchanged |
| Skills covering session lifecycle | 1 (`multi-session`, 265 lines) | 2 (`session-setup` ~80 lines + `multi-session` ~150 lines) |

---

## Timeline Estimate

| Story | Estimate |
|-------|----------|
| US-001 (session-setup skill + multi-session trim) | 2-3 hours |
| US-002 (Builder always-on) | 1-2 hours |
| US-003 (Lazy heartbeat) | 1 hour |
| US-004 (Developer always-on) | 30 min |
| US-005 (Schema deprecation + project notification) | 30 min |
| US-006 (Builder-state skill update) | 30 min |
| US-007 (Post-change workflow) | 30 min |
| **Total** | **6-8 hours** |

---

## Credential & Service Access Plan

No external credentials required for this PRD.
