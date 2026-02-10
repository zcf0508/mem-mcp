import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import pkg from '../package.json' with { type: 'json' };
import {
  deleteMemory,
  evictMemories,
  listMemoryTitles,
  readMemories,
  searchArchive,
  updateMemory,
  writeMemory,
} from './mem.js';

const PORT = 3000;

function createServer_(token: string) {
  const server = new McpServer({
    name: 'memory-mcp-server',
    version: pkg.version,
  });

  // Register read_memory tool
  server.registerTool(
    'read_memory',
    {
      title: 'Read Memory',
      description: 'Read memories for a user, optionally filtered by query',
      inputSchema: {
        query: z.string().optional().describe('Search query to filter memories'),
      },
    },
    async (params) => {
      const memories = readMemories(token, params.query);
      return {
        content: [
          {
            type: 'text' as const,
            text: memories.length > 0
              ? memories.join('\n\n---\n\n')
              : 'No memories found. Try `list_memory_titles` first to see all available memories.',
          },
        ],
      };
    },
  );

  // Register write_memory tool
  server.registerTool(
    'write_memory',
    {
      title: 'Write Memory',
      description: 'Write a memory for a user',
      inputSchema: {
        title: z.string().describe('Title of the memory'),
        content: z.string().describe('Content of the memory'),
        priority: z.enum(['P0', 'P1', 'P2']).optional().describe('Priority level: P0=core/permanent, P1=project/90d, P2=temporary/30d. Default: P2'),
      },
    },
    async (params) => {
      const filename = writeMemory(token, params.title, params.content, params.priority);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Memory saved to ${filename}`,
          },
        ],
      };
    },
  );

  // Register update_memory tool
  server.registerTool(
    'update_memory',
    {
      title: 'Update Memory',
      description: 'Update an existing memory for a user. IMPORTANT: Preserve the original content and only add or modify specific parts. Do NOT summarize or condense existing content. If adding new information, append it to the existing content. If correcting information, only change the specific incorrect parts.',
      inputSchema: {
        filename: z.string().describe('Current filename of the memory'),
        title: z.string().describe('New title of the memory'),
        content: z.string().describe('New content of the memory. Must preserve original content - only append new information or modify specific parts, never summarize or condense.'),
        priority: z.enum(['P0', 'P1', 'P2']).optional().describe('Priority level: P0=core/permanent, P1=project/90d, P2=temporary/30d. Default: P2'),
      },
    },
    async (params) => {
      const success = updateMemory(token, params.filename, params.title, params.content, params.priority);
      return {
        content: [
          {
            type: 'text' as const,
            text: success ? 'Memory updated successfully' : 'Memory not found',
          },
        ],
      };
    },
  );

  // Register delete_memory tool
  server.registerTool(
    'delete_memory',
    {
      title: 'Delete Memory',
      description: 'Delete a memory for a user',
      inputSchema: {
        filename: z.string().describe('Filename of the memory to delete'),
      },
    },
    async (params) => {
      const success = deleteMemory(token, params.filename);
      return {
        content: [
          {
            type: 'text' as const,
            text: success ? 'Memory deleted successfully' : 'Memory not found',
          },
        ],
      };
    },
  );

  // Register list_memory_titles tool
  server.registerTool(
    'list_memory_titles',
    {
      title: 'List Memory Titles',
      description: 'List all memory titles for discovery. Call this FIRST in new conversations to see what memories exist before querying specific ones.',
      inputSchema: {},
    },
    async () => {
      const titles = listMemoryTitles(token);
      return {
        content: [
          {
            type: 'text' as const,
            text: titles.length > 0
              ? titles.map(t => `${t.filename}|${t.title}|${t.priority}|${t.lastAccessedAt}`).join('\n')
              : 'No memories found',
          },
        ],
      };
    },
  );

  // Register search_archive tool
  server.registerTool(
    'search_archive',
    {
      title: 'Search Archive',
      description: 'Search archived (evicted) memories. Use when current memories don\'t have the answer - old memories may be in the archive.',
      inputSchema: {
        query: z.string().describe('Search query to find in archived memories'),
      },
    },
    async (params) => {
      const results = searchArchive(token, params.query);
      return {
        content: [{
          type: 'text' as const,
          text: results.length > 0
            ? results.join('\n\n---\n\n')
            : 'No archived memories found matching the query.',
        }],
      };
    },
  );

  // Register evict_memories tool
  server.registerTool(
    'evict_memories',
    {
      title: 'Evict Memories',
      description: 'Run memory eviction sweep: archive P2 memories older than 30 days and P1 older than 90 days (based on last access time). P0 memories are never evicted.',
      inputSchema: {
        dryRun: z.boolean().optional().describe('Preview what would be evicted without actually archiving. Default: false'),
      },
    },
    async (params) => {
      const result = evictMemories(token, { dryRun: params.dryRun });
      const lines = [
        result.dryRun ? '## Dry Run Preview' : '## Eviction Complete',
        `Archived: ${result.archived.length} memories`,
        `Kept: ${result.kept.length} memories`,
      ];
      if (result.archived.length > 0) {
        lines.push('', '### Archived:', ...result.archived.map(f => `- ${f}`));
      }
      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n'),
        }],
      };
    },
  );

  return server;
}

const httpServer = createServer();

httpServer.on('request', (req, res) => {
  // Parse URL to extract token from /mcp/:token
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathParts = url.pathname.split('/').filter(Boolean);

  if (pathParts[0] === 'mcp' && pathParts[1]) {
    const token = pathParts[1];

    // Create new server instance per request (to avoid state sharing)
    const server = createServer_(token);
    const transport = new StreamableHTTPServerTransport();
    server.connect(transport);

    if (req.method === 'POST') {
      // Collect body
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const parsedBody = JSON.parse(body);
          transport.handleRequest(req, res, parsedBody);
        }
        catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    }
    else if (req.method === 'GET') {
      // SSE stream
      transport.handleRequest(req, res);
    }
    else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }
  }
  else if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        message: 'Memory MCP Server is running',
        endpoint: 'POST /mcp/:token (or GET /mcp/:token for SSE)',
        example: 'POST http://localhost:3000/mcp/user-token-123',
      }),
    );
  }
  else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

httpServer.listen(PORT, () => {
  console.log(`🦊 Memory MCP Server running at http://localhost:${PORT}`);
  console.log(`📍 Endpoint: POST http://localhost:${PORT}/mcp/:token`);
});
