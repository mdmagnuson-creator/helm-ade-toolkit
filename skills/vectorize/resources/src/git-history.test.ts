/**
 * Tests for git history indexing
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  isGitRepository,
  getCommitHistory,
  getBlameInfo,
  getFileHistory,
  getNewCommits,
  CommitInfo,
} from './git-history';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('git-history', () => {
  let testDir: string;
  let isGitAvailable = true;

  beforeAll(async () => {
    // Check if git is available
    try {
      await execAsync('git --version');
    } catch {
      isGitAvailable = false;
    }
    
    if (!isGitAvailable) return;
    
    // Create a temporary test directory with a git repo
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectorize-git-history-'));
    
    // Initialize git repo
    await execAsync('git init', { cwd: testDir });
    await execAsync('git config user.email "test@example.com"', { cwd: testDir });
    await execAsync('git config user.name "Test User"', { cwd: testDir });
    
    // Create initial file and commit
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test Project\n');
    await execAsync('git add .', { cwd: testDir });
    await execAsync('git commit -m "Initial commit"', { cwd: testDir });
    
    // Create source files
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, 'src', 'app.ts'),
      `export function hello() {\n  return 'Hello';\n}\n`
    );
    await execAsync('git add .', { cwd: testDir });
    await execAsync('git commit -m "feat: add hello function"', { cwd: testDir });
    
    // Make another change
    fs.writeFileSync(
      path.join(testDir, 'src', 'app.ts'),
      `export function hello() {\n  return 'Hello, World!';\n}\n\nexport function goodbye() {\n  return 'Goodbye';\n}\n`
    );
    await execAsync('git add .', { cwd: testDir });
    await execAsync('git commit -m "feat: improve hello, add goodbye function"', { cwd: testDir });
  });

  afterAll(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('isGitRepository', () => {
    it('should return true for git repository', async () => {
      if (!isGitAvailable) return;
      
      const result = await isGitRepository(testDir);
      expect(result).toBe(true);
    });

    it('should return false for non-git directory', async () => {
      if (!isGitAvailable) return;
      
      const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'not-git-'));
      
      try {
        const result = await isGitRepository(nonGitDir);
        expect(result).toBe(false);
      } finally {
        fs.rmSync(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  describe('getCommitHistory', () => {
    it('should return commit history', async () => {
      if (!isGitAvailable) return;
      
      const commits = await getCommitHistory(testDir, { maxCommits: 10 });
      
      expect(commits.length).toBeGreaterThanOrEqual(3);
      
      // Most recent commit first
      expect(commits[0].message).toContain('goodbye');
    });

    it('should include commit metadata', async () => {
      if (!isGitAvailable) return;
      
      const commits = await getCommitHistory(testDir, { maxCommits: 1 });
      
      expect(commits[0].hash).toMatch(/^[a-f0-9]{40}$/);
      expect(commits[0].author).toBe('Test User');
      expect(commits[0].date).toBeTruthy();
      expect(commits[0].message).toBeTruthy();
    });

    it('should include files changed', async () => {
      if (!isGitAvailable) return;
      
      const commits = await getCommitHistory(testDir, { maxCommits: 10 });
      
      // Find the commit that added hello
      const helloCommit = commits.find(c => c.message.includes('add hello'));
      
      if (helloCommit) {
        expect(helloCommit.filesChanged).toContain('src/app.ts');
      }
    });

    it('should respect maxCommits limit', async () => {
      if (!isGitAvailable) return;
      
      const commits = await getCommitHistory(testDir, { maxCommits: 2 });
      
      expect(commits.length).toBeLessThanOrEqual(2);
    });

    it('should exclude files matching excludePatterns', async () => {
      if (!isGitAvailable) return;
      
      // Create a package-lock.json commit
      fs.writeFileSync(path.join(testDir, 'package-lock.json'), '{}');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "chore: update deps"', { cwd: testDir });
      
      const commits = await getCommitHistory(testDir, { maxCommits: 1 });
      
      // package-lock.json should be excluded
      expect(commits[0].filesChanged).not.toContain('package-lock.json');
    });

    it('should return empty array for non-git directory', async () => {
      if (!isGitAvailable) return;
      
      const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'not-git-'));
      
      try {
        const commits = await getCommitHistory(nonGitDir);
        expect(commits).toEqual([]);
      } finally {
        fs.rmSync(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  describe('getFileHistory', () => {
    it('should return commits for a specific file', async () => {
      if (!isGitAvailable) return;
      
      const commits = await getFileHistory(testDir, 'src/app.ts', 10);
      
      expect(commits.length).toBeGreaterThanOrEqual(2);
      
      // All commits should reference the file
      for (const commit of commits) {
        expect(commit.filesChanged).toContain('src/app.ts');
      }
    });

    it('should return empty array for non-existent file', async () => {
      if (!isGitAvailable) return;
      
      const commits = await getFileHistory(testDir, 'nonexistent.ts', 10);
      
      expect(commits).toEqual([]);
    });
  });

  describe('getNewCommits', () => {
    it('should return empty array when up to date', async () => {
      if (!isGitAvailable) return;
      
      // Get current HEAD
      const { stdout } = await execAsync('git rev-parse HEAD', { cwd: testDir });
      const currentHead = stdout.trim();
      
      const commits = await getNewCommits(testDir, currentHead);
      
      expect(commits).toEqual([]);
    });

    it('should return new commits since last indexed', async () => {
      if (!isGitAvailable) return;
      
      // Get commit before the last one
      const { stdout } = await execAsync('git rev-parse HEAD~1', { cwd: testDir });
      const previousCommit = stdout.trim();
      
      const commits = await getNewCommits(testDir, previousCommit);
      
      expect(commits.length).toBeGreaterThanOrEqual(1);
    });

    it('should fall back to full history if commit not found', async () => {
      if (!isGitAvailable) return;
      
      const commits = await getNewCommits(testDir, 'invalid-commit-hash-000000', 10);
      
      // Should fall back to full history
      expect(commits.length).toBeGreaterThan(0);
    });

    it('should return full history when lastIndexedCommit is null', async () => {
      if (!isGitAvailable) return;
      
      const commits = await getNewCommits(testDir, null, 10);
      
      expect(commits.length).toBeGreaterThan(0);
    });
  });

  describe('getBlameInfo', () => {
    it('should return blame info for a file', async () => {
      if (!isGitAvailable) return;
      
      const blameInfos = await getBlameInfo(testDir, 'src/app.ts');
      
      expect(blameInfos.length).toBeGreaterThan(0);
      
      for (const info of blameInfos) {
        expect(info.file).toBe('src/app.ts');
        expect(info.commitHash).toMatch(/^[a-f0-9]{40}$/);
        expect(info.lineStart).toBeGreaterThan(0);
        expect(info.lineEnd).toBeGreaterThanOrEqual(info.lineStart);
      }
    });

    it('should return empty array for non-existent file', async () => {
      if (!isGitAvailable) return;
      
      const blameInfos = await getBlameInfo(testDir, 'nonexistent.ts');
      
      expect(blameInfos).toEqual([]);
    });

    it('should return empty array for untracked file', async () => {
      if (!isGitAvailable) return;
      
      // Create an untracked file
      fs.writeFileSync(path.join(testDir, 'untracked.ts'), 'console.log("untracked");');
      
      const blameInfos = await getBlameInfo(testDir, 'untracked.ts');
      
      expect(blameInfos).toEqual([]);
      
      // Clean up
      fs.unlinkSync(path.join(testDir, 'untracked.ts'));
    });
  });

  describe('edge cases', () => {
    it('should handle commits with special characters in message', async () => {
      if (!isGitAvailable) return;
      
      // Create a file with special chars commit
      fs.writeFileSync(path.join(testDir, 'special.ts'), 'export const x = 1;');
      await execAsync('git add .', { cwd: testDir });
      await execAsync(`git commit -m "feat: add 'special' chars & \"quotes\""`, { cwd: testDir });
      
      const commits = await getCommitHistory(testDir, { maxCommits: 1 });
      
      expect(commits[0].message).toContain('special');
    });

    it('should handle empty commits (no file changes recorded)', async () => {
      if (!isGitAvailable) return;
      
      const commits = await getCommitHistory(testDir, { maxCommits: 100 });
      
      // Should not throw, even if some commits have no files
      expect(Array.isArray(commits)).toBe(true);
    });

    it('should handle merge commits', async () => {
      if (!isGitAvailable) return;
      
      // Create a branch, make a commit, merge
      await execAsync('git checkout -b test-branch', { cwd: testDir });
      fs.writeFileSync(path.join(testDir, 'branch.ts'), 'export const branch = true;');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "feat: branch commit"', { cwd: testDir });
      await execAsync('git checkout -', { cwd: testDir }); // Go back to previous branch
      await execAsync('git merge test-branch --no-ff -m "Merge test-branch"', { cwd: testDir });
      
      const commits = await getCommitHistory(testDir, { maxCommits: 10 });
      
      // Should include the merge commit
      const mergeCommit = commits.find(c => c.message.includes('Merge'));
      expect(mergeCommit).toBeTruthy();
    });

    it('should handle multiline commit messages', async () => {
      if (!isGitAvailable) return;
      
      fs.writeFileSync(path.join(testDir, 'multiline.ts'), 'export const multi = 1;');
      await execAsync('git add .', { cwd: testDir });
      await execAsync('git commit -m "feat: multiline commit\n\nThis is a longer description\nwith multiple lines."', { cwd: testDir });
      
      const commits = await getCommitHistory(testDir, { maxCommits: 1 });
      
      expect(commits[0].message).toContain('multiline commit');
      expect(commits[0].message).toContain('longer description');
    });
  });
});
