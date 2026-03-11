/**
 * Test-to-code mapping
 *
 * Extracts relationships between test files and source code they test.
 * Supports Jest, Vitest, Playwright, pytest, and go test.
 */
import { FileInfo } from './chunker.js';
import { TestMappingRecord } from './store.js';
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
export declare function detectTestFramework(projectRoot: string): TestFramework;
/**
 * Check if a file is a test file
 */
export declare function isTestFile(filePath: string): boolean;
/**
 * Detect test type (unit, integration, e2e)
 */
export declare function detectTestType(filePath: string, content: string): 'unit' | 'integration' | 'e2e';
/**
 * Extract test definitions from a file
 */
export declare function extractTests(file: FileInfo): TestInfo[];
/**
 * Extract imports from a test file to determine source files tested
 */
export declare function extractTestImports(file: FileInfo): string[];
/**
 * Resolve import path to actual file path
 */
export declare function resolveImportPath(importPath: string, fromFile: string, projectRoot: string): string | null;
/**
 * Create test mapping records from test files
 */
export declare function createTestMappings(testFiles: FileInfo[], projectRoot: string): Promise<TestMappingRecord[]>;
/**
 * Infer source file from test file name
 */
export declare function inferSourceFile(testFile: string): string | null;
/**
 * Find tests that cover a specific source file
 */
export declare function findTestsForFile(mappings: TestMappingRecord[], sourceFile: string): TestMappingRecord[];
/**
 * Find tests that cover a specific function
 */
export declare function findTestsForFunction(mappings: TestMappingRecord[], sourceFile: string, functionName: string): TestMappingRecord[];
/**
 * Parse coverage report (lcov format) to enhance mappings
 */
export declare function parseLcovCoverage(lcovPath: string): Map<string, {
    file: string;
    lines: number[];
}[]>;
/**
 * Extract E2E test route mappings (for Playwright/Cypress tests)
 */
export declare function extractE2ERoutes(file: FileInfo): string[];
//# sourceMappingURL=test-mapping.d.ts.map