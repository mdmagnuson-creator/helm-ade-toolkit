# PRD: Codebase and Database Vectorization

## Introduction

Add semantic search capabilities to the AI toolkit by vectorizing project codebases, database schemas, and code relationships. This enables agents (@planner, @builder, @developer, critics, testers) to deeply understand complex projects — asking "What calls this function?", "How does authentication work?", and "Which tests cover this code?" instead of relying solely on keyword grep searches.

The system uses RAG (Retrieval-Augmented Generation) with optional Contextual Retrieval to dramatically improve agent accuracy by grounding responses in actual code, relationships, and schema — reducing hallucination, improving consistency with existing patterns, and enabling confident bug fixes and changes.

## Goals

- Enable semantic search across project codebases (source files, tests, docs, configs)
- **Index code relationships** (call graphs, dependencies, imports)
- **Index git history context** (commit messages, blame, change rationale)
- **Map tests to code** (which tests cover which functions)
- **Generate architecture summaries** for high-level understanding
- Index database schemas and designated configuration tables
- Reduce agent retrieval failures by 40%+ through contextual embeddings
- Maintain privacy-first approach with local-default storage
- Provide configurable embedding models (local, OpenAI, Voyage)
- Support incremental indexing triggered by git changes
- Make vector search available to all agents as a shared tool

## User Stories

### US-001: Add vectorization configuration to project.json schema

**Description:** As a developer, I want to configure vectorization settings in my project.json so that the system knows what to index and how.

**Documentation:** Yes (new: vectorization-setup)

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] New `vectorization` section added to project.json schema
- [ ] Schema includes: enabled, storage, embeddingModel, contextualRetrieval settings
- [ ] Schema includes: codebase.include/exclude patterns, chunkStrategy
- [ ] Schema includes: codebase.indexTests (boolean, default true)
- [ ] Schema includes: relationships.callGraph, relationships.dependencies, relationships.testMapping
- [ ] Schema includes: gitHistory.enabled, gitHistory.depth (commits to index)
- [ ] Schema includes: architectureSummary.enabled, architectureSummary.refreshInterval
- [ ] Schema includes: database.enabled, connection (env reference), type
- [ ] Schema includes: database.schema.include/exclude patterns
- [ ] Schema includes: database.configTables array with table, description, sampleRows
- [ ] Schema includes: refresh.onGitChange, onSessionStart, maxAge
- [ ] Schema validation works for all field types
- [ ] JSON schema file updated: `schemas/project.schema.json`

---

### US-002: Implement codebase chunking with AST parsing

**Description:** As a system, I need to split source files into semantic chunks (functions, classes, methods) so that embeddings capture meaningful units of code.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Tree-sitter integration for AST parsing
- [ ] Supported languages: TypeScript, JavaScript, Python, Go, Java, Rust
- [ ] Chunks respect semantic boundaries (function, class, method, module)
- [ ] Large functions (>500 tokens) are split with overlap
- [ ] Fallback to sliding window (256 tokens, 50 overlap) for unsupported languages
- [ ] File metadata attached to each chunk (path, language, line range)
- [ ] Non-code files (markdown, JSON, YAML) use paragraph/section chunking
- [ ] **Test files indexed by default** (unless explicitly excluded)
- [ ] Unit tests pass

---

### US-003: Implement embedding generation pipeline

**Description:** As a system, I need to convert code chunks into vector embeddings using configurable models so that semantic search is possible.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** required (OpenAI API key OR Voyage API key, timing: after-initial-build)

**Acceptance Criteria:**

- [ ] Support for OpenAI `text-embedding-3-small` model
- [ ] Support for Voyage AI `voyage-code-3` model (recommended for code)
- [ ] Support for local Ollama with `nomic-embed-text`
- [ ] Auto-detection: use Voyage if available, else OpenAI, else Ollama
- [ ] Explicit model override via project.json config
- [ ] Batch embedding requests for efficiency (max 100 chunks per request)
- [ ] Rate limiting and retry logic for API models
- [ ] Embedding dimension handling (normalize across models)
- [ ] Unit tests pass

---

### US-004: Implement Contextual Retrieval preprocessing

**Description:** As a system, I need to optionally add contextual descriptions to each chunk before embedding so that retrieval accuracy improves significantly.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** required (Anthropic API key for Claude Haiku, timing: after-initial-build)

**Acceptance Criteria:**

