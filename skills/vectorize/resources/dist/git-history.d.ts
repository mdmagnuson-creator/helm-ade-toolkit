/**
 * Git history indexing for semantic search
 *
 * Extracts commit messages, blame data, and change context
 * to enable "why was this code written?" queries.
 */
import { GitHistoryRecord } from './store.js';
export interface CommitInfo {
    hash: string;
    author: string;
    authorEmail: string;
    date: string;
    message: string;
    filesChanged: string[];
}
export interface BlameInfo {
    file: string;
    lineStart: number;
    lineEnd: number;
    commitHash: string;
    author: string;
    date: string;
}
export interface GitHistoryConfig {
    maxCommits: number;
    includeBlame: boolean;
    excludePatterns: string[];
}
/**
 * Check if directory is a git repository
 */
export declare function isGitRepository(projectRoot: string): Promise<boolean>;
/**
 * Get commit history from git log
 */
export declare function getCommitHistory(projectRoot: string, config?: Partial<GitHistoryConfig>): Promise<CommitInfo[]>;
/**
 * Get blame info for a file
 */
export declare function getBlameInfo(projectRoot: string, filePath: string): Promise<BlameInfo[]>;
/**
 * Get recent commits for a specific file
 */
export declare function getFileHistory(projectRoot: string, filePath: string, maxCommits?: number): Promise<CommitInfo[]>;
/**
 * Get commits that haven't been indexed yet
 */
export declare function getNewCommits(projectRoot: string, lastIndexedCommit: string | null, maxCommits?: number): Promise<CommitInfo[]>;
/**
 * Convert commits to GitHistoryRecords with embeddings
 */
export declare function indexCommitHistory(projectRoot: string, config?: Partial<GitHistoryConfig>, lastIndexedCommit?: string | null): Promise<{
    records: GitHistoryRecord[];
    latestCommit: string | null;
}>;
/**
 * Search git history semantically
 */
export declare function searchGitHistory(query: string, records: GitHistoryRecord[], limit?: number): Promise<GitHistoryRecord[]>;
/**
 * Get commits that touched a specific function
 */
export declare function getCommitsForFunction(projectRoot: string, filePath: string, functionName: string, lineRange?: [number, number]): Promise<CommitInfo[]>;
//# sourceMappingURL=git-history.d.ts.map