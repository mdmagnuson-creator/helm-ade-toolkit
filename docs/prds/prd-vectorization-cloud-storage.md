# PRD: Vectorization Cloud Storage (Pinecone)

> **Status:** Ready for Implementation
> **Priority:** High — Enables cross-machine vector sync
> **Depends on:** Core vectorization (already implemented)

## Introduction

Add Pinecone cloud vector storage to the vectorization system so that vector indexes sync automatically across multiple computers via a shared cloud backend. This eliminates the need to re-run vectorization on each machine when sharing projects via git.

### Problem Statement

Currently, vectorization stores indexes locally in `.vectorindex/` (gitignored). When working on multiple computers:
1. Each machine must run `vectorize init` independently
2. Each machine pays embedding costs separately
3. Indexes can drift out of sync
4. New machines have cold-start delays

### Solution

Store vectors in Pinecone cloud storage. Each project uses a **namespace** within a shared Pinecone **index**, providing:
- One embedding cost per chunk (whichever machine embeds first)
- Automatic sync across machines
- Instant access on new machines
- No local storage requirements (optional local cache for speed)

## Goals

- Enable Pinecone as a cloud vector backend via project configuration
- Use namespaces to isolate projects within a single Pinecone index
- Sync vectors to cloud on index creation and refresh
- Query directly from Pinecone when configured for cloud storage
- Provide migration path from existing local indexes
- Maintain backward compatibility (local storage remains default)

## Architecture

### Pinecone Organization

```
Pinecone Account
└── Index: "yo-go-vectors" (dimension: 1024 for voyage-code-3)
    ├── Namespace: "project-alpha"     ← Project 1
    ├── Namespace: "project-beta"      ← Project 2
    ├── Namespace: "yo-go-toolkit"     ← Toolkit itself
    └── Namespace: "..."               ← More projects
```

**Why one index with namespaces:**
- Pinecone pricing is per-index (free tier: 1 index, 100k vectors)
- Namespaces provide logical isolation at no extra cost
- Queries are scoped to namespace automatically

### Configuration in project.json

```json
{
  "vectorization": {
    "enabled": true,
    "storage": "cloud",
    "embeddingModel": "voyage-code-3",
    "contextualRetrieval": "auto",
    
    "cloud": {
      "provider": "pinecone",
      "index": "yo-go-vectors",
      "namespace": "project-alpha",
      "credentials": "env:PINECONE_API_KEY"
    },
    
    "codebase": {
      "include": ["src/**", "lib/**", "docs/**"],
      "exclude": ["node_modules/**", "dist/**"]
    }
  }
}
```

### Credential Setup (Global, One-Time)

Users set environment variables (not per-project):
```bash
export PINECONE_API_KEY="pcsk_..."
export VOYAGE_API_KEY="pa-..."  # Or OPENAI_API_KEY
```

## User Stories

### US-001: Create Pinecone Store Abstraction

**Description:** As a developer, I need a `PineconeStore` class that implements the same interface as `VectorStore` so that cloud storage is a drop-in replacement.

**Documentation:** No

**Tools:** No

**Credentials:** required (`Pinecone`, `API key`, `timing: upfront`)

**Acceptance Criteria:**

- [ ] Create `skills/vectorize/resources/src/pinecone-store.ts`
- [ ] Implement `PineconeStore` class with same interface as `VectorStore`:
  - `initialize()` — Connect to Pinecone, verify index exists
  - `addCodebaseEmbeddings(chunks, embeddings)` — Upsert vectors to namespace
  - `addTestEmbeddings(chunks, embeddings)` — Upsert with metadata `type: "test"`
  - `addDatabaseEmbeddings(chunks, embeddings)` — Upsert with metadata `type: "database"`
  - `search(queryVector, options)` — Query Pinecone with filters
  - `removeByFiles(filePaths)` — Delete vectors by file path filter
  - `clear()` — Delete all vectors in namespace
  - `getStats()` — Return vector count and namespace info
