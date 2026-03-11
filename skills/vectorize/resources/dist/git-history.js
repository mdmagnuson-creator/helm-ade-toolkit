/**
 * Git history indexing for semantic search
 *
 * Extracts commit messages, blame data, and change context
 * to enable "why was this code written?" queries.
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { generateQueryEmbeddingAuto } from './embeddings.js';
const execAsync = promisify(exec);
const DEFAULT_CONFIG = {
    maxCommits: 500,
    includeBlame: false, // Blame is expensive, disabled by default
    excludePatterns: [
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        '*.min.js',
        '*.min.css',
        'dist/**',
        'build/**',
    ],
};
/**
 * Check if directory is a git repository
 */
export async function isGitRepository(projectRoot) {
    try {
        await execAsync('git rev-parse --git-dir', { cwd: projectRoot });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Get commit history from git log
 */
export async function getCommitHistory(projectRoot, config = {}) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    if (!await isGitRepository(projectRoot)) {
        return [];
    }
    try {
        // Use null byte as record separator and special field separator
        // Format: hash|author|email|date|subject|body (null byte) files
        const separator = '\x1F'; // Unit separator (ASCII 31)
        const recordSep = '\x1E'; // Record separator (ASCII 30)
        const format = `${recordSep}%H${separator}%an${separator}%ae${separator}%aI${separator}%s${separator}%b`;
        const { stdout } = await execAsync(`git log -n ${mergedConfig.maxCommits} --format="${format}" --name-only`, {
            cwd: projectRoot,
            maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large repos
        });
        const commits = [];
        // Split by record separator, which comes BEFORE each commit
        const records = stdout.split(recordSep).filter(Boolean);
        for (const record of records) {
            const lines = record.split('\n');
            if (lines.length === 0)
                continue;
            // First line contains commit metadata
            const fields = lines[0].split(separator);
            if (fields.length < 5)
                continue;
            const [hash, author, authorEmail, date, subject, ...bodyParts] = fields;
            // Body may contain the separator, so join remaining parts
            const body = bodyParts.join(separator).trim();
            // Files are listed on subsequent lines (after the commit info)
            const filesChanged = lines.slice(1)
                .map(f => f.trim())
                .filter(f => f && !shouldExclude(f, mergedConfig.excludePatterns));
            // Combine subject and body for full message
            const message = body ? `${subject}\n\n${body}` : subject;
            commits.push({
                hash: hash.trim(),
                author: author.trim(),
                authorEmail: authorEmail.trim(),
                date: date.trim(),
                message: message.trim(),
                filesChanged,
            });
        }
        return commits;
    }
    catch (error) {
        console.warn('Failed to get commit history:', error.message);
        return [];
    }
}
/**
 * Get blame info for a file
 */
export async function getBlameInfo(projectRoot, filePath) {
    try {
        // git blame with porcelain format for machine parsing
        const { stdout } = await execAsync(`git blame --porcelain "${filePath}"`, { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 });
        const blameInfos = [];
        const lines = stdout.split('\n');
        let currentHash = '';
        let currentAuthor = '';
        let currentDate = '';
        let lineNum = 0;
        let lineStart = 0;
        let prevHash = '';
        for (const line of lines) {
            // First line of a block: <hash> <orig-line> <final-line> [<num-lines>]
            const headerMatch = line.match(/^([a-f0-9]{40})\s+(\d+)\s+(\d+)(?:\s+(\d+))?/);
            if (headerMatch) {
                // If we have a previous block with different hash, save it
                if (prevHash && prevHash !== headerMatch[1] && lineStart > 0) {
                    blameInfos.push({
                        file: filePath,
                        lineStart,
                        lineEnd: lineNum,
                        commitHash: prevHash,
                        author: currentAuthor,
                        date: currentDate,
                    });
                }
                if (prevHash !== headerMatch[1]) {
                    lineStart = parseInt(headerMatch[3], 10);
                }
                currentHash = headerMatch[1];
                lineNum = parseInt(headerMatch[3], 10);
                prevHash = currentHash;
            }
            else if (line.startsWith('author ')) {
                currentAuthor = line.slice(7);
            }
            else if (line.startsWith('author-time ')) {
                const timestamp = parseInt(line.slice(12), 10);
                currentDate = new Date(timestamp * 1000).toISOString();
            }
        }
        // Save the last block
        if (prevHash && lineStart > 0) {
            blameInfos.push({
                file: filePath,
                lineStart,
                lineEnd: lineNum,
                commitHash: prevHash,
                author: currentAuthor,
                date: currentDate,
            });
        }
        // Merge consecutive ranges with the same commit
        return mergeBlameRanges(blameInfos);
    }
    catch (error) {
        // File might not be tracked, or might be new
        return [];
    }
}
/**
 * Merge consecutive blame ranges with the same commit
 */
function mergeBlameRanges(blameInfos) {
    if (blameInfos.length === 0)
        return [];
    const merged = [];
    let current = { ...blameInfos[0] };
    for (let i = 1; i < blameInfos.length; i++) {
        const next = blameInfos[i];
        if (next.commitHash === current.commitHash && next.lineStart === current.lineEnd + 1) {
            // Extend current range
            current.lineEnd = next.lineEnd;
        }
        else {
            // Save current and start new
            merged.push(current);
            current = { ...next };
        }
    }
    merged.push(current);
    return merged;
}
/**
 * Check if file should be excluded
 */
function shouldExclude(filePath, patterns) {
    for (const pattern of patterns) {
        if (pattern.includes('*')) {
            // Simple glob matching
            const regex = new RegExp('^' + pattern
                .replace(/\./g, '\\.')
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*') + '$');
            if (regex.test(filePath))
                return true;
        }
        else if (filePath === pattern || filePath.endsWith('/' + pattern)) {
            return true;
        }
    }
    return false;
}
/**
 * Get recent commits for a specific file
 */
export async function getFileHistory(projectRoot, filePath, maxCommits = 50) {
    try {
        const separator = '\x1F'; // Unit separator
        const recordSep = '\x1E'; // Record separator
        const format = `${recordSep}%H${separator}%an${separator}%ae${separator}%aI${separator}%s${separator}%b`;
        const { stdout } = await execAsync(`git log -n ${maxCommits} --follow --format="${format}" -- "${filePath}"`, { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 });
        const commits = [];
        const records = stdout.split(recordSep).filter(Boolean);
        for (const record of records) {
            const lines = record.split('\n');
            const fields = lines[0].split(separator);
            if (fields.length < 5)
                continue;
            const [hash, author, authorEmail, date, subject, ...bodyParts] = fields;
            const body = bodyParts.join(separator).trim();
            const message = body ? `${subject}\n\n${body}` : subject;
            commits.push({
                hash: hash.trim(),
                author: author.trim(),
                authorEmail: authorEmail.trim(),
                date: date.trim(),
                message: message.trim(),
                filesChanged: [filePath],
            });
        }
        return commits;
    }
    catch {
        return [];
    }
}
/**
 * Get commits that haven't been indexed yet
 */
export async function getNewCommits(projectRoot, lastIndexedCommit, maxCommits = 500) {
    if (!lastIndexedCommit) {
        return getCommitHistory(projectRoot, { maxCommits });
    }
    try {
        // Check if the last indexed commit still exists
        await execAsync(`git cat-file -e ${lastIndexedCommit}`, { cwd: projectRoot });
        // Get commits since the last indexed one
        const separator = '\x1F'; // Unit separator
        const recordSep = '\x1E'; // Record separator
        const format = `${recordSep}%H${separator}%an${separator}%ae${separator}%aI${separator}%s${separator}%b`;
        const { stdout } = await execAsync(`git log ${lastIndexedCommit}..HEAD --format="${format}" --name-only`, { cwd: projectRoot, maxBuffer: 50 * 1024 * 1024 });
        if (!stdout.trim()) {
            return []; // No new commits
        }
        const commits = [];
        const records = stdout.split(recordSep).filter(Boolean);
        for (const record of records) {
            const lines = record.split('\n');
            if (lines.length === 0)
                continue;
            const fields = lines[0].split(separator);
            if (fields.length < 5)
                continue;
            const [hash, author, authorEmail, date, subject, ...bodyParts] = fields;
            const body = bodyParts.join(separator).trim();
            const filesChanged = lines.slice(1).map(f => f.trim()).filter(Boolean);
            const message = body ? `${subject}\n\n${body}` : subject;
            commits.push({
                hash: hash.trim(),
                author: author.trim(),
                authorEmail: authorEmail.trim(),
                date: date.trim(),
                message: message.trim(),
                filesChanged,
            });
        }
        return commits;
    }
    catch {
        // If the commit doesn't exist, do a full re-index
        return getCommitHistory(projectRoot, { maxCommits });
    }
}
/**
 * Convert commits to GitHistoryRecords with embeddings
 */
export async function indexCommitHistory(projectRoot, config = {}, lastIndexedCommit = null) {
    // Get commits to index
    const commits = lastIndexedCommit
        ? await getNewCommits(projectRoot, lastIndexedCommit, config.maxCommits || DEFAULT_CONFIG.maxCommits)
        : await getCommitHistory(projectRoot, config);
    if (commits.length === 0) {
        return { records: [], latestCommit: lastIndexedCommit };
    }
    // Generate embeddings for commit messages
    const records = [];
    for (const commit of commits) {
        // Create a searchable text from the commit
        const searchText = `${commit.message}\n\nFiles changed: ${commit.filesChanged.join(', ')}`;
        try {
            const { embedding: vector } = await generateQueryEmbeddingAuto(searchText);
            records.push({
                id: `commit:${commit.hash}`,
                commitHash: commit.hash,
                author: commit.author,
                date: commit.date,
                message: commit.message,
                filesChanged: commit.filesChanged,
                vector,
            });
        }
        catch (error) {
            console.warn(`Failed to embed commit ${commit.hash}: ${error.message}`);
        }
    }
    // Get the latest commit hash
    let latestCommit = null;
    try {
        const { stdout } = await execAsync('git rev-parse HEAD', { cwd: projectRoot });
        latestCommit = stdout.trim();
    }
    catch {
        // Ignore
    }
    return { records, latestCommit };
}
/**
 * Search git history semantically
 */
export async function searchGitHistory(query, records, limit = 10) {
    if (records.length === 0)
        return [];
    const { embedding: queryVector } = await generateQueryEmbeddingAuto(query);
    // Calculate cosine similarity for each record
    const scored = records.map(record => ({
        record,
        score: cosineSimilarity(queryVector, record.vector),
    }));
    // Sort by score descending and return top results
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.record);
}
/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length)
        return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
}
/**
 * Get commits that touched a specific function
 */
