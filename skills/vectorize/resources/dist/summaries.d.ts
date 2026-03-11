/**
 * Architecture summaries generation
 *
 * Uses Claude to generate high-level summaries of major modules
 * and project architecture for new agent orientation.
 */
import { FileInfo } from './chunker.js';
export interface ModuleInfo {
    name: string;
    path: string;
    files: string[];
    entryPoint?: string;
    exports: string[];
    imports: string[];
    description?: string;
}
export interface ArchitectureSummary {
    version: number;
    generatedAt: string;
    projectSummary: string;
    modules: ModuleSummary[];
    keyPatterns: string[];
    dataFlow: string;
}
export interface ModuleSummary {
    name: string;
    path: string;
    summary: string;
    purpose: string;
    keyExports: string[];
    dependencies: string[];
    patterns: string[];
}
export interface SummaryGeneratorOptions {
    maxModules: number;
    maxFilesPerModule: number;
    maxTokensPerSummary: number;
    anthropicApiKey?: string;
}
/**
 * Detect major modules in the codebase
 */
export declare function detectModules(projectRoot: string, files: FileInfo[]): ModuleInfo[];
/**
 * Estimate cost for generating summaries
 */
export declare function estimateSummaryCost(modules: ModuleInfo[]): {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
};
/**
 * Generate a prompt for module summary
 */
export declare function buildModuleSummaryPrompt(module: ModuleInfo, files: FileInfo[]): string;
/**
 * Generate a prompt for project-level summary
 */
export declare function buildProjectSummaryPrompt(modules: ModuleInfo[], projectRoot: string): string;
/**
 * Generate summaries using Claude API
 */
export declare function generateSummaries(projectRoot: string, modules: ModuleInfo[], files: FileInfo[], options?: Partial<SummaryGeneratorOptions>): Promise<ArchitectureSummary>;
/**
 * Load existing summaries
 */
export declare function loadSummaries(indexDir: string): ArchitectureSummary | null;
/**
 * Save summaries to disk
 */
export declare function saveSummaries(indexDir: string, summaries: ArchitectureSummary): void;
/**
 * Check if summaries need refresh
 */
export declare function needsSummaryRefresh(indexDir: string, modules: ModuleInfo[], forceRefresh?: boolean): boolean;
/**
 * Search summaries for a query
 */
export declare function searchSummaries(summaries: ArchitectureSummary, query: string): {
    type: 'project' | 'module';
    content: string;
    module?: ModuleSummary;
}[];
//# sourceMappingURL=summaries.d.ts.map