- [ ] Claude Haiku prompt generates 50-100 token context per chunk
- [ ] Context describes chunk's role within the broader file/module
- [ ] Prompt caching used to reduce costs (cache the source file)
- [ ] Context prepended to chunk before embedding
- [ ] Configurable: "auto" (enable for codebases >50k tokens), "always", "never"
- [ ] Progress indicator during contextual processing
- [ ] Estimated cost displayed before starting (based on token count)
- [ ] Unit tests pass

---

### US-005: Implement local vector storage with LanceDB

**Description:** As a system, I need to store embeddings in a local vector database so that semantic search is fast and works offline.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] LanceDB integration for local vector storage
- [ ] Index stored in `<project>/.vectorindex/` directory
- [ ] Separate tables for: codebase, tests, database, relationships, git history
- [ ] Metadata stored alongside vectors (file path, line range, chunk text)
- [ ] `.vectorindex/` added to default .gitignore recommendations
- [ ] Index file size reasonable (<100MB for typical project)
- [ ] Query latency <100ms for top-20 results
- [ ] Unit tests pass

---

### US-006: Implement database schema extraction

**Description:** As a system, I need to connect to project databases and extract schema information so that agents understand data structures.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** required (DATABASE_URL env var, timing: after-initial-build)

**Acceptance Criteria:**

- [ ] Support PostgreSQL schema extraction (tables, columns, types, constraints, comments)
- [ ] Support MySQL schema extraction
- [ ] Support SQLite schema extraction
- [ ] Support Supabase (via PostgreSQL with RLS awareness)
- [ ] Connection via environment variable reference (never inline secrets)
- [ ] Include/exclude patterns for schema filtering
- [ ] Foreign key relationships captured
- [ ] Index information captured
- [ ] Read-only connection enforced (SELECT only)
- [ ] Unit tests pass

---

### US-007: Implement config table content extraction

**Description:** As a system, I need to extract sample rows from designated configuration tables so that agents understand runtime configuration.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** required (DATABASE_URL env var, timing: after-initial-build)

**Acceptance Criteria:**

- [ ] Extract rows from tables listed in `database.configTables`
- [ ] Respect `sampleRows` limit (number or "all")
- [ ] Include table description in embedding context
- [ ] Format rows as structured text for embedding
- [ ] Handle different column types appropriately (JSON, arrays, etc.)
- [ ] Skip binary/blob columns
- [ ] Refresh config table data on index refresh
- [ ] Unit tests pass

---

### US-008: Implement hybrid search (embeddings + BM25)

**Description:** As a system, I need to combine semantic search with keyword search so that both conceptual queries and exact term matches work well.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] BM25 index built alongside vector index
- [ ] Hybrid query combines vector similarity + BM25 scores
- [ ] Rank fusion to merge and deduplicate results
- [ ] Configurable weighting between semantic and keyword scores
- [ ] Exact matches (function names, error codes) rank highly
- [ ] Semantic queries ("how does X work") return conceptually relevant chunks
- [ ] Top-K configurable (default 20)
- [ ] Unit tests pass

---

### US-009: Build call graph and dependency index

**Description:** As an agent fixing bugs, I need to know what calls a function and what it depends on so that I can understand impact and trace issues.

**Documentation:** Yes (update: vectorization-setup)

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] AST analysis extracts function/method calls within each file
- [ ] Cross-file import/require statements tracked
- [ ] Call graph stored in `.vectorindex/relationships.lance`
- [ ] Query: "What calls function X?" returns callers with file:line
- [ ] Query: "What does function X call?" returns callees
- [ ] Query: "What imports module Y?" returns dependent files
- [ ] Handles TypeScript, JavaScript, Python, Go (extensible)
- [ ] Incremental update on file change (re-analyze changed files only)
- [ ] `semantic_search` tool supports `type: "callers"` and `type: "callees"` filters
- [ ] Unit tests pass

---

### US-010: Index git history and blame context

**Description:** As an agent understanding code, I need to know when and why code was written so that I can understand intent and make consistent changes.

**Documentation:** Yes (update: vectorization-setup)

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Extract commit messages for recent history (configurable depth, default 500 commits)
- [ ] Associate commits with files/functions changed
- [ ] Store commit metadata: hash, author, date, message, files changed
- [ ] Parse PR descriptions if available (via commit message conventions or GitHub API)
- [ ] Query: "Why was function X added/changed?" returns relevant commit context
- [ ] Query: "What changed recently in module Y?" returns recent commits
- [ ] Git blame integration: know who last touched each chunk
- [ ] Indexed in `.vectorindex/git-history.lance`
- [ ] Refresh on `vectorize refresh` (incremental: only new commits)
- [ ] Unit tests pass

