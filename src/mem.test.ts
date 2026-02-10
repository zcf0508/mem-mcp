import type { MemoryMeta } from './mem.js';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  listMemoryTitles,
  parseFrontmatter,
  readMemories,
  serializeFrontmatter,
  updateMemory,
  writeMemory,
} from './mem.js';

const TEST_TOKEN = `test-${Date.now()}`;
const TEST_DIR = join('memories', TEST_TOKEN);

beforeEach(() => {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const content = `---\npriority: P1\ncreatedAt: 2026-01-01T00:00:00.000Z\nupdatedAt: 2026-01-02T00:00:00.000Z\nlastAccessedAt: 2026-01-03T00:00:00.000Z\n---\n# Title\n\nBody`;
    const { meta, body } = parseFrontmatter(content);
    expect(meta).toEqual({
      priority: 'P1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      lastAccessedAt: '2026-01-03T00:00:00.000Z',
    });
    expect(body).toBe('# Title\n\nBody');
  });

  it('returns null meta for content without frontmatter', () => {
    const content = '# Title\n\nJust a plain file';
    const { meta, body } = parseFrontmatter(content);
    expect(meta).toBeNull();
    expect(body).toBe(content);
  });

  it('returns null meta for incomplete frontmatter', () => {
    const content = `---\npriority: P1\ncreatedAt: 2026-01-01T00:00:00.000Z\n---\n# Title`;
    const { meta } = parseFrontmatter(content);
    expect(meta).toBeNull();
  });

  it('returns null meta for invalid priority', () => {
    const content = `---\npriority: P3\ncreatedAt: 2026-01-01T00:00:00.000Z\nupdatedAt: 2026-01-01T00:00:00.000Z\nlastAccessedAt: 2026-01-01T00:00:00.000Z\n---\n# Title`;
    const { meta } = parseFrontmatter(content);
    expect(meta).toBeNull();
  });
});

describe('serializeFrontmatter', () => {
  it('roundtrips with parseFrontmatter', () => {
    const meta: MemoryMeta = {
      priority: 'P0',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      lastAccessedAt: '2026-01-03T00:00:00.000Z',
    };
    const body = '# Title\n\nContent';
    const serialized = serializeFrontmatter(meta, body);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.meta).toEqual(meta);
    expect(parsed.body).toBe(body);
  });
});

describe('ensureFrontmatter (via integration)', () => {
  it('migrates legacy file on read', () => {
    const legacyContent = '# Old Note\n\nSome content\n\n---\n*Created: 2025-12-24T15:22:18.784Z*';
    writeFileSync(join(TEST_DIR, 'old-note.md'), legacyContent, 'utf-8');

    readMemories(TEST_TOKEN);

    const updated = readFileSync(join(TEST_DIR, 'old-note.md'), 'utf-8');
    const { meta } = parseFrontmatter(updated);
    expect(meta).not.toBeNull();
    expect(meta!.priority).toBe('P2');
    expect(meta!.createdAt).toBe('2025-12-24T15:22:18.784Z');
  });

  it('preserves existing frontmatter on read', () => {
    const meta: MemoryMeta = {
      priority: 'P0',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastAccessedAt: '2026-01-01T00:00:00.000Z',
    };
    const body = '# Important\n\nCore info';
    writeFileSync(join(TEST_DIR, 'important.md'), serializeFrontmatter(meta, body), 'utf-8');

    readMemories(TEST_TOKEN);

    const updated = readFileSync(join(TEST_DIR, 'important.md'), 'utf-8');
    const parsed = parseFrontmatter(updated);
    expect(parsed.meta!.priority).toBe('P0');
    expect(parsed.meta!.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(new Date(parsed.meta!.lastAccessedAt).getTime()).toBeGreaterThan(new Date('2026-01-01').getTime());
  });

  it('migrates legacy file without Created footer using file mtime', () => {
    const legacyContent = '# No Footer\n\nJust content, no date footer';
    writeFileSync(join(TEST_DIR, 'no-footer.md'), legacyContent, 'utf-8');

    readMemories(TEST_TOKEN);

    const updated = readFileSync(join(TEST_DIR, 'no-footer.md'), 'utf-8');
    const { meta } = parseFrontmatter(updated);
    expect(meta).not.toBeNull();
    expect(meta!.priority).toBe('P2');
    expect(meta!.createdAt).toBeTruthy();
  });
});

describe('writeMemory with priority', () => {
  it('writes P0 memory with frontmatter', () => {
    const filename = writeMemory(TEST_TOKEN, 'Core Rule', 'Never do X', 'P0');
    const content = readFileSync(join(TEST_DIR, filename), 'utf-8');
    const { meta } = parseFrontmatter(content);
    expect(meta!.priority).toBe('P0');
  });

  it('defaults to P2', () => {
    const filename = writeMemory(TEST_TOKEN, 'Temp Note', 'Quick note');
    const content = readFileSync(join(TEST_DIR, filename), 'utf-8');
    const { meta } = parseFrontmatter(content);
    expect(meta!.priority).toBe('P2');
  });
});

describe('updateMemory with priority', () => {
  it('changes priority on update', () => {
    const filename = writeMemory(TEST_TOKEN, 'Promote Me', 'Started as P2');
    updateMemory(TEST_TOKEN, filename, 'Promote Me', 'Now P1', 'P1');
    const content = readFileSync(join(TEST_DIR, filename), 'utf-8');
    const { meta } = parseFrontmatter(content);
    expect(meta!.priority).toBe('P1');
  });

  it('preserves priority when not specified', () => {
    const filename = writeMemory(TEST_TOKEN, 'Keep Priority', 'Content', 'P0');
    updateMemory(TEST_TOKEN, filename, 'Keep Priority', 'Updated content');
    const content = readFileSync(join(TEST_DIR, filename), 'utf-8');
    const { meta } = parseFrontmatter(content);
    expect(meta!.priority).toBe('P0');
  });
});

describe('listMemoryTitles', () => {
  it('returns priority and lastAccessedAt', () => {
    writeMemory(TEST_TOKEN, 'List Test', 'Content', 'P1');
    const titles = listMemoryTitles(TEST_TOKEN);
    expect(titles.length).toBe(1);
    expect(titles[0]!.priority).toBe('P1');
    expect(titles[0]!.lastAccessedAt).toBeTruthy();
  });
});
