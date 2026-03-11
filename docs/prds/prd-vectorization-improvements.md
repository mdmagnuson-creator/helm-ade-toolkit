# PRD: Vectorization Visibility Improvements

**Status:** COMPLETE  
**Created:** 2026-03-03  
**Completed:** 2026-03-03  
**Author:** @toolkit (on behalf of user)

---

## Problem Statement

### Dashboard Lacks Vectorization Visibility

When Builder shows the project dashboard, users have no way to tell:
1. Whether vectorization is enabled for the current project
2. What the index status is (stale? healthy? missing?)
3. Whether agents are using semantic search or falling back to grep/glob

**Current dashboard shows:**
- ✅ Project name and git status
- ✅ PRD status (ready, in-progress, awaiting E2E)
- ✅ Pending updates
- ✅ Dev server status
- ❌ **No vectorization status**

**Result:** Users don't know if they're missing out on semantic search capabilities, and have no visibility into index health.

### Token-Aware Batching Is Implemented But Not Documented

The vectorization system has token-aware batching for Voyage embeddings (in `embeddings.ts`), but:
1. The SKILL.md documentation doesn't mention this feature
2. Users don't know batching is happening automatically
3. No visibility into batch sizes or API efficiency

**Code already handles this:**
```typescript
const VOYAGE_MAX_TOKENS_PER_BATCH = 50000;

// Process in token-aware batches
while (i < preparedChunks.length) {
  // Build batch until we hit token limit or chunk limit
  while (batch.length < BATCH_SIZE) {
    if (batchTokens + item.estimatedTokens > VOYAGE_MAX_TOKENS_PER_BATCH) break;
    // ...
  }
}
```

But this isn't documented or visible to users.

---

## Goals

1. **Dashboard vectorization indicator** — Show vectorization status on Builder dashboard
2. **Quick status check** — Users can see at a glance: enabled/disabled, index age, health
3. **Document token batching** — Update SKILL.md to explain token-aware batching
4. **Index health alerts** — Warn when index is stale or missing

---

## Non-Goals

- Changing the batching algorithm (already works well)
- Adding new vectorization features
- Automatic index refresh (already exists via git hooks)
- Complex index analytics or metrics

---

## User Stories

### Story 1: Dashboard Vectorization Status

**As a** developer using Builder  
**I want** to see vectorization status on the dashboard  
**So that** I know whether my project has semantic search enabled

**Acceptance Criteria:**
- [ ] Dashboard shows vectorization status section
- [ ] Status shows: enabled/disabled, index age, chunk count
- [ ] If disabled, shows quick enable hint
- [ ] If enabled but stale (>24h), shows warning
- [ ] If enabled and healthy, shows green indicator

**Example dashboard addition:**

```
═══════════════════════════════════════════════════════════════════════
                    [PROJECT NAME] - BUILDER
═══════════════════════════════════════════════════════════════════════

VECTORIZATION
───────────────────────────────────────────────────────────────────────
  🟢 Enabled | 8,453 chunks | Updated 2 hours ago
  
  [Or if disabled:]
  ⚪ Not enabled — run 'vectorize init' to enable semantic search

  [Or if stale:]
  🟡 Enabled | 8,453 chunks | ⚠️ Stale (updated 3 days ago)
     Run 'vectorize refresh' to update

READY PRDs
───────────────────────────────────────────────────────────────────────
  ...
```

### Story 2: Blocking Stale Index Warning

**As a** developer starting a Builder session with a stale index  
**I want** to be prompted to refresh before continuing  
**So that** I'm aware semantic search may miss recent changes

**Acceptance Criteria:**
- [ ] At session start, check `.vectorindex/metadata.json` timestamp
- [ ] **Only block if vectorization is enabled AND index exists but is stale (>24h)**
- [ ] Blocking prompt options: [R] Refresh now, [S] Skip (continue stale), [D] Disable for session
- [ ] If vectorization not enabled: non-blocking "Not enabled" message (informational only)
- [ ] If enabled but index missing: non-blocking error with `vectorize init` hint
- [ ] After user chooses (when blocking), continue to dashboard

