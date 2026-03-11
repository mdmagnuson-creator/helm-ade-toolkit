/**
 * Tests for contextual retrieval preprocessing
 */
import { describe, it, expect } from 'vitest';
import { estimateContextualCost, formatCostEstimate, shouldEnableContextual, estimateTotalTokens, } from './contextual.js';
describe('estimateContextualCost', () => {
    it('should estimate cost for single file with single chunk', () => {
        const chunks = [
            {
                id: 'test.ts:1-10',
                content: 'function hello() { return "world"; }',
                filePath: 'src/test.ts',
                lineRange: [1, 10],
                language: 'typescript',
                type: 'code',
            },
        ];
        const estimate = estimateContextualCost(chunks);
        expect(estimate.totalChunks).toBe(1);
        expect(estimate.totalFiles).toBe(1);
        expect(estimate.estimatedCostUSD).toBeGreaterThan(0);
        expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
        expect(estimate.estimatedOutputTokens).toBeGreaterThan(0);
    });
    it('should estimate cost for multiple chunks in same file', () => {
        const chunks = [
            {
                id: 'test.ts:1-10',
                content: 'function hello() { return "world"; }',
                filePath: 'src/test.ts',
                lineRange: [1, 10],
                language: 'typescript',
                type: 'code',
            },
            {
                id: 'test.ts:11-20',
                content: 'function goodbye() { return "farewell"; }',
                filePath: 'src/test.ts',
                lineRange: [11, 20],
                language: 'typescript',
                type: 'code',
            },
            {
                id: 'test.ts:21-30',
                content: 'function greet(name: string) { return `Hello ${name}`; }',
                filePath: 'src/test.ts',
                lineRange: [21, 30],
                language: 'typescript',
                type: 'code',
            },
        ];
        const estimate = estimateContextualCost(chunks);
        expect(estimate.totalChunks).toBe(3);
        expect(estimate.totalFiles).toBe(1);
        // Cache read should be for 2 chunks (first chunk writes, subsequent read)
        expect(estimate.estimatedCacheReadTokens).toBeGreaterThan(0);
        expect(estimate.estimatedCacheWriteTokens).toBeGreaterThan(0);
    });
    it('should estimate cost for chunks across multiple files', () => {
        const chunks = [
            {
                id: 'auth.ts:1-10',
                content: 'function login() {}',
                filePath: 'src/auth.ts',
                lineRange: [1, 10],
                language: 'typescript',
                type: 'code',
            },
            {
                id: 'auth.ts:11-20',
                content: 'function logout() {}',
                filePath: 'src/auth.ts',
                lineRange: [11, 20],
                language: 'typescript',
                type: 'code',
            },
            {
                id: 'user.ts:1-10',
                content: 'function getUser() {}',
                filePath: 'src/user.ts',
                lineRange: [1, 10],
                language: 'typescript',
                type: 'code',
            },
        ];
        const estimate = estimateContextualCost(chunks);
        expect(estimate.totalChunks).toBe(3);
        expect(estimate.totalFiles).toBe(2);
        // 2 cache writes (one per file), 1 cache read (second chunk of auth.ts)
    });
    it('should include breakdown of costs', () => {
        const chunks = [
            {
                id: 'test.ts:1-10',
                content: 'function hello() {}',
                filePath: 'src/test.ts',
                lineRange: [1, 10],
                language: 'typescript',
                type: 'code',
            },
        ];
        const estimate = estimateContextualCost(chunks);
        expect(estimate.breakdown).toBeDefined();
        expect(estimate.breakdown.inputCost).toBeGreaterThanOrEqual(0);
        expect(estimate.breakdown.outputCost).toBeGreaterThanOrEqual(0);
        expect(estimate.breakdown.cacheWriteCost).toBeGreaterThanOrEqual(0);
        expect(estimate.breakdown.cacheReadCost).toBeGreaterThanOrEqual(0);
        // Total should equal sum of breakdown
        const totalFromBreakdown = estimate.breakdown.inputCost +
            estimate.breakdown.outputCost +
            estimate.breakdown.cacheWriteCost +
            estimate.breakdown.cacheReadCost;
        expect(estimate.estimatedCostUSD).toBeCloseTo(totalFromBreakdown, 10);
    });
    it('should handle empty chunks array', () => {
        const estimate = estimateContextualCost([]);
        expect(estimate.totalChunks).toBe(0);
        expect(estimate.totalFiles).toBe(0);
        expect(estimate.estimatedCostUSD).toBe(0);
    });
    it('should scale cost with number of chunks', () => {
        const smallChunks = Array.from({ length: 10 }, (_, i) => ({
            id: `test.ts:${i * 10}-${i * 10 + 10}`,
            content: `function func${i}() {}`,
            filePath: 'src/test.ts',
            lineRange: [i * 10, i * 10 + 10],
            language: 'typescript',
            type: 'code',
        }));
        const largeChunks = Array.from({ length: 100 }, (_, i) => ({
            id: `test.ts:${i * 10}-${i * 10 + 10}`,
            content: `function func${i}() {}`,
            filePath: 'src/test.ts',
            lineRange: [i * 10, i * 10 + 10],
            language: 'typescript',
            type: 'code',
        }));
        const smallEstimate = estimateContextualCost(smallChunks);
        const largeEstimate = estimateContextualCost(largeChunks);
        // Large should cost more than small
        expect(largeEstimate.estimatedCostUSD).toBeGreaterThan(smallEstimate.estimatedCostUSD);
    });
    it('should benefit from caching across multiple chunks per file', () => {
        // Single chunk per file (no cache benefit)
        const singlePerFile = Array.from({ length: 10 }, (_, i) => ({
            id: `file${i}.ts:1-10`,
            content: `function func${i}() {}`,
            filePath: `src/file${i}.ts`,
            lineRange: [1, 10],
            language: 'typescript',
            type: 'code',
        }));
        // Multiple chunks per file (cache benefit)
        const multiplePerFile = Array.from({ length: 10 }, (_, i) => ({
            id: `single.ts:${i * 10}-${i * 10 + 10}`,
            content: `function func${i}() {}`,
            filePath: 'src/single.ts',
            lineRange: [i * 10, i * 10 + 10],
            language: 'typescript',
            type: 'code',
        }));
        const singleEstimate = estimateContextualCost(singlePerFile);
        const multipleEstimate = estimateContextualCost(multiplePerFile);
        // Multiple chunks per file should have more cache reads
        expect(multipleEstimate.estimatedCacheReadTokens).toBeGreaterThan(singleEstimate.estimatedCacheReadTokens);
        // And fewer cache writes
        expect(multipleEstimate.estimatedCacheWriteTokens).toBeLessThan(singleEstimate.estimatedCacheWriteTokens);
    });
});
describe('formatCostEstimate', () => {
    it('should format estimate as readable string', () => {
        const estimate = {
            totalChunks: 100,
            totalFiles: 10,
            estimatedInputTokens: 50000,
            estimatedOutputTokens: 7500,
            estimatedCacheWriteTokens: 20000,
            estimatedCacheReadTokens: 180000,
            estimatedCostUSD: 0.25,
            breakdown: {
                inputCost: 0.01,
                outputCost: 0.009,
                cacheWriteCost: 0.006,
                cacheReadCost: 0.005,
            },
        };
        const formatted = formatCostEstimate(estimate);
        expect(formatted).toContain('100');
        expect(formatted).toContain('10 files');
        expect(formatted).toContain('$0.25');
        expect(formatted).toContain('50,000');
    });
    it('should handle zero values', () => {
        const estimate = {
            totalChunks: 0,
            totalFiles: 0,
            estimatedInputTokens: 0,
            estimatedOutputTokens: 0,
            estimatedCacheWriteTokens: 0,
            estimatedCacheReadTokens: 0,
            estimatedCostUSD: 0,
            breakdown: {
                inputCost: 0,
                outputCost: 0,
                cacheWriteCost: 0,
                cacheReadCost: 0,
            },
        };
        const formatted = formatCostEstimate(estimate);
        expect(formatted).toContain('0');
        expect(formatted).toContain('$0.00');
    });
    it('should format large numbers with commas', () => {
        const estimate = {
            totalChunks: 1000,
            totalFiles: 50,
            estimatedInputTokens: 1500000,
            estimatedOutputTokens: 75000,
            estimatedCacheWriteTokens: 100000,
            estimatedCacheReadTokens: 4000000,
            estimatedCostUSD: 2.50,
            breakdown: {
                inputCost: 0.375,
                outputCost: 0.094,
                cacheWriteCost: 0.03,
                cacheReadCost: 0.12,
            },
        };
        const formatted = formatCostEstimate(estimate);
        expect(formatted).toContain('1,500,000');
        expect(formatted).toContain('$2.50');
    });
});
describe('shouldEnableContextual', () => {
    it('should return true for "always" setting', () => {
        expect(shouldEnableContextual('always', 0)).toBe(true);
        expect(shouldEnableContextual('always', 100000)).toBe(true);
    });
    it('should return false for "never" setting', () => {
        expect(shouldEnableContextual('never', 0)).toBe(false);
        expect(shouldEnableContextual('never', 100000)).toBe(false);
    });
    it('should return true for "auto" when tokens > 50k', () => {
        expect(shouldEnableContextual('auto', 50001)).toBe(true);
        expect(shouldEnableContextual('auto', 100000)).toBe(true);
    });
    it('should return false for "auto" when tokens <= 50k', () => {
        expect(shouldEnableContextual('auto', 50000)).toBe(false);
        expect(shouldEnableContextual('auto', 10000)).toBe(false);
        expect(shouldEnableContextual('auto', 0)).toBe(false);
    });
    it('should handle edge case at exactly 50k', () => {
        expect(shouldEnableContextual('auto', 50000)).toBe(false);
    });
    it('should handle invalid setting as never', () => {
        // @ts-expect-error Testing invalid input
        expect(shouldEnableContextual('invalid', 100000)).toBe(false);
    });
});
describe('estimateTotalTokens', () => {
    it('should estimate tokens based on content length', () => {
        const chunks = [
            {
                id: 'test.ts:1-10',
                content: 'a'.repeat(400), // 400 chars = ~100 tokens
                filePath: 'src/test.ts',
                lineRange: [1, 10],
                language: 'typescript',
                type: 'code',
            },
        ];
        const tokens = estimateTotalTokens(chunks);
        // 400 chars / 4 = 100 tokens
        expect(tokens).toBe(100);
    });
    it('should sum tokens across multiple chunks', () => {
        const chunks = [
            {
                id: 'test.ts:1-10',
                content: 'a'.repeat(400),
                filePath: 'src/test.ts',
                lineRange: [1, 10],
                language: 'typescript',
                type: 'code',
            },
            {
                id: 'test.ts:11-20',
                content: 'b'.repeat(800),
                filePath: 'src/test.ts',
                lineRange: [11, 20],
                language: 'typescript',
                type: 'code',
            },
        ];
        const tokens = estimateTotalTokens(chunks);
        // (400 + 800) / 4 = 300 tokens
        expect(tokens).toBe(300);
    });
    it('should return 0 for empty array', () => {
        expect(estimateTotalTokens([])).toBe(0);
    });
    it('should round up partial tokens', () => {
        const chunks = [
            {
                id: 'test.ts:1-10',
                content: 'abc', // 3 chars = 0.75 tokens, rounded to 1
                filePath: 'src/test.ts',
                lineRange: [1, 10],
                language: 'typescript',
                type: 'code',
            },
        ];
        const tokens = estimateTotalTokens(chunks);
        expect(tokens).toBe(1);
    });
    it('should handle chunks with empty content', () => {
        const chunks = [
            {
                id: 'test.ts:1-10',
                content: '',
                filePath: 'src/test.ts',
                lineRange: [1, 10],
                language: 'typescript',
                type: 'code',
            },
        ];
        const tokens = estimateTotalTokens(chunks);
        expect(tokens).toBe(0);
    });
});
describe('integration scenarios', () => {
    it('should enable contextual for large codebase automatically', () => {
        // Simulate a large codebase with 1000 chunks averaging 200 tokens each
        const chunks = Array.from({ length: 1000 }, (_, i) => ({
            id: `file${i}.ts:1-10`,
            content: 'x'.repeat(800), // ~200 tokens per chunk
            filePath: `src/file${i}.ts`,
            lineRange: [1, 10],
            language: 'typescript',
            type: 'code',
        }));
        const totalTokens = estimateTotalTokens(chunks);
        const shouldEnable = shouldEnableContextual('auto', totalTokens);
        expect(totalTokens).toBe(200000); // 1000 * 200
        expect(shouldEnable).toBe(true);
    });
    it('should not enable contextual for small codebase', () => {
        // Simulate a small codebase with 10 chunks averaging 200 tokens each
        const chunks = Array.from({ length: 10 }, (_, i) => ({
            id: `file${i}.ts:1-10`,
            content: 'x'.repeat(800), // ~200 tokens per chunk
            filePath: `src/file${i}.ts`,
            lineRange: [1, 10],
            language: 'typescript',
            type: 'code',
        }));
        const totalTokens = estimateTotalTokens(chunks);
        const shouldEnable = shouldEnableContextual('auto', totalTokens);
        expect(totalTokens).toBe(2000); // 10 * 200
        expect(shouldEnable).toBe(false);
    });
    it('should estimate reasonable cost for medium project', () => {
        // Simulate a medium project: 50 files, ~10 chunks each = 500 chunks
        const chunks = [];
        for (let f = 0; f < 50; f++) {
            for (let c = 0; c < 10; c++) {
                chunks.push({
                    id: `file${f}.ts:${c * 10}-${c * 10 + 10}`,
                    content: 'function example() { /* code */ }',
                    filePath: `src/file${f}.ts`,
                    lineRange: [c * 10, c * 10 + 10],
                    language: 'typescript',
                    type: 'code',
                });
            }
        }
        const estimate = estimateContextualCost(chunks);
        expect(estimate.totalChunks).toBe(500);
        expect(estimate.totalFiles).toBe(50);
        // Cost should be reasonable (under $1 for medium project)
        expect(estimate.estimatedCostUSD).toBeLessThan(1);
        expect(estimate.estimatedCostUSD).toBeGreaterThan(0);
    });
    it('should estimate cost for large project', () => {
        // Simulate a large project: 100 files, ~50 chunks each = 5000 chunks
        const chunks = [];
        for (let f = 0; f < 100; f++) {
            for (let c = 0; c < 50; c++) {
                chunks.push({
                    id: `file${f}.ts:${c * 10}-${c * 10 + 10}`,
                    content: 'function example() { /* longer code block with more content */ }',
                    filePath: `src/file${f}.ts`,
                    lineRange: [c * 10, c * 10 + 10],
                    language: 'typescript',
                    type: 'code',
                });
            }
        }
        const estimate = estimateContextualCost(chunks);
        expect(estimate.totalChunks).toBe(5000);
        expect(estimate.totalFiles).toBe(100);
        // Large project should still be affordable (under $10)
        expect(estimate.estimatedCostUSD).toBeLessThan(10);
        expect(estimate.estimatedCostUSD).toBeGreaterThan(0);
    });
});
// Note: addContextualDescriptions integration tests require actual API key
// and are in a separate e2e test file (similar to embeddings.test.ts)
describe('addContextualDescriptions', () => {
    it('note: requires API key for integration testing', () => {
        // This is a placeholder to document that addContextualDescriptions
        // needs real API credentials to test properly.
        // Integration tests are in a separate e2e test suite.
        expect(true).toBe(true);
    });
});
//# sourceMappingURL=contextual.test.js.map