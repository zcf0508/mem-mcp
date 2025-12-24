# mem-mcp

A memory MCP (Model Context Protocol) server that allows AI assistants to store, read, update, and delete user memories.

## Features

- **Multi-user support**: Each user token gets isolated memory storage
- **CRUD operations**: Create, Read, Update, Delete memories
- **Query filtering**: Search memories by content or filename
- **Markdown format**: Memories stored as `.md` files with metadata
- **HTTP + SSE**: Supports both POST requests and Server-Sent Events

## Tools

| Tool | Description |
|------|-------------|
| `read_memory` | Read memories, optionally filtered by query |
| `write_memory` | Create a new memory with title and content |
| `update_memory` | Update an existing memory |
| `delete_memory` | Delete a memory by filename |

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
│   ├── note-1.md
│   └── note-2.md
├── user-token-2/
│   └── note-a.md
└── ...
```

## License

MIT
