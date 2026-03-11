/**
 * Architecture summaries generation
 *
 * Uses Claude to generate high-level summaries of major modules
 * and project architecture for new agent orientation.
 */
import fs from 'fs';
import path from 'path';
const DEFAULT_OPTIONS = {
    maxModules: 20,
    maxFilesPerModule: 10,
    maxTokensPerSummary: 500,
};
/**
 * Detect major modules in the codebase
 */
export function detectModules(projectRoot, files) {
    const modules = new Map();
    // Group files by directory structure
    for (const file of files) {
        const parts = file.path.split('/');
        // Skip root-level files
        if (parts.length < 2)
            continue;
        // Determine module name (first directory or first two for nested structures)
        let modulePath;
        let moduleName;
        // Handle common patterns like src/components, lib/utils, etc.
        if (parts[0] === 'src' || parts[0] === 'lib' || parts[0] === 'app' || parts[0] === 'pkg') {
            if (parts.length > 2) {
                modulePath = parts.slice(0, 2).join('/');
                moduleName = parts[1];
            }
            else {
                modulePath = parts[0];
                moduleName = parts[0];
            }
        }
        else {
            modulePath = parts[0];
            moduleName = parts[0];
        }
        if (!modules.has(modulePath)) {
            modules.set(modulePath, {
                name: moduleName,
                path: modulePath,
                files: [],
                exports: [],
                imports: [],
            });
        }
        modules.get(modulePath).files.push(file.path);
    }
    // Detect entry points and exports
    for (const [modulePath, module] of modules) {
        // Look for index files as entry points
        const indexPatterns = ['index.ts', 'index.js', 'index.tsx', 'mod.ts', '__init__.py', 'main.go'];
        for (const pattern of indexPatterns) {
            const indexFile = module.files.find(f => f.endsWith('/' + pattern) || f === modulePath + '/' + pattern);
            if (indexFile) {
                module.entryPoint = indexFile;
                break;
            }
        }
        // Extract exports from entry point if available
        if (module.entryPoint) {
            const entryFile = files.find(f => f.path === module.entryPoint);
            if (entryFile) {
                module.exports = extractExports(entryFile);
                module.imports = extractImports(entryFile);
            }
        }
    }
    // Sort by file count (larger modules first)
    return Array.from(modules.values())
        .sort((a, b) => b.files.length - a.files.length);
}
/**
 * Extract exported names from a file
 */
function extractExports(file) {
    const exports = [];
    const lines = file.content.split('\n');
    for (const line of lines) {
        // TypeScript/JavaScript exports
        const exportMatch = line.match(/export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/);
        if (exportMatch) {
            exports.push(exportMatch[1]);
        }
        // Named exports
        const namedExportMatch = line.match(/export\s+\{([^}]+)\}/);
        if (namedExportMatch) {
            const names = namedExportMatch[1].split(',').map(n => n.trim().split(' ')[0]);
            exports.push(...names);
        }
        // Default exports
        if (line.includes('export default')) {
            const defaultMatch = line.match(/export\s+default\s+(?:class|function)?\s*(\w+)?/);
            if (defaultMatch && defaultMatch[1]) {
                exports.push(defaultMatch[1] + ' (default)');
            }
            else {
                exports.push('(default export)');
            }
        }
        // Python exports (functions and classes at module level)
        if (file.language === 'python') {
            const pyDefMatch = line.match(/^def\s+(\w+)\s*\(/);
            const pyClassMatch = line.match(/^class\s+(\w+)/);
            if (pyDefMatch && !pyDefMatch[1].startsWith('_')) {
                exports.push(pyDefMatch[1]);
            }
            if (pyClassMatch && !pyClassMatch[1].startsWith('_')) {
                exports.push(pyClassMatch[1]);
            }
        }
        // Go exports (capitalized names)
        if (file.language === 'go') {
            const goFuncMatch = line.match(/^func\s+([A-Z]\w*)\s*\(/);
            const goTypeMatch = line.match(/^type\s+([A-Z]\w*)\s+/);
            if (goFuncMatch) {
                exports.push(goFuncMatch[1]);
            }
            if (goTypeMatch) {
                exports.push(goTypeMatch[1]);
            }
        }
    }
    return [...new Set(exports)];
}
/**
 * Extract import paths from a file
 */
function extractImports(file) {
    const imports = [];
    const lines = file.content.split('\n');
    for (const line of lines) {
        // TypeScript/JavaScript imports
        const importMatch = line.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/);
        if (importMatch) {
            imports.push(importMatch[1]);
        }
        // Python imports
        const pyImportMatch = line.match(/from\s+(\S+)\s+import/);
        if (pyImportMatch) {
            imports.push(pyImportMatch[1]);
        }
        // Go imports
        const goImportMatch = line.match(/"([^"]+)"/);
        if (goImportMatch && line.includes('import')) {
            imports.push(goImportMatch[1]);
        }
    }
    return [...new Set(imports)];
}
/**
 * Estimate cost for generating summaries
 */
