# mem-mcp

A memory MCP (Model Context Protocol) server that allows AI assistants to store, read, update, and delete user memories, with built-in memory eviction to keep context lean and relevant.

## Features

- **Multi-user support**: Each user token gets isolated memory storage
- **CRUD operations**: Create, Read, Update, Delete memories
- **Query filtering**: Search memories by content or filename (Fuse.js fuzzy search)
- **Markdown format**: Memories stored as `.md` files with YAML frontmatter metadata
- **HTTP + SSE**: Supports both POST requests and Server-Sent Events
- **Priority system**: P0 (core/permanent), P1 (project/90 days), P2 (temporary/30 days)
- **Automatic eviction**: Lazy eviction on read, archiving stale memories based on last access time
- **Hot/cold storage**: Active memories stay in hot storage; evicted memories move to a searchable archive

## Tools

| Tool | Description |
|------|-------------|
| `list_memory_titles` | List all memory titles with priority and last access time |
| `read_memory` | Read memories, optionally filtered by query |
| `write_memory` | Create a new memory with title, content, and optional priority (`P0`/`P1`/`P2`) |
| `update_memory` | Update an existing memory, optionally change priority |
| `delete_memory` | Delete a memory by filename |
| `search_archive` | Search archived (evicted) memories for recall |
| `evict_memories` | Manually run eviction sweep (supports `dryRun` preview) |

## Memory Priority

Each memory has a priority level that determines its eviction behavior:

| Priority | TTL | Use for |
|----------|-----|---------|
| `P0` | Never evicted | Core identity, long-term preferences, safety rules |
| `P1` | 90 days since last access | Current projects, active strategies, ongoing plans |
| `P2` | 30 days since last access | One-off events, debug notes, temporary preferences |

Default priority is `P2`. Eviction is based on **last access time**, not creation time — frequently used memories stay hot regardless of age.

## Eviction Mechanism

Eviction runs **lazily on read**, throttled to at most once per 24 hours per user:

1. Scan all hot memories
2. Archive P2 memories not accessed in 30 days
3. Archive P1 memories not accessed in 90 days
4. If still over capacity (default: 50 files), archive oldest-accessed P2 first, then P1
5. P0 memories are never archived

Archived memories are moved to `memories/:token/archive/` and remain searchable via `search_archive`.

## Quick Start

### Local Development

```bash
pnpm install
pnpm dev
```

### Production

```bash
pnpm build
pnpm start
```

### Docker

```bash
docker-compose up -d
```

See [DOCKER.md](DOCKER.md) for detailed Docker setup instructions.

## API Endpoint

```
POST http://localhost:3000/mcp/:token
GET  http://localhost:3000/mcp/:token  (SSE)
```

The `:token` parameter isolates each user's memories. Memories are stored in `memories/:token/` directory.

## Directory Structure

```
memories/
├── user-token-1/
│   ├── archive/          # evicted memories (cold storage)
│   │   └── old-note.md
│   ├── note-1.md         # active memories (hot storage)
│   └── note-2.md
└── ...
```

## Memory File Format

```md
---
priority: P1
createdAt: 2026-01-15T12:00:00.000Z
updatedAt: 2026-02-01T08:00:00.000Z
lastAccessedAt: 2026-02-10T10:30:00.000Z
---
# Memory Title

Memory content here.

---
*Created: 2026-01-15T12:00:00.000Z*
```

Legacy files without frontmatter are automatically migrated on first access.

## License

MIT