- [ ] Handle Pinecone client initialization with API key from env
- [ ] Use namespace from config for all operations
- [ ] Include metadata fields: `filePath`, `lineStart`, `lineEnd`, `language`, `type`, `context`
- [ ] TypeScript compiles without errors
- [ ] Unit tests for PineconeStore (mock Pinecone client)

---

### US-002: Create Store Factory

**Description:** As a developer, I need a factory function that returns the correct store implementation based on project configuration.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Create `skills/vectorize/resources/src/store-factory.ts`
- [ ] Export `createStore(projectRoot: string): Promise<VectorStore | PineconeStore>`
- [ ] Read `project.json` to determine storage type
- [ ] Return `VectorStore` (LanceDB) when `storage: "local"` or not set
- [ ] Return `PineconeStore` when `storage: "cloud"` and `cloud.provider: "pinecone"`
- [ ] Throw clear error if cloud configured but credentials missing
- [ ] Update `index.ts` to use factory instead of direct `VectorStore` instantiation
- [ ] TypeScript compiles without errors

---

### US-003: Update Init Command for Cloud Storage

**Description:** As a developer, I want `vectorize init --cloud pinecone` to set up cloud storage so that I can enable cross-machine sync.

**Documentation:** Yes (new: vectorize-cloud-setup)

**Tools:** No

**Credentials:** required (`Pinecone`, `API key`, `timing: upfront`)

**Acceptance Criteria:**

- [ ] Add `--cloud <provider>` flag to init command
- [ ] When `--cloud pinecone`:
  - Verify `PINECONE_API_KEY` is set, error if not
  - Prompt for index name (default: "yo-go-vectors")
  - Prompt for namespace (default: project name from project.json)
  - Check if index exists, create if not (with correct dimension for embedding model)
  - Update project.json with cloud configuration
- [ ] Display clear output showing cloud setup:
  ```
  Cloud storage: Pinecone
  Index: yo-go-vectors
  Namespace: my-project
  Vectors uploaded: 8,453
  ```
- [ ] Skip `.vectorindex/` directory creation when using cloud-only mode
- [ ] Still create `.vectorindex/metadata.json` for tracking git head and refresh state
- [ ] TypeScript compiles without errors
- [ ] Manual verification: init with --cloud pinecone creates namespace

---

### US-004: Update Refresh Command for Cloud Sync

**Description:** As a developer, I want `vectorize refresh` to sync changes to Pinecone so that other machines see my updates.

**Documentation:** Yes (update: vectorize-cloud-setup)

**Tools:** No

**Acceptance Criteria:**

- [ ] When `storage: "cloud"` in config:
  - Detect changed files (same as local refresh)
  - Generate embeddings for changed chunks
  - Delete old vectors for changed files from Pinecone namespace
  - Upsert new vectors to Pinecone namespace
- [ ] Display sync status:
  ```
  Syncing to Pinecone (namespace: my-project)...
  Deleted: 12 vectors (3 changed files)
  Uploaded: 15 vectors
  ```
- [ ] Update local `metadata.json` with new gitHead
- [ ] Handle Pinecone rate limits gracefully (retry with backoff)
- [ ] TypeScript compiles without errors
- [ ] Manual verification: refresh uploads to Pinecone

---

### US-005: Update Search to Query Pinecone

**Description:** As a developer, I want `vectorize search` and the `semantic_search` tool to query Pinecone when configured so that I get results from the shared index.

**Documentation:** Yes (update: vectorize-cloud-setup)

**Tools:** No

**Acceptance Criteria:**

- [ ] When `storage: "cloud"`:
  - Generate query embedding (same as local)
  - Query Pinecone namespace with filters
  - Return results in same format as local search
- [ ] Support same filter options: `type`, `language`, `filePatterns`
- [ ] Include latency in search output (cloud adds ~50-100ms)
- [ ] Hybrid search: query Pinecone for semantic, keep local BM25 for keywords
  - If local BM25 index doesn't exist, skip keyword component
- [ ] TypeScript compiles without errors
- [ ] Manual verification: search returns results from Pinecone

---

### US-006: Update Status Command for Cloud

**Description:** As a developer, I want `vectorize status` to show cloud index information so that I can verify sync state.