export async function getCommitsForFunction(projectRoot, filePath, functionName, lineRange) {
    try {
        // If we have a line range, use git log -L
        if (lineRange) {
            const [start, end] = lineRange;
            const separator = '\x1F'; // Unit separator
            const recordSep = '\x1E'; // Record separator
            const format = `${recordSep}%H${separator}%an${separator}%ae${separator}%aI${separator}%s${separator}%b`;
            const { stdout } = await execAsync(`git log -L ${start},${end}:"${filePath}" --format="${format}" --no-patch -n 50`, { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 });
            const commits = [];
            const records = stdout.split(recordSep).filter(Boolean);
            for (const record of records) {
                const lines = record.split('\n');
                const fields = lines[0].split(separator);
                if (fields.length < 5)
                    continue;
                const [hash, author, authorEmail, date, subject, ...bodyParts] = fields;
                const body = bodyParts.join(separator).trim();
                const message = body ? `${subject}\n\n${body}` : subject;
                commits.push({
                    hash: hash.trim(),
                    author: author.trim(),
                    authorEmail: authorEmail.trim(),
                    date: date.trim(),
                    message: message.trim(),
                    filesChanged: [filePath],
                });
            }
            return commits;
        }
        // Fallback: search for commits mentioning the function name
        const fileCommits = await getFileHistory(projectRoot, filePath, 100);
        // Filter to commits that might mention the function
        return fileCommits.filter(c => c.message.toLowerCase().includes(functionName.toLowerCase()));
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=git-history.js.map