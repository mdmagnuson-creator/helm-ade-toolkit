/**
 * Codebase chunking with AST parsing
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

// Tree-sitter imports (conditional to avoid build issues)
let Parser: any;
let TypeScript: any;
let JavaScript: any;
let Python: any;
let Go: any;
let Rust: any;
let Java: any;

try {
  Parser = require('tree-sitter');
  TypeScript = require('tree-sitter-typescript').typescript;
  JavaScript = require('tree-sitter-javascript');
  Python = require('tree-sitter-python');
  Go = require('tree-sitter-go');
  Rust = require('tree-sitter-rust');
  Java = require('tree-sitter-java');
} catch {
  // Tree-sitter not available, will use sliding window
}

export interface FileInfo {
  path: string;
  absolutePath: string;
  content: string;
  language: string;
}

export interface Chunk {
  id: string;
  content: string;
  filePath: string;
  lineRange: [number, number];
  language: string;
  type: 'code' | 'schema' | 'config' | 'docs';
  context?: string; // Added by contextual retrieval
}

interface CodebaseConfig {
  include?: string[];
  exclude?: string[];
  chunkStrategy?: 'ast' | 'sliding-window';
}

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
};

/**
 * Scan codebase for files matching include/exclude patterns
 */
export async function scanCodebase(
  projectRoot: string,
  config: CodebaseConfig,
  filterFiles?: string[]
): Promise<FileInfo[]> {
  const include = config.include || ['src/**', 'lib/**', 'app/**', 'docs/**'];
  const exclude = config.exclude || ['node_modules/**', 'dist/**', 'build/**', '.git/**'];
  
  const files: FileInfo[] = [];
  
  for (const pattern of include) {
    const matches = await glob(pattern, {
      cwd: projectRoot,
      ignore: exclude,
      nodir: true,
      absolute: false,
    });
    
    for (const match of matches) {
      // If filterFiles provided, only include those
      if (filterFiles && !filterFiles.includes(match)) {
        continue;
      }
      
      const absolutePath = path.join(projectRoot, match);
      const ext = path.extname(match).toLowerCase();
      const language = LANGUAGE_MAP[ext] || 'unknown';
      
      try {
        const content = fs.readFileSync(absolutePath, 'utf-8');
        files.push({
          path: match,
          absolutePath,
          content,
          language,
        });
      } catch {
        // Skip files that can't be read
      }
    }
  }
  
  return files;
}

/**
 * Chunk files using the specified strategy
 */
export async function chunkFiles(
  files: FileInfo[],
  strategy: 'ast' | 'sliding-window'
): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  
  for (const file of files) {
    const fileChunks = strategy === 'ast' && canParseWithAST(file.language)
      ? await chunkWithAST(file)
      : chunkWithSlidingWindow(file);
    
    chunks.push(...fileChunks);
  }
  
  return chunks;
}

/**
 * Check if a language can be parsed with Tree-sitter
 */
function canParseWithAST(language: string): boolean {
  if (!Parser) return false;
  return ['typescript', 'javascript', 'python', 'go', 'rust', 'java'].includes(language);
}

/**
 * Get Tree-sitter language parser
 */
function getLanguageParser(language: string): any {
  switch (language) {
    case 'typescript': return TypeScript;
    case 'javascript': return JavaScript;
    case 'python': return Python;
    case 'go': return Go;
    case 'rust': return Rust;
    case 'java': return Java;
    default: return null;
  }
}

/**
 * Chunk file using AST parsing
 */
async function chunkWithAST(file: FileInfo): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  const languageParser = getLanguageParser(file.language);
  
  if (!languageParser) {
    return chunkWithSlidingWindow(file);
  }
  
  try {
    const parser = new Parser();
    parser.setLanguage(languageParser);
    const tree = parser.parse(file.content);
    
    // Extract semantic units based on language
    const nodes = extractSemanticNodes(tree.rootNode, file.language);
    
    for (const node of nodes) {
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const content = file.content.substring(node.startIndex, node.endIndex);
      
      // Skip very small chunks
      if (content.trim().length < 20) continue;
      
      // Split large chunks
      const tokenCount = estimateTokens(content);
      if (tokenCount > 500) {
        const subChunks = splitLargeChunk(content, file, startLine);
        chunks.push(...subChunks);
      } else {
        chunks.push({
          id: `${file.path}:${startLine}-${endLine}`,
          content,
          filePath: file.path,
          lineRange: [startLine, endLine],
          language: file.language,
          type: 'code',
        });
      }
    }
    
    // If no semantic nodes found, fall back to sliding window
    if (chunks.length === 0) {
      return chunkWithSlidingWindow(file);
    }
    
    return chunks;
  } catch {
    // Parse error, fall back to sliding window
    return chunkWithSlidingWindow(file);
  }
}

/**
 * Extract semantic nodes from AST
 */
function extractSemanticNodes(rootNode: any, language: string): any[] {
  const nodes: any[] = [];
  const nodeTypes = getSemanticNodeTypes(language);
  
  function traverse(node: any) {
    if (nodeTypes.includes(node.type)) {
      nodes.push(node);
      return; // Don't traverse children of semantic nodes
    }
    
    for (const child of node.children || []) {
      traverse(child);
    }
  }
  
  traverse(rootNode);
  return nodes;
}

/**
 * Get node types that represent semantic boundaries
 */
