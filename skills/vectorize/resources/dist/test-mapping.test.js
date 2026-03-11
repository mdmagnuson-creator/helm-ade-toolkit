/**
 * Tests for test-to-code mapping
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { detectTestFramework, isTestFile, detectTestType, extractTests, extractTestImports, createTestMappings, findTestsForFile, inferSourceFile, extractE2ERoutes, } from './test-mapping';
import fs from 'fs';
import path from 'path';
import os from 'os';
describe('test-mapping', () => {
    let testDir;
    beforeAll(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectorize-test-mapping-'));
        fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(testDir, 'tests'), { recursive: true });
    });
    afterAll(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });
    describe('detectTestFramework', () => {
        it('should detect Vitest from vite.config.ts', () => {
            const projectDir = path.join(testDir, 'vitest-project');
            fs.mkdirSync(projectDir, { recursive: true });
            fs.writeFileSync(path.join(projectDir, 'vite.config.ts'), `import { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: {} });`);
            const framework = detectTestFramework(projectDir);
            expect(framework.name).toBe('vitest');
            expect(framework.testPatterns).toContain('**/*.test.ts');
        });
        it('should detect Jest from package.json', () => {
            const projectDir = path.join(testDir, 'jest-project');
            fs.mkdirSync(projectDir, { recursive: true });
            fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ devDependencies: { jest: '^29.0.0' } }));
            const framework = detectTestFramework(projectDir);
            expect(framework.name).toBe('jest');
        });
        it('should detect Playwright from package.json', () => {
            const projectDir = path.join(testDir, 'playwright-project');
            fs.mkdirSync(projectDir, { recursive: true });
            fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ devDependencies: { '@playwright/test': '^1.0.0' } }));
            const framework = detectTestFramework(projectDir);
            expect(framework.name).toBe('playwright');
        });
        it('should detect pytest from pytest.ini', () => {
            const projectDir = path.join(testDir, 'pytest-project');
            fs.mkdirSync(projectDir, { recursive: true });
            fs.writeFileSync(path.join(projectDir, 'pytest.ini'), '[pytest]\ntestpaths = tests');
            const framework = detectTestFramework(projectDir);
            expect(framework.name).toBe('pytest');
        });
        it('should detect Go tests from go.mod', () => {
            const projectDir = path.join(testDir, 'go-project');
            fs.mkdirSync(projectDir, { recursive: true });
            fs.writeFileSync(path.join(projectDir, 'go.mod'), 'module example.com/mymodule\n\ngo 1.21');
            const framework = detectTestFramework(projectDir);
            expect(framework.name).toBe('gotest');
        });
        it('should return unknown for unrecognized projects', () => {
            const projectDir = path.join(testDir, 'unknown-project');
            fs.mkdirSync(projectDir, { recursive: true });
            const framework = detectTestFramework(projectDir);
            expect(framework.name).toBe('unknown');
        });
    });
    describe('isTestFile', () => {
        it('should identify TypeScript test files', () => {
            expect(isTestFile('src/utils.test.ts')).toBe(true);
            expect(isTestFile('src/utils.spec.ts')).toBe(true);
            expect(isTestFile('tests/component.test.tsx')).toBe(true);
        });
        it('should identify JavaScript test files', () => {
            expect(isTestFile('src/utils.test.js')).toBe(true);
            expect(isTestFile('src/utils.spec.jsx')).toBe(true);
        });
        it('should identify Python test files', () => {
            expect(isTestFile('tests/test_utils.py')).toBe(true);
            expect(isTestFile('tests/utils_test.py')).toBe(true);
        });
        it('should identify Go test files', () => {
            expect(isTestFile('pkg/utils_test.go')).toBe(true);
        });
        it('should identify E2E test files', () => {
            expect(isTestFile('e2e/login.ts')).toBe(true);
            expect(isTestFile('tests/home.spec.ts')).toBe(true);
        });
        it('should not identify non-test files', () => {
            expect(isTestFile('src/utils.ts')).toBe(false);
            expect(isTestFile('src/component.tsx')).toBe(false);
            expect(isTestFile('main.go')).toBe(false);
            expect(isTestFile('app.py')).toBe(false);
        });
    });
    describe('detectTestType', () => {
        it('should detect E2E tests by path', () => {
            expect(detectTestType('e2e/login.spec.ts', '')).toBe('e2e');
            expect(detectTestType('tests/playwright/home.spec.ts', '')).toBe('e2e');
        });
        it('should detect E2E tests by content', () => {
            expect(detectTestType('test.spec.ts', 'await page.goto("/login")')).toBe('e2e');
            expect(detectTestType('test.spec.ts', 'browser.newPage()')).toBe('e2e');
        });
        it('should detect integration tests by path', () => {
            expect(detectTestType('tests/integration/api.test.ts', '')).toBe('integration');
        });
        it('should detect integration tests by content', () => {
            expect(detectTestType('test.ts', 'import supertest from "supertest"')).toBe('integration');
            expect(detectTestType('test.go', 'httptest.NewRecorder()')).toBe('integration');
        });
        it('should default to unit tests', () => {
            expect(detectTestType('src/utils.test.ts', 'expect(add(1, 2)).toBe(3)')).toBe('unit');
        });
    });
    describe('extractTests', () => {
        it('should extract TypeScript/JavaScript tests', () => {
            const file = {
                path: 'src/utils.test.ts',
                absolutePath: '/project/src/utils.test.ts',
                content: `
describe('Math utils', () => {
  it('should add numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
  
  test('should subtract numbers', () => {
    expect(subtract(3, 1)).toBe(2);
  });
});
`,
                language: 'typescript',
            };
            const tests = extractTests(file);
            expect(tests.length).toBeGreaterThanOrEqual(2);
            expect(tests.some(t => t.name.includes('add'))).toBe(true);
            expect(tests.some(t => t.name.includes('subtract'))).toBe(true);
            expect(tests[0].type).toBe('unit');
        });
        it('should extract Python tests', () => {
            const file = {
                path: 'tests/test_utils.py',
                absolutePath: '/project/tests/test_utils.py',
                content: `
class TestMathUtils:
    def test_add(self):
        assert add(1, 2) == 3
    
    def test_subtract(self):
        assert subtract(3, 1) == 2

def test_standalone():
    assert True
`,
                language: 'python',
            };
            const tests = extractTests(file);
            expect(tests.length).toBeGreaterThanOrEqual(3);
            expect(tests.some(t => t.name.includes('test_add'))).toBe(true);
            expect(tests.some(t => t.name.includes('test_subtract'))).toBe(true);
            expect(tests.some(t => t.name === 'test_standalone')).toBe(true);
        });
        it('should extract Go tests', () => {
            const file = {
                path: 'pkg/utils_test.go',
                absolutePath: '/project/pkg/utils_test.go',
                content: `
package utils

import "testing"

func TestAdd(t *testing.T) {
    result := Add(1, 2)
    if result != 3 {
        t.Error("Expected 3")
    }
}

func TestSubtract(t *testing.T) {
    result := Subtract(3, 1)
    if result != 2 {
        t.Error("Expected 2")
    }
}

func BenchmarkAdd(b *testing.B) {
    for i := 0; i < b.N; i++ {
        Add(1, 2)
    }
}
`,
                language: 'go',
            };
            const tests = extractTests(file);
            expect(tests.length).toBeGreaterThanOrEqual(3);
            expect(tests.some(t => t.name === 'TestAdd')).toBe(true);
            expect(tests.some(t => t.name === 'TestSubtract')).toBe(true);
            expect(tests.some(t => t.name === 'BenchmarkAdd')).toBe(true);
        });
        it('should not extract from non-test files', () => {
            const file = {
                path: 'src/utils.ts',
                absolutePath: '/project/src/utils.ts',
                content: 'export function add(a: number, b: number) { return a + b; }',
                language: 'typescript',
            };
            const tests = extractTests(file);
            expect(tests).toEqual([]);
        });
    });
    describe('extractTestImports', () => {
        it('should extract TypeScript imports', () => {
            const file = {
                path: 'src/utils.test.ts',
                absolutePath: '/project/src/utils.test.ts',
                content: `
import { add, subtract } from './utils';
import { multiply } from '../lib/math';
import axios from 'axios';
`,
                language: 'typescript',
            };
            const imports = extractTestImports(file);
            expect(imports).toContain('./utils');
            expect(imports).toContain('../lib/math');
            expect(imports).not.toContain('axios'); // External package
        });
        it('should extract Python imports', () => {
            const file = {
                path: 'tests/test_utils.py',
                absolutePath: '/project/tests/test_utils.py',
                content: `
from src.utils import add, subtract
from lib.math import multiply
import pytest
`,
                language: 'python',
            };
            const imports = extractTestImports(file);
            expect(imports.some(i => i.includes('utils'))).toBe(true);
            expect(imports.some(i => i.includes('math'))).toBe(true);
        });
    });
    describe('createTestMappings', () => {
        it('should create mappings from test to source files', async () => {
            // Create source file
            fs.writeFileSync(path.join(testDir, 'src', 'utils.ts'), 'export function add(a: number, b: number) { return a + b; }');
            // Create test file
            const testContent = `
import { add } from './utils';

describe('utils', () => {
  it('should add numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});
`;
            fs.writeFileSync(path.join(testDir, 'src', 'utils.test.ts'), testContent);
            const testFiles = [{
                    path: 'src/utils.test.ts',
                    absolutePath: path.join(testDir, 'src', 'utils.test.ts'),
                    content: testContent,
                    language: 'typescript',
                }];
            const mappings = await createTestMappings(testFiles, testDir);
            expect(mappings.length).toBeGreaterThan(0);
            expect(mappings.some(m => m.testFile === 'src/utils.test.ts')).toBe(true);
        });
        it('should infer source file from test file name', async () => {
            const testContent = `
describe('component', () => {
  it('should render', () => {
    expect(true).toBe(true);
  });
});
`;
            const testFile = {
                path: 'src/component.test.ts',
                absolutePath: path.join(testDir, 'src', 'component.test.ts'),
                content: testContent,
                language: 'typescript',
            };
            const mappings = await createTestMappings([testFile], testDir);
            // Should infer src/component.ts from src/component.test.ts
            expect(mappings.some(m => m.sourceFile.includes('component.ts'))).toBe(true);
        });
    });
    describe('findTestsForFile', () => {
        it('should find tests for a source file', () => {
            const mappings = [
                {
                    id: 'test1',
                    testFile: 'src/utils.test.ts',
                    testName: 'should add numbers',
                    testLineStart: 5,
                    testLineEnd: 8,
                    sourceFile: 'src/utils.ts',
                    mappingType: 'static',
                },
                {
                    id: 'test2',
                    testFile: 'src/math.test.ts',
                    testName: 'should multiply',
                    testLineStart: 3,
                    testLineEnd: 6,
                    sourceFile: 'src/math.ts',
                    mappingType: 'static',
                },
            ];
            const tests = findTestsForFile(mappings, 'src/utils.ts');
            expect(tests.length).toBe(1);
            expect(tests[0].testName).toBe('should add numbers');
        });
        it('should handle partial path matches', () => {
            const mappings = [
                {
                    id: 'test1',
                    testFile: 'tests/utils.test.ts',
                    testName: 'test utils',
                    testLineStart: 1,
                    testLineEnd: 5,
                    sourceFile: 'src/utils.ts',
                    mappingType: 'static',
                },
            ];
            const tests = findTestsForFile(mappings, 'utils.ts');
            expect(tests.length).toBe(1);
        });
    });
    describe('inferSourceFile', () => {
        it('should infer TypeScript source from test file', () => {
            expect(inferSourceFile('src/utils.test.ts')).toBe('src/utils.ts');
            expect(inferSourceFile('src/component.spec.tsx')).toBe('src/component.tsx');
        });
        it('should infer Python source from test file', () => {
            expect(inferSourceFile('tests/test_utils.py')).toBe('tests/utils.py');
            expect(inferSourceFile('tests/utils_test.py')).toBe('tests/utils.py');
        });
        it('should infer Go source from test file', () => {
            expect(inferSourceFile('pkg/utils_test.go')).toBe('pkg/utils.go');
        });
        it('should return null for non-test files', () => {
            expect(inferSourceFile('src/utils.ts')).toBe(null);
            expect(inferSourceFile('main.go')).toBe(null);
        });
    });
    describe('extractE2ERoutes', () => {
        it('should extract Playwright routes', () => {
            const file = {
                path: 'e2e/login.spec.ts',
                absolutePath: '/project/e2e/login.spec.ts',
                content: `
test('user can login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', 'test@example.com');
  await page.goto('/dashboard');
});
`,
                language: 'typescript',
            };
            const routes = extractE2ERoutes(file);
            expect(routes).toContain('/login');
            expect(routes).toContain('/dashboard');
        });
        it('should extract Cypress routes', () => {
            const file = {
                path: 'cypress/e2e/home.cy.ts',
                absolutePath: '/project/cypress/e2e/home.cy.ts',
                content: `
describe('home page', () => {
  it('displays welcome message', () => {
    cy.visit('/');
    cy.visit('/about');
  });
});
`,
                language: 'typescript',
            };
            const routes = extractE2ERoutes(file);
            expect(routes).toContain('/');
            expect(routes).toContain('/about');
        });
        it('should deduplicate routes', () => {
            const file = {
                path: 'e2e/test.spec.ts',
                absolutePath: '/project/e2e/test.spec.ts',
                content: `
await page.goto('/login');
await page.goto('/login');
await page.goto('/login');
`,
                language: 'typescript',
            };
            const routes = extractE2ERoutes(file);
            expect(routes.filter(r => r === '/login').length).toBe(1);
        });
    });
    describe('edge cases', () => {
        it('should handle empty test files', () => {
            const file = {
                path: 'src/empty.test.ts',
                absolutePath: '/project/src/empty.test.ts',
                content: '',
                language: 'typescript',
            };
            const tests = extractTests(file);
            expect(tests).toEqual([]);
        });
        it('should handle test files with syntax errors', () => {
            const file = {
                path: 'src/broken.test.ts',
                absolutePath: '/project/src/broken.test.ts',
                content: 'describe("broken" { it("fails"',
                language: 'typescript',
            };
            // Should not throw
            const tests = extractTests(file);
            expect(Array.isArray(tests)).toBe(true);
        });
        it('should handle unsupported languages', () => {
            const file = {
                path: 'test.rb',
                absolutePath: '/project/test.rb',
                content: 'describe "Ruby test" do\n  it "works" do\n  end\nend',
                language: 'ruby',
            };
            const tests = extractTests(file);
            expect(tests).toEqual([]);
        });
    });
});
//# sourceMappingURL=test-mapping.test.js.map