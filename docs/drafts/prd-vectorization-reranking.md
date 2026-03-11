# PRD: Vectorization Reranking

> **Status:** Draft (Skeleton)
> **Depends on:** prd-vectorization.md (core vectorization with hybrid search must be implemented first)
> **Priority:** Low — Consider when search precision needs improvement

## Introduction

Add result reranking to the vectorization system for improved search precision. After initial retrieval (semantic + BM25), a reranking model re-scores results to surface the most relevant chunks.

## When to Implement

Consider this PRD when:
- Search results are "close but not quite right"
- You have very large codebases where precision matters more
- You're doing RAG and need the absolute best context
- Initial hybrid search isn't surfacing the right results consistently

## Goals

- Improve search precision by 10-20% over hybrid search alone
- Support cloud rerankers (Cohere) for best quality
- Support local cross-encoder rerankers for offline use
- Keep additional latency under 500ms
- Make reranking optional and configurable

## User Stories (Skeleton)

### US-001: Cohere Reranker Integration

**Description:** As a developer wanting best search quality, I want to use Cohere's reranker so that the most relevant results are surfaced.

**Acceptance Criteria (Draft):**

- [ ] Configuration via `reranking.enabled: true` and `reranking.provider: "cohere"`
- [ ] Cohere API key via environment variable (COHERE_API_KEY)
- [ ] Initial retrieval returns top 150 candidates
- [ ] Cohere reranks and returns top 20
- [ ] Latency impact <300ms
- [ ] Cost estimates documented
- [ ] Graceful fallback if Cohere unavailable

---

### US-002: Local Cross-Encoder Reranker

**Description:** As a developer working offline, I want a local reranker so that I get improved precision without cloud dependencies.

**Acceptance Criteria (Draft):**

- [ ] Support `reranking.provider: "local"`
- [ ] Use cross-encoder model (e.g., ms-marco-MiniLM)
- [ ] Model downloaded on first use (~100MB)
- [ ] Latency impact <500ms
- [ ] Quality slightly lower than Cohere but better than no reranking

---

### US-003: Reranking Configuration

**Description:** As a developer, I want to configure when reranking is used so that I can balance quality vs latency.

**Acceptance Criteria (Draft):**

- [ ] `reranking.mode`: "always" | "large-results" | "never"
- [ ] `reranking.threshold`: Only rerank if initial results > N
- [ ] `reranking.topK`: How many results to return after reranking
- [ ] Per-query override in semantic_search tool

---

## Technical Considerations (Draft)

| Aspect | Cohere | Local Cross-Encoder |
|--------|--------|---------------------|
| Quality | Best | Good |
| Latency | ~200ms | ~400ms |
| Cost | ~$0.001/query | Free |
| Offline | No | Yes |
| Setup | API key | Model download |

## How Reranking Works

```
Query: "How does authentication work?"
    │
    ▼
┌─────────────────────────┐
│ Hybrid Search (BM25 +   │
│ Semantic)               │
│ Returns: Top 150        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Reranker Model          │
│ Scores each result      │
│ against original query  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Return Top 20           │
│ (reordered by reranker) │
└─────────────────────────┘
```

## Open Questions

1. Is the quality improvement worth the latency/cost?
2. Should we cache reranking results?
3. Should reranking be applied to relationship queries (callers/callees)?
4. What's the break-even point where reranking helps vs hurts?

## Cost Estimates

| Usage | Cohere Cost |
|-------|-------------|
| 100 queries/day | ~$3/month |
| 1000 queries/day | ~$30/month |
| 10000 queries/day | ~$300/month |

---

*PRD Version: 0.1 (Skeleton)*
*Created: 2026-03-02*
*Status: Draft — For future consideration*
