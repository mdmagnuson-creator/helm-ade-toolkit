---
name: vectorize
description: "Manage codebase and database vectorization for semantic search. Use when initializing, refreshing, or querying the vector index. Triggers on: vectorize init, vectorize refresh, vectorize search, semantic search, vector index, enable vectorization."
---

# Vectorize Skill

Manage codebase and database vectorization for semantic search capabilities.

---

## Overview

Vectorization enables agents to query project knowledge semantically instead of relying solely on grep/glob. This skill provides CLI commands to initialize, refresh, and query the vector index.

### Benefits

- **Semantic search**: Ask "How does authentication work?" instead of grep for "auth"
- **49% fewer retrieval failures** with Contextual Retrieval
- **Hybrid search**: Combines semantic understanding with keyword matching
- **Database awareness**: Agents understand your schema and config tables

### Requirements

- **Embedding API Key** (one of):
  - `OPENAI_API_KEY` — For OpenAI embeddings (text-embedding-3-small)
  - `VOYAGE_API_KEY` — For Voyage AI embeddings (voyage-code-3) ⭐ Recommended for code
- **ANTHROPIC_API_KEY**: Required for Contextual Retrieval (Claude Haiku)
- **DATABASE_URL**: Optional, for database schema indexing

---

## Commands

### `vectorize init`

Initialize vectorization for the current project.

```bash
# From project root
vectorize init
```

**What it does:**

1. Checks for required API keys in environment
2. Adds `vectorization` section to `project.json`
3. Creates `.vectorindex/` directory (gitignored)
4. Scans codebase and creates initial index
5. Installs git post-commit hook for automatic updates
6. Optionally indexes database schema

**Output:**

```
Initializing vectorization for my-project...

Detected stack: Next.js + TypeScript + Supabase
Found 1,247 source files

Configuration:
  Embedding model: Voyage AI voyage-code-3
  Contextual retrieval: enabled
  Storage: local (.vectorindex/)

Database detected:
  DATABASE_URL found in environment
  Type: PostgreSQL (Supabase)
  Include schema indexing? (y/n): y

Building index...
  Chunking: 1,247 files → 8,453 chunks
  Contextual: Adding descriptions (Claude Haiku)
  Embedding: 8,453 chunks → vectors
  [████████████████████] 100%

Installing git hooks...
  post-commit hook installed

✅ Vectorization ready!
   Index: 8,453 chunks (42MB)
   Cost: $2.34 (one-time)

Next steps:
  • Agents will automatically use semantic search
  • Run 'vectorize search <query>' to test
  • Run 'vectorize status' to check index health
```

---

### `vectorize refresh`

Rebuild the vector index (full or incremental).

```bash
# Incremental refresh (only changed files)
vectorize refresh

# Full rebuild
vectorize refresh --full
```

**When to use:**

- After major refactoring
- If index seems stale or corrupted
- After adding database config tables

---

### `vectorize status`

Show index statistics and health.

```bash
vectorize status
```

**Output:**

```
Vector Index Status: my-project

Index Location: .vectorindex/
Last Updated: 2026-02-28 10:30:45 (2 hours ago)
Index Age: OK (within 24h threshold)

Codebase:
  Files indexed: 1,247
  Chunks: 8,453
  Languages: TypeScript (1,102), JavaScript (89), Markdown (56)

Database:
  Schema: 23 tables, 187 columns
  Config tables: pricing_tiers (10 rows), feature_flags (15 rows)

Storage:
  Vector index: 38MB
  BM25 index: 4MB
  Total: 42MB

Configuration:
  Embedding model: voyage (voyage-code-3)
  Contextual retrieval: enabled
  Hybrid weight: 0.7 (semantic)
  Top-K: 20
```

---

### `vectorize search <query>`

Test semantic search from the command line.

```bash
vectorize search "How does user authentication work?"
```

**Output:**