---

### US-011: Map tests to code (test coverage index)

**Description:** As an agent making changes, I need to know which tests cover which code so that I can run relevant tests and understand expected behavior.

**Documentation:** Yes (update: vectorization-setup)

**Tools:** No

**Considerations:** Integrates with project's test framework (Jest, Vitest, Playwright, pytest, go test)

**Credentials:** none

**Acceptance Criteria:**

- [ ] Detect test framework from project.json or package.json
- [ ] Parse test files to extract test names and descriptions
- [ ] **Static analysis**: Map test imports to source files tested
- [ ] **Dynamic analysis** (optional): Parse coverage reports (lcov, coverage.json) if available
- [ ] Store mapping in `.vectorindex/test-mapping.lance`
- [ ] Query: "What tests cover function X?" returns test names with file:line
- [ ] Query: "What code does test Y exercise?" returns covered functions
- [ ] Support Jest, Vitest, Playwright, pytest, go test
- [ ] E2E tests mapped to routes/pages they exercise (via URL patterns in test)
- [ ] Refresh on `vectorize refresh` (re-analyze test files)
- [ ] `semantic_search` tool supports `type: "tests"` filter
- [ ] Unit tests pass

---

### US-012: Generate architecture summaries

**Description:** As an agent new to a project, I need high-level summaries of how major systems work so that I can understand the big picture before diving into details.

**Documentation:** Yes (update: vectorization-setup)

**Tools:** No

**Considerations:** Uses Claude to synthesize summaries from indexed code

**Credentials:** required (Anthropic API key, timing: after-initial-build)

**Acceptance Criteria:**

- [ ] Auto-detect major modules/packages in codebase
- [ ] Generate 200-500 token summary per module using Claude
- [ ] Summary covers: purpose, key exports, dependencies, common patterns
- [ ] Generate project-level summary: architecture style, data flow, key integrations
- [ ] Store summaries in `.vectorindex/architecture-summaries.json`
- [ ] Query: "How does the auth system work?" retrieves auth module summary + relevant chunks
- [ ] Query: "Give me an overview of this project" returns project summary
- [ ] Summaries refreshed on `vectorize refresh --full` or when module significantly changes
- [ ] Cost estimate displayed before generating (~$0.50 for typical project)
- [ ] Unit tests pass

---

### US-013: Implement incremental indexing with git hooks

**Description:** As a developer, I want the vector index to update automatically when I commit changes so that agents always have current context.

**Documentation:** Yes (update: vectorization-setup)

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Git post-commit hook detects changed files
- [ ] Only changed files are re-chunked and re-embedded
- [ ] Deleted files have their chunks removed from index
- [ ] Renamed files update chunk metadata
- [ ] Call graph updated for changed files
- [ ] Test mapping updated if test files changed
- [ ] Hook installation via `vectorize init` command
- [ ] Session-start check compares index timestamp vs git HEAD
- [ ] Force refresh if index older than `maxAge` setting
- [ ] Progress indicator during refresh
- [ ] Unit tests pass

---

### US-014: Create semantic_search tool for agents

**Description:** As an agent, I need a tool to query the vector index so that I can find relevant code, tests, and relationships when working on tasks.

**Documentation:** Yes (new: agent-semantic-search)

**Tools:** Yes (new: semantic_search)

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Tool available to all agents via standard tool interface
- [ ] Input: natural language query string
- [ ] Optional filters: 
  - `filePatterns`: glob patterns to filter results
  - `languages`: filter by programming language
  - `contentType`: "code" | "tests" | "schema" | "config" | "docs"
  - `relationshipType`: "callers" | "callees" | "imports" | "tests-for" | "tested-by"
- [ ] Output: ranked list of relevant chunks with metadata
- [ ] Each result includes: content, file path, line range, relevance score, type
- [ ] Relationship queries return structured caller/callee/test data
- [ ] Results formatted for easy inclusion in agent context
- [ ] Tool gracefully handles missing/stale index
- [ ] Tool suggests `vectorize refresh` if index is stale
- [ ] Unit tests pass

---

### US-015: Create vectorize CLI skill

**Description:** As a developer, I want CLI commands to manage the vector index so that I can initialize, refresh, and inspect the index.

