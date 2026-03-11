/**
 * Contextual Retrieval preprocessing using Claude Haiku
 *
 * Implements Anthropic's Contextual Retrieval approach:
 * https://www.anthropic.com/news/contextual-retrieval
 *
 * Uses prompt caching to reduce costs when processing multiple chunks from the same file.
 */
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
const BATCH_SIZE = 10; // Process 10 chunks at a time for prompt caching
const MAX_RETRIES = 3;
// Pricing per 1M tokens (as of 2024)
const HAIKU_INPUT_COST_PER_1M = 0.25; // $0.25 per 1M input tokens
const HAIKU_OUTPUT_COST_PER_1M = 1.25; // $1.25 per 1M output tokens
const HAIKU_CACHE_WRITE_COST_PER_1M = 0.30; // $0.30 per 1M tokens to write cache
const HAIKU_CACHE_READ_COST_PER_1M = 0.03; // $0.03 per 1M tokens to read cache
// Average tokens per context generation
const AVG_INPUT_TOKENS_PER_CHUNK = 500; // file context + chunk + prompt
const AVG_OUTPUT_TOKENS_PER_CHUNK = 75; // context description
/**
 * Estimate the cost of contextual retrieval before running
 */
export function estimateContextualCost(chunks) {
    // Group chunks by file
    const chunksByFile = new Map();
    for (const chunk of chunks) {
        const existing = chunksByFile.get(chunk.filePath) || [];
        existing.push(chunk);
        chunksByFile.set(chunk.filePath, existing);
    }
    const totalFiles = chunksByFile.size;
    const totalChunks = chunks.length;
    // Estimate tokens
    // For each file: write to cache once, read from cache for subsequent chunks
    let estimatedCacheWriteTokens = 0;
    let estimatedCacheReadTokens = 0;
    let estimatedInputTokens = 0;
    for (const [, fileChunks] of chunksByFile) {
        // First chunk writes to cache
        const avgFileTokens = 2000; // Average file size in tokens
        estimatedCacheWriteTokens += avgFileTokens;
        // All chunks read from cache (including first, which gets cache miss but writes)
        estimatedCacheReadTokens += avgFileTokens * (fileChunks.length - 1);
        // Each chunk also has the chunk content and prompt (not cached)
        estimatedInputTokens += AVG_INPUT_TOKENS_PER_CHUNK * fileChunks.length;
    }
    const estimatedOutputTokens = AVG_OUTPUT_TOKENS_PER_CHUNK * totalChunks;
    // Calculate costs
    const inputCost = (estimatedInputTokens / 1_000_000) * HAIKU_INPUT_COST_PER_1M;
    const outputCost = (estimatedOutputTokens / 1_000_000) * HAIKU_OUTPUT_COST_PER_1M;
    const cacheWriteCost = (estimatedCacheWriteTokens / 1_000_000) * HAIKU_CACHE_WRITE_COST_PER_1M;
    const cacheReadCost = (estimatedCacheReadTokens / 1_000_000) * HAIKU_CACHE_READ_COST_PER_1M;
    const estimatedCostUSD = inputCost + outputCost + cacheWriteCost + cacheReadCost;
    return {
        totalChunks,
        totalFiles,
        estimatedInputTokens,
        estimatedOutputTokens,
        estimatedCacheWriteTokens,
        estimatedCacheReadTokens,
        estimatedCostUSD,
        breakdown: {
            inputCost,
            outputCost,
            cacheWriteCost,
            cacheReadCost,
        },
    };
}
/**
 * Format cost estimate for display
 */
export function formatCostEstimate(estimate) {
    return [
        `Contextual Retrieval Estimate:`,
        `  Chunks: ${estimate.totalChunks} across ${estimate.totalFiles} files`,
        `  Input tokens: ~${estimate.estimatedInputTokens.toLocaleString()}`,
        `  Output tokens: ~${estimate.estimatedOutputTokens.toLocaleString()}`,
        `  Cache write: ~${estimate.estimatedCacheWriteTokens.toLocaleString()} tokens`,
        `  Cache read: ~${estimate.estimatedCacheReadTokens.toLocaleString()} tokens`,
        `  Estimated cost: $${estimate.estimatedCostUSD.toFixed(2)}`,
    ].join('\n');
}
/**
 * Add contextual descriptions to chunks using Claude Haiku
 * Uses prompt caching to reduce costs for multiple chunks from the same file
 */
