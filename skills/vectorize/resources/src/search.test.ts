/**
 * Tests for hybrid search
 */

import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion } from './search';

// Note: Full integration tests require embedding API keys and are in e2e tests.
// These unit tests focus on the rank fusion logic.

describe('search', () => {
  describe('reciprocalRankFusion', () => {
    it('should combine rankings from multiple sources', () => {
      const ranking1 = new Map([
        ['doc1', 0.9],
        ['doc2', 0.7],
        ['doc3', 0.5],
      ]);

      const ranking2 = new Map([
        ['doc2', 0.95],
        ['doc1', 0.6],
        ['doc4', 0.4],
      ]);

      const fused = reciprocalRankFusion([ranking1, ranking2]);

      // All docs should be present
      expect(fused.has('doc1')).toBe(true);
      expect(fused.has('doc2')).toBe(true);
      expect(fused.has('doc3')).toBe(true);
      expect(fused.has('doc4')).toBe(true);
    });

    it('should rank docs appearing in multiple lists higher', () => {
      const ranking1 = new Map([
        ['doc1', 0.9],
        ['doc2', 0.7],
      ]);

      const ranking2 = new Map([
        ['doc1', 0.8],
        ['doc3', 0.6],
      ]);

      const fused = reciprocalRankFusion([ranking1, ranking2]);

      // doc1 appears in both lists, should have highest score
      const scores = [...fused.entries()].sort((a, b) => b[1] - a[1]);
      expect(scores[0][0]).toBe('doc1');
    });

    it('should handle empty rankings', () => {
      const ranking1 = new Map<string, number>();
      const fused = reciprocalRankFusion([ranking1]);
      expect(fused.size).toBe(0);
    });

    it('should handle single ranking', () => {
      const ranking = new Map([
        ['doc1', 0.9],
        ['doc2', 0.7],
      ]);

      const fused = reciprocalRankFusion([ranking]);

      expect(fused.size).toBe(2);
      // Higher scored doc should have higher RRF score
      expect(fused.get('doc1')!).toBeGreaterThan(fused.get('doc2')!);
    });

    it('should use configurable k parameter', () => {
      const ranking = new Map([
        ['doc1', 0.9],
        ['doc2', 0.7],
      ]);

      // With k=1, scores are: 1/(1+1)=0.5 for rank 1, 1/(1+2)=0.33 for rank 2
      const fusedK1 = reciprocalRankFusion([ranking], 1);
      
      // With k=60 (default), scores are: 1/(60+1)≈0.016, 1/(60+2)≈0.016
      const fusedK60 = reciprocalRankFusion([ranking], 60);

      // k=1 gives larger score difference between ranks
      const diffK1 = fusedK1.get('doc1')! - fusedK1.get('doc2')!;
      const diffK60 = fusedK60.get('doc1')! - fusedK60.get('doc2')!;
      
      expect(diffK1).toBeGreaterThan(diffK60);
    });

    it('should handle ties correctly', () => {
      const ranking = new Map([
        ['doc1', 0.9],
        ['doc2', 0.9], // Same score as doc1
        ['doc3', 0.7],
      ]);

      const fused = reciprocalRankFusion([ranking]);

      // All docs should have scores
      expect(fused.has('doc1')).toBe(true);
      expect(fused.has('doc2')).toBe(true);
      expect(fused.has('doc3')).toBe(true);
    });

    it('should combine three or more rankings', () => {
      const rankings = [
        new Map([['doc1', 1.0], ['doc2', 0.5]]),
        new Map([['doc2', 1.0], ['doc3', 0.5]]),
        new Map([['doc3', 1.0], ['doc1', 0.5]]),
      ];

      const fused = reciprocalRankFusion(rankings);

      // All docs appear twice, but at different ranks
      // doc1: rank 1 in list1, rank 2 in list3
      // doc2: rank 2 in list1, rank 1 in list2
      // doc3: rank 2 in list2, rank 1 in list3
      // All should have similar scores since each appears at rank 1 once and rank 2 once
      const scores = [...fused.values()];
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      
      // Scores should be close (same total RRF contribution)
      expect(maxScore - minScore).toBeLessThan(0.001);
    });
  });
});