**Documentation:** Yes (update: vectorization-setup)

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] `vectorize init` — initialize index for current project
- [ ] `vectorize refresh` — rebuild index (full or incremental)
- [ ] `vectorize refresh --full` — force full rebuild including architecture summaries
- [ ] `vectorize status` — show index stats (chunks, age, size, coverage, relationship counts)
- [ ] `vectorize search <query>` — test search from command line
- [ ] `vectorize callers <function>` — show what calls a function
- [ ] `vectorize tests <function>` — show tests that cover a function
- [ ] `vectorize config` — show current vectorization settings
- [ ] Commands work from project root
- [ ] Helpful error messages for common issues
- [ ] Skill file updated: `skills/vectorize/SKILL.md`
- [ ] Unit tests pass

---

### US-016: Write comprehensive README documentation

**Description:** As a developer, I want complete documentation on how vectorization works and how to set it up so that I can configure it for my projects.

**Documentation:** Yes (new: vectorization-readme)

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] README explains the concept and benefits of vectorization
- [ ] README covers all configuration options with examples
- [ ] README includes quick start guide (5-minute setup)
- [ ] README documents embedding model options and tradeoffs
- [ ] README explains call graph and dependency indexing
- [ ] README explains test mapping and how to use it
- [ ] README explains git history indexing
- [ ] README explains architecture summaries
- [ ] README explains database connection setup (env vars)
- [ ] README covers config table designation
- [ ] README includes troubleshooting section
- [ ] README documents cost estimates for different approaches
- [ ] README explains Contextual Retrieval and when to use it
- [ ] README includes architecture diagram
- [ ] File location: `docs/vectorization.md` in toolkit

---

### US-017: Update agent prompts to use semantic search

**Description:** As a system, I need to update key agents to leverage semantic search so that they automatically use vector context when available.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] @planner uses semantic search when analyzing codebases for PRDs
- [ ] @builder uses semantic search to find relevant patterns before implementing
- [ ] @builder queries call graph before making changes ("what calls this?")
- [ ] @builder queries test mapping before changes ("which tests cover this?")
- [ ] @developer uses semantic search for implementation context
- [ ] @developer uses git history to understand code intent
- [ ] @critic agents use semantic search to verify consistency
- [ ] @tester agents use test mapping to identify coverage gaps
- [ ] Agents check for index availability before querying
- [ ] Agents fall back gracefully to grep/glob if no index
- [ ] Search results added to agent context appropriately
- [ ] No change to agent behavior if vectorization disabled

---

### US-018: Integrate vectorization into project bootstrap

**Description:** As a developer creating a new project, I want vectorization to be set up automatically during bootstrap so that agents have semantic search from day one.

**Documentation:** Yes (update: project-bootstrap skill)

**Tools:** No

**Considerations:** Requires API keys (OPENAI_API_KEY or VOYAGE_API_KEY, ANTHROPIC_API_KEY) to be available in environment. If keys are missing, skip vectorization with a message about manual setup later.

**Credentials:** required (VOYAGE_API_KEY or OPENAI_API_KEY, ANTHROPIC_API_KEY, timing: during-bootstrap)

**Acceptance Criteria:**

- [ ] `project-bootstrap` skill checks for vectorization API keys in environment
- [ ] If keys available, runs `vectorize init` as part of bootstrap flow
- [ ] If keys missing, skips with clear message: "Vectorization skipped — set VOYAGE_API_KEY and ANTHROPIC_API_KEY to enable"
- [ ] Bootstrap output shows vectorization status (enabled/skipped)
- [ ] Total bootstrap time remains reasonable (<5 min including vectorization)
- [ ] Vectorization section added to generated `project.json`

---

### US-019: Builder prompts for vectorization on existing projects

**Description:** As a developer working on an existing project without vectorization, I want @builder to offer to set it up so that I don't miss the benefits of semantic search.

**Documentation:** No

**Tools:** No

**Considerations:** Prompt should be non-intrusive and respect user preference to skip.

**Credentials:** required (VOYAGE_API_KEY or OPENAI_API_KEY, ANTHROPIC_API_KEY, timing: on-demand)

**Acceptance Criteria:**

- [ ] @builder checks `project.json` for `vectorization.enabled` on session start
- [ ] If missing or false, prompts user once: "Enable semantic search? (~2 min setup)"
- [ ] User can choose: Yes / No / Don't ask again this session
- [ ] "Don't ask again" preference stored in session state (not persisted)
- [ ] If user chooses Yes, runs `vectorize init` before continuing with task
- [ ] If user chooses No, continues without vectorization
- [ ] Prompt only shown once per session (not on every task)

