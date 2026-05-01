import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from './config.js';

export type EmailSummary = {
  uid: number;
  messageId: string | null;
  from: string;
  subject: string;
  date: string | null;
  isUnread: boolean;
  snippet: string;
};

export type EmailDetail = EmailSummary & {
  to: string[];
  cc: string[];
  flags: string[];
  textBody: string;
  htmlBodySanitized: string | null;
  attachments: { filename: string; mimeType: string; sizeBytes: number }[];
};

export type PaginationResult<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

const IMAP_CONNECT_TIMEOUT_MS = 10_000;
const IMAP_OPERATION_TIMEOUT_MS = 20_000;
const IMAP_RETRIES = 2;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`IMAP timeout in ${operation} after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  });
}

function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return [
    'timeout',
    'timed out',
    'econnreset',
    'socket hang up',
    'connection closed',
    'network'
  ].some((needle) => message.includes(needle));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= IMAP_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === IMAP_RETRIES || !isTransientError(error)) throw error;
      const backoffMs = 250 * (2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unknown IMAP error');
}

function encodeCursor(uid: number): string {
  return Buffer.from(JSON.stringify({ uid }), 'utf8').toString('base64url');
}

function decodeCursor(cursor?: string): number | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { uid?: unknown };
    return typeof parsed.uid === 'number' && parsed.uid > 0 ? parsed.uid : null;
  } catch {
    return null;
  }
}

async function withClient<T>(fn: (client: ImapFlow) => Promise<T>) {
  return withRetry(async () => {
    const client = new ImapFlow({
      host: config.imap.host,
      port: config.imap.port,
      secure: config.imap.secure,
      auth: config.imap.auth
    });
    await withTimeout(client.connect(), IMAP_CONNECT_TIMEOUT_MS, 'connect');
    try {
      await withTimeout(client.mailboxOpen(config.imap.mailbox), IMAP_OPERATION_TIMEOUT_MS, 'mailboxOpen');
      return await fn(client);
    } finally {
      await client.logout().catch(() => undefined);
    }
  });
}

function summarizeText(input?: string | null, max = 220) {
  const clean = (input ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function sanitizeEmailHtml(html: string | null | undefined): string | null {
  if (typeof html !== 'string') return null;
  let sanitized = html;

  sanitized = sanitized.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  sanitized = sanitized.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?\s*>/gi, '');

  sanitized = sanitized.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  sanitized = sanitized.replace(/\s(href|src)\s*=\s*("|')\s*javascript:[^"']*("|')/gi, '');
  sanitized = sanitized.replace(/\s(href|src)\s*=\s*javascript:[^\s>]*/gi, '');

  sanitized = sanitized.replace(/<a\b([^>]*)>/gi, (_match, attrs) => {
    const hasRel = /\brel\s*=/.test(attrs);
    if (hasRel) return `<a${attrs}>`;
    return `<a${attrs} rel="noopener noreferrer nofollow">`;
  });

  return sanitized;
}

export async function getUnreadCount() {
  return withClient(async (client) => {
    const status = await withTimeout(
      client.status(config.imap.mailbox, { unseen: true, messages: true }),
      IMAP_OPERATION_TIMEOUT_MS,
      'status'
    );
    return { mailbox: config.imap.mailbox, unread: status.unseen ?? 0, total: status.messages ?? 0 };
  });
}

export async function listFolders() {
  return withClient(async (client) => {
    const boxes = await withTimeout(client.list(), IMAP_OPERATION_TIMEOUT_MS, 'list-folders');
    return boxes.map((box) => ({ path: box.path, name: box.name }));
  });
}

export async function listRecentEmails(limit = 10, cursor?: string): Promise<PaginationResult<EmailSummary>> {
  return withClient(async (client) => {
    const allUidsResult = await withTimeout(client.search({ all: true }), IMAP_OPERATION_TIMEOUT_MS, 'search-recent-uids');
    const allUids = Array.isArray(allUidsResult) ? allUidsResult : [];
    const cursorUid = decodeCursor(cursor);
    const eligibleUids = cursorUid ? allUids.filter((uid: number) => uid < cursorUid) : allUids;
    const selected = eligibleUids.slice(-limit);

    const out: EmailSummary[] = [];
    for await (const msg of client.fetch(selected, { uid: true, envelope: true, flags: true, source: true })) {
      const parsed = await simpleParser(msg.source);
      out.push({
        uid: msg.uid,
        messageId: parsed.messageId ?? null,
        from: parsed.from?.text ?? '',
        subject: parsed.subject ?? '(sin asunto)',
        date: parsed.date?.toISOString() ?? null,
        isUnread: !msg.flags?.has('\\Seen'),
        snippet: summarizeText(parsed.text)
      });
    }

    const items = out.sort((a, b) => b.uid - a.uid);
    const hasMore = eligibleUids.length > selected.length;
    const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1].uid) : null;

    return { items, hasMore, nextCursor };
  });
}

export async function getEmail(uid: number): Promise<EmailDetail | null> {
  return withClient(async (client) => {
    for await (const msg of client.fetch(String(uid), { uid: true, envelope: true, flags: true, source: true })) {
      const parsed = await simpleParser(msg.source);
      return {
        uid: msg.uid,
        messageId: parsed.messageId ?? null,
        from: parsed.from?.text ?? '',
        to: parsed.to?.value.map((v: { address?: string | null }) => v.address ?? '').filter(Boolean) ?? [],
        cc: parsed.cc?.value.map((v: { address?: string | null }) => v.address ?? '').filter(Boolean) ?? [],
        subject: parsed.subject ?? '(sin asunto)',
        date: parsed.date?.toISOString() ?? null,
        isUnread: !msg.flags?.has('\\Seen'),
        snippet: summarizeText(parsed.text),
        flags: Array.from(msg.flags ?? []).map(String),
        textBody: parsed.text ?? '',
        htmlBodySanitized: sanitizeEmailHtml(typeof parsed.html === 'string' ? parsed.html : null),
        attachments: parsed.attachments.map((a: { filename?: string | null; contentType: string; size?: number | null }) => ({
          filename: a.filename ?? 'attachment',
          mimeType: a.contentType,
          sizeBytes: a.size ?? 0
        }))
      };
    }
    return null;
  });
}

export async function searchEmails(query: {
  from?: string;
  subject?: string;
  text?: string;
  unseen?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<PaginationResult<EmailSummary>> {
  const limit = query.limit ?? 10;
  return withClient(async (client) => {
    const search = buildSearchCriteria(query);

    const uidsResult = await withTimeout(client.search(search), IMAP_OPERATION_TIMEOUT_MS, 'search');
    const uids = Array.isArray(uidsResult) ? uidsResult : [];
    const cursorUid = decodeCursor(query.cursor);
    const eligibleUids = cursorUid ? uids.filter((uid: number) => uid < cursorUid) : uids;
    const selected = eligibleUids.slice(-limit);

    const results: EmailSummary[] = [];
    for await (const msg of client.fetch(selected, { uid: true, envelope: true, flags: true, source: true })) {
      const parsed = await simpleParser(msg.source);
      results.push({
        uid: msg.uid,
        messageId: parsed.messageId ?? null,
        from: parsed.from?.text ?? '',
        subject: parsed.subject ?? '(sin asunto)',
        date: parsed.date?.toISOString() ?? null,
        isUnread: !msg.flags?.has('\\Seen'),
        snippet: summarizeText(parsed.text)
      });
    }

    const items = results.sort((a, b) => b.uid - a.uid);
    const hasMore = eligibleUids.length > selected.length;
    const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1].uid) : null;

    return { items, hasMore, nextCursor };
  });
}

export function buildSearchCriteria(query: {
  from?: string;
  subject?: string;
  text?: string;
  unseen?: boolean;
}): Record<string, unknown> {
  const search: Record<string, unknown> = {};
  if (query.from) search.from = query.from;
  if (query.subject) search.subject = query.subject;
  if (query.text) search.body = query.text;
  if (typeof query.unseen === 'boolean') search.seen = !query.unseen;
  return search;
}