```
Found 8 relevant chunks for "How does user authentication work?"

1. src/auth/middleware.ts (lines 45-89) [score: 0.94]
   ┌─────────────────────────────────────────────────────────────────
   │ // JWT verification middleware
   │ export async function verifyAuth(req: Request) {
   │   const token = req.headers.get('Authorization')?.replace('Bearer ', '');
   │   if (!token) throw new AuthError('Missing token');
   │   
   │   const payload = await verifyJWT(token, process.env.JWT_SECRET);
   │   return { userId: payload.sub, role: payload.role };
   │ }
   └─────────────────────────────────────────────────────────────────

2. src/auth/providers/supabase.ts (lines 12-67) [score: 0.91]
   ┌─────────────────────────────────────────────────────────────────
   │ // Supabase auth provider implementation
   │ export const supabaseAuth = {
   │   signIn: async (email: string, password: string) => {
   │     const { data, error } = await supabase.auth.signInWithPassword({
   │       email, password
   │     });
   │ ...
   └─────────────────────────────────────────────────────────────────

3. docs/ARCHITECTURE.md (lines 156-180) [score: 0.87]
   ┌─────────────────────────────────────────────────────────────────
   │ ## Authentication Design
   │ 
   │ We use Supabase Auth with JWT tokens. The flow:
   │ 1. User signs in via Supabase
   │ 2. Frontend stores access token
   │ 3. API routes verify via middleware
   │ ...
   └─────────────────────────────────────────────────────────────────

[5 more results...]
```

---

### `vectorize config`

Show current vectorization settings.

```bash
vectorize config
```

---

## Implementation

### Directory Structure

```
<project>/
├── .vectorindex/              # Gitignored
│   ├── codebase.lance/        # LanceDB table for code embeddings
│   ├── database.lance/        # LanceDB table for schema/config embeddings
│   ├── bm25/                  # BM25 keyword index
│   ├── metadata.json          # Index state, timestamps, chunk count
│   └── contexts/              # Cached contextual descriptions
├── docs/
│   └── project.json           # Contains vectorization config
```

### Embedding Models

| Provider | Model | Best For | Env Var |
|----------|-------|----------|---------|
| **Voyage AI** | `voyage-code-3` | Code retrieval ⭐ | `VOYAGE_API_KEY` |
| Voyage AI | `voyage-3.5` | General purpose | `VOYAGE_API_KEY` |
| Voyage AI | `voyage-3.5-lite` | Low latency/cost | `VOYAGE_API_KEY` |
| OpenAI | `text-embedding-3-small` | General purpose | `OPENAI_API_KEY` |
| OpenAI | `text-embedding-3-large` | Higher quality | `OPENAI_API_KEY` |
| Ollama | Local models | Free, offline | None (local) |

**Recommendation:** Use `voyage-code-3` for code search. It's specifically optimized for code retrieval and is [recommended by Anthropic](https://docs.anthropic.com/en/docs/build-with-claude/embeddings).

### Token-Aware Batching

When using Voyage AI embeddings, the system automatically batches chunks to stay within API token limits:

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

**Output modes:**

| Mode | Command | Output |
|------|---------|--------|
| Default | `vectorize refresh` | Progress bar + summary ("100 chunks in 3 batches") |
| Verbose | `vectorize refresh --verbose` | Per-batch breakdown |
| Quiet | `vectorize refresh --quiet` | Errors only (for CI/scripts) |

**Default output:**

```
Building index...
  [████████████████████] 100%
  
Total: 8,453 chunks in 85 batches, 85 API calls
```

**Verbose output:**

```
Building index...
  Batch 1: 98 chunks, ~49,500 tokens
  Batch 2: 97 chunks, ~48,200 tokens
  ...
  Batch 85: 12 chunks, ~5,100 tokens (final)
  [████████████████████] 100%
  
Total: 8,453 chunks in 85 batches, 85 API calls
```

### Configuration in project.json

