/**
 * Configuration loading and saving for vectorization
 */

import fs from 'fs';
import path from 'path';

export interface VectorizationConfig {
  enabled?: boolean;
  storage?: 'local' | 'cloud';
  embeddingModel?: 'auto' | 'openai' | 'voyage' | 'ollama';
  contextualRetrieval?: 'auto' | 'always' | 'never';
  
  codebase?: {
    include?: string[];
    exclude?: string[];
    chunkStrategy?: 'ast' | 'sliding-window';
    indexTests?: boolean; // default true
  };
  
  relationships?: {
    callGraph?: boolean; // default true
    dependencies?: boolean; // default true
    testMapping?: boolean; // default true
  };
  
  gitHistory?: {
    enabled?: boolean; // default true
    depth?: number; // default 500
  };
  
  architectureSummary?: {
    enabled?: boolean; // default true
    refreshInterval?: 'daily' | 'weekly' | 'monthly' | 'manual'; // default weekly
  };
  
  database?: {
    enabled?: boolean;
    connection?: string;
    type?: 'postgres' | 'mysql' | 'sqlite';
    schema?: {
      enabled?: boolean;
      include?: string[];
      exclude?: string[];
    };
    configTables?: Array<{
      table: string;
      description?: string;
      sampleRows?: number | 'all';
    }>;
  };
  
  search?: {
    hybridWeight?: number;
    topK?: number;
    reranking?: {
      enabled?: boolean;
      model?: 'cohere' | 'cross-encoder';
    };
  };
  
  refresh?: {
    onGitChange?: boolean;
    onSessionStart?: boolean;
    maxAge?: string;
  };
  
  cloud?: {
    provider?: 'pinecone' | 'weaviate';
    credentials?: string;
    namespace?: string;
  };
  
  credentials?: {
    openai?: string;
    anthropic?: string;
    voyage?: string;
    cohere?: string;
  };
}

export interface ProjectConfig {
  name?: string;
  vectorization?: VectorizationConfig;
  [key: string]: unknown;
}

/**
 * Load project configuration from docs/project.json
 */
export async function loadProjectConfig(projectRoot: string): Promise<ProjectConfig> {
  const projectJsonPath = path.join(projectRoot, 'docs', 'project.json');
  
  if (!fs.existsSync(projectJsonPath)) {
    // Try root level
    const rootPath = path.join(projectRoot, 'project.json');
    if (fs.existsSync(rootPath)) {
      return JSON.parse(fs.readFileSync(rootPath, 'utf-8'));
    }
    return {};
  }
  
  return JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
}

/**
 * Save project configuration to docs/project.json
 */
export async function saveProjectConfig(projectRoot: string, config: ProjectConfig): Promise<void> {
  const docsDir = path.join(projectRoot, 'docs');
  const projectJsonPath = path.join(docsDir, 'project.json');
  
  // Ensure docs directory exists
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  
  fs.writeFileSync(projectJsonPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Get credential value from config (resolves env: references)
 */
export function resolveCredential(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  if (value.startsWith('env:')) {
    const envVar = value.substring(4);
    return process.env[envVar];
  }
  
  return value;
}
