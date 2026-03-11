/**
 * Codebase chunking with AST parsing
 */
export interface FileInfo {
    path: string;
    absolutePath: string;
    content: string;
    language: string;
}
export interface Chunk {
    id: string;
    content: string;
    filePath: string;
    lineRange: [number, number];
    language: string;
    type: 'code' | 'schema' | 'config' | 'docs';
    context?: string;
}
interface CodebaseConfig {
    include?: string[];
    exclude?: string[];
    chunkStrategy?: 'ast' | 'sliding-window';
}
/**
 * Scan codebase for files matching include/exclude patterns
 */
export declare function scanCodebase(projectRoot: string, config: CodebaseConfig, filterFiles?: string[]): Promise<FileInfo[]>;
/**
 * Chunk files using the specified strategy
 */
export declare function chunkFiles(files: FileInfo[], strategy: 'ast' | 'sliding-window'): Promise<Chunk[]>;
export {};
//# sourceMappingURL=chunker.d.ts.map