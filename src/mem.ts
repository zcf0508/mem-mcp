import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Fuse from 'fuse.js';

const MEMORY_DIR = 'memories';

// Ensure memories directory exists
if (!existsSync(MEMORY_DIR)) {
  mkdirSync(MEMORY_DIR, { recursive: true });
}

// Get user-specific directory
const getUserDir = (token: string) => join(MEMORY_DIR, token);

// Ensure user directory exists
function ensureUserDir(token: string) {
  const userDir = getUserDir(token);
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
  }
}

/**
 * Validate that a filename is safe and doesn't escape the user directory
 */
function validateFilename(filename: string): boolean {
  // Normalize filename (ensure .md extension)
  const normalizedFilename = filename.endsWith('.md') ? filename : `${filename}.md`;

  // Check for path traversal attempts
  if (normalizedFilename.includes('..') || normalizedFilename.includes('/') || normalizedFilename.includes('\\')) {
    return false;
  }

  // Should only contain alphanumeric, dash, and .md extension
  return /^[a-z0-9\-]+\.md$/.test(normalizedFilename);
}

/**
 * Get safe filepath within user directory
 */
function getSafeFilepath(token: string, filename: string): string | null {
  if (!validateFilename(filename)) {
    return null;
  }

  const userDir = getUserDir(token);
  const normalizedFilename = filename.endsWith('.md') ? filename : `${filename}.md`;
  const filepath = join(userDir, normalizedFilename);

  // Extra safety check: verify the resolved path is within userDir
  const resolvedFilepath = resolve(filepath);
  const resolvedUserDir = resolve(userDir);

  if (!resolvedFilepath.startsWith(resolvedUserDir)) {
    return null;
  }

  return filepath;
}

/**
 * Extract title from markdown content (assumes first H1 is the title)
 */
function extractTitle(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('# ')) {
      return line.slice(2).trim();
    }
  }
  return 'Untitled';
}

/**
 * Read memories for a user, optionally filtered by query
 * Returns formatted strings with metadata prefix for LLM consumption
 */
export function readMemories(token: string, query?: string): string[] {
  ensureUserDir(token);
  const userDir = getUserDir(token);

  try {
    const files = readdirSync(userDir).filter((f: string) => f.endsWith('.md'));

    const memories = files.map((file: string) => {
      const content = readFileSync(join(userDir, file), 'utf-8');
      return { file, content };
    });

    // Filter by query if provided
    if (query) {
      // Use Fuse.js for fuzzy search with better recall
      const fuse = new Fuse(memories, {
        keys: ['file', 'content'],
        threshold: 0.3, // Allow some fuzzy matching (0.3 = 70% match required)
        includeScore: true,
        minMatchCharLength: 2, // Minimum 2 characters to match
        useExtendedSearch: true, // Enable extended search syntax
      });

      const results = fuse.search(query);
      return results.map(result => formatMemory(result.item));
    }

    return memories.map(m => formatMemory(m));
  }
  catch {
    return [];
  }
}

/**
 * Format memory item with metadata prefix for LLM consumption
 */
function formatMemory(memory: { file: string, content: string }): string {
  const title = extractTitle(memory.content);
  return `### Memory\n**filename:** ${memory.file}\n**title:** ${title}\n---\n${memory.content}`;
}

/**
 * Write a memory for a user
 */
export function writeMemory(token: string, title: string, content: string): string {
  ensureUserDir(token);
  const userDir = getUserDir(token);

  // Sanitize title for filename
  const filename = `${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}.md`;

  const filepath = join(userDir, filename);

  // Add metadata
  const fullContent = `# ${title}\n\n${content}\n\n---\n*Created: ${new Date().toISOString()}*`;

  writeFileSync(filepath, fullContent, 'utf-8');

  return filename;
}

/**
 * Update an existing memory for a user
 * filename is immutable and used as the unique identifier
 */
export function updateMemory(token: string, filename: string, title: string, content: string): boolean {
  ensureUserDir(token);

  // Validate and get safe filepath
  const filepath = getSafeFilepath(token, filename);
  if (!filepath) {
    return false;
  }

  // Check if file exists
  if (!existsSync(filepath)) {
    return false;
  }

  // Add metadata
  const fullContent = `# ${title}\n\n${content}\n\n---\n*Updated: ${new Date().toISOString()}*`;

  writeFileSync(filepath, fullContent, 'utf-8');

  return true;
}

/**
 * Delete a memory for a user
 */
export function deleteMemory(token: string, filename: string): boolean {
  ensureUserDir(token);

  // Validate and get safe filepath
  const filepath = getSafeFilepath(token, filename);
  if (!filepath) {
    return false;
  }

  if (!existsSync(filepath)) {
    return false;
  }

  unlinkSync(filepath);
  return true;
}

/**
 * Generate a new user token
 */
export function generateToken(): string {
  return randomBytes(16).toString('hex');
}