**Decision tree:**

```
vectorization.enabled?
├── NO  → Non-blocking: "⚪ Not enabled — run 'vectorize init'"
└── YES → .vectorindex/ exists?
          ├── NO  → Non-blocking: "🔴 Index missing — run 'vectorize init'"
          └── YES → index age > 24h?
                    ├── NO  → Non-blocking: "🟢 Healthy"
                    └── YES → **BLOCKING PROMPT** (R/S/D options)
```

**Blocking prompt (only for stale index):**

```
═══════════════════════════════════════════════════════════════════════
                    ⚠️ STALE VECTOR INDEX
═══════════════════════════════════════════════════════════════════════

Your vector index is 3 days old. Semantic search may miss recent changes.

  [R] Refresh now (takes ~2 min)
  [S] Skip and continue with stale index
  [D] Disable vectorization for this session

> _
```

### Story 3: Document Token-Aware Batching

**As a** developer reading the vectorize skill documentation  
**I want** to understand how batching works  
**So that** I know the system handles large codebases efficiently

**Acceptance Criteria:**
- [ ] SKILL.md documents token-aware batching for Voyage API
- [ ] Explains the 50k token limit per batch
- [ ] Notes that batching is automatic, no configuration needed
- [ ] Mentions batch size visible in refresh output

**Documentation to add:**

```markdown
## Token-Aware Batching

When using Voyage AI embeddings, the system automatically batches chunks
to stay within API limits:

- **Token limit:** 50,000 tokens per batch (conservative estimate)
- **Chunk limit:** 100 chunks per batch (API limit)
- **Automatic:** No configuration required

Large codebases are handled efficiently — the system estimates token count
per chunk and builds optimal batches automatically.

Batch progress is shown during indexing:
```
Building index...
  Embedded 100/8453 chunks...
  Embedded 200/8453 chunks...
```
```

### Story 4: Improved Indexing Output

**As a** developer running `vectorize init` or `vectorize refresh`  
**I want** to see a summary of batching efficiency  
**So that** I understand how my codebase was processed

**Acceptance Criteria:**
- [ ] Default mode shows: progress bar + summary line at end
- [ ] `--verbose` flag shows per-batch breakdown details
- [ ] `--quiet` flag shows nothing except errors (for CI/scripts)

**Output modes:**

| Mode | Output |
|------|--------|
| Default | Progress bar + "100 chunks in 3 batches, 3 API calls" |
| `--verbose` | Default + per-batch breakdown |
| `--quiet` | Errors only |

**Example default output:**

```
Building index...
  [████████████████████] 100%
  
Total: 100 chunks in 3 batches, 3 API calls
```

**Example verbose output:**

```
Building index...
  Batch 1: 45 chunks, ~48,500 tokens
  Batch 2: 52 chunks, ~49,200 tokens
  Batch 3: 3 chunks, ~2,100 tokens (final)
  [████████████████████] 100%
  
Total: 100 chunks in 3 batches, 3 API calls
```

---

## Technical Specification

### Dashboard Integration

**Location:** `agents/builder.md`, Fresh Dashboard section (~line 1541)

**Data sources:**
1. `project.json` → `vectorization.enabled` (boolean)
2. `.vectorindex/metadata.json` → `lastUpdated`, `chunkCount`
3. File existence check for `.vectorindex/`

**Status logic:**

```
if !vectorization.enabled:
  status = "disabled"
  icon = "⚪"
  message = "Not enabled — run 'vectorize init' to enable semantic search"

elif !exists(".vectorindex/"):
  status = "error"
  icon = "🔴"
  message = "Enabled in config but index missing — run 'vectorize init'"

elif metadata.lastUpdated > 24h:
  status = "stale"
  icon = "🟡"
  message = "Stale (updated {age} ago) — run 'vectorize refresh'"

else:
  status = "healthy"
  icon = "🟢"
  message = "Enabled | {chunkCount} chunks | Updated {age} ago"
```

