import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import Fuse from 'fuse.js';

const MEMORY_DIR = 'memories';
const EVICTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const lastEvictionTime = new Map<string, number>();

// Ensure memories directory exists
if (!existsSync(MEMORY_DIR)) {
  mkdirSync(MEMORY_DIR, { recursive: true });
}

// Get user-specific directory
const getUserDir = (token: string) => join(MEMORY_DIR, token);

// Get user-specific archive directory
const getArchiveDir = (token: string) => join(MEMORY_DIR, token, 'archive');

// Ensure user directory exists
function ensureUserDir(token: string) {
  const userDir = getUserDir(token);
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
  }
}

// Ensure archive directory exists
function ensureArchiveDir(token: string) {
  const archiveDir = getArchiveDir(token);
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
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
 * Get safe filepath within archive directory
 */
function getSafeArchiveFilepath(token: string, filename: string): string | null {
  if (!validateFilename(filename)) {
    return null;
  }

  const archiveDir = getArchiveDir(token);
  const normalizedFilename = filename.endsWith('.md') ? filename : `${filename}.md`;
  const filepath = join(archiveDir, normalizedFilename);

  const resolvedFilepath = resolve(filepath);
  const resolvedArchiveDir = resolve(archiveDir);

  if (!resolvedFilepath.startsWith(resolvedArchiveDir)) {
    return null;
  }

  return filepath;
}

// --- Priority & Frontmatter ---

export type Priority = 'P0' | 'P1' | 'P2';

export interface MemoryMeta {
  priority: Priority
  createdAt: string
  updatedAt: string
  lastAccessedAt: string
}

export function parseFrontmatter(content: string): { meta: MemoryMeta | null, body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    return { meta: null, body: content };
  }

  const raw = match[1]!;
  const body = content.slice(match[0].length);

  const getValue = (key: string): string | undefined => {
    const line = raw.split('\n').find(l => l.startsWith(`${key}:`));
    return line ? line.slice(key.length + 1).trim() : undefined;
  };

  const priority = getValue('priority');
  const createdAt = getValue('createdAt');
  const updatedAt = getValue('updatedAt');
  const lastAccessedAt = getValue('lastAccessedAt');

  if (!priority || !createdAt || !updatedAt || !lastAccessedAt) {
    return { meta: null, body: content };
  }

  if (priority !== 'P0' && priority !== 'P1' && priority !== 'P2') {
    return { meta: null, body: content };
  }

  return {
    meta: {
      priority: priority as Priority,
      createdAt,
      updatedAt,
      lastAccessedAt,
    },
    body,
  };
}

export function serializeFrontmatter(meta: MemoryMeta, body: string): string {
  return `---\npriority: ${meta.priority}\ncreatedAt: ${meta.createdAt}\nupdatedAt: ${meta.updatedAt}\nlastAccessedAt: ${meta.lastAccessedAt}\n---\n${body}`;
}

/**
 * Extract title from markdown content (assumes first H1 is the title)
 */
function extractTitle(content: string): string {
  const { body } = parseFrontmatter(content);
  const lines = body.split('\n');
  for (const line of lines) {
    if (line.startsWith('# ')) {
      return line.slice(2).trim();
    }
  }
  return 'Untitled';
}

/**
 * Infer createdAt from legacy footer line `*Created: <ISO>*` or file mtime
 */
