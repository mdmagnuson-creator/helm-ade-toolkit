/**
 * Hybrid search combining vector similarity and BM25 keyword search
 *
 * Supports configurable weighting and rank fusion for merging results.
 */
import { EmbeddingConfig } from './embeddings.js';
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
export declare function hybridSearch(indexDir: string, query: string, options?: HybridSearchOptions): Promise<SearchResult[]>;
/**
 * Perform vector-only search (semantic search)
 *
 * Best for conceptual queries like:
 * - "how does authentication work"
 * - "where is user data processed"
 */
export declare function vectorSearch(indexDir: string, query: string, options?: {
    topK?: number;
    table?: 'codebase' | 'database' | 'all';
    embedding?: EmbeddingConfig;
}): Promise<SearchResult[]>;
/**
 * Perform BM25-only search (keyword search)
 *
 * Best for exact term matches like:
 * - function names
 * - error codes
 * - specific identifiers
 */
export declare function keywordSearch(indexDir: string, query: string, options?: {
    topK?: number;
}): Promise<{
    id: string;
    score: number;
}[]>;
/**
 * Reciprocal Rank Fusion (RRF) for merging ranked lists
 *
 * RRF is an alternative to weighted combination that works well
 * when scores from different sources are not comparable.
 *
 * Formula: score = sum(1 / (k + rank)) for each list
 * where k is a constant (usually 60)
 */
export declare function reciprocalRankFusion(rankings: Map<string, number>[], k?: number): Map<string, number>;
/**
 * Perform hybrid search using Reciprocal Rank Fusion
 *
 * RRF is useful when vector and BM25 scores are on different scales
 * and weighted combination doesn't work well.
 */
export declare function hybridSearchRRF(indexDir: string, query: string, options?: Omit<HybridSearchOptions, 'hybridWeight'> & {
    rrfK?: number;
}): Promise<SearchResult[]>;
//# sourceMappingURL=search.d.ts.map