/**
 * BM25 keyword index for hybrid search
 * Uses a simple inverted index stored as JSON
 */
import { Chunk } from './chunker.js';
interface BM25Result {
    chunkId: string;
    score: number;
}
/**
 * Build BM25 index from chunks
 */
export declare function buildBM25Index(indexDir: string, chunks: Chunk[]): Promise<void>;
/**
 * Search BM25 index
 */
export declare function searchBM25(indexDir: string, query: string, topK?: number): Promise<BM25Result[]>;
/**
 * Get BM25 index stats
 */
export declare function getBM25Stats(indexDir: string): {
    terms: number;
    docs: number;
} | null;
export {};
//# sourceMappingURL=bm25.d.ts.map