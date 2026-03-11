/**
 * Hybrid search combining vector similarity and BM25 keyword search
 * 
 * Supports configurable weighting and rank fusion for merging results.
 */

import { VectorStore, StoredChunk } from './store.js';
import { searchBM25 } from './bm25.js';
import { generateQueryEmbeddingAuto, EmbeddingConfig } from './embeddings.js';

export interface SearchResult {
  id: string;
  content: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  language: string;
  type: string;
  context?: string;
  score: number;
  vectorScore?: number;
  bm25Score?: number;
}

export interface HybridSearchOptions {
  /** Number of results to return (default 20) */
  topK?: number;
  /** Weight for vector search (0-1), BM25 gets (1-weight). Default 0.7 */
  hybridWeight?: number;
  /** Content type filter */
  contentType?: 'code' | 'schema' | 'config' | 'docs';
  /** Language filter */
  language?: string;
  /** File pattern filters */
  filePatterns?: string[];
  /** Embedding configuration (auto-detected if not provided) */
  embedding?: EmbeddingConfig;
}

/**
 * Perform hybrid search combining vector similarity and BM25
 * 
 * The hybrid approach combines:
 * - Semantic search (vector similarity) for conceptual queries
 * - Keyword search (BM25) for exact term matches
 * 
 * Results are merged using weighted combination with configurable weights.
 */
