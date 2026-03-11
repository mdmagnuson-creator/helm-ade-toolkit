/**
 * Tests for embedding generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getModelDimension,
  normalizeEmbedding,
  getDefaultModel,
  detectProviders,
  MODEL_DIMENSIONS,
} from './embeddings';

// Note: Full integration tests require API keys and are in a separate e2e test file

describe('embeddings', () => {
  describe('getModelDimension', () => {
    it('should return correct dimension for OpenAI models', () => {
      expect(getModelDimension('text-embedding-3-small')).toBe(1536);
      expect(getModelDimension('text-embedding-3-large')).toBe(3072);
      expect(getModelDimension('text-embedding-ada-002')).toBe(1536);
    });

    it('should return correct dimension for Voyage models', () => {
      expect(getModelDimension('voyage-code-3')).toBe(1024);
      expect(getModelDimension('voyage-code-2')).toBe(1536);
    });

    it('should return correct dimension for Ollama models', () => {
      expect(getModelDimension('nomic-embed-text')).toBe(768);
      expect(getModelDimension('mxbai-embed-large')).toBe(1024);
      expect(getModelDimension('all-minilm')).toBe(384);
    });

    it('should return default dimension for unknown models', () => {
      expect(getModelDimension('unknown-model')).toBe(1536);
    });
  });

  describe('normalizeEmbedding', () => {
    it('should return same embedding if dimensions match', () => {
      const embedding = [0.1, 0.2, 0.3];
      const result = normalizeEmbedding(embedding, 3);
      expect(result).toEqual(embedding);
    });

    it('should truncate embedding if larger than target', () => {
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const result = normalizeEmbedding(embedding, 3);
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should pad embedding with zeros if smaller than target', () => {
      const embedding = [0.1, 0.2, 0.3];
      const result = normalizeEmbedding(embedding, 5);
      expect(result).toEqual([0.1, 0.2, 0.3, 0, 0]);
    });
  });

  describe('getDefaultModel', () => {
    it('should return voyage-code-3 for voyage provider', () => {
      expect(getDefaultModel('voyage')).toBe('voyage-code-3');
    });

    it('should return text-embedding-3-small for openai provider', () => {
      expect(getDefaultModel('openai')).toBe('text-embedding-3-small');
    });

    it('should return nomic-embed-text for ollama provider', () => {
      expect(getDefaultModel('ollama')).toBe('nomic-embed-text');
    });
  });

  describe('detectProviders', () => {
    let originalEnv: NodeJS.ProcessEnv;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      originalEnv = { ...process.env };
      // Clear relevant env vars
      delete process.env.VOYAGE_API_KEY;
      delete process.env.OPENAI_API_KEY;
      
      // Mock fetch for Ollama check
      fetchMock = vi.fn();
      global.fetch = fetchMock;
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('should detect Voyage when API key is set', async () => {
      process.env.VOYAGE_API_KEY = 'test-key';
      fetchMock.mockRejectedValue(new Error('No Ollama'));
      
      const result = await detectProviders();
      
      expect(result.voyage).toBe(true);
      expect(result.preferred).toBe('voyage');
    });

    it('should detect OpenAI when API key is set', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      fetchMock.mockRejectedValue(new Error('No Ollama'));
      
      const result = await detectProviders();
      
      expect(result.openai).toBe(true);
      expect(result.preferred).toBe('openai');
    });

    it('should prefer Voyage over OpenAI when both are available', async () => {
      process.env.VOYAGE_API_KEY = 'voyage-key';
      process.env.OPENAI_API_KEY = 'openai-key';
      fetchMock.mockRejectedValue(new Error('No Ollama'));
      
      const result = await detectProviders();
      
      expect(result.voyage).toBe(true);
      expect(result.openai).toBe(true);
      expect(result.preferred).toBe('voyage');
    });

    it('should detect Ollama when running locally', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      
      const result = await detectProviders();
      
      expect(result.ollama).toBe(true);
      expect(result.preferred).toBe('ollama');
    });

    it('should return null preferred when no providers available', async () => {
      fetchMock.mockRejectedValue(new Error('No Ollama'));
      
      const result = await detectProviders();
      
      expect(result.preferred).toBeNull();
    });
  });

  describe('MODEL_DIMENSIONS', () => {
    it('should have all expected models', () => {
      const expectedModels = [
        'text-embedding-3-small',
        'text-embedding-3-large',
        'text-embedding-ada-002',
        'voyage-code-3',
        'voyage-code-2',
        'voyage-2',
        'nomic-embed-text',
        'mxbai-embed-large',
        'all-minilm',
      ];

      for (const model of expectedModels) {
        expect(MODEL_DIMENSIONS[model]).toBeDefined();
      }
    });

    it('should have reasonable dimensions (256-4096)', () => {
      for (const [model, dim] of Object.entries(MODEL_DIMENSIONS)) {
        expect(dim).toBeGreaterThanOrEqual(256);
        expect(dim).toBeLessThanOrEqual(4096);
      }
    });
  });
});