**Documentation:** Yes (update: vectorize-cloud-setup)

**Tools:** No

**Acceptance Criteria:**

- [ ] When `storage: "cloud"`:
  - Query Pinecone for namespace stats (vector count)
  - Show cloud-specific info:
    ```
    Storage: Pinecone (cloud)
    Index: yo-go-vectors
    Namespace: my-project
    Vectors: 8,453
    Last synced: 2 hours ago (from metadata.json)
    ```
- [ ] Compare local gitHead with current git HEAD to detect unsynced changes
- [ ] Show warning if local changes not yet synced:
  ```
  ⚠️ 3 files changed since last sync. Run `vectorize refresh` to sync.
  ```
- [ ] TypeScript compiles without errors

---

### US-007: Migrate Existing Local Index to Cloud

**Description:** As a developer with an existing local index, I want to migrate to cloud storage without re-embedding so that I save time and cost.

**Documentation:** Yes (update: vectorize-cloud-setup)

**Tools:** No

**Credentials:** required (`Pinecone`, `API key`, `timing: upfront`)

**Acceptance Criteria:**

- [ ] Add `vectorize migrate-to-cloud` command
- [ ] Read all vectors from local LanceDB store
- [ ] Prompt for Pinecone index and namespace (same as init)
- [ ] Upload all vectors to Pinecone in batches (100 vectors per batch)
- [ ] Update project.json to `storage: "cloud"` with cloud config
- [ ] Display progress and completion:
  ```
  Migrating to Pinecone...
  Uploading: [████████████████████] 100%
  Migrated 8,453 vectors to namespace "my-project"
  
  Updated project.json to use cloud storage.
  Local .vectorindex/ can be deleted to save disk space.
  ```
- [ ] Optionally delete local `.vectorindex/` after migration (prompt user)
- [ ] TypeScript compiles without errors
- [ ] Manual verification: existing index migrates to Pinecone

---

### US-008: Handle Index Creation with Correct Dimensions

**Description:** As a developer, I need the system to create a Pinecone index with the correct embedding dimensions so that it works with my chosen embedding model.

**Documentation:** No

**Tools:** No

**Acceptance Criteria:**

- [ ] Detect embedding model from config or auto-detection
- [ ] Map model to dimension:
  | Model | Dimension |
  |-------|-----------|
  | voyage-code-3 | 1024 |
  | voyage-3.5 | 1024 |
  | voyage-3.5-lite | 512 |
  | text-embedding-3-small | 1536 |
  | text-embedding-3-large | 3072 |
- [ ] When creating index, use correct dimension
- [ ] When connecting to existing index, verify dimension matches
- [ ] Clear error if dimension mismatch:
  ```
  Error: Index "yo-go-vectors" has dimension 1536 but model voyage-code-3 produces 1024.
  Create a new index or use a compatible embedding model.
  ```
- [ ] TypeScript compiles without errors

---

### US-009: Graceful Fallback When Pinecone Unavailable

**Description:** As a developer, I want the system to handle Pinecone outages gracefully so that I can still work offline.

**Documentation:** Yes (update: vectorize-cloud-setup)

**Tools:** No

**Acceptance Criteria:**

- [ ] On search: if Pinecone unreachable, fall back to local BM25 only with warning
- [ ] On refresh: if Pinecone unreachable, queue changes locally and warn
- [ ] Store pending uploads in `.vectorindex/pending-sync.json`
- [ ] On next successful connection, sync pending changes
- [ ] Clear warning message:
  ```
  ⚠️ Pinecone unreachable. Using local keyword search only.
     Semantic search disabled until connection restored.
  ```
- [ ] TypeScript compiles without errors

---

## Functional Requirements

- FR-1: Support `storage: "cloud"` configuration option in project.json
- FR-2: Support `cloud.provider: "pinecone"` with index and namespace settings
- FR-3: Read Pinecone API key from environment variable
- FR-4: Create Pinecone index with correct dimensions for embedding model
- FR-5: Use namespace isolation for multi-project support
- FR-6: Sync vectors to Pinecone on init and refresh
- FR-7: Query Pinecone for semantic search when configured
- FR-8: Maintain local metadata.json for git tracking regardless of storage type
- FR-9: Provide migration path from local to cloud storage
- FR-10: Handle Pinecone unavailability with graceful degradation

