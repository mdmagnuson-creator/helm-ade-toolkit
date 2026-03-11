/**
 * Vectorize - Core module for codebase and database vectorization
 */
import { VectorizationConfig } from './config.js';
import { SearchResult } from './search.js';
export interface InitOptions {
    dryRun?: boolean;
    skipDatabase?: boolean;
    contextualRetrieval?: boolean;
    skipRelationships?: boolean;
    skipGitHistory?: boolean;
    skipTestMapping?: boolean;
    skipSummaries?: boolean;
}
export interface InitResult {
    summary: string;
    cost?: number;
    chunks: number;
    files: number;
    relationships?: number;
    commits?: number;
    testMappings?: number;
    modules?: number;
}
export interface RefreshOptions {
    full?: boolean;
    changedFiles?: string[];
}
export interface RefreshResult {
    chunksUpdated: number;
    timeMs: number;
}
export interface SearchOptions {
    topK?: number;
    contentType?: 'code' | 'schema' | 'config' | 'docs';
    language?: string;
    filePatterns?: string[];
}
export interface IndexStatus {
    lastUpdated: string;
    isStale: boolean;
    codebase: {
        files: number;
        chunks: number;
        languages: string[];
    };
    database?: {
        tables: number;
        columns: number;
        configTables: string[];
    };
    storage: {
        vectorSize: string;
        bm25Size: string;
        totalSize: string;
    };
    config: {
        embeddingModel: string;
        contextualRetrieval: string;
        hybridWeight: number;
        topK: number;
    };
}
/**
 * Initialize vectorization for a project
 */
export declare function initializeVectorization(projectRoot: string, options?: InitOptions): Promise<InitResult>;
/**
 * Refresh the vector index
 */
export declare function refreshIndex(projectRoot: string, options?: RefreshOptions): Promise<RefreshResult>;
/**
 * Search the vector index
 */
export declare function searchIndex(projectRoot: string, query: string, options?: SearchOptions): Promise<SearchResult[]>;
/**
 * Get index status
 */
export declare function getStatus(projectRoot: string): Promise<IndexStatus>;
/**
 * Show current configuration
 */
export declare function showConfig(projectRoot: string): Promise<VectorizationConfig>;
//# sourceMappingURL=index.d.ts.map