---

## Functional Requirements

- FR-1: The system must chunk source code using AST parsing for semantic boundaries
- FR-2: The system must support multiple embedding models (Voyage, OpenAI, local)
- FR-3: The system must store embeddings in a local vector database by default
- FR-4: The system must optionally add contextual descriptions to chunks before embedding
- FR-5: The system must extract database schema from PostgreSQL, MySQL, SQLite
- FR-6: The system must extract sample rows from designated configuration tables
- FR-7: The system must combine semantic and keyword (BM25) search for hybrid retrieval
- FR-8: The system must incrementally update the index on git changes
- FR-9: The system must provide a `semantic_search` tool accessible to all agents
- FR-10: The system must provide CLI commands for index management
- FR-11: The system must never store database credentials in configuration files
- FR-12: The system must work offline when using local embedding models
- FR-13: The system must gracefully degrade when vectorization is unavailable
- FR-14: **The system must build and maintain a call graph of function relationships**
- FR-15: **The system must index git history to provide change context**
- FR-16: **The system must map tests to the code they cover**
- FR-17: **The system must generate architecture summaries for major modules**
- FR-18: **The system must index test files by default (not exclude them)**
- FR-19: The system must integrate vectorization setup into project bootstrap when API keys are available
- FR-20: The system must prompt users to enable vectorization on existing projects (once per session)

## Non-Goals (Out of Scope)

- **Real-time streaming updates** — We use git hooks and session-start checks, not file watchers
- **Cross-project search** — Each project has its own isolated index
- **Full database content indexing** — Only schema and explicitly designated config tables
- **Training custom embedding models** — We use existing models only
- **Automatic sensitive data detection** — Users must explicitly exclude sensitive tables
- **Multi-user index sharing** — Local index is per-machine (see separate cloud storage PRD)
- **IDE integration** — Focus is on agent tooling, not editor plugins
- **Image/binary file embedding** — Text-based content only
- **Runtime code coverage** — We use static analysis and optional coverage report parsing, not instrumentation
- **Reranking** — Deferred to separate PRD for precision optimization

## Design Considerations

### Vector Index Structure

```
<project>/
├── .vectorindex/              # Gitignored
│   ├── codebase.lance/        # LanceDB table for code embeddings
│   ├── tests.lance/           # LanceDB table for test file embeddings
│   ├── database.lance/        # LanceDB table for schema/config embeddings
│   ├── relationships.lance/   # Call graph and dependency data
│   ├── test-mapping.lance/    # Test-to-code coverage mapping
│   ├── git-history.lance/     # Commit messages and blame data
│   ├── bm25/                  # BM25 index files
│   ├── metadata.json          # Index state, last refresh, chunk count
│   ├── architecture-summaries.json  # Module and project summaries
│   └── chunks/                # Cached contextual descriptions
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
      "include": ["src/**", "lib/**", "docs/**", "tests/**", "e2e/**"],
      "exclude": ["node_modules/**", "dist/**", ".next/**"],
      "chunkStrategy": "ast",
      "indexTests": true
    },
    
    "relationships": {
      "callGraph": true,
      "dependencies": true,
      "testMapping": true
    },
    
    "gitHistory": {
      "enabled": true,
      "depth": 500
    },
    
    "architectureSummary": {
      "enabled": true,
      "refreshInterval": "weekly"
    },
    
    "database": {
      "enabled": true,
      "connection": "env:DATABASE_URL",
      "type": "postgres",
      
      "schema": {
        "enabled": true,
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
    
    "refresh": {
      "onGitChange": true,
      "onSessionStart": true,
      "maxAge": "24h"
    }
  }
}
```

## Technical Considerations

### Dependencies

| Component | Library/Service | Purpose |
|-----------|-----------------|---------|
| AST Parsing | tree-sitter | Multi-language code parsing & call graph |
| Vector Storage | LanceDB | Local embedded vector DB |
| BM25 Index | tantivy or lunr | Keyword search index |
| Embeddings | Voyage/OpenAI/Ollama | Vector generation |
| Contextual | Claude Haiku | Context & summary generation |
| Git Analysis | simple-git | History and blame extraction |
| Coverage Parsing | lcov-parse, c8 | Test coverage report parsing |
| DB Connection | pg, mysql2, better-sqlite3 | Schema extraction |

