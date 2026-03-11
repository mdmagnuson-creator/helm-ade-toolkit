/**
 * Vectorize CLI - Codebase and database vectorization for semantic search
 */

import { Command } from 'commander';
import ora from 'ora';
import { initializeVectorization, refreshIndex, searchIndex, getStatus, showConfig } from './index.js';
import { loadProjectConfig } from './config.js';
import path from 'path';

const program = new Command();

program
  .name('vectorize')
  .description('Codebase and database vectorization for semantic search')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize vectorization for the current project')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--skip-database', 'Skip database schema indexing')
  .option('--no-contextual', 'Disable contextual retrieval')
  .action(async (options) => {
    const projectRoot = process.cwd();
    const spinner = ora('Initializing vectorization...').start();
    
    try {
      const result = await initializeVectorization(projectRoot, {
        dryRun: options.dryRun,
        skipDatabase: options.skipDatabase,
        contextualRetrieval: options.contextual !== false,
      });
      
      spinner.succeed('Vectorization initialized!');
      console.log('\n' + result.summary);
      
      if (result.cost) {
        console.log(`\nEstimated cost: $${result.cost.toFixed(2)} (one-time)`);
      }
      
      console.log('\nNext steps:');
      console.log("  • Agents will automatically use semantic search");
      console.log("  • Run 'vectorize search <query>' to test");
      console.log("  • Run 'vectorize status' to check index health");
    } catch (error) {
      spinner.fail('Initialization failed');
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('refresh')
  .description('Rebuild the vector index')
  .option('--full', 'Force full rebuild instead of incremental')
  .option('--files <files>', 'Comma-separated list of changed files (for incremental)')
  .action(async (options) => {
    const projectRoot = process.cwd();
    const spinner = ora('Refreshing index...').start();
    
    try {
      const files = options.files ? options.files.split(',') : undefined;
      const result = await refreshIndex(projectRoot, {
        full: options.full,
        changedFiles: files,
      });
      
      spinner.succeed('Index refreshed!');
      console.log(`\nUpdated ${result.chunksUpdated} chunks in ${result.timeMs}ms`);
    } catch (error) {
      spinner.fail('Refresh failed');
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('search <query>')
  .description('Search the vector index')
  .option('-k, --top-k <number>', 'Number of results to return', '10')
  .option('-t, --type <type>', 'Filter by type: code, schema, config, docs')
  .option('-l, --language <lang>', 'Filter by language')
  .action(async (query, options) => {
    const projectRoot = process.cwd();
    
    try {
      const results = await searchIndex(projectRoot, query, {
        topK: parseInt(options.topK, 10),
        contentType: options.type,
        language: options.language,
      });
      
      if (results.length === 0) {
        console.log('No results found.');
        return;
      }
      
      console.log(`\nFound ${results.length} relevant chunks for "${query}"\n`);
      
      results.forEach((result, i) => {
        const lineRange = result.lineRange ? ` (lines ${result.lineRange[0]}-${result.lineRange[1]})` : '';
        console.log(`${i + 1}. ${result.filePath}${lineRange} [score: ${result.score.toFixed(2)}]`);
        console.log('   ┌' + '─'.repeat(65));
        const lines = result.content.split('\n').slice(0, 8);
        lines.forEach(line => {
          console.log('   │ ' + line.substring(0, 65));
        });
        if (result.content.split('\n').length > 8) {
          console.log('   │ ...');
        }
        console.log('   └' + '─'.repeat(65));
        console.log('');
      });
    } catch (error) {
      console.error('Search failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show index statistics and health')
  .action(async () => {
    const projectRoot = process.cwd();
    
    try {
      const status = await getStatus(projectRoot);
      
      console.log(`\nVector Index Status: ${path.basename(projectRoot)}\n`);
      console.log(`Index Location: .vectorindex/`);
      console.log(`Last Updated: ${status.lastUpdated}`);
      console.log(`Index Age: ${status.isStale ? 'STALE (needs refresh)' : 'OK'}\n`);
      
      console.log('Codebase:');
      console.log(`  Files indexed: ${status.codebase.files}`);
      console.log(`  Chunks: ${status.codebase.chunks}`);
      console.log(`  Languages: ${status.codebase.languages.join(', ')}\n`);
      
      if (status.database) {
        console.log('Database:');
        console.log(`  Schema: ${status.database.tables} tables, ${status.database.columns} columns`);
        console.log(`  Config tables: ${status.database.configTables.join(', ')}\n`);
      }
      
      console.log('Storage:');
      console.log(`  Vector index: ${status.storage.vectorSize}`);
      console.log(`  BM25 index: ${status.storage.bm25Size}`);
      console.log(`  Total: ${status.storage.totalSize}\n`);
      
      console.log('Configuration:');
      console.log(`  Embedding model: ${status.config.embeddingModel}`);
      console.log(`  Contextual retrieval: ${status.config.contextualRetrieval}`);
      console.log(`  Hybrid weight: ${status.config.hybridWeight}`);
      console.log(`  Top-K: ${status.config.topK}`);
    } catch (error) {
      console.error('Status check failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show current vectorization configuration')
  .action(async () => {
    const projectRoot = process.cwd();
    
    try {
      const config = await showConfig(projectRoot);
      console.log('\nVectorization Configuration:\n');
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Config check failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
