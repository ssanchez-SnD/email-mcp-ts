import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { config } from './lib/config.js';
import { createEmailService } from './lib/email-service.js';
import { appendRawMessage, deleteEmail, getEmail, getUnreadCount, listFolders, listRecentEmails, moveEmail, searchEmails, updateEmailFlags } from './lib/imap.js';
import { sendRawMessage } from './lib/smtp.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

const requestCounters = new Map<string, { count: number; resetAt: number }>();

type RateLimitOptions = {
  windowMs: number;
  limit: number;
  keyFn: (req: express.Request) => string;
  message: string;
};

function createRateLimit({ windowMs, limit, keyFn, message }: RateLimitOptions) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = keyFn(req);
    const now = Date.now();
    const current = requestCounters.get(key);

    if (!current || now >= current.resetAt) {
      requestCounters.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= limit) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(retryAfterSeconds, 1)));
      return res.status(429).json({ error: message });
    }

    current.count += 1;
    requestCounters.set(key, current);
    return next();
  };
}

const globalRateLimit = createRateLimit({
  windowMs: 60_000,
  limit: 60,
  keyFn: (req) => req.ip ?? 'unknown-ip',
  message: 'Too many requests. Please retry later.'
});

const mcpRateLimit = createRateLimit({
  windowMs: 60_000,
  limit: 30,
  keyFn: (req) => `${req.ip ?? 'unknown-ip'}:${req.header('authorization') ?? 'anonymous'}`,
  message: 'Rate limit exceeded for MCP endpoint.'
});

app.use(globalRateLimit);
app.use(config.mcpPath, mcpRateLimit);