```json
{
  "vectorization": {
    "enabled": true,
    "storage": "local",
    "embeddingModel": "voyage-code-3",
    "contextualRetrieval": "auto",
    
    "codebase": {
      "include": ["src/**", "lib/**", "docs/**"],
      "exclude": ["node_modules/**", "dist/**", "*.test.ts"],
      "chunkStrategy": "ast"
    },
    
    "database": {
      "enabled": true,
      "connection": "env:DATABASE_URL",
      "type": "postgres",
      "schema": {
        "include": ["public.*"],
        "exclude": ["public.migrations"]
      },
      "configTables": [
        {
          "table": "public.pricing_tiers",
          "description": "Subscription pricing and feature limits",
          "sampleRows": 10
        }
      ]
    },
    
    "search": {
      "hybridWeight": 0.7,
      "topK": 20,
      "reranking": {
        "enabled": false,
        "model": "cross-encoder"
      }
    },
    
    "refresh": {
      "onGitChange": true,
      "onSessionStart": true,
      "maxAge": "24h"
    },
    
    "credentials": {
      "voyage": "env:VOYAGE_API_KEY",
      "openai": "env:OPENAI_API_KEY",
      "anthropic": "env:ANTHROPIC_API_KEY"
    }
  }
}
```

---

## Agent Integration

### semantic_search Tool

When vectorization is enabled, agents have access to a `semantic_search` tool:

```typescript
// Tool signature
semantic_search({
  query: string,           // Natural language query
  filters?: {
    filePatterns?: string[], // e.g., ["src/auth/**", "*.ts"]
    languages?: string[],    // e.g., ["typescript", "python"]
    contentType?: "code" | "schema" | "config" | "docs"
  },
  topK?: number            // Override default (20)
})

// Returns
{
  results: [
    {
      content: string,      // Chunk content
      filePath: string,     // e.g., "src/auth/middleware.ts"
      lineRange: [45, 89],  // Start and end lines
      language: string,     // e.g., "typescript"
      score: number,        // Relevance score (0-1)
      type: "code" | "schema" | "config" | "docs"
    }
  ],
  indexAge: string,         // e.g., "2 hours ago"
  queryTime: number         // Milliseconds
}
```

### Agent Usage

Agents automatically use semantic search when:
1. `vectorization.enabled: true` in project.json
2. Index exists in `.vectorindex/`
3. Index is not stale (within `maxAge`)

**Example agent prompt usage:**

```
// @builder looking for authentication patterns
Before implementing the auth feature, let me search for existing patterns:

semantic_search("How is authentication implemented?")
→ Found middleware in src/auth/middleware.ts
→ Found provider in src/auth/providers/supabase.ts
→ Found architecture docs explaining the flow

Now I can implement consistent with existing patterns.
```

---

## Chunking Strategy

### AST Chunking (Default)

Uses Tree-sitter for language-aware chunking:

- **TypeScript/JavaScript**: Functions, classes, methods, exports
- **Python**: Functions, classes, methods, modules
- **Go**: Functions, methods, structs, interfaces
- **Rust**: Functions, impls, structs, enums
- **Java**: Classes, methods, interfaces

Chunks respect semantic boundaries. Large functions (>500 tokens) are split with overlap.

### Sliding Window Fallback

For unsupported languages or config files:
- Window size: 256 tokens
- Overlap: 50 tokens
- Preserves context across chunk boundaries

### Markdown/Docs Chunking

- Section-based chunking (by headings)
- Preserves heading hierarchy in context
- Code blocks kept intact

---

## Contextual Retrieval

When enabled, each chunk is enriched with a brief contextual description before embedding.

**How it works:**

1. Read the full source file
2. For each chunk, ask Claude Haiku: "Given this file, describe what this chunk does in 50-100 tokens"
3. Prepend the description to the chunk
4. Embed the enriched chunk

**Example:**

Original chunk:
```typescript
export async function verifyAuth(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new AuthError('Missing token');
  return verifyJWT(token, process.env.JWT_SECRET);
}
```

With context:
```
[This function is the main authentication middleware in the auth module. It extracts
the JWT token from the Authorization header and verifies it using the JWT_SECRET
environment variable. It's used by all protected API routes.]

export async function verifyAuth(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new AuthError('Missing token');
  return verifyJWT(token, process.env.JWT_SECRET);
}
```

**Benefits:**
- 49% fewer retrieval failures (per Anthropic research)
- Better understanding of chunk's role in codebase
- Improved semantic matching

