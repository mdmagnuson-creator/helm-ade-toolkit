/**
 * semantic_search - MCP tool for AI agents
 *
 * This module exports the semantic_search tool definition and handler
 * that can be registered with an MCP server.
 */
export interface SemanticSearchInput {
    query: string;
    filters?: {
        filePatterns?: string[];
        languages?: string[];
        contentType?: 'code' | 'schema' | 'config' | 'docs';
    };
    topK?: number;
    projectPath?: string;
}
export interface SemanticSearchResult {
    results: Array<{
        content: string;
        filePath: string;
        lineRange: [number, number];
        language: string;
        score: number;
        type: string;
        context?: string;
    }>;
    indexAge: string;
    queryTime: number;
    indexStatus: 'fresh' | 'stale' | 'missing';
}
/**
 * Tool definition for MCP registration
 */
export declare const semanticSearchToolDefinition: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            query: {
                type: string;
                description: string;
            };
            filters: {
                type: string;
                properties: {
                    filePatterns: {
                        type: string;
                        items: {
                            type: string;
                        };
                        description: string;
                    };
                    languages: {
                        type: string;
                        items: {
                            type: string;
                        };
                        description: string;
                    };
                    contentType: {
                        type: string;
                        enum: string[];
                        description: string;
                    };
                };
            };
            topK: {
                type: string;
                description: string;
            };
            projectPath: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
};
/**
 * Handle semantic_search tool invocation
 */
export declare function handleSemanticSearch(input: SemanticSearchInput): Promise<SemanticSearchResult>;
/**
 * Format search results for display in agent context
 */
export declare function formatSearchResults(result: SemanticSearchResult): string;
/**
 * Check if semantic search is available for a project
 */
export declare function isSemanticSearchAvailable(projectPath: string): boolean;
/**
 * Get semantic search status for a project
 */
export declare function getSemanticSearchStatus(projectPath: string): Promise<{
    available: boolean;
    enabled: boolean;
    indexExists: boolean;
    isStale: boolean;
    lastUpdated?: string;
    chunkCount?: number;
}>;
//# sourceMappingURL=tool.d.ts.map