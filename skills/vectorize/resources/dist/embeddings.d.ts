/**
 * Embedding generation using OpenAI, Voyage, or Ollama
 *
 * Supports auto-detection of available providers and dimension normalization.
 */
import { Chunk } from './chunker.js';
export declare const MODEL_DIMENSIONS: Record<string, number>;
export type EmbeddingProvider = 'openai' | 'voyage' | 'ollama';
export interface EmbeddingConfig {
    provider?: EmbeddingProvider;
    model?: string;
    apiKey?: string;
    ollamaBaseUrl?: string;
    targetDimension?: number;
}
export interface EmbeddingResult {
    chunkId: string;
    embedding: number[];
}
export interface ProviderAvailability {
    openai: boolean;
    voyage: boolean;
    ollama: boolean;
    preferred: EmbeddingProvider | null;
}
/**
 * Detect which embedding providers are available
 */
export declare function detectProviders(): Promise<ProviderAvailability>;
/**
 * Get the default model for a provider
 */
export declare function getDefaultModel(provider: EmbeddingProvider): string;
/**
 * Get the dimension of embeddings for a model
 */
export declare function getModelDimension(model: string): number;
/**
 * Normalize embedding to target dimension (truncation or padding)
 * This is useful when mixing embeddings from different models.
 */
export declare function normalizeEmbedding(embedding: number[], targetDimension: number): number[];
/**
 * Generate embeddings using auto-detected or configured provider
 */
export declare function generateEmbeddingsAuto(chunks: Chunk[], config?: EmbeddingConfig): Promise<{
    results: EmbeddingResult[];
    provider: EmbeddingProvider;
    model: string;
}>;
/**
 * Generate embeddings for chunks using OpenAI
 */
export declare function generateEmbeddings(chunks: Chunk[], apiKey: string, model?: string): Promise<EmbeddingResult[]>;
/**
 * Generate a single embedding for a query
 */
export declare function generateQueryEmbedding(query: string, apiKey: string, model?: string): Promise<number[]>;
/**
 * Generate a query embedding using auto-detected provider
 */
export declare function generateQueryEmbeddingAuto(query: string, config?: EmbeddingConfig): Promise<{
    embedding: number[];
    provider: EmbeddingProvider;
    model: string;
}>;
/**
 * Generate embeddings using Voyage AI (recommended for code)
 * Uses token-aware batching to stay under Voyage's 120k token limit
 */
export declare function generateVoyageEmbeddings(chunks: Chunk[], apiKey: string, model?: string): Promise<EmbeddingResult[]>;
/**
 * Generate a single query embedding using Voyage AI
 */
export declare function generateVoyageQueryEmbedding(query: string, apiKey: string, model?: string): Promise<number[]>;
/**
 * Generate embeddings using local Ollama
 */
export declare function generateOllamaEmbeddings(chunks: Chunk[], model?: string, baseUrl?: string): Promise<EmbeddingResult[]>;
/**
 * Generate a single query embedding using Ollama
 */
export declare function generateOllamaQueryEmbedding(query: string, model?: string, baseUrl?: string): Promise<number[]>;
//# sourceMappingURL=embeddings.d.ts.map