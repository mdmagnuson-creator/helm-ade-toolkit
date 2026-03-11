/**
 * semantic_search - MCP tool for AI agents
 * 
 * This module exports the semantic_search tool definition and handler
 * that can be registered with an MCP server.
 */

import { searchIndex } from './index.js';
import { getStatus } from './index.js';
import path from 'path';
import fs from 'fs';

export interface SemanticSearchInput {
  query: string;
  filters?: {
    filePatterns?: string[];
    languages?: string[];
    contentType?: 'code' | 'schema' | 'config' | 'docs';
  };
  topK?: number;
  projectPath?: string;
}

export interface SemanticSearchResult {
  results: Array<{
    content: string;
    filePath: string;
    lineRange: [number, number];
    language: string;
    score: number;
    type: string;
    context?: string;
  }>;
  indexAge: string;
  queryTime: number;
  indexStatus: 'fresh' | 'stale' | 'missing';
}

/**
 * Tool definition for MCP registration
 */
export const semanticSearchToolDefinition = {
  name: 'semantic_search',
  description: `Search the codebase semantically using natural language queries.
Returns relevant code snippets, documentation, and database schema based on meaning, not just keywords.

Use this tool when you need to:
- Understand how a feature is implemented
- Find code related to a concept
- Discover patterns and conventions
- Locate relevant database tables/columns

Requires vectorization to be enabled in project.json.`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query describing what you\'re looking for',
      },
      filters: {
        type: 'object',
        properties: {
          filePatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Glob patterns to filter files (e.g., ["src/auth/**", "*.ts"])',
          },
          languages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by programming language (e.g., ["typescript", "python"])',
          },
          contentType: {
            type: 'string',
            enum: ['code', 'schema', 'config', 'docs'],
            description: 'Filter by content type',
          },
        },
      },
      topK: {
        type: 'number',
        description: 'Maximum number of results to return (default: 20)',
      },
      projectPath: {
        type: 'string',
        description: 'Path to the project root (defaults to current working directory)',
      },
    },
    required: ['query'],
  },
};

/**
 * Handle semantic_search tool invocation
 */
export async function handleSemanticSearch(
  input: SemanticSearchInput
): Promise<SemanticSearchResult> {
  const startTime = Date.now();
  const projectPath = input.projectPath || process.cwd();
  
  // Check if vectorization is enabled
  const indexDir = path.join(projectPath, '.vectorindex');
  const metadataPath = path.join(indexDir, 'metadata.json');
  
  if (!fs.existsSync(metadataPath)) {
    return {
      results: [],
      indexAge: 'N/A',
      queryTime: Date.now() - startTime,
      indexStatus: 'missing',
    };
  }
  
  // Check index age
  let indexStatus: 'fresh' | 'stale' = 'fresh';
  let indexAge = '';
  
  try {
    const status = await getStatus(projectPath);
    indexAge = status.lastUpdated;
    indexStatus = status.isStale ? 'stale' : 'fresh';
  } catch {
    // Continue with search anyway
  }
  
  // Perform search
  const results = await searchIndex(projectPath, input.query, {
    topK: input.topK,
    contentType: input.filters?.contentType,
    language: input.filters?.languages?.[0], // Currently supports single language
    filePatterns: input.filters?.filePatterns,
  });
  
  return {
    results: results.map(r => ({
      content: r.content,
      filePath: r.filePath,
      lineRange: [r.lineStart, r.lineEnd],
      language: r.language,
      score: r.score,
      type: r.type,
      context: r.context,
    })),
    indexAge,
    queryTime: Date.now() - startTime,
    indexStatus,
  };
}

/**
 * Format search results for display in agent context
 */
export function formatSearchResults(result: SemanticSearchResult): string {
  if (result.indexStatus === 'missing') {
    return `⚠️ Vector index not found. Run 'vectorize init' to enable semantic search.`;
  }
  
  if (result.results.length === 0) {
    return `No results found. Try rephrasing your query or checking 'vectorize status'.`;
  }
  
  const lines: string[] = [];
  
  if (result.indexStatus === 'stale') {
    lines.push(`⚠️ Index is stale (last updated: ${result.indexAge}). Consider running 'vectorize refresh'.`);
    lines.push('');
  }
  
  lines.push(`Found ${result.results.length} results (${result.queryTime}ms):`);
  lines.push('');
  
  for (let i = 0; i < result.results.length; i++) {
    const r = result.results[i];
    lines.push(`${i + 1}. **${r.filePath}** (lines ${r.lineRange[0]}-${r.lineRange[1]}) [score: ${r.score.toFixed(2)}]`);
    
    if (r.context) {
      lines.push(`   _${r.context}_`);
    }
    
    // Show preview (first 3 lines)
    const preview = r.content.split('\n').slice(0, 3).join('\n');
    lines.push('   ```' + r.language);
    lines.push('   ' + preview.replace(/\n/g, '\n   '));
    lines.push('   ```');
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Check if semantic search is available for a project
 */
export function isSemanticSearchAvailable(projectPath: string): boolean {
  const indexDir = path.join(projectPath, '.vectorindex');
  const metadataPath = path.join(indexDir, 'metadata.json');
  return fs.existsSync(metadataPath);
}

/**
 * Get semantic search status for a project
 */
export async function getSemanticSearchStatus(projectPath: string): Promise<{
  available: boolean;
  enabled: boolean;
  indexExists: boolean;
  isStale: boolean;
  lastUpdated?: string;
  chunkCount?: number;
}> {
  const indexDir = path.join(projectPath, '.vectorindex');
  const metadataPath = path.join(indexDir, 'metadata.json');
  const projectJsonPath = path.join(projectPath, 'docs', 'project.json');
  
  // Check if enabled in project.json
  let enabled = false;
  if (fs.existsSync(projectJsonPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
      enabled = config.vectorization?.enabled === true;
    } catch {
      // Ignore parse errors
    }
  }
  
  // Check if index exists
  const indexExists = fs.existsSync(metadataPath);
  
  if (!indexExists) {
    return {
      available: false,
      enabled,
      indexExists: false,
      isStale: false,
    };
  }
  
  // Get index metadata
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const lastUpdated = new Date(metadata.lastUpdated);
    const ageMs = Date.now() - lastUpdated.getTime();
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours default
    
    return {
      available: true,
      enabled,
      indexExists: true,
      isStale: ageMs > maxAgeMs,
      lastUpdated: metadata.lastUpdated,
      chunkCount: metadata.codebase?.chunks || 0,
    };
  } catch {
    return {
      available: false,
      enabled,
      indexExists: true,
      isStale: true,
    };
  }
}