function getSemanticNodeTypes(language: string): string[] {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return [
        'function_declaration',
        'function_expression',
        'arrow_function',
        'method_definition',
        'class_declaration',
        'interface_declaration',
        'type_alias_declaration',
        'export_statement',
        'lexical_declaration', // const/let at top level
      ];
    case 'python':
      return [
        'function_definition',
        'class_definition',
        'decorated_definition',
      ];
    case 'go':
      return [
        'function_declaration',
        'method_declaration',
        'type_declaration',
        'const_declaration',
        'var_declaration',
      ];
    case 'rust':
      return [
        'function_item',
        'impl_item',
        'struct_item',
        'enum_item',
        'trait_item',
        'mod_item',
      ];
    case 'java':
      return [
        'method_declaration',
        'class_declaration',
        'interface_declaration',
        'constructor_declaration',
      ];
    default:
      return [];
  }
}

/**
 * Chunk file using sliding window
 */
function chunkWithSlidingWindow(file: FileInfo): Chunk[] {
  const chunks: Chunk[] = [];
  const lines = file.content.split('\n');
  const windowSize = 256; // tokens
  const overlap = 50; // tokens
  
  // For markdown, use section-based chunking
  if (file.language === 'markdown') {
    return chunkMarkdown(file);
  }
  
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let startLine = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = estimateTokens(line);
    
    if (currentTokens + lineTokens > windowSize && currentChunk.length > 0) {
      // Save current chunk
      const content = currentChunk.join('\n');
      chunks.push({
        id: `${file.path}:${startLine}-${startLine + currentChunk.length - 1}`,
        content,
        filePath: file.path,
        lineRange: [startLine, startLine + currentChunk.length - 1],
        language: file.language,
        type: file.language === 'markdown' ? 'docs' : 'code',
      });
      
      // Start new chunk with overlap
      const overlapLines = Math.ceil(overlap / 4); // ~4 tokens per line
      currentChunk = currentChunk.slice(-overlapLines);
      currentTokens = estimateTokens(currentChunk.join('\n'));
      startLine = i + 1 - overlapLines;
    }
    
    currentChunk.push(line);
    currentTokens += lineTokens;
  }
  
  // Save final chunk
  if (currentChunk.length > 0) {
    const content = currentChunk.join('\n');
    if (content.trim().length > 20) {
      chunks.push({
        id: `${file.path}:${startLine}-${startLine + currentChunk.length - 1}`,
        content,
        filePath: file.path,
        lineRange: [startLine, startLine + currentChunk.length - 1],
        language: file.language,
        type: file.language === 'markdown' ? 'docs' : 'code',
      });
    }
  }
  
  return chunks;
}

/**
 * Chunk markdown by sections
 */
function chunkMarkdown(file: FileInfo): Chunk[] {
  const chunks: Chunk[] = [];
  const lines = file.content.split('\n');
  
  let currentSection: string[] = [];
  let currentHeading = '';
  let startLine = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for heading
    if (line.match(/^#{1,3}\s/)) {
      // Save previous section
      if (currentSection.length > 0) {
        const content = currentSection.join('\n');
        if (content.trim().length > 20) {
          chunks.push({
            id: `${file.path}:${startLine}-${i}`,
            content,
            filePath: file.path,
            lineRange: [startLine, i],
            language: 'markdown',
            type: 'docs',
          });
        }
      }
      
      currentSection = [line];
      currentHeading = line;
      startLine = i + 1;
    } else {
      currentSection.push(line);
    }
  }
  
  // Save final section
  if (currentSection.length > 0) {
    const content = currentSection.join('\n');
    if (content.trim().length > 20) {
      chunks.push({
        id: `${file.path}:${startLine}-${lines.length}`,
        content,
        filePath: file.path,
        lineRange: [startLine, lines.length],
        language: 'markdown',
        type: 'docs',
      });
    }
  }
  
  return chunks;
}

/**
 * Split large chunk into smaller pieces with overlap
 */
function splitLargeChunk(content: string, file: FileInfo, startLine: number): Chunk[] {
  const chunks: Chunk[] = [];
  const lines = content.split('\n');
  const maxTokens = 500;
  const overlap = 50;
  
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let chunkStartLine = startLine;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = estimateTokens(line);
    
    if (currentTokens + lineTokens > maxTokens && currentChunk.length > 0) {
      const chunkContent = currentChunk.join('\n');
      chunks.push({
        id: `${file.path}:${chunkStartLine}-${chunkStartLine + currentChunk.length - 1}`,
        content: chunkContent,
        filePath: file.path,
        lineRange: [chunkStartLine, chunkStartLine + currentChunk.length - 1],
        language: file.language,
        type: 'code',
      });
      
      const overlapLines = Math.ceil(overlap / 4);
      currentChunk = currentChunk.slice(-overlapLines);
      currentTokens = estimateTokens(currentChunk.join('\n'));
      chunkStartLine = startLine + i - overlapLines;
    }
    
    currentChunk.push(line);
    currentTokens += lineTokens;
  }
  
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join('\n');
    if (chunkContent.trim().length > 20) {
      chunks.push({
        id: `${file.path}:${chunkStartLine}-${chunkStartLine + currentChunk.length - 1}`,
        content: chunkContent,
        filePath: file.path,
        lineRange: [chunkStartLine, chunkStartLine + currentChunk.length - 1],
        language: file.language,
        type: 'code',
      });
    }
  }
  
  return chunks;
}

/**
 * Estimate token count for text
 */
function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for code
  return Math.ceil(text.length / 4);
}
