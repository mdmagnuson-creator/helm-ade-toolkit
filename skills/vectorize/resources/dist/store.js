/**
 * Vector storage using LanceDB
 */
import * as lancedb from '@lancedb/lancedb';
import path from 'path';
import fs from 'fs';
// Table names for the vector index
export const TABLE_NAMES = {
    CODEBASE: 'codebase',
    TESTS: 'tests',
    DATABASE: 'database',
    RELATIONSHIPS: 'relationships',
    GIT_HISTORY: 'git-history',
    TEST_MAPPING: 'test-mapping',
};
export class VectorStore {
    db = null;
    indexDir;
    constructor(indexDir) {
        this.indexDir = indexDir;
    }
    /**
     * Get the index directory path
     */
    getIndexDir() {
        return this.indexDir;
    }
    /**
     * Initialize the vector store
     */
    async initialize() {
        // Ensure directory exists
        if (!fs.existsSync(this.indexDir)) {
            fs.mkdirSync(this.indexDir, { recursive: true });
        }
        this.db = await lancedb.connect(this.indexDir);
        // Initialize metadata if not exists
        const metadataPath = path.join(this.indexDir, 'metadata.json');
        if (!fs.existsSync(metadataPath)) {
            const metadata = {
                version: 1,
                createdAt: new Date().toISOString(),
                lastRefreshedAt: new Date().toISOString(),
                chunkCount: 0,
                embeddingModel: 'unknown',
                embeddingDimension: 0,
            };
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        }
    }
    /**
     * Check if store is initialized
     */
    isInitialized() {
        return this.db !== null;
    }
    /**
     * Get index metadata
     */
    getMetadata() {
        const metadataPath = path.join(this.indexDir, 'metadata.json');
        if (!fs.existsSync(metadataPath))
            return null;
        return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    }
    /**
     * Update index metadata
     */
    updateMetadata(updates) {
        const metadataPath = path.join(this.indexDir, 'metadata.json');
        const current = this.getMetadata() || {
            version: 1,
            createdAt: new Date().toISOString(),
            lastRefreshedAt: new Date().toISOString(),
            chunkCount: 0,
            embeddingModel: 'unknown',
            embeddingDimension: 0,
        };
        const updated = { ...current, ...updates };
        fs.writeFileSync(metadataPath, JSON.stringify(updated, null, 2));
    }
    /**
     * Add codebase embeddings to the store
     */
    async addCodebaseEmbeddings(chunks, embeddings) {
        if (!this.db)
            throw new Error('Store not initialized');
        // Create embedding lookup
        const embeddingMap = new Map();
        for (const e of embeddings) {
            embeddingMap.set(e.chunkId, e.embedding);
        }
        // Prepare data - ensure context is always a string (LanceDB requires typed columns)
        const data = chunks
            .filter(chunk => embeddingMap.has(chunk.id))
            .map(chunk => ({
            id: chunk.id,
            content: chunk.content,
            filePath: chunk.filePath,
            lineStart: chunk.lineRange[0],
            lineEnd: chunk.lineRange[1],
            language: chunk.language,
            type: chunk.type,
            context: chunk.context || '', // Always provide a string
            vector: embeddingMap.get(chunk.id),
        }));
        if (data.length === 0)
            return;
        // Create or overwrite table
        try {
            await this.db.dropTable(TABLE_NAMES.CODEBASE);
        }
        catch {
            // Table doesn't exist, that's fine
        }
        await this.db.createTable(TABLE_NAMES.CODEBASE, data);
        // Update metadata
        this.updateMetadata({
            lastRefreshedAt: new Date().toISOString(),
            chunkCount: data.length,
            embeddingDimension: data[0]?.vector.length || 0,
        });
    }
    /**
     * Add test file embeddings to the store (separate from codebase)
     */
    async addTestEmbeddings(chunks, embeddings) {
        if (!this.db)
            throw new Error('Store not initialized');
        const embeddingMap = new Map();
        for (const e of embeddings) {
            embeddingMap.set(e.chunkId, e.embedding);
        }
        const data = chunks
            .filter(chunk => embeddingMap.has(chunk.id))
            .map(chunk => ({
            id: chunk.id,
            content: chunk.content,
            filePath: chunk.filePath,
            lineStart: chunk.lineRange[0],
            lineEnd: chunk.lineRange[1],
            language: chunk.language,
            type: 'tests',
            context: chunk.context || '', // Always provide a string (LanceDB requires typed columns)
            vector: embeddingMap.get(chunk.id),
        }));
        if (data.length === 0)
            return;
        try {
            await this.db.dropTable(TABLE_NAMES.TESTS);
        }
        catch {
            // Table doesn't exist
        }
        await this.db.createTable(TABLE_NAMES.TESTS, data);
    }
    /**
     * Add database embeddings to the store
     */
    async addDatabaseEmbeddings(chunks, embeddings) {
        if (!this.db)
            throw new Error('Store not initialized');
        const embeddingMap = new Map();
        for (const e of embeddings) {
            embeddingMap.set(e.chunkId, e.embedding);
        }
        const data = chunks
            .filter(chunk => embeddingMap.has(chunk.id))
            .map(chunk => ({
            id: chunk.id,
            content: chunk.content,
            filePath: chunk.filePath,
            lineStart: chunk.lineRange[0],
            lineEnd: chunk.lineRange[1],
            language: chunk.language,
            type: chunk.type,
            context: chunk.context || '', // Always provide a string (LanceDB requires typed columns)
            vector: embeddingMap.get(chunk.id),
        }));
        if (data.length === 0)
            return;
        try {
            await this.db.dropTable(TABLE_NAMES.DATABASE);
        }
        catch {
            // Table doesn't exist
        }
        await this.db.createTable(TABLE_NAMES.DATABASE, data);
    }
    /**
     * Add relationship records (call graph, dependencies)
     */
    async addRelationships(records) {
        if (!this.db)
            throw new Error('Store not initialized');
        if (records.length === 0)
            return;
        try {
            await this.db.dropTable(TABLE_NAMES.RELATIONSHIPS);
        }
        catch {
            // Table doesn't exist
        }
        await this.db.createTable(TABLE_NAMES.RELATIONSHIPS, records);
    }
    /**
     * Add git history records
     */
    async addGitHistory(records) {
        if (!this.db)
            throw new Error('Store not initialized');
        if (records.length === 0)
            return;
        try {
            await this.db.dropTable(TABLE_NAMES.GIT_HISTORY);
        }
        catch {
            // Table doesn't exist
        }
        await this.db.createTable(TABLE_NAMES.GIT_HISTORY, records);
    }
    /**
     * Add test mapping records
     */
    async addTestMappings(records) {
        if (!this.db)
            throw new Error('Store not initialized');
        if (records.length === 0)
            return;
        try {
            await this.db.dropTable(TABLE_NAMES.TEST_MAPPING);
        }
        catch {
            // Table doesn't exist
        }
        await this.db.createTable(TABLE_NAMES.TEST_MAPPING, records);
    }
    /**
     * Query relationships (callers/callees)
     */
    async queryRelationships(options) {
        if (!this.db)
            throw new Error('Store not initialized');
        try {
            const table = await this.db.openTable(TABLE_NAMES.RELATIONSHIPS);
            let query = table.query();
            // Use backticks for camelCase field names in LanceDB
            if (options.sourceFile) {
                query = query.where(`\`sourceFile\` = '${options.sourceFile.replace(/'/g, "''")}'`);
            }
            if (options.sourceName) {
                query = query.where(`\`sourceName\` = '${options.sourceName.replace(/'/g, "''")}'`);
            }
            if (options.targetFile) {
                query = query.where(`\`targetFile\` = '${options.targetFile.replace(/'/g, "''")}'`);
            }
            if (options.targetName) {
                query = query.where(`\`targetName\` = '${options.targetName.replace(/'/g, "''")}'`);
            }
            if (options.relationshipType) {
                query = query.where(`\`relationshipType\` = '${options.relationshipType}'`);
            }
            const results = await query.toArray();
            return results;
        }
        catch {
            return [];
        }
    }
    /**
     * Query test mappings
     */
    async queryTestMappings(options) {
        if (!this.db)
            throw new Error('Store not initialized');
        try {
            const table = await this.db.openTable(TABLE_NAMES.TEST_MAPPING);
            let query = table.query();
            // Use backticks for camelCase field names in LanceDB
            if (options.sourceFile) {
                query = query.where(`\`sourceFile\` = '${options.sourceFile.replace(/'/g, "''")}'`);
            }
            if (options.sourceName) {
                query = query.where(`\`sourceName\` = '${options.sourceName.replace(/'/g, "''")}'`);
            }
            if (options.testFile) {
                query = query.where(`\`testFile\` = '${options.testFile.replace(/'/g, "''")}'`);
            }
            const results = await query.toArray();
            return results;
        }
        catch {
            return [];
        }
    }
    /**
     * Search for similar vectors
     */
    async search(queryVector, options = {}) {
        if (!this.db)
            throw new Error('Store not initialized');
        const topK = options.topK || 20;
        const tables = options.table === 'all'
            ? [TABLE_NAMES.CODEBASE, TABLE_NAMES.TESTS, TABLE_NAMES.DATABASE]
            : [options.table || TABLE_NAMES.CODEBASE];
        const results = [];
        for (const tableName of tables) {
            try {
                const table = await this.db.openTable(tableName);
                // Use vectorSearch for nearest neighbor search (LanceDB 0.4+ API)
                let query = table.vectorSearch(queryVector).limit(topK);
                // Apply filters (use backticks for camelCase field names in LanceDB)
                if (options.filters?.type) {
                    query = query.where(`\`type\` = '${options.filters.type}'`);
                }
                if (options.filters?.language) {
                    query = query.where(`\`language\` = '${options.filters.language}'`);
                }
                const tableResults = await query.toArray();
                results.push(...tableResults.map(r => ({
                    id: r.id,
                    content: r.content,
                    filePath: r.filePath,
                    lineStart: r.lineStart,
                    lineEnd: r.lineEnd,
                    language: r.language,
                    type: r.type,
                    context: r.context,
                    vector: r.vector,
                    _distance: r._distance, // LanceDB adds this
                })));
            }
            catch {
                // Table doesn't exist, skip
            }
        }
        // Sort by distance and return top K
        return results
            .sort((a, b) => a._distance - b._distance)
            .slice(0, topK);
    }
    /**
     * Remove chunks by file paths
     */
    async removeByFiles(filePaths) {
        if (!this.db)
            throw new Error('Store not initialized');
        const tables = [TABLE_NAMES.CODEBASE, TABLE_NAMES.TESTS];
        for (const tableName of tables) {
            try {
                const table = await this.db.openTable(tableName);
                for (const filePath of filePaths) {
                    // Use backticks for camelCase field names in LanceDB
                    await table.delete(`\`filePath\` = '${filePath.replace(/'/g, "''")}'`);
                }
            }
            catch {
                // Table doesn't exist
            }
        }
    }
    /**
     * Clear all data
     */
    async clear() {
        if (!this.db)
            throw new Error('Store not initialized');
        const allTables = Object.values(TABLE_NAMES);
        for (const tableName of allTables) {
            try {
                await this.db.dropTable(tableName);
            }
            catch {
                // Table doesn't exist
            }
        }
        // Reset metadata
        this.updateMetadata({
            lastRefreshedAt: new Date().toISOString(),
            chunkCount: 0,
        });
    }
    /**
     * Get all chunks (for BM25 rebuild)
     */
    async getAllChunks() {
        if (!this.db)
            throw new Error('Store not initialized');
        const chunks = [];
        const tables = [TABLE_NAMES.CODEBASE, TABLE_NAMES.TESTS];
        for (const tableName of tables) {
            try {
                const table = await this.db.openTable(tableName);
                const results = await table.query().toArray();
                for (const r of results) {
                    chunks.push({
                        id: r.id,
                        content: r.content,
                        filePath: r.filePath,
                        lineRange: [r.lineStart, r.lineEnd],
                        language: r.language,
                        type: r.type,
                        context: r.context,
                    });
                }
            }
            catch {
                // Table doesn't exist
            }
        }
        return chunks;
    }
    /**
     * Get index statistics
     */
    async getStats() {
        const stats = {
            codebaseChunks: 0,
            testChunks: 0,
            databaseChunks: 0,
            relationships: 0,
            gitHistoryRecords: 0,
            testMappings: 0,
            indexSizeBytes: 0,
        };
        if (!this.db)
            return stats;
        // Count records in each table
        const tableCounts = [
            [TABLE_NAMES.CODEBASE, 'codebaseChunks'],
            [TABLE_NAMES.TESTS, 'testChunks'],
            [TABLE_NAMES.DATABASE, 'databaseChunks'],
            [TABLE_NAMES.RELATIONSHIPS, 'relationships'],
            [TABLE_NAMES.GIT_HISTORY, 'gitHistoryRecords'],
            [TABLE_NAMES.TEST_MAPPING, 'testMappings'],
        ];
        for (const [tableName, statKey] of tableCounts) {
            try {
                const table = await this.db.openTable(tableName);
                const count = await table.countRows();
                stats[statKey] = count;
            }
            catch {
                // Table doesn't exist
            }
        }
        // Calculate directory size
        stats.indexSizeBytes = this.getDirectorySize(this.indexDir);
        return stats;
    }
    /**
     * Get directory size in bytes
     */
    getDirectorySize(dirPath) {
        let size = 0;
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    size += this.getDirectorySize(entryPath);
                }
                else {
                    const stat = fs.statSync(entryPath);
                    size += stat.size;
                }
            }
        }
        catch {
            // Directory access error
        }
        return size;
    }
}
//# sourceMappingURL=store.js.map