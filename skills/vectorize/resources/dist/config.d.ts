/**
 * Configuration loading and saving for vectorization
 */
export interface VectorizationConfig {
    enabled?: boolean;
    storage?: 'local' | 'cloud';
    embeddingModel?: 'auto' | 'openai' | 'voyage' | 'ollama';
    contextualRetrieval?: 'auto' | 'always' | 'never';
    codebase?: {
        include?: string[];
        exclude?: string[];
        chunkStrategy?: 'ast' | 'sliding-window';
        indexTests?: boolean;
    };
    relationships?: {
        callGraph?: boolean;
        dependencies?: boolean;
        testMapping?: boolean;
    };
    gitHistory?: {
        enabled?: boolean;
        depth?: number;
    };
    architectureSummary?: {
        enabled?: boolean;
        refreshInterval?: 'daily' | 'weekly' | 'monthly' | 'manual';
    };
    database?: {
        enabled?: boolean;
        connection?: string;
        type?: 'postgres' | 'mysql' | 'sqlite';
        schema?: {
            enabled?: boolean;
            include?: string[];
            exclude?: string[];
        };
        configTables?: Array<{
            table: string;
            description?: string;
            sampleRows?: number | 'all';
        }>;
    };
    search?: {
        hybridWeight?: number;
        topK?: number;
        reranking?: {
            enabled?: boolean;
            model?: 'cohere' | 'cross-encoder';
        };
    };
    refresh?: {
        onGitChange?: boolean;
        onSessionStart?: boolean;
        maxAge?: string;
    };
    cloud?: {
        provider?: 'pinecone' | 'weaviate';
        credentials?: string;
        namespace?: string;
    };
    credentials?: {
        openai?: string;
        anthropic?: string;
        voyage?: string;
        cohere?: string;
    };
}
export interface ProjectConfig {
    name?: string;
    vectorization?: VectorizationConfig;
    [key: string]: unknown;
}
/**
 * Load project configuration from docs/project.json
 */
export declare function loadProjectConfig(projectRoot: string): Promise<ProjectConfig>;
/**
 * Save project configuration to docs/project.json
 */
export declare function saveProjectConfig(projectRoot: string, config: ProjectConfig): Promise<void>;
/**
 * Get credential value from config (resolves env: references)
 */
export declare function resolveCredential(value: string | undefined): string | undefined;
//# sourceMappingURL=config.d.ts.map