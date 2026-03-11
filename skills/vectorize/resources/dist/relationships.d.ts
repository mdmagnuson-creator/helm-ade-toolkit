/**
 * Call graph and dependency extraction using AST analysis
 *
 * Extracts function calls, imports, and class relationships
 * to enable "what calls X?" and "what does X depend on?" queries.
 */
import { FileInfo } from './chunker.js';
import { RelationshipRecord } from './store.js';
export interface FunctionInfo {
    name: string;
    file: string;
    lineStart: number;
    lineEnd: number;
    calls: string[];
    imports: string[];
}
export interface ImportInfo {
    source: string;
    specifiers: string[];
    file: string;
    lineStart: number;
}
/**
 * Extract all relationships from a set of files
 */
export declare function extractRelationships(files: FileInfo[]): Promise<RelationshipRecord[]>;
/**
 * Query callers of a function
 */
export declare function findCallers(relationships: RelationshipRecord[], functionName: string, file?: string): RelationshipRecord[];
/**
 * Query callees of a function
 */
export declare function findCallees(relationships: RelationshipRecord[], functionName: string, file?: string): RelationshipRecord[];
/**
 * Query files that import a module
 */
export declare function findImporters(relationships: RelationshipRecord[], modulePath: string): RelationshipRecord[];
//# sourceMappingURL=relationships.d.ts.map