export async function hybridSearch(
  indexDir: string,
  query: string,
  options: HybridSearchOptions = {}
): Promise<SearchResult[]> {
  const topK = options.topK || 20;
  const hybridWeight = options.hybridWeight ?? 0.7;
  
  // Fetch more candidates than needed for reranking
  const fetchK = Math.min(topK * 3, 100);
  
  // Generate query embedding using auto-detection
  const { embedding: queryVector } = await generateQueryEmbeddingAuto(
    query,
    options.embedding || {}
  );
  
  // Vector search
  const store = new VectorStore(indexDir);
  await store.initialize();
  
  const vectorResults = await store.search(queryVector, {
    topK: fetchK,
    table: options.contentType === 'schema' || options.contentType === 'config' ? 'database' : 
           options.contentType === 'code' ? 'codebase' : 'all',
    filters: {
      type: options.contentType,
      language: options.language,
      filePatterns: options.filePatterns,
    },
  });
  
  // BM25 search
  const bm25Results = await searchBM25(indexDir, query, fetchK);
  
  // Create lookup maps
  const vectorScores = new Map<string, { chunk: StoredChunk; score: number }>();
  for (let i = 0; i < vectorResults.length; i++) {
    const chunk = vectorResults[i];
    // Convert distance to similarity score (lower distance = higher similarity)
    // LanceDB returns L2 distance, so we use 1 / (1 + distance) for similarity
    const distance = (chunk as any)._distance || 0;
    const similarity = 1 / (1 + distance);
    vectorScores.set(chunk.id, { chunk, score: similarity });
  }
  
  const bm25Scores = new Map<string, number>();
  for (const result of bm25Results) {
    bm25Scores.set(result.chunkId, result.score);
  }
  
  // Normalize BM25 scores to 0-1 range
  const maxBm25 = Math.max(...bm25Results.map(r => r.score), 1);
  for (const [id, score] of bm25Scores) {
    bm25Scores.set(id, score / maxBm25);
  }
  
  // Combine results using weighted average
  const allIds = new Set([...vectorScores.keys(), ...bm25Scores.keys()]);
  const combinedResults: SearchResult[] = [];
  
  for (const id of allIds) {
    const vectorData = vectorScores.get(id);
    const vectorScore = vectorData?.score || 0;
    const bm25Score = bm25Scores.get(id) || 0;
    
    // Weighted combination
    const combinedScore = hybridWeight * vectorScore + (1 - hybridWeight) * bm25Score;
    
    // Get chunk data (prefer vector result as it has full data)
    const chunk: StoredChunk | undefined = vectorData?.chunk;
    
    if (chunk) {
      combinedResults.push({
        id: chunk.id,
        content: chunk.content,
        filePath: chunk.filePath,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        language: chunk.language,
        type: chunk.type,
        context: chunk.context,
        score: combinedScore,
        vectorScore,
        bm25Score,
      });
    }
  }
  
  // Sort by combined score and return top K
  return combinedResults
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Perform vector-only search (semantic search)
 * 
 * Best for conceptual queries like:
 * - "how does authentication work"
 * - "where is user data processed"
 */
export async function vectorSearch(
  indexDir: string,
  query: string,
  options: {
    topK?: number;
    table?: 'codebase' | 'database' | 'all';
    embedding?: EmbeddingConfig;
  } = {}
): Promise<SearchResult[]> {
  const topK = options.topK || 20;
  
  const { embedding: queryVector } = await generateQueryEmbeddingAuto(
    query,
    options.embedding || {}
  );
  
  const store = new VectorStore(indexDir);
  await store.initialize();
  
  const results = await store.search(queryVector, {
    topK,
    table: options.table,
  });
  
  return results.map(chunk => ({
    id: chunk.id,
    content: chunk.content,
    filePath: chunk.filePath,
    lineStart: chunk.lineStart,
    lineEnd: chunk.lineEnd,
    language: chunk.language,
    type: chunk.type,
    context: chunk.context,
    score: 1 / (1 + ((chunk as any)._distance || 0)),
  }));
}

/**
 * Perform BM25-only search (keyword search)
 * 
 * Best for exact term matches like:
 * - function names
 * - error codes
 * - specific identifiers
 */
export async function keywordSearch(
  indexDir: string,
  query: string,
  options: { topK?: number } = {}
): Promise<{ id: string; score: number }[]> {
  const topK = options.topK || 20;
  return searchBM25(indexDir, query, topK);
}

/**
 * Reciprocal Rank Fusion (RRF) for merging ranked lists
 * 
 * RRF is an alternative to weighted combination that works well
 * when scores from different sources are not comparable.
 * 
 * Formula: score = sum(1 / (k + rank)) for each list
 * where k is a constant (usually 60)
 */
export function reciprocalRankFusion(
  rankings: Map<string, number>[],
  k: number = 60
): Map<string, number> {
  const fusedScores = new Map<string, number>();
  
  for (const ranking of rankings) {
    // Sort by score descending to get ranks
    const sorted = [...ranking.entries()]
      .sort((a, b) => b[1] - a[1]);
    
    for (let rank = 0; rank < sorted.length; rank++) {
      const [id] = sorted[rank];
      const rrfScore = 1 / (k + rank + 1);
      fusedScores.set(id, (fusedScores.get(id) || 0) + rrfScore);
    }
  }
  
  return fusedScores;
}

/**
 * Perform hybrid search using Reciprocal Rank Fusion
 * 
 * RRF is useful when vector and BM25 scores are on different scales
 * and weighted combination doesn't work well.
 */
export async function hybridSearchRRF(
  indexDir: string,
  query: string,
  options: Omit<HybridSearchOptions, 'hybridWeight'> & { rrfK?: number } = {}
): Promise<SearchResult[]> {
  const topK = options.topK || 20;
  const rrfK = options.rrfK || 60;
  const fetchK = Math.min(topK * 3, 100);
  
  // Generate query embedding
  const { embedding: queryVector } = await generateQueryEmbeddingAuto(
    query,
    options.embedding || {}
  );
  
  // Vector search
  const store = new VectorStore(indexDir);
  await store.initialize();
  
  const vectorResults = await store.search(queryVector, {
    topK: fetchK,
    table: options.contentType === 'schema' || options.contentType === 'config' ? 'database' : 
           options.contentType === 'code' ? 'codebase' : 'all',
    filters: {
      type: options.contentType,
      language: options.language,
      filePatterns: options.filePatterns,
    },
  });
  
  // BM25 search
  const bm25Results = await searchBM25(indexDir, query, fetchK);
  
  // Create score maps for RRF
  const vectorScoreMap = new Map<string, number>();
  const vectorChunkMap = new Map<string, StoredChunk>();
  for (const chunk of vectorResults) {
    const distance = (chunk as any)._distance || 0;
    vectorScoreMap.set(chunk.id, 1 / (1 + distance));
    vectorChunkMap.set(chunk.id, chunk);
  }
  
  const bm25ScoreMap = new Map<string, number>();
  for (const result of bm25Results) {
    bm25ScoreMap.set(result.chunkId, result.score);
  }
  
  // Apply RRF
  const fusedScores = reciprocalRankFusion([vectorScoreMap, bm25ScoreMap], rrfK);
  
  // Build results
  const results: SearchResult[] = [];
  for (const [id, score] of fusedScores) {
    const chunk = vectorChunkMap.get(id);
    if (chunk) {
      results.push({
        id: chunk.id,
        content: chunk.content,
        filePath: chunk.filePath,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        language: chunk.language,
        type: chunk.type,
        context: chunk.context,
        score,
        vectorScore: vectorScoreMap.get(id),
        bm25Score: bm25ScoreMap.get(id),
      });
    }
  }
  
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
