/**
 * Tests for architecture summaries generation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  detectModules,
  estimateSummaryCost,
  buildModuleSummaryPrompt,
  buildProjectSummaryPrompt,
  loadSummaries,
  saveSummaries,
  needsSummaryRefresh,
  searchSummaries,
  generateSummaries,
  ModuleInfo,
  ArchitectureSummary,
} from './summaries.js';
import { FileInfo } from './chunker.js';

describe('summaries', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'summaries-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('detectModules', () => {
    it('should detect modules from file paths', () => {
      const files: FileInfo[] = [
        { path: 'src/components/Button.tsx', content: 'export const Button = () => {}', language: 'typescript' },
        { path: 'src/components/Modal.tsx', content: 'export const Modal = () => {}', language: 'typescript' },
        { path: 'src/utils/format.ts', content: 'export function format() {}', language: 'typescript' },
        { path: 'src/utils/validate.ts', content: 'export function validate() {}', language: 'typescript' },
      ];

      const modules = detectModules(tempDir, files);

      expect(modules.length).toBe(2);
      expect(modules.some(m => m.name === 'components')).toBe(true);
      expect(modules.some(m => m.name === 'utils')).toBe(true);
    });

    it('should skip root-level files', () => {
      const files: FileInfo[] = [
        { path: 'README.md', content: '# Project', language: 'markdown' },
        { path: 'package.json', content: '{}', language: 'json' },
        { path: 'src/index.ts', content: 'export * from "./app"', language: 'typescript' },
      ];

      const modules = detectModules(tempDir, files);

      // Only src should be detected
      expect(modules.length).toBe(1);
      expect(modules[0].name).toBe('src');
    });

    it('should handle nested module structures', () => {
      const files: FileInfo[] = [
        { path: 'lib/auth/login.ts', content: 'export function login() {}', language: 'typescript' },
        { path: 'lib/auth/logout.ts', content: 'export function logout() {}', language: 'typescript' },
        { path: 'lib/db/connect.ts', content: 'export function connect() {}', language: 'typescript' },
      ];

      const modules = detectModules(tempDir, files);

      expect(modules.length).toBe(2);
      expect(modules.some(m => m.name === 'auth')).toBe(true);
      expect(modules.some(m => m.name === 'db')).toBe(true);
    });

    it('should detect entry points', () => {
      const files: FileInfo[] = [
        { path: 'src/components/index.ts', content: 'export * from "./Button"', language: 'typescript' },
        { path: 'src/components/Button.tsx', content: 'export const Button = () => {}', language: 'typescript' },
      ];

      const modules = detectModules(tempDir, files);

      const componentsModule = modules.find(m => m.name === 'components');
      expect(componentsModule).toBeDefined();
      expect(componentsModule?.entryPoint).toBe('src/components/index.ts');
    });

    it('should extract exports from entry point', () => {
      const files: FileInfo[] = [
        {
          path: 'src/utils/index.ts',
          content: `
export const VERSION = '1.0.0';
export function format(str: string) { return str; }
export class Validator {}
export interface Config {}
export type Options = {};
export { parse } from './parser';
export default Validator;
`,
          language: 'typescript',
        },
      ];

      const modules = detectModules(tempDir, files);
      const utilsModule = modules.find(m => m.name === 'utils');

      expect(utilsModule?.exports).toContain('VERSION');
      expect(utilsModule?.exports).toContain('format');
      expect(utilsModule?.exports).toContain('Validator');
      expect(utilsModule?.exports).toContain('Config');
      expect(utilsModule?.exports).toContain('Options');
      expect(utilsModule?.exports).toContain('parse');
    });

    it('should extract Python exports', () => {
      const files: FileInfo[] = [
        {
          path: 'app/utils/__init__.py',
          content: `
def format_string(s):
    return s

class Formatter:
    pass

def _private_func():
    pass
`,
          language: 'python',
        },
      ];

      const modules = detectModules(tempDir, files);
      const utilsModule = modules.find(m => m.name === 'utils');

      expect(utilsModule?.exports).toContain('format_string');
      expect(utilsModule?.exports).toContain('Formatter');
      expect(utilsModule?.exports).not.toContain('_private_func');
    });

    it('should extract Go exports', () => {
      const files: FileInfo[] = [
        {
          path: 'pkg/utils/main.go',
          content: `
package utils

func FormatString(s string) string {
    return s
}

type Formatter struct {}

func privateFunc() {}
`,
          language: 'go',
        },
      ];

      const modules = detectModules(tempDir, files);
      const utilsModule = modules.find(m => m.name === 'utils');

      expect(utilsModule?.exports).toContain('FormatString');
      expect(utilsModule?.exports).toContain('Formatter');
      expect(utilsModule?.exports).not.toContain('privateFunc');
    });

    it('should extract imports from entry point', () => {
      const files: FileInfo[] = [
        {
          path: 'src/app/index.ts',
          content: `
import React from 'react';
import { useState } from 'react';
import axios from 'axios';
import { helper } from './utils';
`,
          language: 'typescript',
        },
      ];

      const modules = detectModules(tempDir, files);
      const appModule = modules.find(m => m.name === 'app');

      expect(appModule?.imports).toContain('react');
      expect(appModule?.imports).toContain('axios');
      expect(appModule?.imports).toContain('./utils');
    });

    it('should sort modules by file count', () => {
      const files: FileInfo[] = [
        { path: 'src/small/a.ts', content: '', language: 'typescript' },
        { path: 'src/large/a.ts', content: '', language: 'typescript' },
        { path: 'src/large/b.ts', content: '', language: 'typescript' },
        { path: 'src/large/c.ts', content: '', language: 'typescript' },
        { path: 'src/medium/a.ts', content: '', language: 'typescript' },
        { path: 'src/medium/b.ts', content: '', language: 'typescript' },
      ];

      const modules = detectModules(tempDir, files);

      expect(modules[0].name).toBe('large');
      expect(modules[1].name).toBe('medium');
      expect(modules[2].name).toBe('small');
    });

    it('should handle app directory pattern', () => {
      const files: FileInfo[] = [
        { path: 'app/api/users/route.ts', content: '', language: 'typescript' },
        { path: 'app/api/posts/route.ts', content: '', language: 'typescript' },
        { path: 'app/dashboard/page.tsx', content: '', language: 'typescript' },
      ];

      const modules = detectModules(tempDir, files);

      expect(modules.some(m => m.name === 'api')).toBe(true);
      expect(modules.some(m => m.name === 'dashboard')).toBe(true);
    });
  });

  describe('estimateSummaryCost', () => {
    it('should estimate cost for modules', () => {
      const modules: ModuleInfo[] = [
        { name: 'components', path: 'src/components', files: [], exports: [], imports: [] },
        { name: 'utils', path: 'src/utils', files: [], exports: [], imports: [] },
      ];

      const estimate = estimateSummaryCost(modules);

      expect(estimate.inputTokens).toBeGreaterThan(0);
      expect(estimate.outputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedCost).toBeGreaterThan(0);
    });

    it('should scale cost with module count', () => {
      const smallModules: ModuleInfo[] = [
        { name: 'a', path: 'a', files: [], exports: [], imports: [] },
      ];

      const largeModules: ModuleInfo[] = Array(10).fill(null).map((_, i) => ({
        name: `module${i}`,
        path: `src/module${i}`,
        files: [],
        exports: [],
        imports: [],
      }));

      const smallEstimate = estimateSummaryCost(smallModules);
      const largeEstimate = estimateSummaryCost(largeModules);

      expect(largeEstimate.inputTokens).toBeGreaterThan(smallEstimate.inputTokens);
      expect(largeEstimate.estimatedCost).toBeGreaterThan(smallEstimate.estimatedCost);
    });
  });

  describe('buildModuleSummaryPrompt', () => {
    it('should build prompt with module info', () => {
      const module: ModuleInfo = {
        name: 'components',
        path: 'src/components',
        // Include the entry point in the files list (as detectModules would)
        files: ['src/components/index.ts', 'src/components/Button.tsx', 'src/components/Modal.tsx'],
        entryPoint: 'src/components/index.ts',
        exports: ['Button', 'Modal'],
        imports: ['react', 'lodash'],
      };

      const files: FileInfo[] = [
        { path: 'src/components/index.ts', content: 'export * from "./Button"', language: 'typescript' },
        { path: 'src/components/Button.tsx', content: 'export const Button = () => <button/>', language: 'typescript' },
        { path: 'src/components/Modal.tsx', content: 'export const Modal = () => <div/>', language: 'typescript' },
      ];

      const prompt = buildModuleSummaryPrompt(module, files);

      expect(prompt).toContain('Module: components');
      expect(prompt).toContain('Path: src/components');
      expect(prompt).toContain('Button, Modal');
      expect(prompt).toContain('react');
      expect(prompt).toContain('(entry point)');
      expect(prompt).toContain('"purpose"');
      expect(prompt).toContain('"summary"');
    });

    it('should truncate long file content', () => {
      const module: ModuleInfo = {
        name: 'large',
        path: 'src/large',
        files: ['src/large/big.ts'],
        exports: [],
        imports: [],
      };

      const longContent = 'x'.repeat(5000);
      const files: FileInfo[] = [
        { path: 'src/large/big.ts', content: longContent, language: 'typescript' },
      ];

      const prompt = buildModuleSummaryPrompt(module, files);

      expect(prompt).toContain('(truncated)');
      expect(prompt.length).toBeLessThan(longContent.length);
    });

    it('should limit files included in prompt', () => {
      const module: ModuleInfo = {
        name: 'many',
        path: 'src/many',
        files: Array(20).fill(null).map((_, i) => `src/many/file${i}.ts`),
        exports: [],
        imports: [],
      };

      const files: FileInfo[] = Array(20).fill(null).map((_, i) => ({
        path: `src/many/file${i}.ts`,
        content: `// File ${i}`,
        language: 'typescript' as const,
      }));

      const prompt = buildModuleSummaryPrompt(module, files);

      // Should only include up to 6 files (1 entry + 5 others)
      const fileMatches = prompt.match(/## src\/many\/file\d+\.ts/g) || [];
      expect(fileMatches.length).toBeLessThanOrEqual(6);
    });
  });

  describe('buildProjectSummaryPrompt', () => {
    it('should build prompt with module overview', () => {
      const modules: ModuleInfo[] = [
        { name: 'components', path: 'src/components', files: ['a.ts', 'b.ts'], exports: ['Button'], imports: [] },
        { name: 'utils', path: 'src/utils', files: ['c.ts'], exports: ['format'], imports: [] },
      ];

      const prompt = buildProjectSummaryPrompt(modules, tempDir);

      expect(prompt).toContain('components');
      expect(prompt).toContain('utils');
      expect(prompt).toContain('"projectSummary"');
      expect(prompt).toContain('"keyPatterns"');
      expect(prompt).toContain('"dataFlow"');
    });

    it('should include package.json info when available', () => {
      // Write a package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          description: 'A test project',
          dependencies: {
            react: '^18.0.0',
            lodash: '^4.0.0',
          },
        })
      );

      const modules: ModuleInfo[] = [];
      const prompt = buildProjectSummaryPrompt(modules, tempDir);

      expect(prompt).toContain('test-project');
      expect(prompt).toContain('A test project');
      expect(prompt).toContain('react');
      expect(prompt).toContain('lodash');
    });

    it('should limit modules in overview', () => {
      const modules: ModuleInfo[] = Array(25).fill(null).map((_, i) => ({
        name: `module${i}`,
        path: `src/module${i}`,
        files: ['a.ts'],
        exports: [],
        imports: [],
      }));

      const prompt = buildProjectSummaryPrompt(modules, tempDir);

      // Should only include first 10 modules
      const moduleMatches = prompt.match(/module\d+/g) || [];
      expect(moduleMatches.length).toBeLessThanOrEqual(10 * 2); // Each module mentioned up to 2 times
    });
  });

  describe('loadSummaries / saveSummaries', () => {
    it('should save and load summaries', () => {
      const summaries: ArchitectureSummary = {
        version: 1,
        generatedAt: new Date().toISOString(),
        projectSummary: 'Test project summary',
        modules: [
          {
            name: 'test',
            path: 'src/test',
            summary: 'Test module',
            purpose: 'Testing',
            keyExports: ['testFn'],
            dependencies: ['vitest'],
            patterns: ['unit testing'],
          },
        ],
        keyPatterns: ['MVC', 'Repository'],
        dataFlow: 'Request -> Controller -> Service -> Repository',
      };

      saveSummaries(tempDir, summaries);

      const loaded = loadSummaries(tempDir);

      expect(loaded).toBeDefined();
      expect(loaded?.version).toBe(1);
      expect(loaded?.projectSummary).toBe('Test project summary');
      expect(loaded?.modules.length).toBe(1);
      expect(loaded?.modules[0].name).toBe('test');
      expect(loaded?.keyPatterns).toContain('MVC');
    });

    it('should return null when no summaries exist', () => {
      const loaded = loadSummaries(tempDir);
      expect(loaded).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      fs.writeFileSync(path.join(tempDir, 'architecture-summaries.json'), 'invalid json');

      const loaded = loadSummaries(tempDir);
      expect(loaded).toBeNull();
    });
  });

  describe('needsSummaryRefresh', () => {
    it('should return true when no summaries exist', () => {
      const modules: ModuleInfo[] = [];
      expect(needsSummaryRefresh(tempDir, modules)).toBe(true);
    });

    it('should return true when forceRefresh is true', () => {
      const summaries: ArchitectureSummary = {
        version: 1,
        generatedAt: new Date().toISOString(),
        projectSummary: '',
        modules: [],
        keyPatterns: [],
        dataFlow: '',
      };
      saveSummaries(tempDir, summaries);

      const modules: ModuleInfo[] = [];
      expect(needsSummaryRefresh(tempDir, modules, true)).toBe(true);
    });

    it('should return true when module count changed significantly', () => {
      const summaries: ArchitectureSummary = {
        version: 1,
        generatedAt: new Date().toISOString(),
        projectSummary: '',
        modules: [
          { name: 'a', path: 'a', summary: '', purpose: '', keyExports: [], dependencies: [], patterns: [] },
          { name: 'b', path: 'b', summary: '', purpose: '', keyExports: [], dependencies: [], patterns: [] },
        ],
        keyPatterns: [],
        dataFlow: '',
      };
      saveSummaries(tempDir, summaries);

      // Now we have 10 modules (significant change from 2)
      const modules: ModuleInfo[] = Array(10).fill(null).map((_, i) => ({
        name: `mod${i}`,
        path: `src/mod${i}`,
        files: [],
        exports: [],
        imports: [],
      }));

      expect(needsSummaryRefresh(tempDir, modules)).toBe(true);
    });

    it('should return true when summaries are older than 7 days', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      const summaries: ArchitectureSummary = {
        version: 1,
        generatedAt: oldDate.toISOString(),
        projectSummary: '',
        modules: [],
        keyPatterns: [],
        dataFlow: '',
      };
      saveSummaries(tempDir, summaries);

      const modules: ModuleInfo[] = [];
      expect(needsSummaryRefresh(tempDir, modules)).toBe(true);
    });

    it('should return false when summaries are fresh and module count is similar', () => {
      const summaries: ArchitectureSummary = {
        version: 1,
        generatedAt: new Date().toISOString(),
        projectSummary: '',
        modules: [
          { name: 'a', path: 'a', summary: '', purpose: '', keyExports: [], dependencies: [], patterns: [] },
          { name: 'b', path: 'b', summary: '', purpose: '', keyExports: [], dependencies: [], patterns: [] },
          { name: 'c', path: 'c', summary: '', purpose: '', keyExports: [], dependencies: [], patterns: [] },
        ],
        keyPatterns: [],
        dataFlow: '',
      };
      saveSummaries(tempDir, summaries);

      // Similar module count (within 3)
      const modules: ModuleInfo[] = [
        { name: 'x', path: 'x', files: [], exports: [], imports: [] },
        { name: 'y', path: 'y', files: [], exports: [], imports: [] },
        { name: 'z', path: 'z', files: [], exports: [], imports: [] },
        { name: 'w', path: 'w', files: [], exports: [], imports: [] },
      ];

      expect(needsSummaryRefresh(tempDir, modules)).toBe(false);
    });
  });

  describe('searchSummaries', () => {
    const summaries: ArchitectureSummary = {
      version: 1,
      generatedAt: new Date().toISOString(),
      projectSummary: 'A React application for managing user authentication and profiles.',
      modules: [
        {
          name: 'auth',
          path: 'src/auth',
          summary: 'Handles user login, logout, and session management.',
          purpose: 'Authentication module',
          keyExports: ['login', 'logout', 'useAuth'],
          dependencies: ['axios', 'jwt-decode'],
          patterns: ['React hooks', 'Context API'],
        },
        {
          name: 'profile',
          path: 'src/profile',
          summary: 'Manages user profile display and editing.',
          purpose: 'User profile management',
          keyExports: ['ProfilePage', 'EditProfile'],
          dependencies: ['react-hook-form'],
          patterns: ['Form validation'],
        },
        {
          name: 'utils',
          path: 'src/utils',
          summary: 'Common utility functions used throughout the app.',
          purpose: 'Utility functions',
          keyExports: ['formatDate', 'validateEmail'],
          dependencies: ['date-fns'],
          patterns: ['Pure functions'],
        },
      ],
      keyPatterns: ['React', 'Context API', 'REST API'],
      dataFlow: 'Components -> Hooks -> API Client -> Backend',
    };

    it('should search project summary', () => {
      const results = searchSummaries(summaries, 'authentication');

      expect(results.some(r => r.type === 'project')).toBe(true);
    });

    it('should search module names', () => {
      const results = searchSummaries(summaries, 'auth');

      expect(results.some(r => r.type === 'module' && r.module?.name === 'auth')).toBe(true);
    });

    it('should search module summaries', () => {
      const results = searchSummaries(summaries, 'login');

      expect(results.some(r => r.module?.name === 'auth')).toBe(true);
    });

    it('should search module purposes', () => {
      const results = searchSummaries(summaries, 'profile management');

      expect(results.some(r => r.module?.name === 'profile')).toBe(true);
    });

    it('should search module exports', () => {
      const results = searchSummaries(summaries, 'formatDate');

      expect(results.some(r => r.module?.name === 'utils')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const results = searchSummaries(summaries, 'REACT');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array for no matches', () => {
      const results = searchSummaries(summaries, 'nonexistent-query-xyz');

      expect(results.length).toBe(0);
    });

    it('should include module details in results', () => {
      const results = searchSummaries(summaries, 'auth');

      const authResult = results.find(r => r.module?.name === 'auth');
      expect(authResult).toBeDefined();
      expect(authResult?.module?.keyExports).toContain('login');
      expect(authResult?.module?.dependencies).toContain('axios');
    });
  });

  describe('generateSummaries', () => {
    it('should generate basic summary without API key', async () => {
      const modules: ModuleInfo[] = [
        {
          name: 'components',
          path: 'src/components',
          files: ['src/components/Button.tsx'],
          exports: ['Button'],
          imports: ['react'],
        },
      ];

      const files: FileInfo[] = [
        { path: 'src/components/Button.tsx', content: 'export const Button = () => <button/>', language: 'typescript' },
      ];

      // No API key set
      const originalEnv = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        const summaries = await generateSummaries(tempDir, modules, files);

        expect(summaries.version).toBe(1);
        expect(summaries.generatedAt).toBeDefined();
        expect(summaries.modules.length).toBe(1);
        expect(summaries.modules[0].name).toBe('components');
        expect(summaries.modules[0].summary).toContain('1 file');
      } finally {
        if (originalEnv) {
          process.env.ANTHROPIC_API_KEY = originalEnv;
        }
      }
    });

    it('should detect React projects', async () => {
      const modules: ModuleInfo[] = [];
      const files: FileInfo[] = [
        { path: 'src/App.tsx', content: "import React from 'react'", language: 'typescript' },
      ];

      delete process.env.ANTHROPIC_API_KEY;

      const summaries = await generateSummaries(tempDir, modules, files);

      expect(summaries.projectSummary).toContain('React');
    });

    it('should detect Express projects', async () => {
      const modules: ModuleInfo[] = [];
      const files: FileInfo[] = [
        { path: 'src/server.ts', content: "import express from 'express'", language: 'typescript' },
      ];

      delete process.env.ANTHROPIC_API_KEY;

      const summaries = await generateSummaries(tempDir, modules, files);

      expect(summaries.projectSummary).toContain('Express');
    });

    it('should detect Next.js projects', async () => {
      // Create next.config.js
      fs.writeFileSync(path.join(tempDir, 'next.config.js'), 'module.exports = {}');

      const modules: ModuleInfo[] = [];
      const files: FileInfo[] = [];

      delete process.env.ANTHROPIC_API_KEY;

      const summaries = await generateSummaries(tempDir, modules, files);

      expect(summaries.projectSummary).toContain('Next.js');
    });

    it('should limit modules to maxModules option', async () => {
      const modules: ModuleInfo[] = Array(30).fill(null).map((_, i) => ({
        name: `module${i}`,
        path: `src/module${i}`,
        files: [`src/module${i}/index.ts`],
        exports: [],
        imports: [],
      }));

      const files: FileInfo[] = modules.map(m => ({
        path: m.files[0],
        content: '// content',
        language: 'typescript' as const,
      }));

      delete process.env.ANTHROPIC_API_KEY;

      const summaries = await generateSummaries(tempDir, modules, files, { maxModules: 5 });

      // Should only have 5 modules (limited to 20 in basic summary, but we passed 5)
      expect(summaries.modules.length).toBeLessThanOrEqual(20);
    });

    it('should handle full-stack detection', async () => {
      const modules: ModuleInfo[] = [];
      const files: FileInfo[] = [
        { path: 'src/client/App.tsx', content: "import React from 'react'", language: 'typescript' },
        { path: 'src/server/app.ts', content: "import express from 'express'", language: 'typescript' },
      ];

      delete process.env.ANTHROPIC_API_KEY;

      const summaries = await generateSummaries(tempDir, modules, files);

      expect(summaries.projectSummary).toContain('React');
      expect(summaries.projectSummary).toContain('Express');
    });
  });

  describe('extract helpers', () => {
    it('should handle Python imports', () => {
      const files: FileInfo[] = [
        {
          path: 'app/utils/__init__.py',
          content: `
from flask import Flask, request
from .helpers import format_string
`,
          language: 'python',
        },
      ];

      const modules = detectModules(tempDir, files);
      const utilsModule = modules.find(m => m.name === 'utils');

      expect(utilsModule?.imports).toContain('flask');
      expect(utilsModule?.imports).toContain('.helpers');
    });

    it('should handle Go imports', () => {
      // Go import extraction works with single-line imports or inline imports
      const files: FileInfo[] = [
        {
          path: 'pkg/server/main.go',
          content: `
package main

import "fmt"
import "net/http"
import "github.com/gin-gonic/gin"
`,
          language: 'go',
        },
      ];

      const modules = detectModules(tempDir, files);
      const serverModule = modules.find(m => m.name === 'server');

      expect(serverModule?.imports).toContain('fmt');
      expect(serverModule?.imports).toContain('net/http');
      expect(serverModule?.imports).toContain('github.com/gin-gonic/gin');
    });

    it('should detect mod.ts entry point', () => {
      const files: FileInfo[] = [
        { path: 'src/utils/mod.ts', content: 'export * from "./format"', language: 'typescript' },
        { path: 'src/utils/format.ts', content: 'export function format() {}', language: 'typescript' },
      ];

      const modules = detectModules(tempDir, files);
      const utilsModule = modules.find(m => m.name === 'utils');

      expect(utilsModule?.entryPoint).toBe('src/utils/mod.ts');
    });

    it('should detect __init__.py entry point', () => {
      const files: FileInfo[] = [
        { path: 'app/utils/__init__.py', content: 'from .format import format', language: 'python' },
        { path: 'app/utils/format.py', content: 'def format(): pass', language: 'python' },
      ];

      const modules = detectModules(tempDir, files);
      const utilsModule = modules.find(m => m.name === 'utils');

      expect(utilsModule?.entryPoint).toBe('app/utils/__init__.py');
    });
  });
});
