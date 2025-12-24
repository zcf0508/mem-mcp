import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { deleteMemory, readMemories, updateMemory, writeMemory } from './mem.js';

const PORT = 3000;

// Store token for current request
const tokenContext = new AsyncLocalStorage<string>();

function createServer_() {
  const server = new McpServer({
    name: 'memory-mcp-server',
    version: '1.0.0',
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
      const token = tokenContext.getStore();
      if (!token)
        throw new Error('Token not found in context');
      const memories = readMemories(token, params.query);
      return {
        content: [
          {
            type: 'text' as const,
            text: memories.length > 0
              ? memories.join('\n\n---\n\n')
              : 'No memories found',
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
      },
    },
    async (params) => {
      const token = tokenContext.getStore();
      if (!token)
        throw new Error('Token not found in context');
      const filename = writeMemory(token, params.title, params.content);
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
      description: 'Update an existing memory for a user',
      inputSchema: {
        filename: z.string().describe('Current filename of the memory'),
        title: z.string().describe('New title of the memory'),
        content: z.string().describe('New content of the memory'),
      },
    },
    async (params) => {
      const token = tokenContext.getStore();
      if (!token)
        throw new Error('Token not found in context');
      const success = updateMemory(token, params.filename, params.title, params.content);
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
      const token = tokenContext.getStore();
      if (!token)
        throw new Error('Token not found in context');
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

  return server;
}

const httpServer = createServer();

httpServer.on('request', async (req, res) => {
  // Parse URL to extract token from /mcp/:token
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathParts = url.pathname.split('/').filter(Boolean);

  if (pathParts[0] === 'mcp' && pathParts[1]) {
    const token = pathParts[1];

    // Run handler within token context
    await tokenContext.run(token, async () => {
      // Create new server instance per request (to avoid state sharing)
      const server = createServer_();
      const transport = new StreamableHTTPServerTransport();
      await server.connect(transport);

      if (req.method === 'POST') {
        // Collect body
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const parsedBody = JSON.parse(body);
            await transport.handleRequest(req, res, parsedBody);
          }
          catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
      }
      else if (req.method === 'GET') {
        // SSE stream
        await transport.handleRequest(req, res);
      }
      else {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      }
    });
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