**Cost:**
- ~$5 per 10k files (one-time)
- Uses prompt caching to reduce costs
- Only reruns for changed files

---

## Database Indexing

### Schema Extraction

Extracts and indexes:
- Table names and descriptions
- Column names, types, and constraints
- Foreign key relationships
- Indexes
- Table/column comments

**Example indexed content:**
```
Table: public.users
Description: Application users and their profiles

Columns:
- id: uuid (primary key, default: gen_random_uuid())
- email: text (unique, not null)
- password_hash: text (not null)
- full_name: text
- role: text (default: 'user', check: role in ('user', 'admin', 'moderator'))
- created_at: timestamptz (default: now())
- updated_at: timestamptz

Foreign keys:
- organization_id → organizations(id)

Indexes:
- users_email_idx on (email)
- users_org_idx on (organization_id)
```

### Config Table Extraction

For designated config tables, extracts sample rows:

```
Table: public.pricing_tiers
Description: Subscription pricing and feature limits

Sample rows:
| name       | price_monthly | price_yearly | max_users | features            |
|------------|---------------|--------------|-----------|---------------------|
| Free       | 0             | 0            | 1         | ["basic"]           |
| Pro        | 29            | 290          | 5         | ["basic", "api"]    |
| Enterprise | 99            | 990          | unlimited | ["basic", "api", …] |
```

---

## Git Integration

### Post-commit Hook

Installed automatically by `vectorize init`:

```bash
#!/bin/sh
# .git/hooks/post-commit

# Get changed files
CHANGED_FILES=$(git diff-tree --no-commit-id --name-only -r HEAD)

# Run incremental vectorize
if [ -d ".vectorindex" ]; then
  npx vectorize refresh --incremental --files "$CHANGED_FILES"
fi
```

### Session Start Check

When an agent session starts:

1. Check if `.vectorindex/metadata.json` exists
2. Compare `lastUpdated` timestamp with current time
3. If older than `maxAge` (default 24h), prompt for refresh
4. Compare with `git log HEAD` to detect missed commits

---

## Cost Estimates

| Codebase Size | Files | Chunks | Embedding Cost | Contextual Cost | Total |
|---------------|-------|--------|----------------|-----------------|-------|
| Small         | 500   | 3k     | ~$0.01         | ~$1.50          | ~$1.51 |
| Medium        | 2k    | 12k    | ~$0.02         | ~$6.00          | ~$6.02 |
| Large         | 10k   | 60k    | ~$0.10         | ~$30.00         | ~$30.10 |

- Costs are one-time for initial indexing
- Incremental updates cost ~1% of full index per commit
- Contextual retrieval can be disabled to reduce costs

---

## Troubleshooting

### "VOYAGE_API_KEY not found"

Get an API key from [Voyage AI](https://www.voyageai.com/) and set it:
```bash
export VOYAGE_API_KEY=pa-...
```

Or add to your shell profile (~/.zshrc, ~/.bashrc).

### "OPENAI_API_KEY not found"

Set the environment variable:
```bash
export OPENAI_API_KEY=sk-...
```

Or add to your shell profile (~/.zshrc, ~/.bashrc).

### "Index is stale"

Run refresh:
```bash
vectorize refresh
```

### "No results for my query"

1. Check if file is included in `codebase.include` patterns
2. Try different query phrasing
3. Use `vectorize search` to test different queries
4. Check `vectorize status` for index health

### "High embedding costs"

- Use Voyage lite: Set `embeddingModel: "voyage-3.5-lite"` for lower cost
- Disable contextual retrieval: Set `contextualRetrieval: "never"`
- Use local Ollama: Set `embeddingModel: "ollama"` (free)
- Reduce include patterns to essential directories

---

## Best Practices

1. **Include documentation**: Add `docs/**` to include patterns
2. **Exclude generated code**: Add `dist/**`, `build/**`, `.next/**`
3. **Exclude tests initially**: Add `*.test.ts` to reduce noise
4. **Use config tables**: Designate reference data tables for agent context
5. **Keep index fresh**: Enable `onGitChange` hook
6. **Review costs first**: Run `vectorize init --dry-run` to see estimates
