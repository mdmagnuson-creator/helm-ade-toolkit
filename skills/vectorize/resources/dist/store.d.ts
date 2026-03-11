/**
 * Vector storage using LanceDB
 */
import { Chunk } from './chunker.js';
import { EmbeddingResult } from './embeddings.js';
export interface StoredChunk {
    id: string;
    content: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    language: string;
    type: string;
    context?: string;
    vector: number[];
}
export interface RelationshipRecord {
    id: string;
    sourceFile: string;
    sourceName: string;
    sourceLineStart: number;
    sourceLineEnd: number;
    targetFile: string;
    targetName: string;
    relationshipType: 'calls' | 'imports' | 'extends' | 'implements';
}
export interface GitHistoryRecord {
    id: string;
    commitHash: string;
    author: string;
    date: string;
    message: string;
    filesChanged: string[];
    vector: number[];
}
export interface TestMappingRecord {
    id: string;
    testFile: string;
    testName: string;
    testLineStart: number;
    testLineEnd: number;
    sourceFile: string;
    sourceName?: string;
    mappingType: 'static' | 'coverage';
}
export interface IndexMetadata {
    version: number;
    createdAt: string;
    lastRefreshedAt: string;
    chunkCount: number;
    embeddingModel: string;
    embeddingDimension: number;
    projectName?: string;
}
export declare const TABLE_NAMES: {
    readonly CODEBASE: "codebase";
    readonly TESTS: "tests";
    readonly DATABASE: "database";
    readonly RELATIONSHIPS: "relationships";
    readonly GIT_HISTORY: "git-history";
    readonly TEST_MAPPING: "test-mapping";
};
export declare class VectorStore {
    private db;
    private indexDir;
    constructor(indexDir: string);
    /**
     * Get the index directory path
     */
    getIndexDir(): string;
    /**
     * Initialize the vector store
     */
    initialize(): Promise<void>;
    /**
     * Check if store is initialized
     */
    isInitialized(): boolean;
    /**
     * Get index metadata
     */
    getMetadata(): IndexMetadata | null;
    /**
     * Update index metadata
     */
    updateMetadata(updates: Partial<IndexMetadata>): void;
    /**
     * Add codebase embeddings to the store
     */
    addCodebaseEmbeddings(chunks: Chunk[], embeddings: EmbeddingResult[]): Promise<void>;
    /**
     * Add test file embeddings to the store (separate from codebase)
     */
    addTestEmbeddings(chunks: Chunk[], embeddings: EmbeddingResult[]): Promise<void>;
    /**
     * Add database embeddings to the store
     */
    addDatabaseEmbeddings(chunks: Chunk[], embeddings: EmbeddingResult[]): Promise<void>;
    /**
     * Add relationship records (call graph, dependencies)
     */
    addRelationships(records: RelationshipRecord[]): Promise<void>;
    /**
     * Add git history records
     */
    addGitHistory(records: GitHistoryRecord[]): Promise<void>;
    /**
     * Add test mapping records
     */
    addTestMappings(records: TestMappingRecord[]): Promise<void>;
    /**
     * Query relationships (callers/callees)
     */
    queryRelationships(options: {
        sourceFile?: string;
        sourceName?: string;
        targetFile?: string;
        targetName?: string;
        relationshipType?: RelationshipRecord['relationshipType'];
    }): Promise<RelationshipRecord[]>;
    /**
     * Query test mappings
     */
    queryTestMappings(options: {
        sourceFile?: string;
        sourceName?: string;
        testFile?: string;
    }): Promise<TestMappingRecord[]>;
    /**
     * Search for similar vectors
     */
    search(queryVector: number[], options?: {
        topK?: number;
        table?: 'codebase' | 'tests' | 'database' | 'git-history' | 'all';
        filters?: {
            type?: string;
            language?: string;
            filePatterns?: string[];
        };
    }): Promise<StoredChunk[]>;
    /**
     * Remove chunks by file paths
     */
    removeByFiles(filePaths: string[]): Promise<void>;
    /**
     * Clear all data
     */
    clear(): Promise<void>;
    /**
     * Get all chunks (for BM25 rebuild)
     */
    getAllChunks(): Promise<Chunk[]>;
    /**
     * Get index statistics
     */
    getStats(): Promise<{
        codebaseChunks: number;
        testChunks: number;
        databaseChunks: number;
        relationships: number;
        gitHistoryRecords: number;
        testMappings: number;
        indexSizeBytes: number;
    }>;
    /**
     * Get directory size in bytes
     */
    private getDirectorySize;
}
//# sourceMappingURL=store.d.ts.map