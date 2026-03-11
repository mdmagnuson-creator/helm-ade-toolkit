/**
 * Tests for vector storage
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { VectorStore, TABLE_NAMES, StoredChunk } from './store';
import { Chunk } from './chunker';
import { EmbeddingResult } from './embeddings';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('VectorStore', () => {
  let testDir: string;
  let store: VectorStore;

  beforeAll(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectorize-store-test-'));
  });

  afterAll(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Create fresh store for each test
    const indexDir = path.join(testDir, `index-${Date.now()}`);
    store = new VectorStore(indexDir);
    await store.initialize();
  });

  describe('initialization', () => {
    it('should create index directory', async () => {
      const indexDir = path.join(testDir, 'init-test');
      const newStore = new VectorStore(indexDir);
      await newStore.initialize();
      
      expect(fs.existsSync(indexDir)).toBe(true);
    });

    it('should create metadata.json', async () => {
      const metadataPath = path.join(store.getIndexDir(), 'metadata.json');
      expect(fs.existsSync(metadataPath)).toBe(true);
      
      const metadata = store.getMetadata();
      expect(metadata).toBeDefined();
      expect(metadata?.version).toBe(1);
    });

    it('should report initialization status', async () => {
      expect(store.isInitialized()).toBe(true);
      
      const uninitStore = new VectorStore('/tmp/not-init');
      expect(uninitStore.isInitialized()).toBe(false);
    });
  });

  describe('codebase embeddings', () => {
    it('should add and retrieve codebase chunks', async () => {
      const chunks: Chunk[] = [
        {
          id: 'test.ts:1-10',
          content: 'function test() { return 1; }',
          filePath: 'test.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
      ];
      
      const embeddings: EmbeddingResult[] = [
        {
          chunkId: 'test.ts:1-10',
          embedding: new Array(384).fill(0.1), // Mock embedding
        },
      ];
      
      await store.addCodebaseEmbeddings(chunks, embeddings);
      
      // Search should find the chunk
      const results = await store.search(new Array(384).fill(0.1), { topK: 1 });
      expect(results.length).toBe(1);
      expect(results[0].filePath).toBe('test.ts');
    });

    it('should update metadata after adding chunks', async () => {
      const chunks: Chunk[] = [
        {
          id: 'test.ts:1-10',
          content: 'function test() { return 1; }',
          filePath: 'test.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
      ];
      
      const embeddings: EmbeddingResult[] = [
        {
          chunkId: 'test.ts:1-10',
          embedding: new Array(384).fill(0.1),
        },
      ];
      
      await store.addCodebaseEmbeddings(chunks, embeddings);
      
      const metadata = store.getMetadata();
      expect(metadata?.chunkCount).toBe(1);
      expect(metadata?.embeddingDimension).toBe(384);
    });
  });

  describe('test embeddings', () => {
    it('should store test chunks separately', async () => {
      const testChunks: Chunk[] = [
        {
          id: 'test.test.ts:1-10',
          content: 'describe("test", () => { it("works", () => {}); });',
          filePath: 'test.test.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
      ];
      
      const embeddings: EmbeddingResult[] = [
        {
          chunkId: 'test.test.ts:1-10',
          embedding: new Array(384).fill(0.2),
        },
      ];
      
      await store.addTestEmbeddings(testChunks, embeddings);
      
      // Search in tests table
      const results = await store.search(new Array(384).fill(0.2), {
        topK: 1,
        table: 'tests',
      });
      expect(results.length).toBe(1);
      expect(results[0].filePath).toBe('test.test.ts');
    });
  });

  describe('relationships', () => {
    it('should store and query relationships', async () => {
      await store.addRelationships([
        {
          id: 'rel-1',
          sourceFile: 'a.ts',
          sourceName: 'funcA',
          sourceLineStart: 1,
          sourceLineEnd: 10,
          targetFile: 'b.ts',
          targetName: 'funcB',
          relationshipType: 'calls',
        },
      ]);
      
      // Query callers of funcB
      const callers = await store.queryRelationships({
        targetName: 'funcB',
        relationshipType: 'calls',
      });
      
      expect(callers.length).toBe(1);
      expect(callers[0].sourceName).toBe('funcA');
    });
  });

  describe('test mappings', () => {
    it('should store and query test mappings', async () => {
      await store.addTestMappings([
        {
          id: 'map-1',
          testFile: 'utils.test.ts',
          testName: 'should add numbers',
          testLineStart: 5,
          testLineEnd: 10,
          sourceFile: 'utils.ts',
          sourceName: 'add',
          mappingType: 'static',
        },
      ]);
      
      // Query tests for function
      const tests = await store.queryTestMappings({
        sourceName: 'add',
      });
      
      expect(tests.length).toBe(1);
      expect(tests[0].testName).toBe('should add numbers');
    });
  });

  describe('search', () => {
    it('should search across multiple tables with "all"', async () => {
      const codeChunks: Chunk[] = [
        {
          id: 'code.ts:1-10',
          content: 'function code() {}',
          filePath: 'code.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
      ];
      
      const testChunks: Chunk[] = [
        {
          id: 'test.ts:1-10',
          content: 'describe("test", () => {});',
          filePath: 'test.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
      ];
      
      await store.addCodebaseEmbeddings(codeChunks, [
        { chunkId: 'code.ts:1-10', embedding: new Array(384).fill(0.1) },
      ]);
      
      await store.addTestEmbeddings(testChunks, [
        { chunkId: 'test.ts:1-10', embedding: new Array(384).fill(0.1) },
      ]);
      
      // Search all tables
      const results = await store.search(new Array(384).fill(0.1), {
        topK: 10,
        table: 'all',
      });
      
      expect(results.length).toBe(2);
    });

    it('should filter by language', async () => {
      const chunks: Chunk[] = [
        {
          id: 'ts.ts:1-10',
          content: 'const x = 1;',
          filePath: 'ts.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
        {
          id: 'py.py:1-10',
          content: 'x = 1',
          filePath: 'py.py',
          lineRange: [1, 10],
          language: 'python',
          type: 'code',
        },
      ];
      
      const embeddings: EmbeddingResult[] = [
        { chunkId: 'ts.ts:1-10', embedding: new Array(384).fill(0.1) },
        { chunkId: 'py.py:1-10', embedding: new Array(384).fill(0.1) },
      ];
      
      await store.addCodebaseEmbeddings(chunks, embeddings);
      
      // Filter by TypeScript
      const results = await store.search(new Array(384).fill(0.1), {
        topK: 10,
        filters: { language: 'typescript' },
      });
      
      expect(results.length).toBe(1);
      expect(results[0].language).toBe('typescript');
    });
  });

  describe('removal', () => {
    it('should remove chunks by file path', async () => {
      const chunks: Chunk[] = [
        {
          id: 'keep.ts:1-10',
          content: 'keep',
          filePath: 'keep.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
        {
          id: 'remove.ts:1-10',
          content: 'remove',
          filePath: 'remove.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
      ];
      
      const embeddings: EmbeddingResult[] = [
        { chunkId: 'keep.ts:1-10', embedding: new Array(384).fill(0.1) },
        { chunkId: 'remove.ts:1-10', embedding: new Array(384).fill(0.2) },
      ];
      
      await store.addCodebaseEmbeddings(chunks, embeddings);
      await store.removeByFiles(['remove.ts']);
      
      const results = await store.search(new Array(384).fill(0.1), { topK: 10 });
      expect(results.length).toBe(1);
      expect(results[0].filePath).toBe('keep.ts');
    });
  });

  describe('statistics', () => {
    it('should return correct stats', async () => {
      const chunks: Chunk[] = [
        {
          id: 'test.ts:1-10',
          content: 'test',
          filePath: 'test.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
      ];
      
      const embeddings: EmbeddingResult[] = [
        { chunkId: 'test.ts:1-10', embedding: new Array(384).fill(0.1) },
      ];
      
      await store.addCodebaseEmbeddings(chunks, embeddings);
      
      const stats = await store.getStats();
      expect(stats.codebaseChunks).toBe(1);
      expect(stats.indexSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should clear all tables', async () => {
      const chunks: Chunk[] = [
        {
          id: 'test.ts:1-10',
          content: 'test',
          filePath: 'test.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
      ];
      
      const embeddings: EmbeddingResult[] = [
        { chunkId: 'test.ts:1-10', embedding: new Array(384).fill(0.1) },
      ];
      
      await store.addCodebaseEmbeddings(chunks, embeddings);
      await store.clear();
      
      const stats = await store.getStats();
      expect(stats.codebaseChunks).toBe(0);
    });
  });
});
