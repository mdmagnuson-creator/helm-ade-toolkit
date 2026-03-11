/**
 * BM25 keyword index for hybrid search
 * Uses a simple inverted index stored as JSON
 */

import fs from 'fs';
import path from 'path';
import { Chunk } from './chunker.js';

interface BM25Index {
  version: string;
  k1: number;
  b: number;
  avgDocLength: number;
  docCount: number;
  docLengths: Record<string, number>;
  termFreqs: Record<string, Record<string, number>>; // term -> docId -> freq
  docFreqs: Record<string, number>; // term -> num docs containing term
}

interface BM25Result {
  chunkId: string;
  score: number;
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'to', 'was', 'were', 'will', 'with', 'this', 'but', 'they',
  'have', 'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'can', 'just', 'should', 'now',
  // Code-specific stopwords
  'function', 'const', 'let', 'var', 'return', 'if', 'else', 'import',
  'export', 'default', 'class', 'new', 'async', 'await', 'try', 'catch',
  'throw', 'true', 'false', 'null', 'undefined', 'void', 'type',
]);

/**
 * Build BM25 index from chunks
 */
export async function buildBM25Index(indexDir: string, chunks: Chunk[]): Promise<void> {
  const bm25Dir = path.join(indexDir, 'bm25');
  
  if (!fs.existsSync(bm25Dir)) {
    fs.mkdirSync(bm25Dir, { recursive: true });
  }
  
  const index: BM25Index = {
    version: '1.0.0',
    k1: 1.5,
    b: 0.75,
    avgDocLength: 0,
    docCount: chunks.length,
    docLengths: {},
    termFreqs: {},
    docFreqs: {},
  };
  
  let totalLength = 0;
  
  // Build term frequencies and document lengths
  for (const chunk of chunks) {
    const tokens = tokenize(chunk.content);
    index.docLengths[chunk.id] = tokens.length;
    totalLength += tokens.length;
    
    const termCounts = new Map<string, number>();
    
    for (const token of tokens) {
      termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }
    
    for (const [term, count] of termCounts) {
      if (!index.termFreqs[term]) {
        index.termFreqs[term] = {};
        index.docFreqs[term] = 0;
      }
      
      index.termFreqs[term][chunk.id] = count;
      index.docFreqs[term]++;
    }
  }
  
  index.avgDocLength = chunks.length > 0 ? totalLength / chunks.length : 0;
  
  // Save index
  fs.writeFileSync(
    path.join(bm25Dir, 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  // Also save a term-to-chunks mapping for quick lookup
  const termChunks: Record<string, string[]> = {};
  for (const [term, docs] of Object.entries(index.termFreqs)) {
    termChunks[term] = Object.keys(docs);
  }
  
  fs.writeFileSync(
    path.join(bm25Dir, 'term-chunks.json'),
    JSON.stringify(termChunks)
  );
}

/**
 * Search BM25 index
 */
export async function searchBM25(
  indexDir: string,
  query: string,
  topK: number = 20
): Promise<BM25Result[]> {
  const indexPath = path.join(indexDir, 'bm25', 'index.json');
  
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  
  const index: BM25Index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const queryTokens = tokenize(query);
  
  // Find all documents containing any query term
  const candidateDocs = new Set<string>();
  for (const term of queryTokens) {
    if (index.termFreqs[term]) {
      for (const docId of Object.keys(index.termFreqs[term])) {
        candidateDocs.add(docId);
      }
    }
  }
  
  // Score each candidate
  const scores: BM25Result[] = [];
  
  for (const docId of candidateDocs) {
    let score = 0;
    const docLength = index.docLengths[docId];
    
    for (const term of queryTokens) {
      if (!index.termFreqs[term] || !index.termFreqs[term][docId]) continue;
      
      const tf = index.termFreqs[term][docId];
      const df = index.docFreqs[term];
      
      // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
      const idf = Math.log(
        (index.docCount - df + 0.5) / (df + 0.5) + 1
      );
      
      // TF normalization: (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLength / avgDocLength))
      const tfNorm = (tf * (index.k1 + 1)) / (
        tf + index.k1 * (1 - index.b + index.b * docLength / index.avgDocLength)
      );
      
      score += idf * tfNorm;
    }
    
    if (score > 0) {
      scores.push({ chunkId: docId, score });
    }
  }
  
  // Sort by score descending and return top K
  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Tokenize text for indexing/searching
 */
function tokenize(text: string): string[] {
  // First, handle camelCase before any splitting
  // Insert space before uppercase letters
  const withSpaces = text.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Split on non-alphanumeric characters and lowercase
  const tokens = withSpaces.toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(t => t.length > 1);
  
  // Handle snake_case
  const expanded: string[] = [];
  
  for (const token of tokens) {
    // Skip stopwords
    if (STOPWORDS.has(token)) continue;
    
    expanded.push(token);
    
    // Split snake_case
    const snakeParts = token.split('_');
    if (snakeParts.length > 1) {
      for (const part of snakeParts) {
        if (part.length > 1 && !STOPWORDS.has(part)) {
          expanded.push(part);
        }
      }
    }
  }
  
  return expanded;
}

/**
 * Get BM25 index stats
 */
export function getBM25Stats(indexDir: string): { terms: number; docs: number } | null {
  const indexPath = path.join(indexDir, 'bm25', 'index.json');
  
  if (!fs.existsSync(indexPath)) {
    return null;
  }
  
  const index: BM25Index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  
  return {
    terms: Object.keys(index.termFreqs).length,
    docs: index.docCount,
  };
}
