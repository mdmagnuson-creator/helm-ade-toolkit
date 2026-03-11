/**
 * Configuration loading and saving for vectorization
 */
import fs from 'fs';
import path from 'path';
/**
 * Load project configuration from docs/project.json
 */
export async function loadProjectConfig(projectRoot) {
    const projectJsonPath = path.join(projectRoot, 'docs', 'project.json');
    if (!fs.existsSync(projectJsonPath)) {
        // Try root level
        const rootPath = path.join(projectRoot, 'project.json');
        if (fs.existsSync(rootPath)) {
            return JSON.parse(fs.readFileSync(rootPath, 'utf-8'));
        }
        return {};
    }
    return JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
}
/**
 * Save project configuration to docs/project.json
 */
export async function saveProjectConfig(projectRoot, config) {
    const docsDir = path.join(projectRoot, 'docs');
    const projectJsonPath = path.join(docsDir, 'project.json');
    // Ensure docs directory exists
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }
    fs.writeFileSync(projectJsonPath, JSON.stringify(config, null, 2) + '\n');
}
/**
 * Get credential value from config (resolves env: references)
 */
export function resolveCredential(value) {
    if (!value)
        return undefined;
    if (value.startsWith('env:')) {
        const envVar = value.substring(4);
        return process.env[envVar];
    }
    return value;
}
//# sourceMappingURL=config.js.map