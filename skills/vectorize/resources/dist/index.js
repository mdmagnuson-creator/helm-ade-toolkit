/**
 * Vectorize - Core module for codebase and database vectorization
 */
import { loadProjectConfig, saveProjectConfig } from './config.js';
import { scanCodebase, chunkFiles } from './chunker.js';
import { generateEmbeddingsAuto, detectProviders } from './embeddings.js';
import { addContextualDescriptions } from './contextual.js';
import { VectorStore } from './store.js';
import { extractDatabaseSchema, extractConfigTableRows } from './database.js';
import { installGitHook, getChangedFilesSinceIndex } from './git.js';
import { buildBM25Index } from './bm25.js';
import { hybridSearch } from './search.js';
// Phase 2 modules
import { extractRelationships } from './relationships.js';
import { indexCommitHistory, isGitRepository } from './git-history.js';
import { createTestMappings, isTestFile } from './test-mapping.js';
import { detectModules, generateSummaries, saveSummaries } from './summaries.js';
import path from 'path';
import fs from 'fs';
/**
 * Initialize vectorization for a project
 */
export async function initializeVectorization(projectRoot, options = {}) {
    // Check for available embedding providers
    const providers = await detectProviders();
    if (!providers.preferred) {
        throw new Error('No embedding provider available.\n' +
            'Set one of: VOYAGE_API_KEY, OPENAI_API_KEY, or start Ollama locally.');
    }
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (options.contextualRetrieval && !anthropicKey) {
        console.warn('Warning: ANTHROPIC_API_KEY not found. Contextual retrieval will be disabled.\n' +
            'Set it with: export ANTHROPIC_API_KEY=sk-ant-...');
    }
    // Load or create project config
    let config = await loadProjectConfig(projectRoot);
    const vectorConfig = config.vectorization || {
        enabled: true,
        storage: 'local',
        embeddingModel: providers.preferred,
        contextualRetrieval: options.contextualRetrieval && anthropicKey ? 'auto' : 'never',
        codebase: {
            include: ['src/**', 'lib/**', 'app/**', 'docs/**'],
            exclude: ['node_modules/**', 'dist/**', 'build/**', '.git/**', '*.test.ts', '*.spec.ts'],
            chunkStrategy: 'ast',
        },
        search: {
            hybridWeight: 0.7,
            topK: 20,
        },
        refresh: {
            onGitChange: true,
            onSessionStart: true,
            maxAge: '24h',
        },
        credentials: {
            openai: 'env:OPENAI_API_KEY',
            anthropic: 'env:ANTHROPIC_API_KEY',
            voyage: 'env:VOYAGE_API_KEY',
        },
    };
    // Check for database
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl && !options.skipDatabase) {
        vectorConfig.database = {
            enabled: true,
            connection: 'env:DATABASE_URL',
            type: detectDatabaseType(databaseUrl),
            schema: {
                enabled: true,
                include: ['public.*'],
                exclude: [],
            },
            configTables: [],
        };
    }
    if (options.dryRun) {
        // Scan and estimate without making changes
        const files = await scanCodebase(projectRoot, vectorConfig.codebase);
        const chunks = await chunkFiles(files, vectorConfig.codebase.chunkStrategy || 'ast');
        const estimatedCost = estimateCost(chunks.length, options.contextualRetrieval || false);
        return {
            summary: `Would index ${files.length} files (${chunks.length} chunks)`,
            cost: estimatedCost,
            chunks: chunks.length,
            files: files.length,
        };
    }
    // Create index directory
    const indexDir = path.join(projectRoot, '.vectorindex');
    if (!fs.existsSync(indexDir)) {
        fs.mkdirSync(indexDir, { recursive: true });
    }
    // Add to .gitignore if needed
    await ensureGitignore(projectRoot, '.vectorindex/');
    // Scan codebase
    const files = await scanCodebase(projectRoot, vectorConfig.codebase);
    let chunks = await chunkFiles(files, vectorConfig.codebase.chunkStrategy || 'ast');
    // Add contextual descriptions if enabled
    if (options.contextualRetrieval && anthropicKey) {
        chunks = await addContextualDescriptions(chunks, anthropicKey);
    }
    // Generate embeddings (uses auto-detected provider)
    const { results: embeddings, provider, model } = await generateEmbeddingsAuto(chunks);
    console.log(`  Using ${provider} with model ${model}`);
    // Store in LanceDB
    const store = new VectorStore(indexDir);
    await store.initialize();
    await store.addCodebaseEmbeddings(chunks, embeddings);
    // Build BM25 index
    await buildBM25Index(indexDir, chunks);
    // Index database if configured
    if (vectorConfig.database?.enabled && databaseUrl) {
        const schemaChunks = await extractDatabaseSchema(databaseUrl, vectorConfig.database);
        const configChunks = await extractConfigTableRows(databaseUrl, vectorConfig.database);
        const dbChunks = [...schemaChunks, ...configChunks];
        if (dbChunks.length > 0) {
            const { results: dbEmbeddings } = await generateEmbeddingsAuto(dbChunks);
            await store.addDatabaseEmbeddings(dbChunks, dbEmbeddings);
        }
    }
    // Phase 2: Index relationships, git history, test mappings, and summaries
    let relationshipCount = 0;
    let commitCount = 0;
    let testMappingCount = 0;
    let moduleCount = 0;
    // Extract relationships (call graph, dependencies)
    if (!options.skipRelationships) {
        console.log('  Indexing code relationships...');
        const relationships = await extractRelationships(files);
        if (relationships.length > 0) {
            await store.addRelationships(relationships);
            relationshipCount = relationships.length;
        }
    }
    // Index git commit history
    if (!options.skipGitHistory && await isGitRepository(projectRoot)) {
        console.log('  Indexing git history...');
        const { records: historyRecords, latestCommit } = await indexCommitHistory(projectRoot, { maxCommits: 500 });
        if (historyRecords.length > 0) {
            await store.addGitHistory(historyRecords);
            commitCount = historyRecords.length;
        }
    }
    // Extract test mappings
    if (!options.skipTestMapping) {
        console.log('  Indexing test mappings...');
        const testFiles = files.filter(f => isTestFile(f.path));
        const testMappings = await createTestMappings(testFiles, projectRoot);
        if (testMappings.length > 0) {
            await store.addTestMappings(testMappings);
            testMappingCount = testMappings.length;
        }
    }
    // Generate architecture summaries
    if (!options.skipSummaries) {
        console.log('  Detecting modules...');
        const modules = detectModules(projectRoot, files);
        moduleCount = modules.length;
        if (modules.length > 0) {
            console.log(`  Found ${modules.length} modules, generating summaries...`);
            const summaries = await generateSummaries(projectRoot, modules, files);
            saveSummaries(indexDir, summaries);
        }
    }
    // Save metadata
    const metadata = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        gitHead: await getCurrentGitHead(projectRoot),
        codebase: {
            files: files.length,
            chunks: chunks.length,
            languages: [...new Set(chunks.map(c => c.language).filter(Boolean))],
        },
        relationships: relationshipCount,
        commits: commitCount,
        testMappings: testMappingCount,
        modules: moduleCount,
        config: vectorConfig,
    };
    fs.writeFileSync(path.join(indexDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    // Update project.json
    config.vectorization = vectorConfig;
    await saveProjectConfig(projectRoot, config);
    // Install git hook
    await installGitHook(projectRoot);
    const cost = estimateCost(chunks.length, options.contextualRetrieval || false);
    // Build summary with Phase 2 stats
    let summaryParts = [`Indexed ${files.length} files (${chunks.length} chunks)`];
    if (relationshipCount > 0)
        summaryParts.push(`${relationshipCount} relationships`);
    if (commitCount > 0)
        summaryParts.push(`${commitCount} commits`);
    if (testMappingCount > 0)
        summaryParts.push(`${testMappingCount} test mappings`);
    if (moduleCount > 0)
        summaryParts.push(`${moduleCount} modules`);
    return {
        summary: summaryParts.join(', '),
        cost,
        chunks: chunks.length,
        files: files.length,
        relationships: relationshipCount,
        commits: commitCount,
        testMappings: testMappingCount,
        modules: moduleCount,
    };
}
/**
 * Refresh the vector index
 */
export async function refreshIndex(projectRoot, options = {}) {
    const startTime = Date.now();
    const indexDir = path.join(projectRoot, '.vectorindex');
    const metadataPath = path.join(indexDir, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
        throw new Error('No index found. Run "vectorize init" first.');
    }
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const config = metadata.config;
    // Check for available embedding providers
    const providers = await detectProviders();
    if (!providers.preferred) {
        throw new Error('No embedding provider available.\n' +
            'Set one of: VOYAGE_API_KEY, OPENAI_API_KEY, or start Ollama locally.');
    }
    const store = new VectorStore(indexDir);
    await store.initialize();
    let chunksUpdated = 0;
    if (options.full) {
        // Full rebuild
        const files = await scanCodebase(projectRoot, config.codebase);
        let chunks = await chunkFiles(files, config.codebase.chunkStrategy || 'ast');
        if (config.contextualRetrieval !== 'never') {
            const anthropicKey = process.env.ANTHROPIC_API_KEY;
            if (anthropicKey) {
                chunks = await addContextualDescriptions(chunks, anthropicKey);
            }
        }
        const { results: embeddings, provider, model } = await generateEmbeddingsAuto(chunks);
        console.log(`  Using ${provider} with model ${model}`);
        await store.clear();
        await store.addCodebaseEmbeddings(chunks, embeddings);
        await buildBM25Index(indexDir, chunks);
        chunksUpdated = chunks.length;
    }
    else {
        // Incremental update
        const changedFiles = options.changedFiles ||
            await getChangedFilesSinceIndex(projectRoot, metadata.gitHead);
        if (changedFiles.length === 0) {
            return { chunksUpdated: 0, timeMs: Date.now() - startTime };
        }
        // Remove old chunks for changed files
        await store.removeByFiles(changedFiles);
        // Re-chunk changed files
        const files = await scanCodebase(projectRoot, config.codebase, changedFiles);
        let chunks = await chunkFiles(files, config.codebase.chunkStrategy || 'ast');
        if (config.contextualRetrieval !== 'never') {
            const anthropicKey = process.env.ANTHROPIC_API_KEY;
            if (anthropicKey) {
                chunks = await addContextualDescriptions(chunks, anthropicKey);
            }
        }
        const { results: embeddings, provider, model } = await generateEmbeddingsAuto(chunks);
        console.log(`  Using ${provider} with model ${model}`);
        await store.addCodebaseEmbeddings(chunks, embeddings);
        // Rebuild BM25 (full, as incremental is complex)
        const allChunks = await store.getAllChunks();
        await buildBM25Index(indexDir, allChunks);
        chunksUpdated = chunks.length;
    }
    // Update metadata
    metadata.lastUpdated = new Date().toISOString();
    metadata.gitHead = await getCurrentGitHead(projectRoot);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    return {
        chunksUpdated,
        timeMs: Date.now() - startTime,
    };
}
/**
 * Search the vector index
 */
export async function searchIndex(projectRoot, query, options = {}) {
    const indexDir = path.join(projectRoot, '.vectorindex');
    const metadataPath = path.join(indexDir, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
        throw new Error('No index found. Run "vectorize init" first.');
    }
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const config = metadata.config;
    const topK = options.topK || config.search?.topK || 20;
    const hybridWeight = config.search?.hybridWeight ?? 0.7;
    // Perform hybrid search (uses auto-detected embedding provider)
    const results = await hybridSearch(indexDir, query, {
        topK,
        hybridWeight,
        contentType: options.contentType,
        language: options.language,
        filePatterns: options.filePatterns,
    });
    return results;
}
/**
 * Get index status
 */
export async function getStatus(projectRoot) {
    const indexDir = path.join(projectRoot, '.vectorindex');
    const metadataPath = path.join(indexDir, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
        throw new Error('No index found. Run "vectorize init" first.');
    }
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const config = metadata.config;
    // Check if stale
    const lastUpdated = new Date(metadata.lastUpdated);
    const maxAgeMs = parseMaxAge(config.refresh?.maxAge || '24h');
    const isStale = Date.now() - lastUpdated.getTime() > maxAgeMs;
    // Calculate storage sizes
    const vectorSize = getDirectorySize(path.join(indexDir, 'codebase.lance'));
    const bm25Size = getDirectorySize(path.join(indexDir, 'bm25'));
    const status = {
        lastUpdated: formatDate(lastUpdated),
        isStale,
        codebase: {
            files: metadata.codebase?.files || 0,
            chunks: metadata.codebase?.chunks || 0,
            languages: metadata.codebase?.languages || [],
        },
        storage: {
            vectorSize: formatBytes(vectorSize),
            bm25Size: formatBytes(bm25Size),
            totalSize: formatBytes(vectorSize + bm25Size),
        },
        config: {
            embeddingModel: config.embeddingModel || 'openai',
            contextualRetrieval: config.contextualRetrieval || 'auto',
            hybridWeight: config.search?.hybridWeight ?? 0.7,
            topK: config.search?.topK || 20,
        },
    };
    // Add database info if configured
    if (metadata.database) {
        status.database = {
            tables: metadata.database.tables || 0,
            columns: metadata.database.columns || 0,
            configTables: metadata.database.configTables || [],
        };
    }
    return status;
}
/**
 * Show current configuration
 */
export async function showConfig(projectRoot) {
    const config = await loadProjectConfig(projectRoot);
    if (!config.vectorization) {
        throw new Error('Vectorization not configured. Run "vectorize init" first.');
    }
    return config.vectorization;
}
// Helper functions
function detectDatabaseType(url) {
    if (url.startsWith('postgres') || url.startsWith('postgresql'))
        return 'postgres';
    if (url.startsWith('mysql'))
        return 'mysql';
    if (url.startsWith('sqlite') || url.includes('.db') || url.includes('.sqlite'))
        return 'sqlite';
    return 'postgres'; // Default
}
function estimateCost(chunks, contextual) {
    // OpenAI text-embedding-3-small: ~$0.00002 per 1K tokens
    // Assuming ~200 tokens per chunk average
    const embeddingCost = (chunks * 200 / 1000) * 0.00002;
    // Claude Haiku for contextual: ~$0.25 per 1M input tokens, $1.25 per 1M output tokens
    // Assuming ~500 tokens input, ~75 tokens output per chunk
    const contextualCost = contextual
        ? chunks * ((500 / 1000000) * 0.25 + (75 / 1000000) * 1.25)
        : 0;
    return embeddingCost + contextualCost;
}
async function ensureGitignore(projectRoot, pattern) {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        if (!content.includes(pattern)) {
            fs.appendFileSync(gitignorePath, `\n# Vector index\n${pattern}\n`);
        }
    }
    else {
        fs.writeFileSync(gitignorePath, `# Vector index\n${pattern}\n`);
    }
}
async function getCurrentGitHead(projectRoot) {
    try {
        const { execSync } = await import('child_process');
        return execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf-8' }).trim();
    }
    catch {
        return null;
    }
}
function parseMaxAge(maxAge) {
    const match = maxAge.match(/^(\d+)(h|d|w)$/);
    if (!match)
        return 24 * 60 * 60 * 1000; // Default 24h
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'w': return value * 7 * 24 * 60 * 60 * 1000;
        default: return 24 * 60 * 60 * 1000;
    }
}
function getDirectorySize(dirPath) {
    if (!fs.existsSync(dirPath))
        return 0;
    let size = 0;
    const files = fs.readdirSync(dirPath, { recursive: true, withFileTypes: true });
    for (const file of files) {
        if (file.isFile()) {
            const filePath = path.join(file.path || dirPath, file.name);
            size += fs.statSync(filePath).size;
        }
    }
    return size;
}
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
function formatDate(date) {
    return date.toISOString().replace('T', ' ').substring(0, 19);
}
//# sourceMappingURL=index.js.map