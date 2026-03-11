/**
 * Tests for codebase chunking
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scanCodebase, chunkFiles } from './chunker';
import fs from 'fs';
import path from 'path';
import os from 'os';
describe('chunker', () => {
    let testDir;
    beforeAll(() => {
        // Create a temporary test directory
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectorize-test-'));
        // Create test files
        fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(testDir, 'tests'), { recursive: true });
        fs.mkdirSync(path.join(testDir, 'docs'), { recursive: true });
        // TypeScript file with functions
        fs.writeFileSync(path.join(testDir, 'src', 'utils.ts'), `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export class Calculator {
  private value: number = 0;
  
  add(n: number): this {
    this.value += n;
    return this;
  }
  
  subtract(n: number): this {
    this.value -= n;
    return this;
  }
  
  getResult(): number {
    return this.value;
  }
}
`);
        // Test file
        fs.writeFileSync(path.join(testDir, 'tests', 'utils.test.ts'), `
import { describe, it, expect } from 'vitest';
import { add, multiply, Calculator } from '../src/utils';

describe('add', () => {
  it('should add two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});

describe('multiply', () => {
  it('should multiply two numbers', () => {
    expect(multiply(2, 3)).toBe(6);
  });
});

describe('Calculator', () => {
  it('should chain operations', () => {
    const calc = new Calculator();
    expect(calc.add(5).subtract(2).getResult()).toBe(3);
  });
});
`);
        // Markdown file
        fs.writeFileSync(path.join(testDir, 'docs', 'README.md'), `
# Test Project

This is a test project for vectorization.

## Features

- Feature 1
- Feature 2

## Installation

Run \`npm install\` to install dependencies.

## Usage

Import the utilities:

\`\`\`typescript
import { add, multiply } from './src/utils';
\`\`\`
`);
        // Python file
        fs.writeFileSync(path.join(testDir, 'src', 'main.py'), `
def greet(name: str) -> str:
    """Greet a person by name."""
    return f"Hello, {name}!"

class Person:
    def __init__(self, name: str, age: int):
        self.name = name
        self.age = age
    
    def birthday(self) -> None:
        self.age += 1
    
    def introduce(self) -> str:
        return f"I'm {self.name}, {self.age} years old."
`);
        // JSON config file
        fs.writeFileSync(path.join(testDir, 'config.json'), `{
  "name": "test-project",
  "version": "1.0.0"
}
`);
    });
    afterAll(() => {
        // Clean up test directory
        fs.rmSync(testDir, { recursive: true, force: true });
    });
    describe('scanCodebase', () => {
        it('should find files matching include patterns', async () => {
            const files = await scanCodebase(testDir, {
                include: ['src/**', 'tests/**', 'docs/**'],
                exclude: ['node_modules/**'],
            });
            expect(files.length).toBeGreaterThanOrEqual(4);
            expect(files.some(f => f.path === 'src/utils.ts')).toBe(true);
            expect(files.some(f => f.path === 'tests/utils.test.ts')).toBe(true);
            expect(files.some(f => f.path === 'docs/README.md')).toBe(true);
        });
        it('should correctly identify languages', async () => {
            const files = await scanCodebase(testDir, {
                include: ['src/**'],
                exclude: [],
            });
            const tsFile = files.find(f => f.path === 'src/utils.ts');
            const pyFile = files.find(f => f.path === 'src/main.py');
            expect(tsFile?.language).toBe('typescript');
            expect(pyFile?.language).toBe('python');
        });
        it('should filter files when filterFiles provided', async () => {
            const files = await scanCodebase(testDir, {
                include: ['src/**'],
                exclude: [],
            }, ['src/utils.ts']);
            expect(files.length).toBe(1);
            expect(files[0].path).toBe('src/utils.ts');
        });
    });
    describe('chunkFiles', () => {
        it('should chunk TypeScript files with AST strategy', async () => {
            const files = [{
                    path: 'src/utils.ts',
                    absolutePath: path.join(testDir, 'src/utils.ts'),
                    content: fs.readFileSync(path.join(testDir, 'src/utils.ts'), 'utf-8'),
                    language: 'typescript',
                }];
            const chunks = await chunkFiles(files, 'ast');
            // Should have separate chunks for functions and class
            expect(chunks.length).toBeGreaterThanOrEqual(2);
            // Each chunk should have required metadata
            for (const chunk of chunks) {
                expect(chunk.id).toBeDefined();
                expect(chunk.filePath).toBe('src/utils.ts');
                expect(chunk.language).toBe('typescript');
                expect(chunk.lineRange).toHaveLength(2);
                expect(chunk.type).toBe('code');
            }
        });
        it('should chunk markdown files by sections', async () => {
            const files = [{
                    path: 'docs/README.md',
                    absolutePath: path.join(testDir, 'docs/README.md'),
                    content: fs.readFileSync(path.join(testDir, 'docs/README.md'), 'utf-8'),
                    language: 'markdown',
                }];
            const chunks = await chunkFiles(files, 'ast');
            // Should have sections for # Test Project, ## Features, ## Installation, ## Usage
            expect(chunks.length).toBeGreaterThanOrEqual(1);
            for (const chunk of chunks) {
                expect(chunk.type).toBe('docs');
                expect(chunk.language).toBe('markdown');
            }
        });
        it('should use sliding window for unsupported languages', async () => {
            const files = [{
                    path: 'config.json',
                    absolutePath: path.join(testDir, 'config.json'),
                    content: fs.readFileSync(path.join(testDir, 'config.json'), 'utf-8'),
                    language: 'json',
                }];
            const chunks = await chunkFiles(files, 'ast');
            // JSON should fall back to sliding window
            expect(chunks.length).toBeGreaterThanOrEqual(1);
        });
        it('should use sliding window when strategy is sliding-window', async () => {
            const files = [{
                    path: 'src/utils.ts',
                    absolutePath: path.join(testDir, 'src/utils.ts'),
                    content: fs.readFileSync(path.join(testDir, 'src/utils.ts'), 'utf-8'),
                    language: 'typescript',
                }];
            const chunks = await chunkFiles(files, 'sliding-window');
            expect(chunks.length).toBeGreaterThanOrEqual(1);
        });
    });
    describe('test files indexing', () => {
        it('should index test files by default', async () => {
            const files = await scanCodebase(testDir, {
                include: ['src/**', 'tests/**'],
                exclude: ['node_modules/**'],
            });
            const testFile = files.find(f => f.path.includes('.test.ts'));
            expect(testFile).toBeDefined();
        });
        it('should exclude test files when specified', async () => {
            const files = await scanCodebase(testDir, {
                include: ['src/**', 'tests/**'],
                exclude: ['node_modules/**', '**/*.test.ts'],
            });
            const testFile = files.find(f => f.path.includes('.test.ts'));
            expect(testFile).toBeUndefined();
        });
    });
    describe('chunk metadata', () => {
        it('should include file path in chunk id', async () => {
            const files = [{
                    path: 'src/utils.ts',
                    absolutePath: path.join(testDir, 'src/utils.ts'),
                    content: fs.readFileSync(path.join(testDir, 'src/utils.ts'), 'utf-8'),
                    language: 'typescript',
                }];
            const chunks = await chunkFiles(files, 'ast');
            for (const chunk of chunks) {
                expect(chunk.id).toContain('src/utils.ts');
                expect(chunk.id).toMatch(/:\d+-\d+$/); // Should have line range
            }
        });
        it('should have valid line ranges', async () => {
            const files = [{
                    path: 'src/utils.ts',
                    absolutePath: path.join(testDir, 'src/utils.ts'),
                    content: fs.readFileSync(path.join(testDir, 'src/utils.ts'), 'utf-8'),
                    language: 'typescript',
                }];
            const chunks = await chunkFiles(files, 'ast');
            for (const chunk of chunks) {
                const [start, end] = chunk.lineRange;
                expect(start).toBeGreaterThan(0);
                expect(end).toBeGreaterThanOrEqual(start);
            }
        });
    });
});
//# sourceMappingURL=chunker.test.js.map