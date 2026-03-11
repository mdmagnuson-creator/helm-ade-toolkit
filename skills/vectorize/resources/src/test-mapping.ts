/**
 * Test-to-code mapping
 * 
 * Extracts relationships between test files and source code they test.
 * Supports Jest, Vitest, Playwright, pytest, and go test.
 */

import fs from 'fs';
import path from 'path';
import { FileInfo } from './chunker.js';
import { TestMappingRecord } from './store.js';

// Tree-sitter imports (conditional)
let Parser: any;
let TypeScript: any;
let JavaScript: any;
let Python: any;
let Go: any;

try {
  Parser = require('tree-sitter');
  TypeScript = require('tree-sitter-typescript').typescript;
  JavaScript = require('tree-sitter-javascript');
  Python = require('tree-sitter-python');
  Go = require('tree-sitter-go');
} catch {
  // Tree-sitter not available
}

export interface TestInfo {
  file: string;
  name: string;
  lineStart: number;
  lineEnd: number;
  description?: string;
  type: 'unit' | 'integration' | 'e2e';
}

export interface TestFramework {
  name: 'jest' | 'vitest' | 'playwright' | 'pytest' | 'gotest' | 'unknown';
  testPatterns: string[];
}

/**
 * Detect test framework from project configuration
 */
export function detectTestFramework(projectRoot: string): TestFramework {
  // Check for Vitest
  const vitestConfig = ['vite.config.ts', 'vite.config.js', 'vitest.config.ts', 'vitest.config.js'];
  for (const config of vitestConfig) {
    const configPath = path.join(projectRoot, config);
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      if (content.includes('vitest') || content.includes('test:')) {
        return {
          name: 'vitest',
          testPatterns: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
        };
      }
    }
  }

  // Check for Jest
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    if (packageJson.devDependencies?.jest || packageJson.dependencies?.jest) {
      return {
        name: 'jest',
        testPatterns: ['**/*.test.ts', '**/*.test.tsx', '**/*.test.js', '**/*.test.jsx', '**/*.spec.ts', '**/*.spec.js'],
      };
    }
    
    // Check for Playwright
    if (packageJson.devDependencies?.['@playwright/test'] || packageJson.dependencies?.['@playwright/test']) {
      return {
        name: 'playwright',
        testPatterns: ['**/*.spec.ts', '**/e2e/**/*.ts', '**/tests/**/*.ts'],
      };
    }
  }

  // Check for pytest (Python)
  const pytestConfig = ['pytest.ini', 'setup.cfg', 'pyproject.toml'];
  for (const config of pytestConfig) {
    const configPath = path.join(projectRoot, config);
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      if (content.includes('[pytest]') || content.includes('[tool.pytest]')) {
        return {
          name: 'pytest',
          testPatterns: ['**/test_*.py', '**/*_test.py', '**/tests/**/*.py'],
        };
      }
    }
  }
  
  // Check for Go tests
  const goMod = path.join(projectRoot, 'go.mod');
  if (fs.existsSync(goMod)) {
    return {
      name: 'gotest',
      testPatterns: ['**/*_test.go'],
    };
  }

  // Default fallback
  return {
    name: 'unknown',
    testPatterns: ['**/*.test.*', '**/*.spec.*', '**/test_*.*', '**/*_test.*'],
  };
}

/**
 * Check if a file is a test file
 */
export function isTestFile(filePath: string): boolean {
  const testPatterns = [
    /\.test\.(ts|tsx|js|jsx)$/,
    /\.spec\.(ts|tsx|js|jsx)$/,
    /test_.*\.py$/,
    /.*_test\.py$/,
    /.*_test\.go$/,
    /e2e\/.*\.(ts|tsx|js|jsx)$/,
    /tests\/.*\.(ts|tsx|js|jsx|py|go)$/,
  ];
  
  return testPatterns.some(pattern => pattern.test(filePath));
}

/**
 * Detect test type (unit, integration, e2e)
 */