### Performance Targets

| Metric | Target |
|--------|--------|
| Initial indexing | <5 min for 10k file codebase |
| Incremental update | <10 sec for single file change |
| Query latency | <200ms for top-20 results |
| Call graph query | <50ms |
| Index size | <150MB for typical project (with relationships) |
| Memory usage | <500MB during indexing |

### Cost Estimates (Contextual Retrieval + Architecture Summaries enabled)

| Codebase Size | Tokens | Contextual Cost | Summaries Cost | Embedding Cost | Total |
|---------------|--------|-----------------|----------------|----------------|-------|
| Small (1k files) | ~500k | ~$0.50 | ~$0.10 | ~$0.01 | ~$0.61 |
| Medium (10k files) | ~5M | ~$5.00 | ~$0.50 | ~$0.10 | ~$5.60 |
| Large (50k files) | ~25M | ~$25.00 | ~$2.00 | ~$0.50 | ~$27.50 |

*Costs are one-time for initial indexing; incremental updates are much cheaper.*

## Success Metrics

- Agents retrieve relevant code context 80%+ of the time (vs ~50% with grep alone)
- **Agents can answer "what calls X?" in <1 second**
- **Agents can identify relevant tests for a function in <1 second**
- **Agents understand code intent via git history 70%+ of the time**
- Initial index creation completes in <5 minutes for average project
- Query latency remains <200ms at p95
- Zero database credentials exposed in configuration or logs
- 90%+ of users can complete setup in <10 minutes following README

## Credential & Service Access Plan

| Service | Credential Type | Needed For | Request Timing | Fallback if Not Available |
|---------|-----------------|------------|----------------|---------------------------|
| Voyage AI | API key (VOYAGE_API_KEY) | US-003, US-018, US-019 embeddings | during-bootstrap or on-demand | Use OpenAI or local Ollama |
| OpenAI | API key (OPENAI_API_KEY) | US-003 embeddings (fallback) | during-bootstrap or on-demand | Use local Ollama |
| Anthropic | API key (ANTHROPIC_API_KEY) | US-004, US-012, US-018, US-019 contextual & summaries | during-bootstrap or on-demand | Disable contextual retrieval & summaries |
| Database | Connection URL (DATABASE_URL) | US-006, US-007 | after-initial-build | Skip database indexing |

## Open Questions

1. Should we support indexing multiple databases per project?
2. Should config table snapshots be versioned/historied?
3. How should we handle monorepos with multiple project.json files?
4. Should we add a "privacy mode" that never sends code to external APIs?
5. ~~Should semantic_search support filtering by git blame (recent changes only)?~~ → Resolved: Yes, via US-010
6. Should call graph support indirect calls (A calls B, B calls C → A indirectly calls C)?
7. How deep should test mapping go for integration/E2E tests?

## Implementation Order

Recommended story sequencing:

### Phase 1: Core Search (MVP)
1. **US-001** (schema) — Foundation for configuration
2. **US-002** (chunking) — Core parsing capability (includes tests)
3. **US-005** (storage) — Local vector DB
4. **US-003** (embeddings) — Vector generation
5. **US-008** (hybrid search) — Search capability
6. **US-014** (tool) — Agent integration
7. **US-015** (CLI) — Developer interface

### Phase 2: Relationships & Context (Key Enhancements)
8. **US-009** (call graph) — Dependency/caller indexing
9. **US-010** (git history) — Change context
10. **US-011** (test mapping) — Test coverage index
11. **US-012** (architecture summaries) — High-level understanding
12. **US-013** (git hooks) — Automatic refresh

### Phase 3: Deep Integration
13. **US-004** (contextual) — Accuracy improvement
14. **US-017** (agent prompts) — Full integration
15. **US-006** (schema extraction) — Database support
16. **US-007** (config tables) — Config table support

### Phase 4: Polish & Adoption
17. **US-018** (bootstrap integration) — New project setup
18. **US-019** (builder prompt) — Existing project adoption
19. **US-016** (README) — Documentation

---

*PRD Version: 2.0*
*Created: 2026-02-27*
*Updated: 2026-03-02*
*Status: Ready*

## Related PRDs

- [prd-vectorization-cloud-storage.md](../drafts/prd-vectorization-cloud-storage.md) — Cloud vector storage for teams/scale
- [prd-vectorization-reranking.md](../drafts/prd-vectorization-reranking.md) — Result reranking for improved precision