## Non-Goals (Out of Scope)

- **Weaviate support** — Future PRD, not included here
- **Bi-directional sync** — Other machines' changes don't auto-pull (they query cloud directly)
- **Local caching of cloud vectors** — Keep it simple; query cloud each time
- **Self-hosted Pinecone** — Cloud-only for now
- **Conflict resolution** — Last-write-wins is sufficient for embeddings (they're reproducible)
- **Real-time sync** — Sync happens on explicit refresh, not automatically

## Technical Considerations

### Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "@pinecone-database/pinecone": "^2.0.0"
  }
}
```

### Pinecone Client Usage

```typescript
import { Pinecone } from '@pinecone-database/pinecone';

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

// Get or create index
const index = pinecone.index('yo-go-vectors');
const namespace = index.namespace('my-project');

// Upsert vectors
await namespace.upsert([
  {
    id: 'chunk-123',
    values: [0.1, 0.2, ...], // 1024 dimensions
    metadata: {
      filePath: 'src/auth/middleware.ts',
      lineStart: 45,
      lineEnd: 89,
      language: 'typescript',
      type: 'code',
      content: '...', // Store content in metadata for retrieval
      context: '...',
    },
  },
]);

// Query
const results = await namespace.query({
  vector: queryVector,
  topK: 20,
  includeMetadata: true,
  filter: { type: { $eq: 'code' } },
});
```

### Metadata Limits

Pinecone metadata has limits:
- 40KB per vector metadata
- String values max 512 bytes for filtering

**Approach:** Store full `content` in metadata (needed for retrieval), but use truncated `contentPreview` (first 500 chars) for any filtering needs.

### Batching

Pinecone recommends batches of 100 vectors for upsert. The existing `embeddings.ts` already batches; align with that.

### File Structure

```
skills/vectorize/resources/src/
├── store.ts              # Existing VectorStore (LanceDB)
├── pinecone-store.ts     # NEW: PineconeStore 
├── store-factory.ts      # NEW: Factory to choose store
├── config.ts             # Update: Add cloud config types
├── index.ts              # Update: Use store factory
└── ...
```

## Success Metrics

- Vectorization works identically on multiple machines
- No re-embedding required when switching machines
- Init on second machine takes <10 seconds (no embedding, just config)
- Search latency <200ms including Pinecone round-trip
- Migration from local completes without data loss

## Cost Estimates

| Pinecone Plan | Monthly Cost | Vectors Included | Suitable For |
|---------------|--------------|------------------|--------------|
| **Starter** (free) | $0 | 100,000 | 1-10 small projects |
| **Standard** | $70/mo | 1,000,000 | 10-100 projects |

Typical project: ~5,000-15,000 vectors. Free tier covers ~10 projects.

## Open Questions

1. ~~Should cloud be primary or backup?~~ **Decision: Primary when configured. No local vector cache.**

2. ~~How to handle conflicts when multiple people index simultaneously?~~ **Decision: Last-write-wins. Embeddings are deterministic, so this is safe.**

3. ~~What's the sync frequency?~~ **Decision: On explicit `vectorize refresh` only (triggered by git hook or manual).**

4. **Index naming convention?** Suggested: One shared index `yo-go-vectors` with project namespaces.

5. **Should we auto-create the index?** Suggested: Yes, with user confirmation.

## Credential & Service Access Plan

| Service | Credential Type | Needed For | Request Timing | Fallback if Not Available |
|---------|-----------------|------------|----------------|---------------------------|
| Pinecone | API Key (`PINECONE_API_KEY`) | US-001, US-003, US-004, US-007 | upfront | Use local storage (existing behavior) |
| Voyage AI | API Key (`VOYAGE_API_KEY`) | Embeddings | upfront | Fall back to OpenAI or Ollama |

---

*PRD Version: 1.0*
*Created: 2026-03-02*
*Updated: 2026-03-04*
*Status: Ready for Implementation*