export function estimateSummaryCost(modules) {
    // Rough estimates:
    // - Each module summary: ~2000 input tokens (file content excerpts), ~300 output tokens
    // - Project summary: ~1000 input tokens, ~500 output tokens
    const inputTokensPerModule = 2000;
    const outputTokensPerModule = 300;
    const projectInputTokens = 1000;
    const projectOutputTokens = 500;
    const totalInputTokens = (modules.length * inputTokensPerModule) + projectInputTokens;
    const totalOutputTokens = (modules.length * outputTokensPerModule) + projectOutputTokens;
    // Claude 3 Haiku pricing (cheapest): $0.25/million input, $1.25/million output
    // Using Sonnet for better quality: $3/million input, $15/million output
    const inputCost = (totalInputTokens / 1_000_000) * 3;
    const outputCost = (totalOutputTokens / 1_000_000) * 15;
    return {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCost: Number((inputCost + outputCost).toFixed(4)),
    };
}
/**
 * Generate a prompt for module summary
 */
export function buildModuleSummaryPrompt(module, files) {
    // Get relevant files
    const moduleFiles = files.filter(f => module.files.includes(f.path));
    // Build excerpts from key files
    const excerpts = [];
    // Prioritize entry point
    if (module.entryPoint) {
        const entryFile = moduleFiles.find(f => f.path === module.entryPoint);
        if (entryFile) {
            excerpts.push(`## ${entryFile.path} (entry point)\n\`\`\`\n${truncate(entryFile.content, 1000)}\n\`\`\``);
        }
    }
    // Add other key files (up to 5)
    const otherFiles = moduleFiles
        .filter(f => f.path !== module.entryPoint)
        .slice(0, 5);
    for (const file of otherFiles) {
        excerpts.push(`## ${file.path}\n\`\`\`\n${truncate(file.content, 500)}\n\`\`\``);
    }
    return `Analyze this module and provide a concise summary.

Module: ${module.name}
Path: ${module.path}
Files: ${module.files.length}
Key Exports: ${module.exports.join(', ') || 'None detected'}
Dependencies: ${module.imports.filter(i => !i.startsWith('.')).slice(0, 10).join(', ') || 'None detected'}

Code excerpts:

${excerpts.join('\n\n')}

Provide a JSON response with:
{
  "purpose": "One sentence describing what this module does",
  "summary": "2-3 sentences explaining how it works and key concepts",
  "keyExports": ["list", "of", "important", "exports"],
  "dependencies": ["external", "deps", "used"],
  "patterns": ["design patterns", "architectural decisions"]
}`;
}
/**
 * Generate a prompt for project-level summary
 */
export function buildProjectSummaryPrompt(modules, projectRoot) {
    // Get package.json or similar for project metadata
    let projectMeta = '';
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            projectMeta = `
Project: ${pkg.name || 'Unknown'}
Description: ${pkg.description || 'None'}
Dependencies: ${Object.keys(pkg.dependencies || {}).slice(0, 15).join(', ')}
`;
        }
        catch {
            // Ignore
        }
    }
    const moduleOverview = modules.slice(0, 10).map(m => `- ${m.name} (${m.path}): ${m.files.length} files, exports: ${m.exports.slice(0, 5).join(', ')}`).join('\n');
    return `Analyze this project and provide a high-level architectural summary.

${projectMeta}

Module structure:
${moduleOverview}

Provide a JSON response with:
{
  "projectSummary": "2-3 paragraphs describing the overall architecture",
  "keyPatterns": ["architectural patterns", "design decisions"],
  "dataFlow": "Description of how data flows through the system"
}`;
}
/**
 * Truncate text to max characters
 */
function truncate(text, maxChars) {
    if (text.length <= maxChars)
        return text;
    return text.slice(0, maxChars) + '\n... (truncated)';
}
/**
 * Generate summaries using Claude API
 */
