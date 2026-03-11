/**
 * Database schema extraction for vectorization
 * Supports PostgreSQL, MySQL, SQLite, and Supabase (PostgreSQL with RLS)
 */
import { Chunk } from './chunker.js';
import { VectorizationConfig } from './config.js';
/** RLS policy information for Supabase-aware extraction */
export interface RlsPolicy {
    tableName: string;
    policyName: string;
    command: string;
    using: string | null;
    withCheck: string | null;
}
/**
 * Detect database type from connection URL
 */
export declare function detectDatabaseType(url: string): 'postgres' | 'mysql' | 'sqlite';
/**
 * Check if a column type is binary/blob (should be skipped)
 */
export declare function isBinaryType(dataType: string): boolean;
/**
 * Match a table name against include/exclude glob patterns
 */
export declare function matchesPattern(tableKey: string, include: string[], exclude: string[]): boolean;
/**
 * Simple glob matching for schema.table patterns
 */
export declare function matchGlob(str: string, pattern: string): boolean;
/**
 * Group rows by table key
 */
export declare function groupByTable(rows: any[], tableKey?: string, schemaKey?: string): Record<string, any[]>;
/**
 * Group foreign key rows by table
 */
export declare function groupForeignKeys(rows: any[]): Record<string, any[]>;
/**
 * Format table schema as DDL-like representation
 */
export declare function formatTableDDL(tableName: string, columns: any[], foreignKeys: any[], indexes: any[], rlsPolicies?: RlsPolicy[]): string;
/**
 * Format config table rows as SQL INSERT statements (for embedding)
 */
export declare function formatConfigRows(tableName: string, rows: any[], skipBinaryColumns?: boolean): string;
/**
 * Create schema chunks from extracted table data
 */
export declare function createSchemaChunks(tables: Record<string, any[]>, foreignKeys: Record<string, any[]>, indexes: Record<string, any[]>, config: VectorizationConfig['database'], rlsPolicies?: Record<string, RlsPolicy[]>): Chunk[];
/**
 * Extract database schema as chunks for embedding
 */
export declare function extractDatabaseSchema(connectionUrl: string, config: VectorizationConfig['database']): Promise<Chunk[]>;
/**
 * Extract config table rows as chunks
 */
export declare function extractConfigTableRows(connectionUrl: string, config: VectorizationConfig['database']): Promise<Chunk[]>;
//# sourceMappingURL=database.d.ts.map