### Metadata File Structure

`.vectorindex/metadata.json` (already exists):

```json
{
  "projectId": "my-project",
  "lastUpdated": "2026-03-03T10:30:45Z",
  "chunkCount": 8453,
  "embeddingModel": "voyage-code-3",
  "contextualRetrieval": true,
  "version": 1
}
```

### SKILL.md Update

Add new section after "Embedding Models" section (~line 241):

```markdown
### Token-Aware Batching

When using Voyage AI embeddings, the system automatically batches chunks
to stay within API token limits:

| Limit | Value | Purpose |
|-------|-------|---------|
| Token limit | 50,000 per batch | Stay under Voyage 120k API limit (conservative) |
| Chunk limit | 100 per batch | API batch size limit |

**How it works:**

1. Each chunk's token count is estimated (~2 chars per token for code)
2. Chunks are added to a batch until token limit would be exceeded
3. Batch is sent to API, next batch starts
4. Process repeats until all chunks embedded

**Benefits:**
- Large codebases handled efficiently
- Optimal API usage (fewer calls, larger batches)
- Automatic — no configuration required

**Progress output during indexing:**
```
Building index...
  Embedded 100/8453 chunks...
  Embedded 200/8453 chunks...
```
```

---

## Implementation Plan

### Phase 1: Dashboard Vectorization Status

**Files to modify:**
- `agents/builder.md` — Add vectorization section to Fresh Dashboard

**Deliverables:**
- [ ] Add vectorization status check to Builder startup
- [ ] Add status section to dashboard display
- [ ] Show appropriate status icon and message
- [ ] Include quick action hints (init, refresh)

### Phase 2: Document Token-Aware Batching

**Files to modify:**
- `skills/vectorize/SKILL.md` — Add Token-Aware Batching section

**Deliverables:**
- [ ] Add batching documentation after Embedding Models section
- [ ] Explain limits, algorithm, and benefits
- [ ] Show example output

### Phase 3: Blocking Stale Index Check

**Files to modify:**
- `agents/builder.md` — Add health check to startup sequence

**Deliverables:**
- [ ] Check vectorization config and index state at session start
- [ ] Show **blocking** prompt only for stale index (enabled + exists + >24h old)
- [ ] Show non-blocking info for not-enabled or missing-index states
- [ ] Handle R/S/D choice before continuing to dashboard

### Phase 4: Improved Indexing Output

**Files to modify:**
- `skills/vectorize/resources/src/embeddings.ts` — Add summary and verbose logging
- `skills/vectorize/SKILL.md` — Document output modes

**Deliverables:**
- [ ] Add batch summary line to default output
- [ ] Add `--verbose` flag for per-batch breakdown
- [ ] Add `--quiet` flag for CI/scripts (errors only)
- [ ] Document output modes in SKILL.md

---

## Open Questions

*All questions resolved — see Resolved Questions below.*

---

## Resolved Questions

| Question | Resolution |
|----------|------------|
| Should verbose be default? | **No.** Default shows progress + summary line. `--verbose` for per-batch details. `--quiet` for CI/scripts. |
| Should stale index be blocking? | **Yes, but only when vectorization is enabled AND index exists but is stale.** Not-enabled and missing-index states are non-blocking (informational). |
| Show on every dashboard or just fresh start? | **Every dashboard.** Vectorization status visible on all dashboard displays. |

---

## Success Metrics

- Users can see vectorization status at a glance
- Stale indexes are caught early with clear warnings
- SKILL.md documents all batching behavior
- No changes to actual batching algorithm (already working)

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-03-03 | @toolkit | Initial draft |
| 2026-03-03 | @toolkit | Resolved verbose flag question: default shows summary, --verbose for details, --quiet for CI |
| 2026-03-03 | @toolkit | Resolved: stale index = blocking prompt; vectorization status on every dashboard |
| 2026-03-03 | @toolkit | Clarified: blocking only when enabled+exists+stale; not-enabled and missing are non-blocking |