export async function generateSummaries(projectRoot, modules, files, options = {}) {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    const apiKey = mergedOptions.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        // Return a basic summary without LLM generation
        return generateBasicSummary(projectRoot, modules, files);
    }
    // Limit modules
    const limitedModules = modules.slice(0, mergedOptions.maxModules);
    const moduleSummaries = [];
    // Generate module summaries
    for (const module of limitedModules) {
        try {
            const prompt = buildModuleSummaryPrompt(module, files);
            const response = await callClaude(apiKey, prompt);
            const parsed = parseJsonResponse(response);
            moduleSummaries.push({
                name: module.name,
                path: module.path,
                summary: parsed.summary || '',
                purpose: parsed.purpose || '',
                keyExports: parsed.keyExports || module.exports,
                dependencies: parsed.dependencies || [],
                patterns: parsed.patterns || [],
            });
        }
        catch (error) {
            // Fallback to basic summary on error
            moduleSummaries.push({
                name: module.name,
                path: module.path,
                summary: `Module with ${module.files.length} files.`,
                purpose: 'Purpose not determined.',
                keyExports: module.exports,
                dependencies: module.imports.filter(i => !i.startsWith('.')),
                patterns: [],
            });
        }
    }
    // Generate project summary
    let projectSummary = '';
    let keyPatterns = [];
    let dataFlow = '';
    try {
        const projectPrompt = buildProjectSummaryPrompt(limitedModules, projectRoot);
        const projectResponse = await callClaude(apiKey, projectPrompt);
        const parsed = parseJsonResponse(projectResponse);
        projectSummary = parsed.projectSummary || '';
        keyPatterns = parsed.keyPatterns || [];
        dataFlow = parsed.dataFlow || '';
    }
    catch {
        projectSummary = `Project with ${modules.length} modules.`;
    }
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        projectSummary,
        modules: moduleSummaries,
        keyPatterns,
        dataFlow,
    };
}
/**
 * Generate basic summary without LLM
 */
function generateBasicSummary(projectRoot, modules, files) {
    const moduleSummaries = modules.slice(0, 20).map(m => ({
        name: m.name,
        path: m.path,
        summary: `Module containing ${m.files.length} files.`,
        purpose: 'Auto-detected module.',
        keyExports: m.exports.slice(0, 10),
        dependencies: m.imports.filter(i => !i.startsWith('.')).slice(0, 10),
        patterns: [],
    }));
    // Detect project type from files
    const hasReact = files.some(f => f.content.includes('from \'react\'') || f.content.includes('from "react"'));
    const hasExpress = files.some(f => f.content.includes('from \'express\'') || f.content.includes('from "express"'));
    const hasNextjs = fs.existsSync(path.join(projectRoot, 'next.config.js'));
    let projectType = 'Unknown';
    if (hasNextjs)
        projectType = 'Next.js application';
    else if (hasReact && hasExpress)
        projectType = 'Full-stack React + Express application';
    else if (hasReact)
        projectType = 'React application';
    else if (hasExpress)
        projectType = 'Express.js backend';
    const projectSummary = `${projectType} with ${modules.length} detected modules and ${files.length} files.`;
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        projectSummary,
        modules: moduleSummaries,
        keyPatterns: [],
        dataFlow: '',
    };
}
/**
 * Call Claude API
 */
async function callClaude(apiKey, prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-3-haiku-20240307', // Use Haiku for cost efficiency
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    if (!response.ok) {
        throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.content?.[0]?.text || '';
}
/**
 * Parse JSON from LLM response
 */
function parseJsonResponse(response) {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        }
        catch {
            // Ignore parse errors
        }
    }
    return {};
}
/**
 * Load existing summaries
 */
export function loadSummaries(indexDir) {
    const summaryPath = path.join(indexDir, 'architecture-summaries.json');
    if (!fs.existsSync(summaryPath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
/**
 * Save summaries to disk
 */
export function saveSummaries(indexDir, summaries) {
    const summaryPath = path.join(indexDir, 'architecture-summaries.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summaries, null, 2));
}
/**
 * Check if summaries need refresh
 */
export function needsSummaryRefresh(indexDir, modules, forceRefresh = false) {
    if (forceRefresh)
        return true;
    const existing = loadSummaries(indexDir);
    if (!existing)
        return true;
    // Check if module count changed significantly
    const existingModuleCount = existing.modules.length;
    const currentModuleCount = Math.min(modules.length, 20);
    if (Math.abs(existingModuleCount - currentModuleCount) > 3) {
        return true;
    }
    // Check if summaries are older than 7 days
    const generatedAt = new Date(existing.generatedAt);
    const daysSinceGeneration = (Date.now() - generatedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceGeneration > 7) {
        return true;
    }
    return false;
}
/**
 * Search summaries for a query
 */
export function searchSummaries(summaries, query) {
    const results = [];
    const queryLower = query.toLowerCase();
    // Check project summary
    if (summaries.projectSummary.toLowerCase().includes(queryLower)) {
        results.push({
            type: 'project',
            content: summaries.projectSummary,
        });
    }
    // Check module summaries
    for (const module of summaries.modules) {
        if (module.name.toLowerCase().includes(queryLower) ||
            module.summary.toLowerCase().includes(queryLower) ||
            module.purpose.toLowerCase().includes(queryLower) ||
            module.keyExports.some(e => e.toLowerCase().includes(queryLower))) {
            results.push({
                type: 'module',
                content: `${module.purpose}\n\n${module.summary}`,
                module,
            });
        }
    }
    return results;
}
//# sourceMappingURL=summaries.js.map