export function detectTestType(filePath: string, content: string): 'unit' | 'integration' | 'e2e' {
  // E2E patterns - check for e2e directory or playwright path
  if (filePath.includes('/e2e/') || 
      filePath.startsWith('e2e/') ||
      filePath.includes('playwright') ||
      content.includes('page.goto') ||
      content.includes('browser.newPage') ||
      content.includes('cy.visit')) {
    return 'e2e';
  }
  
  // Integration patterns
  if (filePath.includes('/integration/') ||
      content.includes('supertest') ||
      content.includes('httptest') ||
      content.includes('TestClient')) {
    return 'integration';
  }
  
  return 'unit';
}

/**
 * Extract test definitions from a file
 */
export function extractTests(file: FileInfo): TestInfo[] {
  if (!isTestFile(file.path)) return [];
  
  const testType = detectTestType(file.path, file.content);
  
  switch (file.language) {
    case 'typescript':
    case 'javascript':
      return extractJsTests(file, testType);
    case 'python':
      return extractPythonTests(file, testType);
    case 'go':
      return extractGoTests(file, testType);
    default:
      return [];
  }
}

/**
 * Extract tests from JavaScript/TypeScript files
 */
function extractJsTests(file: FileInfo, testType: 'unit' | 'integration' | 'e2e'): TestInfo[] {
  const tests: TestInfo[] = [];
  
  if (!Parser || !TypeScript) {
    // Fallback to regex
    return extractJsTestsRegex(file, testType);
  }
  
  try {
    const parser = new Parser();
    parser.setLanguage(file.language === 'typescript' ? TypeScript : JavaScript);
    const tree = parser.parse(file.content);
    
    function traverse(node: any, describePath: string[] = []) {
      // Handle describe/context blocks
      if (node.type === 'call_expression') {
        const callee = node.childForFieldName('function');
        const args = node.childForFieldName('arguments');
        
        if (callee) {
          const calleeName = callee.text;
          
          // describe/context blocks
          if (calleeName === 'describe' || calleeName === 'context') {
            const describeArgs = args?.children || [];
            const nameArg = describeArgs.find((c: any) => c.type === 'string' || c.type === 'template_string');
            const describeName = nameArg?.text?.replace(/^['"`]|['"`]$/g, '') || '';
            
            // Find the callback body and traverse it
            const callbackArg = describeArgs.find((c: any) => 
              c.type === 'arrow_function' || c.type === 'function_expression'
            );
            if (callbackArg) {
              for (const child of callbackArg.children || []) {
                traverse(child, [...describePath, describeName]);
              }
            }
          }
          
          // test/it blocks
          if (calleeName === 'it' || calleeName === 'test' || 
              calleeName === 'it.only' || calleeName === 'test.only' ||
              calleeName === 'it.skip' || calleeName === 'test.skip') {
            const testArgs = args?.children || [];
            const nameArg = testArgs.find((c: any) => c.type === 'string' || c.type === 'template_string');
            const testName = nameArg?.text?.replace(/^['"`]|['"`]$/g, '') || '';
            
            const fullName = [...describePath, testName].filter(Boolean).join(' > ');
            
            tests.push({
              file: file.path,
              name: fullName || testName,
              lineStart: node.startPosition.row + 1,
              lineEnd: node.endPosition.row + 1,
              type: testType,
            });
          }
        }
      }
      
      // Traverse children
      for (const child of node.children || []) {
        traverse(child, describePath);
      }
    }
    
    traverse(tree.rootNode);
  } catch {
    return extractJsTestsRegex(file, testType);
  }
  
  return tests;
}

/**
 * Regex fallback for JS test extraction
 */
function extractJsTestsRegex(file: FileInfo, testType: 'unit' | 'integration' | 'e2e'): TestInfo[] {
  const tests: TestInfo[] = [];
  const lines = file.content.split('\n');
  
  const testPattern = /^\s*(it|test|describe|context)\s*\(\s*['"`]([^'"`]+)['"`]/;
  
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(testPattern);
    if (match && (match[1] === 'it' || match[1] === 'test')) {
      tests.push({
        file: file.path,
        name: match[2],
        lineStart: i + 1,
        lineEnd: i + 1, // Approximation
        type: testType,
      });
    }
  }
  
  return tests;
}

/**
 * Extract tests from Python files
 */
function extractPythonTests(file: FileInfo, testType: 'unit' | 'integration' | 'e2e'): TestInfo[] {
  const tests: TestInfo[] = [];
  
  if (!Parser || !Python) {
    return extractPythonTestsRegex(file, testType);
  }
  
  try {
    const parser = new Parser();
    parser.setLanguage(Python);
    const tree = parser.parse(file.content);
    
    function traverse(node: any, className?: string) {
      if (node.type === 'class_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode?.text?.startsWith('Test')) {
          const classBody = node.childForFieldName('body');
          if (classBody) {
            for (const child of classBody.children || []) {
              traverse(child, nameNode.text);
            }
          }
        }
      }
      
      if (node.type === 'function_definition') {
        const nameNode = node.childForFieldName('name');
        const funcName = nameNode?.text || '';
        
        if (funcName.startsWith('test_') || funcName.startsWith('test')) {
          const fullName = className ? `${className}::${funcName}` : funcName;
          
          tests.push({
            file: file.path,
            name: fullName,
            lineStart: node.startPosition.row + 1,
            lineEnd: node.endPosition.row + 1,
            type: testType,
          });
        }
      }
      
      for (const child of node.children || []) {
        traverse(child, className);
      }
    }
    
    traverse(tree.rootNode);
  } catch {
    return extractPythonTestsRegex(file, testType);
  }
  
  return tests;
}

/**
 * Regex fallback for Python test extraction
 */
function extractPythonTestsRegex(file: FileInfo, testType: 'unit' | 'integration' | 'e2e'): TestInfo[] {
  const tests: TestInfo[] = [];
  const lines = file.content.split('\n');
  
  const testPattern = /^\s*def\s+(test_\w+)\s*\(/;
  const classPattern = /^\s*class\s+(Test\w+)/;
  let currentClass = '';
  
  for (let i = 0; i < lines.length; i++) {
    const classMatch = lines[i].match(classPattern);
    if (classMatch) {
      currentClass = classMatch[1];
      continue;
    }
    
    const testMatch = lines[i].match(testPattern);
    if (testMatch) {
      const name = currentClass ? `${currentClass}::${testMatch[1]}` : testMatch[1];
      tests.push({
        file: file.path,
        name,
        lineStart: i + 1,
        lineEnd: i + 1,
        type: testType,
      });
    }
  }
  
  return tests;
}

/**
 * Extract tests from Go files
 */
function extractGoTests(file: FileInfo, testType: 'unit' | 'integration' | 'e2e'): TestInfo[] {
  const tests: TestInfo[] = [];
  
  if (!Parser || !Go) {
    return extractGoTestsRegex(file, testType);
  }
  
  try {
    const parser = new Parser();
    parser.setLanguage(Go);
    const tree = parser.parse(file.content);
    
    function traverse(node: any) {
      if (node.type === 'function_declaration') {
        const nameNode = node.childForFieldName('name');
        const funcName = nameNode?.text || '';
        
        if (funcName.startsWith('Test') || funcName.startsWith('Benchmark')) {
          tests.push({
            file: file.path,
            name: funcName,
            lineStart: node.startPosition.row + 1,
            lineEnd: node.endPosition.row + 1,
            type: testType,
          });
        }
      }
      
      for (const child of node.children || []) {
        traverse(child);
      }
    }
    
    traverse(tree.rootNode);
  } catch {
    return extractGoTestsRegex(file, testType);
  }
  
  return tests;
}

/**
 * Regex fallback for Go test extraction
 */
function extractGoTestsRegex(file: FileInfo, testType: 'unit' | 'integration' | 'e2e'): TestInfo[] {
  const tests: TestInfo[] = [];
  const lines = file.content.split('\n');
  
  const testPattern = /^\s*func\s+(Test\w+|Benchmark\w+)\s*\(/;
  
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(testPattern);
    if (match) {
      tests.push({
        file: file.path,
        name: match[1],
        lineStart: i + 1,
        lineEnd: i + 1,
        type: testType,
      });
    }
  }
  
  return tests;
}

/**
 * Extract imports from a test file to determine source files tested
 */
export function extractTestImports(file: FileInfo): string[] {
  const imports: string[] = [];
  
  if (!Parser) {
    return extractTestImportsRegex(file);
  }
  
  try {
    let parser: any;
    let language: any;
    
    switch (file.language) {
      case 'typescript':
        parser = new Parser();
        language = TypeScript;
        break;
      case 'javascript':
        parser = new Parser();
        language = JavaScript;
        break;
      case 'python':
        parser = new Parser();
        language = Python;
        break;
      case 'go':
        parser = new Parser();
        language = Go;
        break;
      default:
        return [];
    }
    
    parser.setLanguage(language);
    const tree = parser.parse(file.content);
    
    function traverse(node: any) {
      // TypeScript/JavaScript imports
      if (node.type === 'import_statement') {
        const source = node.childForFieldName('source')?.text?.replace(/['"]/g, '');
        if (source && source.startsWith('.')) {
          imports.push(source);
        }
      }
      
      // Python imports
      if (node.type === 'import_from_statement') {
        const module = node.childForFieldName('module_name')?.text;
        if (module) {
          imports.push(module);
        }
      }
      
      // Go imports
      if (node.type === 'import_spec') {
        const importPath = node.childForFieldName('path')?.text?.replace(/"/g, '');
        if (importPath) {
          imports.push(importPath);
        }
      }
      
      for (const child of node.children || []) {
        traverse(child);
      }
    }
    
    traverse(tree.rootNode);
  } catch {
    return extractTestImportsRegex(file);
  }
  
  return imports;
}

/**
 * Regex fallback for import extraction
 */
function extractTestImportsRegex(file: FileInfo): string[] {
  const imports: string[] = [];
  const lines = file.content.split('\n');
  
  const jsImportPattern = /import\s+.*\s+from\s+['"]([^'"]+)['"]/;
  const pyImportPattern = /from\s+(\S+)\s+import/;
  const goImportPattern = /"([^"]+)"/;
  
  for (const line of lines) {
    const jsMatch = line.match(jsImportPattern);
    if (jsMatch && jsMatch[1].startsWith('.')) {
      imports.push(jsMatch[1]);
      continue;
    }
    
    const pyMatch = line.match(pyImportPattern);
    if (pyMatch) {
      imports.push(pyMatch[1]);
      continue;
    }
  }
  
  return imports;
}

/**
 * Resolve import path to actual file path
 */
export function resolveImportPath(
  importPath: string, 
  fromFile: string,
  projectRoot: string
): string | null {
  if (!importPath.startsWith('.')) {
    return null; // External package
  }
  
  const fromDir = path.dirname(fromFile);
  const resolved = path.normalize(path.join(fromDir, importPath));
  
  // Try various extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '/index.ts', '/index.js'];
  
  for (const ext of extensions) {
    const fullPath = resolved + ext;
    const absolutePath = path.join(projectRoot, fullPath);
    if (fs.existsSync(absolutePath)) {
      return fullPath;
    }
  }
  
  // Try without extension (exact match)
  const absolutePath = path.join(projectRoot, resolved);
  if (fs.existsSync(absolutePath)) {
    return resolved;
  }
  
  return resolved; // Return as-is, might be correct
}

/**
 * Create test mapping records from test files
 */
export async function createTestMappings(
  testFiles: FileInfo[],
  projectRoot: string
): Promise<TestMappingRecord[]> {
  const mappings: TestMappingRecord[] = [];
  
  for (const file of testFiles) {
    if (!isTestFile(file.path)) continue;
    
    // Extract tests
    const tests = extractTests(file);
    
    // Extract imports to determine tested files
    const imports = extractTestImports(file);
    const sourceFiles = imports
      .map(imp => resolveImportPath(imp, file.path, projectRoot))
      .filter((f): f is string => f !== null && !isTestFile(f));
    
    // Create mappings
    for (const test of tests) {
      // Map each test to each source file it imports
      for (const sourceFile of sourceFiles) {
        mappings.push({
          id: `${file.path}:${test.lineStart}:${sourceFile}`,
          testFile: file.path,
          testName: test.name,
          testLineStart: test.lineStart,
          testLineEnd: test.lineEnd,
          sourceFile,
          mappingType: 'static',
        });
      }
      
      // If no source files detected, still create a mapping for the test
      if (sourceFiles.length === 0) {
        // Try to infer source file from test file name
        const inferredSource = inferSourceFile(file.path);
        if (inferredSource) {
          mappings.push({
            id: `${file.path}:${test.lineStart}:${inferredSource}`,
            testFile: file.path,
            testName: test.name,
            testLineStart: test.lineStart,
            testLineEnd: test.lineEnd,
            sourceFile: inferredSource,
            mappingType: 'static',
          });
        }
      }
    }
  }
  
  return mappings;
}

/**
 * Infer source file from test file name
 */
export function inferSourceFile(testFile: string): string | null {
  // utils.test.ts -> utils.ts
  // test_utils.py -> utils.py
  // utils_test.go -> utils.go
  
  const patterns = [
    { regex: /(.+)\.test\.(ts|tsx|js|jsx)$/, replacement: '$1.$2' },
    { regex: /(.+)\.spec\.(ts|tsx|js|jsx)$/, replacement: '$1.$2' },
    { regex: /test_(.+)\.py$/, replacement: '$1.py' },
    { regex: /(.+)_test\.py$/, replacement: '$1.py' },
    { regex: /(.+)_test\.go$/, replacement: '$1.go' },
  ];
  
  for (const { regex, replacement } of patterns) {
    if (regex.test(testFile)) {
      return testFile.replace(regex, replacement);
    }
  }
  
  return null;
}

/**
 * Find tests that cover a specific source file
 */
export function findTestsForFile(
  mappings: TestMappingRecord[],
  sourceFile: string
): TestMappingRecord[] {
  return mappings.filter(m => 
    m.sourceFile === sourceFile || 
    m.sourceFile.endsWith('/' + sourceFile) ||
    sourceFile.endsWith(m.sourceFile)
  );
}

/**
 * Find tests that cover a specific function
 */
export function findTestsForFunction(
  mappings: TestMappingRecord[],
  sourceFile: string,
  functionName: string
): TestMappingRecord[] {
  return mappings.filter(m => 
    (m.sourceFile === sourceFile || m.sourceFile.includes(sourceFile)) &&
    (m.sourceName === functionName || !m.sourceName)
  );
}

/**
 * Parse coverage report (lcov format) to enhance mappings
 */
export function parseLcovCoverage(
  lcovPath: string
): Map<string, { file: string; lines: number[] }[]> {
  if (!fs.existsSync(lcovPath)) {
    return new Map();
  }
  
  const content = fs.readFileSync(lcovPath, 'utf-8');
  const coverage = new Map<string, { file: string; lines: number[] }[]>();
  
  let currentFile = '';
  let coveredLines: number[] = [];
  
  for (const line of content.split('\n')) {
    if (line.startsWith('SF:')) {
      currentFile = line.slice(3).trim();
      coveredLines = [];
    } else if (line.startsWith('DA:')) {
      const [lineNum, hits] = line.slice(3).split(',').map(Number);
      if (hits > 0) {
        coveredLines.push(lineNum);
      }
    } else if (line === 'end_of_record' && currentFile) {
      if (!coverage.has(currentFile)) {
        coverage.set(currentFile, []);
      }
      coverage.get(currentFile)!.push({ file: currentFile, lines: coveredLines });
      currentFile = '';
    }
  }
  
  return coverage;
}

/**
 * Extract E2E test route mappings (for Playwright/Cypress tests)
 */
export function extractE2ERoutes(file: FileInfo): string[] {
  const routes: string[] = [];
  const lines = file.content.split('\n');
  
  // Look for page.goto, cy.visit, browser.url, etc.
  const routePatterns = [
    /page\.goto\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /cy\.visit\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /browser\.url\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /navigate\s*\(\s*['"`]([^'"`]+)['"`]/g,
  ];
  
  for (const line of lines) {
    for (const pattern of routePatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        routes.push(match[1]);
      }
    }
  }
  
  return [...new Set(routes)];
}
