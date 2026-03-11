/**
 * Tests for BM25 keyword index
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildBM25Index, searchBM25, getBM25Stats } from './bm25';
import { Chunk } from './chunker';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('BM25', () => {
  let testDir: string;

  beforeAll(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm25-test-'));
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('buildBM25Index', () => {
    it('should create BM25 index files', async () => {
      const indexDir = path.join(testDir, 'index1');
      const chunks: Chunk[] = [
        {
          id: 'test.ts:1-10',
          content: 'function calculateSum(a, b) { return a + b; }',
          filePath: 'test.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
      ];

      await buildBM25Index(indexDir, chunks);

      expect(fs.existsSync(path.join(indexDir, 'bm25', 'index.json'))).toBe(true);
      expect(fs.existsSync(path.join(indexDir, 'bm25', 'term-chunks.json'))).toBe(true);
    });

    it('should index terms correctly', async () => {
      const indexDir = path.join(testDir, 'index2');
      const chunks: Chunk[] = [
        {
          id: 'a.ts:1-10',
          content: 'function validateEmail(email) { return email.includes("@"); }',
          filePath: 'a.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
        {
          id: 'b.ts:1-10',
          content: 'function validatePhone(phone) { return phone.length === 10; }',
          filePath: 'b.ts',
          lineRange: [1, 10],
          language: 'typescript',
          type: 'code',
        },
      ];

      await buildBM25Index(indexDir, chunks);

      const stats = getBM25Stats(indexDir);
      expect(stats).not.toBeNull();
      expect(stats!.docs).toBe(2);
      expect(stats!.terms).toBeGreaterThan(0);
    });
  });

  describe('searchBM25', () => {
    let indexDir: string;

    beforeAll(async () => {
      indexDir = path.join(testDir, 'search-index');
      const chunks: Chunk[] = [
        {
          id: 'auth.ts:1-20',
          content: 'function authenticateUser(username, password) { return validateCredentials(username, password); }',
          filePath: 'auth.ts',
          lineRange: [1, 20],
          language: 'typescript',
          type: 'code',
        },
        {
          id: 'user.ts:1-20',
          content: 'function createUser(name, email) { return { id: generateId(), name, email }; }',
          filePath: 'user.ts',
          lineRange: [1, 20],
          language: 'typescript',
          type: 'code',
        },
        {
          id: 'validate.ts:1-20',
          content: 'function validateEmail(email) { return email.includes("@") && email.includes("."); }',
          filePath: 'validate.ts',
          lineRange: [1, 20],
          language: 'typescript',
          type: 'code',
        },
      ];

      await buildBM25Index(indexDir, chunks);
    });

    it('should find exact term matches', async () => {
      const results = await searchBM25(indexDir, 'authenticateUser', 10);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunkId).toBe('auth.ts:1-20');
    });

    it('should find related terms', async () => {
      const results = await searchBM25(indexDir, 'email validation', 10);
      
      expect(results.length).toBeGreaterThan(0);
      // Should find validate.ts (has validateEmail)
      expect(results.some(r => r.chunkId === 'validate.ts:1-20')).toBe(true);
    });

    it('should return empty for non-matching query', async () => {
      const results = await searchBM25(indexDir, 'xyznonexistent123', 10);
      
      expect(results.length).toBe(0);
    });

    it('should respect topK limit', async () => {
      const results = await searchBM25(indexDir, 'user email', 1);
      
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should rank more relevant results higher', async () => {
      const results = await searchBM25(indexDir, 'createUser name email', 10);
      
      // user.ts should be the top result (has all terms)
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunkId).toBe('user.ts:1-20');
    });
  });

  describe('getBM25Stats', () => {
    it('should return null for non-existent index', () => {
      const stats = getBM25Stats('/nonexistent/path');
      expect(stats).toBeNull();
    });

    it('should return correct stats for existing index', async () => {
      const indexDir = path.join(testDir, 'stats-index');
      const chunks: Chunk[] = [
        { id: '1', content: 'hello world', filePath: 'a.ts', lineRange: [1, 1], language: 'typescript', type: 'code' },
        { id: '2', content: 'hello there', filePath: 'b.ts', lineRange: [1, 1], language: 'typescript', type: 'code' },
      ];

      await buildBM25Index(indexDir, chunks);

      const stats = getBM25Stats(indexDir);
      expect(stats).not.toBeNull();
      expect(stats!.docs).toBe(2);
      expect(stats!.terms).toBe(3); // hello, world, there (stopwords filtered)
    });
  });

  describe('tokenization', () => {
    it('should handle camelCase splitting', async () => {
      const indexDir = path.join(testDir, 'camel-index');
      const chunks: Chunk[] = [
        { id: '1', content: 'getUserById findAllUsers', filePath: 'a.ts', lineRange: [1, 1], language: 'typescript', type: 'code' },
      ];

      await buildBM25Index(indexDir, chunks);

      // Should find by camelCase parts
      const results = await searchBM25(indexDir, 'user', 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle snake_case splitting', async () => {
      const indexDir = path.join(testDir, 'snake-index');
      const chunks: Chunk[] = [
        { id: '1', content: 'get_user_by_id find_all_users', filePath: 'a.py', lineRange: [1, 1], language: 'python', type: 'code' },
      ];

      await buildBM25Index(indexDir, chunks);

      // Should find by snake_case parts
      const results = await searchBM25(indexDir, 'user', 10);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
