import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { config } from './lib/config.js';
import { getEmail, getUnreadCount, listFolders, listRecentEmails, searchEmails } from './lib/imap.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  if (req.path !== config.mcpPath) return next();
  const auth = req.header('authorization');
  if (!auth || auth !== `Bearer ${config.apiKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

const transports: Record<string, StreamableHTTPServerTransport> = {};

function buildServer() {
  const server = new McpServer({ name: 'email-mcp-ts', version: '0.1.0' });

  server.registerTool('get_unread_count', {
    title: 'Get unread count',
    description: 'Returns unread and total email counts for the configured mailbox.',
    inputSchema: {}
  }, async () => ({
    content: [{ type: 'text', text: JSON.stringify(await getUnreadCount(), null, 2) }]
  }));

  server.registerTool('list_folders', {
    title: 'List folders',
    description: 'Lists available IMAP folders.',
    inputSchema: {}
  }, async () => ({
    content: [{ type: 'text', text: JSON.stringify(await listFolders(), null, 2) }]
  }));

  server.registerTool('list_recent_emails', {
    title: 'List recent emails',
    description: 'Lists recent emails from the configured mailbox.',
    inputSchema: { limit: z.number().int().min(1).max(50).optional() }
  }, async ({ limit }) => ({
    content: [{ type: 'text', text: JSON.stringify(await listRecentEmails(limit ?? 10), null, 2) }]
  }));

  server.registerTool('get_email', {
    title: 'Get email',
    description: 'Gets the full detail of one email by its IMAP UID.',
    inputSchema: { uid: z.number().int().positive() }
  }, async ({ uid }) => ({
    content: [{ type: 'text', text: JSON.stringify(await getEmail(uid), null, 2) }]
  }));

  server.registerTool('search_emails', {
    title: 'Search emails',
    description: 'Search emails by sender, subject, body text, and/or unread state.',
    inputSchema: {
      from: z.string().optional(),
      subject: z.string().optional(),
      text: z.string().optional(),
      unseen: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).optional()
    }
  }, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await searchEmails(args), null, 2) }]
  }));

  return server;
}

app.post(config.mcpPath, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => { transports[id] = transport; }
    });
    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };
    await buildServer().connect(transport);
  } else {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: no session or invalid init' },
      id: null
    });
  }

  await transport.handleRequest(req, res, req.body);
});

async function handleSessionRequest(req: express.Request, res: express.Response) {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId])
    return res.status(400).send('Invalid or missing session ID');
  await transports[sessionId].handleRequest(req, res);
}

app.get(config.mcpPath, handleSessionRequest);
app.delete(config.mcpPath, handleSessionRequest);

app.get('/health', (_req, res) => res.json({ ok: true, service: 'email-mcp-ts' }));

app.listen(config.port, () => {
  console.log(`email-mcp-ts listening on :${config.port}${config.mcpPath}`);
});