app.use((req, res, next) => {
  if (req.path !== config.mcpPath) return next();
  const auth = req.header('authorization');
  if (!auth || auth !== `Bearer ${config.apiKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

const transports: Record<string, StreamableHTTPServerTransport> = {};

const emailService = createEmailService(
  {
    listFolders,
    getEmail,
    searchEmails,
    moveEmail,
    deleteEmail,
    updateEmailFlags,
    appendMessage: appendRawMessage,
    sendRawMessage
  },
  {
    fromAddress: config.smtp.from,
    defaultMailbox: config.imap.mailbox,
    sentMailbox: config.mailboxes.sent,
    draftsMailbox: config.mailboxes.drafts
  }
);

function buildServer() {
  const server = new McpServer({ name: 'email-mcp-ts', version: '0.1.0' });

  server.registerTool('get_unread_count', {
    title: 'Get unread count',
    description: 'Returns unread and total email counts for the configured mailbox.',
    inputSchema: {
      mailbox: z.string().max(300).optional()
    }
  }, async ({ mailbox }) => ({
    content: [{ type: 'text', text: JSON.stringify(await getUnreadCount(mailbox), null, 2) }]
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
    description: 'Lists recent emails from the configured mailbox using cursor-based pagination.',
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional(),
      cursor: z.string().max(300).optional(),
      mailbox: z.string().max(300).optional()
    }
  }, async ({ limit, cursor, mailbox }) => ({
    content: [{ type: 'text', text: JSON.stringify(await listRecentEmails(limit ?? 10, cursor, mailbox), null, 2) }]
  }));

  server.registerTool('get_email', {
    title: 'Get email',
    description: 'Gets the full detail of one email by its IMAP UID.',
    inputSchema: {
      uid: z.number().int().positive(),
      mailbox: z.string().max(300).optional()
    }
  }, async ({ uid, mailbox }) => ({
    content: [{ type: 'text', text: JSON.stringify(await getEmail(uid, mailbox), null, 2) }]
  }));

  server.registerTool('search_emails', {
    title: 'Search emails',
    description: 'Search emails by sender, subject, body text, and/or unread state with pagination.',
    inputSchema: {
      from: z.string().max(320).optional(),
      to: z.string().max(320).optional(),
      cc: z.string().max(320).optional(),
      subject: z.string().max(500).optional(),
      text: z.string().max(4_000).optional(),
      unseen: z.boolean().optional(),
      flagged: z.boolean().optional(),
      deleted: z.boolean().optional(),
      draft: z.boolean().optional(),
      answered: z.boolean().optional(),
      after: z.string().max(40).optional(),
      before: z.string().max(40).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      cursor: z.string().max(300).optional(),
      mailboxes: z.array(z.string().max(300)).optional()
    }
  }, async (args) => ({
    content: [{ type: 'text', text: JSON.stringify(await searchEmails(args), null, 2) }]
  }));

  server.registerTool('move_email', {
    title: 'Move email',
    description: 'Moves a message to another IMAP mailbox.',
    inputSchema: {
      uid: z.number().int().positive(),
      mailbox: z.string().max(300).optional(),
      destinationMailbox: z.string().max(300)
    }
  }, async ({ uid, mailbox, destinationMailbox }) => ({
    content: [{ type: 'text', text: JSON.stringify(await moveEmail(uid, destinationMailbox, mailbox), null, 2) }]
  }));

  server.registerTool('delete_email', {
    title: 'Delete email',
    description: 'Deletes a message from IMAP.',
    inputSchema: {
      uid: z.number().int().positive(),
      mailbox: z.string().max(300).optional()
    }
  }, async ({ uid, mailbox }) => ({
    content: [{ type: 'text', text: JSON.stringify(await deleteEmail(uid, mailbox), null, 2) }]
  }));

  server.registerTool('update_email_flags', {
    title: 'Update email flags',
    description: 'Marks a message as seen, flagged, deleted, draft, or answered.',
    inputSchema: {
      uid: z.number().int().positive(),
      mailbox: z.string().max(300).optional(),
      seen: z.boolean().optional(),
      flagged: z.boolean().optional(),
      deleted: z.boolean().optional(),
      draft: z.boolean().optional(),
      answered: z.boolean().optional()
    }
  }, async ({ uid, mailbox, ...flags }) => ({
    content: [{ type: 'text', text: JSON.stringify(await updateEmailFlags(uid, flags, mailbox), null, 2) }]
  }));

  server.registerTool('create_draft', {
    title: 'Create draft',
    description: 'Stores a draft in the resolved Drafts mailbox.',
    inputSchema: {
      mailbox: z.string().max(300).optional(),
      to: z.array(z.string().max(320)).min(1),
      cc: z.array(z.string().max(320)).optional(),
      subject: z.string().max(500),
      text: z.string().max(50_000).optional(),
      html: z.string().max(200_000).optional(),
      inReplyTo: z.string().max(500).optional(),
      references: z.array(z.string().max(500)).optional(),
      attachments: z.array(z.object({
        filename: z.string().max(255),
        contentBase64: z.string().max(5_000_000),
        contentType: z.string().max(200).optional()
      })).optional()
    }
  }, async ({ attachments, ...args }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify(await emailService.createDraft({
        ...args,
        attachments: attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: Buffer.from(attachment.contentBase64, 'base64'),
          contentType: attachment.contentType
        }))
      }), null, 2)
    }]
  }));

  server.registerTool('reply_email', {
    title: 'Reply email',
    description: 'Replies to a message, sends it via SMTP, and stores a copy in Sent.',
    inputSchema: {
      mailbox: z.string().max(300).optional(),
      uid: z.number().int().positive(),
      replyAll: z.boolean().optional(),
      text: z.string().max(50_000).optional(),
      html: z.string().max(200_000).optional(),
      attachments: z.array(z.object({
        filename: z.string().max(255),
        contentBase64: z.string().max(5_000_000),
        contentType: z.string().max(200).optional()
      })).optional()
    }
  }, async ({ attachments, ...args }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify(await emailService.replyEmail({
        ...args,
        attachments: attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: Buffer.from(attachment.contentBase64, 'base64'),
          contentType: attachment.contentType
        }))
      }), null, 2)
    }]
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