function inferCreatedAt(content: string, filepath: string): string {
  const match = content.match(/\*Created: ([^*]+)\*/);
  if (match) {
    const parsed = new Date(match[1]!.trim());
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  try {
    return statSync(filepath).mtime.toISOString();
  }
  catch {
    return new Date().toISOString();
  }
}

/**
 * Ensure a file has frontmatter. If not, add default frontmatter and write back.
 * Returns the parsed meta and body.
 */
function ensureFrontmatter(filepath: string, content: string): { meta: MemoryMeta, body: string } {
  const { meta, body } = parseFrontmatter(content);
  if (meta) {
    return { meta, body };
  }

  const now = new Date().toISOString();
  const createdAt = inferCreatedAt(content, filepath);
  const newMeta: MemoryMeta = {
    priority: 'P2',
    createdAt,
    updatedAt: createdAt,
    lastAccessedAt: now,
  };

  const normalized = serializeFrontmatter(newMeta, content);
  writeFileSync(filepath, normalized, 'utf-8');

  return { meta: newMeta, body: content };
}

// --- Core CRUD ---

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
      const filepath = join(userDir, file);
      const content = readFileSync(filepath, 'utf-8');
      return { file, content, filepath };
    });

    let results: typeof memories;

    if (query) {
      const terms = query
        .trim()
        .split(/[\s\-_,;:]+/)
        .filter(term => term.length > 0);

      if (terms.length === 0) {
        results = memories;
      }
      else {
        const fuse = new Fuse(memories, {
          keys: ['file', 'content'],
          threshold: 0.3,
          includeScore: true,
          minMatchCharLength: 1,
          useExtendedSearch: true,
        });

        const resultSets = terms.map((term) => {
          const res = fuse.search(term);
          return new Set(res.map(r => memories.indexOf(r.item)));
        });

        let matchedIndices = resultSets[0] || new Set<number>();
        for (let i = 1; i < resultSets.length; i++) {
          const current = resultSets[i];
          matchedIndices = new Set([...matchedIndices].filter(x => current?.has(x)));
        }

        results = Array.from(matchedIndices)
          .map(idx => memories[idx])
          .filter((m): m is typeof memories[0] => m !== undefined)
          .sort((a, b) => {
            const scoreA = terms.filter(t =>
              a.file.toLowerCase().includes(t.toLowerCase())
              || a.content.toLowerCase().includes(t.toLowerCase()),
            ).length;
            const scoreB = terms.filter(t =>
              b.file.toLowerCase().includes(t.toLowerCase())
              || b.content.toLowerCase().includes(t.toLowerCase()),
            ).length;
            return scoreB - scoreA;
          });
      }
    }
    else {
      results = memories;
    }

    const now = new Date().toISOString();
    for (const m of results) {
      const { meta, body } = ensureFrontmatter(m.filepath, m.content);
      const updated: MemoryMeta = { ...meta, lastAccessedAt: now };
      writeFileSync(m.filepath, serializeFrontmatter(updated, body), 'utf-8');
    }

    maybeEvict(token);

    return results.map(m => formatMemory(m));
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
export function writeMemory(token: string, title: string, content: string, priority: Priority = 'P2'): string {
  ensureUserDir(token);
  const userDir = getUserDir(token);

  const filename = `${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}.md`;

  const filepath = join(userDir, filename);

  const now = new Date().toISOString();
  const meta: MemoryMeta = {
    priority,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
  };

  const body = `# ${title}\n\n${content}\n\n---\n*Created: ${now}*`;
  const fullContent = serializeFrontmatter(meta, body);

  writeFileSync(filepath, fullContent, 'utf-8');

  return filename;
}

/**
 * Update an existing memory for a user
 * filename is immutable and used as the unique identifier
 */
export function updateMemory(token: string, filename: string, title: string, content: string, priority?: Priority): boolean {
  ensureUserDir(token);

  const filepath = getSafeFilepath(token, filename);
  if (!filepath) {
    return false;
  }

  if (!existsSync(filepath)) {
    return false;
  }

  const existing = readFileSync(filepath, 'utf-8');
  const { meta: existingMeta } = ensureFrontmatter(filepath, existing);

  const now = new Date().toISOString();
  const meta: MemoryMeta = {
    ...existingMeta,
    updatedAt: now,
    ...(priority !== undefined ? { priority } : {}),
  };

  const body = `# ${title}\n\n${content}\n\n---\n*Updated: ${now}*`;
  const fullContent = serializeFrontmatter(meta, body);

  writeFileSync(filepath, fullContent, 'utf-8');

  return true;
}

/**
 * Delete a memory for a user
 */
