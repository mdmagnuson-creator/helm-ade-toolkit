/**
 * Git integration for incremental index updates
 */
/**
 * Get files changed since a specific commit
 */
export declare function getChangedFilesSinceIndex(projectRoot: string, lastIndexedCommit: string | null): Promise<string[]>;
/**
 * Get current git HEAD commit
 */
export declare function getCurrentCommit(projectRoot: string): Promise<string | null>;
/**
 * Check if the repo has uncommitted changes
 */
export declare function hasUncommittedChanges(projectRoot: string): Promise<boolean>;
/**
 * Install post-commit and post-checkout hooks for auto-refresh
 */
export declare function installGitHook(projectRoot: string): Promise<void>;
/**
 * Uninstall git hooks
 */
export declare function uninstallGitHook(projectRoot: string): Promise<void>;
/**
 * Get list of files in the last commit
 */
export declare function getLastCommitFiles(projectRoot: string): Promise<string[]>;
/**
 * Check if project is a git repository
 */
export declare function isGitRepo(projectRoot: string): boolean;
/**
 * Get git ignore patterns to exclude from indexing
 */
export declare function getGitIgnorePatterns(projectRoot: string): Promise<string[]>;
//# sourceMappingURL=git.d.ts.map