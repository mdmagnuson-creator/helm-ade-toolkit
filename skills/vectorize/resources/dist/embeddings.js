/**
 * Embedding generation using OpenAI, Voyage, or Ollama
 *
 * Supports auto-detection of available providers and dimension normalization.
 */
import OpenAI from 'openai';
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
// Voyage API has a 120k token limit per batch
// Estimate ~2 chars per token for code (very conservative)
// Also limit batch to 50k tokens to leave room for API overhead
const VOYAGE_MAX_TOKENS_PER_BATCH = 50000; // Very conservative limit
const CHARS_PER_TOKEN_ESTIMATE = 2;
// Model dimensions for normalization
export const MODEL_DIMENSIONS = {
    // OpenAI
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536,
    // Voyage
    'voyage-code-3': 1024,
    'voyage-code-2': 1536,
    'voyage-2': 1024,
    // Ollama
    'nomic-embed-text': 768,
    'mxbai-embed-large': 1024,
    'all-minilm': 384,
};
/**
 * Detect which embedding providers are available
 */
export async function detectProviders() {
    const result = {
        openai: false,
        voyage: false,
        ollama: false,
        preferred: null,
    };
    // Check for API keys in environment
    if (process.env.VOYAGE_API_KEY) {
        result.voyage = true;
        result.preferred = 'voyage';
    }
    if (process.env.OPENAI_API_KEY) {
        result.openai = true;
        if (!result.preferred) {
            result.preferred = 'openai';
        }
    }
    // Check for Ollama (local)
    try {
        const response = await fetch('http://localhost:11434/api/tags', {
            method: 'GET',
            signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
            result.ollama = true;
            if (!result.preferred) {
                result.preferred = 'ollama';
            }
        }
    }
    catch {
        // Ollama not available
    }
    return result;
}
/**
 * Get the default model for a provider
 */
export function getDefaultModel(provider) {
    switch (provider) {
        case 'voyage':
            return 'voyage-code-3';
        case 'openai':
            return 'text-embedding-3-small';
        case 'ollama':
            return 'nomic-embed-text';
        default:
            return 'text-embedding-3-small';
    }
}
/**
 * Get the dimension of embeddings for a model
 */
export function getModelDimension(model) {
    return MODEL_DIMENSIONS[model] || 1536; // Default to OpenAI dimension
}
/**
 * Normalize embedding to target dimension (truncation or padding)
 * This is useful when mixing embeddings from different models.
 */
export function normalizeEmbedding(embedding, targetDimension) {
    if (embedding.length === targetDimension) {
        return embedding;
    }
    if (embedding.length > targetDimension) {
        // Truncate (Matryoshka-style truncation for OpenAI models)
        return embedding.slice(0, targetDimension);
    }
    // Pad with zeros (not ideal, but maintains compatibility)
    return [...embedding, ...new Array(targetDimension - embedding.length).fill(0)];
}
/**
 * Generate embeddings using auto-detected or configured provider
 */
export async function generateEmbeddingsAuto(chunks, config = {}) {
    let provider = config.provider;
    let model = config.model;
    let apiKey = config.apiKey;
    // Auto-detect provider if not specified
    if (!provider) {
        const availability = await detectProviders();
        if (!availability.preferred) {
            throw new Error('No embedding provider available. Set VOYAGE_API_KEY, OPENAI_API_KEY, or start Ollama.');
        }
        provider = availability.preferred;
    }
    // Set default model if not specified
    if (!model) {
        model = getDefaultModel(provider);
    }
    // Get API key from environment if not provided
    if (!apiKey) {
        if (provider === 'voyage') {
            apiKey = process.env.VOYAGE_API_KEY;
        }
        else if (provider === 'openai') {
            apiKey = process.env.OPENAI_API_KEY;
        }
    }
    // Generate embeddings based on provider
    let results;
    switch (provider) {
        case 'voyage':
            if (!apiKey)
                throw new Error('VOYAGE_API_KEY is required for Voyage provider');
            results = await generateVoyageEmbeddings(chunks, apiKey, model);
            break;
        case 'openai':
            if (!apiKey)
                throw new Error('OPENAI_API_KEY is required for OpenAI provider');
            results = await generateEmbeddings(chunks, apiKey, model);
            break;
        case 'ollama':
            results = await generateOllamaEmbeddings(chunks, model, config.ollamaBaseUrl || 'http://localhost:11434');
            break;
        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
    // Normalize dimensions if target is specified
    if (config.targetDimension) {
        for (const result of results) {
            result.embedding = normalizeEmbedding(result.embedding, config.targetDimension);
        }
    }
    return { results, provider, model };
}
/**
 * Generate embeddings for chunks using OpenAI
 */
export async function generateEmbeddings(chunks, apiKey, model = 'text-embedding-3-small') {
    const client = new OpenAI({ apiKey });
    const results = [];
    // Process in batches
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const texts = batch.map(chunk => {
            // Include context if available (from contextual retrieval)
            const content = chunk.context
                ? `${chunk.context}\n\n${chunk.content}`
                : chunk.content;
            // Truncate if too long (OpenAI limit is 8191 tokens)
            return content.substring(0, 30000);
        });
        let retries = 0;
        while (retries < MAX_RETRIES) {
            try {
                const response = await client.embeddings.create({
                    model,
                    input: texts,
                });
                for (let j = 0; j < response.data.length; j++) {
                    results.push({
                        chunkId: batch[j].id,
                        embedding: response.data[j].embedding,
                    });
                }
                break;
            }
            catch (error) {
                retries++;
                if (retries >= MAX_RETRIES) {
                    throw error;
                }
                // Check for rate limit
                if (error instanceof Error && error.message.includes('429')) {
                    await sleep(RETRY_DELAY * retries * 2);
                }
                else {
                    await sleep(RETRY_DELAY * retries);
                }
            }
        }
        // Progress indicator
        if (i % (BATCH_SIZE * 10) === 0 && i > 0) {
            console.log(`  Embedded ${i}/${chunks.length} chunks...`);
        }
    }
    return results;
}
/**
 * Generate a single embedding for a query
 */
export async function generateQueryEmbedding(query, apiKey, model = 'text-embedding-3-small') {
    const client = new OpenAI({ apiKey });
    const response = await client.embeddings.create({
        model,
        input: query,
    });
    return response.data[0].embedding;
}
/**
 * Generate a query embedding using auto-detected provider
 */
export async function generateQueryEmbeddingAuto(query, config = {}) {
    let provider = config.provider;
    let model = config.model;
    let apiKey = config.apiKey;
    // Auto-detect provider if not specified
    if (!provider) {
        const availability = await detectProviders();
        if (!availability.preferred) {
            throw new Error('No embedding provider available. Set VOYAGE_API_KEY, OPENAI_API_KEY, or start Ollama.');
        }
        provider = availability.preferred;
    }
    // Set default model if not specified
    if (!model) {
        model = getDefaultModel(provider);
    }
    // Get API key from environment if not provided
    if (!apiKey) {
        if (provider === 'voyage') {
            apiKey = process.env.VOYAGE_API_KEY;
        }
        else if (provider === 'openai') {
            apiKey = process.env.OPENAI_API_KEY;
        }
    }
    // Generate embedding based on provider
    let embedding;
    switch (provider) {
        case 'voyage':
            if (!apiKey)
                throw new Error('VOYAGE_API_KEY is required for Voyage provider');
            embedding = await generateVoyageQueryEmbedding(query, apiKey, model);
            break;
        case 'openai':
            if (!apiKey)
                throw new Error('OPENAI_API_KEY is required for OpenAI provider');
            embedding = await generateQueryEmbedding(query, apiKey, model);
            break;
        case 'ollama':
            embedding = await generateOllamaQueryEmbedding(query, model, config.ollamaBaseUrl || 'http://localhost:11434');
            break;
        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
    // Normalize dimension if target is specified
    if (config.targetDimension) {
        embedding = normalizeEmbedding(embedding, config.targetDimension);
    }
    return { embedding, provider, model };
}
/**
 * Generate embeddings using Voyage AI (recommended for code)
 * Uses token-aware batching to stay under Voyage's 120k token limit
 */
export async function generateVoyageEmbeddings(chunks, apiKey, model = 'voyage-code-3') {
    const results = [];
    // Prepare texts with token estimates
    const preparedChunks = chunks.map(chunk => {
        const content = chunk.context
            ? `${chunk.context}\n\n${chunk.content}`
            : chunk.content;
        const text = content.substring(0, 30000);
        const estimatedTokens = Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
        return { chunk, text, estimatedTokens };
    });
    // Process in token-aware batches
    let i = 0;
    while (i < preparedChunks.length) {
        const batch = [];
        let batchTokens = 0;
        // Build batch until we hit token limit or chunk limit
        while (i < preparedChunks.length && batch.length < BATCH_SIZE) {
            const item = preparedChunks[i];
            if (batchTokens + item.estimatedTokens > VOYAGE_MAX_TOKENS_PER_BATCH && batch.length > 0) {
                // This chunk would exceed limit, stop here
                break;
            }
            batch.push(item);
            batchTokens += item.estimatedTokens;
            i++;
        }
        const texts = batch.map(item => item.text);
        let retries = 0;
        while (retries < MAX_RETRIES) {
            try {
                const response = await fetch('https://api.voyageai.com/v1/embeddings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        input: texts,
                        input_type: 'document',
                    }),
                });
                if (!response.ok) {
                    const error = await response.text();
                    if (response.status === 429) {
                        throw new Error(`429: ${error}`);
                    }
                    throw new Error(`Voyage API error: ${response.status} ${error}`);
                }
                const data = await response.json();
                for (let j = 0; j < data.data.length; j++) {
                    results.push({
                        chunkId: batch[j].chunk.id,
                        embedding: data.data[j].embedding,
                    });
                }
                break;
            }
            catch (error) {
                retries++;
                if (retries >= MAX_RETRIES) {
                    throw error;
                }
                // Check for rate limit
                if (error instanceof Error && error.message.includes('429')) {
                    await sleep(RETRY_DELAY * retries * 2);
                }
                else {
                    await sleep(RETRY_DELAY * retries);
                }
            }
        }
        // Progress indicator
        if (results.length % 100 === 0 && results.length > 0) {
            console.log(`  Embedded ${results.length}/${chunks.length} chunks...`);
        }
    }
    return results;
}
/**
 * Generate a single query embedding using Voyage AI
 */