export async function addContextualDescriptions(chunks, apiKey, options = {}) {
    const client = new Anthropic({ apiKey });
    const enrichedChunks = [];
    const { showProgress = true, onProgress } = options;
    // Group chunks by file for prompt caching
    const chunksByFile = new Map();
    for (const chunk of chunks) {
        const existing = chunksByFile.get(chunk.filePath) || [];
        existing.push(chunk);
        chunksByFile.set(chunk.filePath, existing);
    }
    let processed = 0;
    for (const [filePath, fileChunks] of chunksByFile) {
        // Read full file content for context (will be cached)
        let fileContent;
        try {
            fileContent = fs.readFileSync(filePath, 'utf-8');
        }
        catch {
            // File might not exist at absolute path, skip context
            enrichedChunks.push(...fileChunks);
            processed += fileChunks.length;
            continue;
        }
        // Truncate file content if too large (cache has limits)
        const maxFileContent = 50000; // ~12k tokens
        const truncatedFile = fileContent.length > maxFileContent
            ? fileContent.substring(0, maxFileContent) + '\n...[truncated]'
            : fileContent;
        // Process chunks in batches
        for (let i = 0; i < fileChunks.length; i += BATCH_SIZE) {
            const batch = fileChunks.slice(i, i + BATCH_SIZE);
            for (const chunk of batch) {
                let retries = 0;
                while (retries < MAX_RETRIES) {
                    try {
                        const context = await generateContextWithCache(client, truncatedFile, chunk);
                        enrichedChunks.push({
                            ...chunk,
                            context,
                        });
                        break;
                    }
                    catch (error) {
                        retries++;
                        if (retries >= MAX_RETRIES) {
                            // Skip context on failure, keep original chunk
                            enrichedChunks.push(chunk);
                            console.warn(`Failed to generate context for ${chunk.id}:`, error);
                        }
                        else {
                            await sleep(1000 * retries);
                        }
                    }
                }
                processed++;
                // Progress callback
                if (onProgress) {
                    onProgress(processed, chunks.length);
                }
            }
            // Progress indicator
            if (showProgress && processed % 100 === 0) {
                console.log(`  Added context to ${processed}/${chunks.length} chunks...`);
            }
        }
    }
    return enrichedChunks;
}
/**
 * Generate contextual description for a single chunk using prompt caching
 *
 * The file content is marked as cacheable so subsequent chunks from the same file
 * can reuse the cached prompt prefix, reducing costs significantly.
 */
async function generateContextWithCache(client, fileContent, chunk) {
    // Build the message with cache_control for the file content
    // The file content will be cached and reused for subsequent chunks from the same file
    const response = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 150,
        system: [
            {
                type: 'text',
                text: 'You are a code analysis assistant. Your task is to provide brief context that situates a code chunk within its file for improved search retrieval. Be concise (50-100 tokens).',
            },
        ],
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `<document>\n${fileContent}\n</document>`,
                        // Mark the document as cacheable - this is the expensive part
                        // that we want to reuse across chunks from the same file
                        cache_control: { type: 'ephemeral' },
                    },
                    {
                        type: 'text',
                        text: `Here is the chunk we want to situate within the whole document:

<chunk>
${chunk.content}
</chunk>

Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.`,
                    },
                ],
            },
        ],
    });
    // Extract text from response
    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock?.text || '';
}
/**
 * Check if contextual retrieval should be enabled based on setting and codebase size
 */
export function shouldEnableContextual(setting, totalTokens) {
    switch (setting) {
        case 'always':
            return true;
        case 'never':
            return false;
        case 'auto':
            // Enable for codebases > 50k tokens
            return totalTokens > 50000;
        default:
            return false;
    }
}
/**
 * Estimate total tokens in chunks
 */
export function estimateTotalTokens(chunks) {
    return chunks.reduce((total, chunk) => {
        return total + Math.ceil(chunk.content.length / 4);
    }, 0);
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=contextual.js.map