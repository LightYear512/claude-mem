#!/usr/bin/env bun
/**
 * Vector Database Reset Script
 *
 * Deletes the vector database directory to force a complete re-indexing.
 * Use this when changing the embedding function to ensure all vectors
 * are regenerated with the new model.
 *
 * ⚠️  WARNING: This will delete all vector embeddings!
 *
 * Usage:
 *   bun scripts/vector-reset.ts           # Interactive mode
 *   bun scripts/vector-reset.ts --force   # Non-interactive mode
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const VECTOR_DB_DIR = path.join(os.homedir(), '.claude-mem', 'vector-db');

async function prompt(question: string): Promise<string> {
  // Check if we have a TTY for interactive input
  if (!process.stdin.isTTY) {
    console.log(question + ' (no TTY, use --force flag for non-interactive mode)');
    return 'n';
  }

  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setRawMode(false);
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      resolve(data.toString().trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  // Help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Claude-Mem Vector Database Reset

Deletes the vector database directory to force complete re-indexing.

Usage:
  bun scripts/vector-reset.ts [options]

Options:
  --help, -h     Show this help message
  --force        Delete without prompting for confirmation

Examples:
  # Interactive mode (asks for confirmation)
  bun scripts/vector-reset.ts

  # Non-interactive mode
  bun scripts/vector-reset.ts --force

When to use this:
  - After changing CLAUDE_MEM_EMBEDDING_FUNCTION setting
  - When switching between different embedding models
  - If vector search results seem inconsistent
  - To free up disk space (vectors will regenerate automatically)

What happens after reset:
  - The vector database directory will be deleted
  - On next worker start, ChromaSync will recreate it
  - Observations will be re-indexed automatically with the new embedding model
  - This process is transparent and happens in the background
`);
    process.exit(0);
  }

  const force = args.includes('--force');

  console.log('\n=== Claude-Mem Vector Database Reset ===\n');
  console.log('📁 Vector DB Directory:', VECTOR_DB_DIR);

  // Check if directory exists
  const exists = fs.existsSync(VECTOR_DB_DIR);
  if (!exists) {
    console.log('ℹ️  Vector database directory does not exist. Nothing to reset.\n');
    process.exit(0);
  }

  // Get directory size
  let totalSize = 0;
  let fileCount = 0;
  try {
    const countFiles = (dir: string) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          countFiles(filePath);
        } else {
          totalSize += stat.size;
          fileCount++;
        }
      }
    };
    countFiles(VECTOR_DB_DIR);

    const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
    console.log(`📊 Current size: ${sizeMB} MB (${fileCount} files)\n`);
  } catch (error) {
    console.log('⚠️  Could not determine directory size\n');
  }

  // Confirm before deleting
  if (!force) {
    console.log('⚠️  WARNING: This will delete all vector embeddings!');
    console.log('    All observations will need to be re-indexed on next worker start.\n');

    const answer = await prompt('Are you sure you want to proceed? [y/N]: ');
    if (answer.toLowerCase() !== 'y') {
      console.log('\nCancelled. Run with --force to skip confirmation.\n');
      process.exit(0);
    }
    console.log('');
  }

  // Delete the directory
  console.log('🗑️  Deleting vector database directory...');
  try {
    fs.rmSync(VECTOR_DB_DIR, { recursive: true, force: true });
    console.log('✅ Vector database reset complete!\n');
    console.log('Next steps:');
    console.log('  1. Optionally update CLAUDE_MEM_EMBEDDING_FUNCTION in ~/.claude-mem/settings.json');
    console.log('  2. Restart the worker: npm run worker:restart');
    console.log('  3. Vectors will re-index automatically in the background\n');
  } catch (error) {
    console.error('❌ Failed to delete vector database:', error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