export async function generateVoyageQueryEmbedding(query, apiKey, model = 'voyage-code-3') {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            input: [query],
            input_type: 'query',
        }),
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Voyage API error: ${response.status} ${error}`);
    }
    const data = await response.json();
    return data.data[0].embedding;
}
/**
 * Generate embeddings using local Ollama
 */
export async function generateOllamaEmbeddings(chunks, model = 'nomic-embed-text', baseUrl = 'http://localhost:11434') {
    const results = [];
    // Ollama doesn't support batching, process one at a time
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const content = chunk.context
            ? `${chunk.context}\n\n${chunk.content}`
            : chunk.content;
        let retries = 0;
        while (retries < MAX_RETRIES) {
            try {
                const response = await fetch(`${baseUrl}/api/embeddings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model,
                        prompt: content.substring(0, 30000),
                    }),
                });
                if (!response.ok) {
                    throw new Error(`Ollama API error: ${response.statusText}`);
                }
                const data = await response.json();
                results.push({
                    chunkId: chunk.id,
                    embedding: data.embedding,
                });
                break;
            }
            catch (error) {
                retries++;
                if (retries >= MAX_RETRIES) {
                    throw error;
                }
                await sleep(RETRY_DELAY * retries);
            }
        }
        // Progress indicator
        if (i % 100 === 0 && i > 0) {
            console.log(`  Embedded ${i}/${chunks.length} chunks...`);
        }
    }
    return results;
}
/**
 * Generate a single query embedding using Ollama
 */
export async function generateOllamaQueryEmbedding(query, model = 'nomic-embed-text', baseUrl = 'http://localhost:11434') {
    const response = await fetch(`${baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            prompt: query,
        }),
    });
    if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
    }
    const data = await response.json();
    return data.embedding;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=embeddings.js.map