export function deleteMemory(token: string, filename: string): boolean {
  ensureUserDir(token);

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
 * List all memory titles for a user (for discovery/indexing)
 */
export function listMemoryTitles(token: string): { filename: string, title: string, priority: Priority, lastAccessedAt: string }[] {
  ensureUserDir(token);
  const userDir = getUserDir(token);

  try {
    const files = readdirSync(userDir).filter((f: string) => f.endsWith('.md'));
    return files.map((file: string) => {
      const filepath = join(userDir, file);
      const content = readFileSync(filepath, 'utf-8');
      const { meta } = ensureFrontmatter(filepath, content);
      return {
        filename: file,
        title: extractTitle(content),
        priority: meta.priority,
        lastAccessedAt: meta.lastAccessedAt,
      };
    });
  }
  catch {
    return [];
  }
}

// --- Archive ---

/**
 * Archive a memory: move from hot directory to archive directory
 */
export function archiveMemory(token: string, filename: string): boolean {
  ensureUserDir(token);
  ensureArchiveDir(token);

  const hotPath = getSafeFilepath(token, filename);
  if (!hotPath) {
    return false;
  }

  if (!existsSync(hotPath)) {
    return false;
  }

  const archivePath = getSafeArchiveFilepath(token, filename);
  if (!archivePath) {
    return false;
  }

  renameSync(hotPath, archivePath);
  return true;
}

/**
 * Search archived memories using Fuse.js, same interface as readMemories
 */
export function searchArchive(token: string, query?: string): string[] {
  ensureArchiveDir(token);
  const archiveDir = getArchiveDir(token);

  try {
    const files = readdirSync(archiveDir).filter((f: string) => f.endsWith('.md'));

    const memories = files.map((file: string) => {
      const content = readFileSync(join(archiveDir, file), 'utf-8');
      return { file, content };
    });

    if (query) {
      const terms = query
        .trim()
        .split(/[\s\-_,;:]+/)
        .filter(term => term.length > 0);

      if (terms.length === 0) {
        return memories.map(m => formatMemory(m));
      }

      const fuse = new Fuse(memories, {
        keys: ['file', 'content'],
        threshold: 0.3,
        includeScore: true,
        minMatchCharLength: 1,
        useExtendedSearch: true,
      });

      const resultSets = terms.map((term) => {
        const res = fuse.search(term);
        return new Set(res.map(r => memories.indexOf(r.item)));
      });

      let matchedIndices = resultSets[0] || new Set<number>();
      for (let i = 1; i < resultSets.length; i++) {
        const current = resultSets[i];
        matchedIndices = new Set([...matchedIndices].filter(x => current?.has(x)));
      }

      const results = Array.from(matchedIndices)
        .map(idx => memories[idx])
        .filter((m): m is typeof memories[0] => m !== undefined)
        .sort((a, b) => {
          const scoreA = terms.filter(t =>
            a.file.toLowerCase().includes(t.toLowerCase())
            || a.content.toLowerCase().includes(t.toLowerCase()),
          ).length;
          const scoreB = terms.filter(t =>
            b.file.toLowerCase().includes(t.toLowerCase())
            || b.content.toLowerCase().includes(t.toLowerCase()),
          ).length;
          return scoreB - scoreA;
        });

      return results.map(m => formatMemory(m));
    }

    return memories.map(m => formatMemory(m));
  }
  catch {
    return [];
  }
}

// --- Eviction ---

function maybeEvict(token: string) {
  const now = Date.now();
  const last = lastEvictionTime.get(token) ?? 0;
  if (now - last < EVICTION_INTERVAL_MS)
    return;
  lastEvictionTime.set(token, now);
  evictMemories(token);
}

export interface EvictResult {
  archived: string[]
  kept: string[]
  dryRun: boolean
}

const P2_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const P1_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_HOT_COUNT = 50;

/**
 * Evict stale memories from hot storage to archive.
 *
 * - P0: never evict
 * - P2 where now - lastAccessedAt > 30 days: archive
 * - P1 where now - lastAccessedAt > 90 days: archive
 * - If still over maxHotCount: evict oldest-accessed P2 first, then oldest P1
 */
export function evictMemories(token: string, options?: { dryRun?: boolean, maxHotCount?: number }): EvictResult {
  const dryRun = options?.dryRun ?? false;
  const maxHotCount = options?.maxHotCount ?? DEFAULT_MAX_HOT_COUNT;

  ensureUserDir(token);
  ensureArchiveDir(token);

  const userDir = getUserDir(token);
  const files = readdirSync(userDir).filter((f: string) => f.endsWith('.md'));

  const now = Date.now();
  const archived: string[] = [];
  const remaining: { file: string, meta: MemoryMeta }[] = [];

  for (const file of files) {
    const filepath = join(userDir, file);
    const content = readFileSync(filepath, 'utf-8');
    const { meta } = ensureFrontmatter(filepath, content);

    const age = now - new Date(meta.lastAccessedAt).getTime();

    if (meta.priority === 'P0') {
      remaining.push({ file, meta });
      continue;
    }

    if (meta.priority === 'P2' && age > P2_MAX_AGE_MS) {
      archived.push(file);
      if (!dryRun) {
        archiveMemory(token, file);
      }
      continue;
    }

    if (meta.priority === 'P1' && age > P1_MAX_AGE_MS) {
      archived.push(file);
      if (!dryRun) {
        archiveMemory(token, file);
      }
      continue;
    }

    remaining.push({ file, meta });
  }

  if (remaining.length > maxHotCount) {
    const p2s = remaining
      .filter(r => r.meta.priority === 'P2')
      .sort((a, b) => new Date(a.meta.lastAccessedAt).getTime() - new Date(b.meta.lastAccessedAt).getTime());

    const p1s = remaining
      .filter(r => r.meta.priority === 'P1')
      .sort((a, b) => new Date(a.meta.lastAccessedAt).getTime() - new Date(b.meta.lastAccessedAt).getTime());

    const evictCandidates = [...p2s, ...p1s];

    let toEvict = remaining.length - maxHotCount;
    for (const candidate of evictCandidates) {
      if (toEvict <= 0)
        break;
      archived.push(candidate.file);
      if (!dryRun) {
        archiveMemory(token, candidate.file);
      }
      toEvict--;
    }
  }

  const archivedSet = new Set(archived);
  const kept = files.filter(f => !archivedSet.has(f));

  return { archived, kept, dryRun };
}

/**
 * Generate a new user token
 */
export function generateToken(): string {
  return randomBytes(16).toString('hex');
}
