/**
 * Contextual Retrieval preprocessing using Claude Haiku
 *
 * Implements Anthropic's Contextual Retrieval approach:
 * https://www.anthropic.com/news/contextual-retrieval
 *
 * Uses prompt caching to reduce costs when processing multiple chunks from the same file.
 */
import { Chunk } from './chunker.js';
export interface ContextualCostEstimate {
    totalChunks: number;
    totalFiles: number;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedCacheWriteTokens: number;
    estimatedCacheReadTokens: number;
    estimatedCostUSD: number;
    breakdown: {
        inputCost: number;
        outputCost: number;
        cacheWriteCost: number;
        cacheReadCost: number;
    };
}
export interface ContextualOptions {
    showProgress?: boolean;
    onProgress?: (processed: number, total: number) => void;
}
/**
 * Estimate the cost of contextual retrieval before running
 */
export declare function estimateContextualCost(chunks: Chunk[]): ContextualCostEstimate;
/**
 * Format cost estimate for display
 */
export declare function formatCostEstimate(estimate: ContextualCostEstimate): string;
/**
 * Add contextual descriptions to chunks using Claude Haiku
 * Uses prompt caching to reduce costs for multiple chunks from the same file
 */
export declare function addContextualDescriptions(chunks: Chunk[], apiKey: string, options?: ContextualOptions): Promise<Chunk[]>;
/**
 * Check if contextual retrieval should be enabled based on setting and codebase size
 */
export declare function shouldEnableContextual(setting: 'auto' | 'always' | 'never', totalTokens: number): boolean;
/**
 * Estimate total tokens in chunks
 */
export declare function estimateTotalTokens(chunks: Chunk[]): number;
//# sourceMappingURL=contextual.d.ts.map