# Docker Setup Guide

## Quick Start

### 1. Default Setup (Memories in current directory)

```bash
docker-compose up -d
```

This will:
- Build the image
- Start the container on port 3000
- Create/use `./memories` directory for data storage
- Server runs at `http://localhost:3000`

### 2. Custom Memories Path

#### Option A: Environment Variable

```bash
export MEMORIES_PATH=/path/to/my/memories
docker-compose up -d
```

Or on Windows:
```powershell
$env:MEMORIES_PATH="C:\my\memories"
docker-compose up -d
```

#### Option B: Command Line

```bash
MEMORIES_PATH=/custom/path docker-compose up -d
```

Or in `docker-compose.yml`:
```yaml
volumes:
  - /your/custom/path:/app/memories
```

#### Option C: .env File

1. Copy the example file:
```bash
cp .env.example .env
```

2. Edit `.env` and set `MEMORIES_PATH`:
```
MEMORIES_PATH=/path/to/memories
MCP_PORT=3000
```

3. Run:
```bash
docker-compose up -d
```

## Usage Examples

### Absolute Path on Linux/Mac
```bash
MEMORIES_PATH=/var/mcp/memories docker-compose up -d
```

### Absolute Path on Windows (PowerShell)
```powershell
$env:MEMORIES_PATH="C:\Users\Username\mcp\memories"
docker-compose up -d
```

### Relative Path
```bash
MEMORIES_PATH=./data/memories docker-compose up -d
```

### Using Named Volume (Docker-managed)
Edit `docker-compose.yml`:
```yaml
volumes:
  - memory-data:/app/memories

volumes:
  memory-data:
```

Then:
```bash
docker-compose up -d
docker volume inspect memory-data
```

## Common Commands

### View Logs
```bash
docker-compose logs -f memory-mcp-server
```

### Stop Server
```bash
docker-compose down
```

### Stop and Remove Volumes
```bash
docker-compose down -v
```

### Restart Server
```bash
docker-compose restart
```

### Check Status
```bash
docker-compose ps
```

### Access Container Shell
```bash
docker-compose exec memory-mcp-server sh
```

## Configuration

### Port Customization
Change port in `.env` or via environment:
```bash
MCP_PORT=8080 docker-compose up -d
```

Then access at `http://localhost:8080`

### Persistent Data Directory Structure
Your memories directory will look like:
```
memories/
├── user-token-1/
│   ├── note-1.md
│   ├── note-2.md
│   └── ...
├── user-token-2/
│   ├── note-a.md
│   └── ...
└── ...
```

Each token gets its own directory for complete isolation.

## Health Check

The container includes a health check that verifies the server is responding:
```bash
docker-compose exec memory-mcp-server wget --quiet --tries=1 --spider http://localhost:3000/
```

Check health status:
```bash
docker-compose ps
```

## Building from Source

If you modify the source code:

```bash
# Rebuild image
docker-compose build

# Rebuild and start fresh
docker-compose up -d --build
```

## Production Deployment

### Using Docker Swarm
```bash
docker stack deploy -c docker-compose.yml memory-mcp
```

### Using Kubernetes
Convert docker-compose to Kubernetes manifests:
```bash
kompose convert -f docker-compose.yml
kubectl apply -f *.yaml
```

### Using with Other Services
Add to your existing docker-compose.yml:
```yaml
version: '3.8'

services:
  # ... your other services ...

  memory-mcp-server:
    build:
      context: ./memory-mcp
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - ./data/memories:/app/memories
    environment:
      - NODE_ENV=production
    depends_on:
      - other-service
```

## Troubleshooting

### Permission Denied on Linux
If you get permission errors on the memories directory:

```bash
# Create directory with proper permissions
mkdir -p /path/to/memories
chmod 777 /path/to/memories

# Then run
docker-compose up -d
```

Or use user mapping in docker-compose.yml:
```yaml
services:
  memory-mcp-server:
    user: "1000:1000"  # Your UID:GID
```

### Port Already in Use
```bash
# Change port
MCP_PORT=3001 docker-compose up -d

# Or find what's using port 3000
lsof -i :3000  # Linux/Mac
netstat -ano | findstr :3000  # Windows
```

### Volume Mount Issues on Windows
Use forward slashes in paths:
```bash
MEMORIES_PATH=C:/Users/Username/mcp/memories docker-compose up -d
```

Or use Docker Desktop's built-in path mapping.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_PORT` | 3000 | Server port |
| `MEMORIES_PATH` | ./memories | Host path for memories storage |
| `NODE_ENV` | production | Node environment |

## Monitoring

### Container Stats
```bash
docker-compose stats
```

### Memory Usage
```bash
docker-compose ps --format "table {{.Names}}\t{{.Status}}"
```

## Backup

### Backup Memories
```bash
# Create backup of memories directory
tar -czf memories-backup-$(date +%Y%m%d).tar.gz -C $(pwd) memories/
```

### Restore from Backup
```bash
tar -xzf memories-backup-20250101.tar.gz
docker-compose restart
```
