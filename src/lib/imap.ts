import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from './config.js';
import { buildSearchCriteria as buildQueryCriteria, type SearchQuery } from './query.js';

export type EmailSummary = {
  uid: number;
  mailbox: string;
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
  inReplyTo: string | null;
  references: string[];
};

export type MailboxInfo = {
  path: string;
  name: string;
  delimiter?: string | null;
  flags?: Set<string> | string[] | null;
  specialUse?: string | null;
  subscribed?: boolean;
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
  return ['timeout', 'timed out', 'econnreset', 'socket hang up', 'connection closed', 'network'].some((needle) => message.includes(needle));
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

function encodeCursor(cursor: { mailbox: string; uid: number }): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(cursor?: string): { mailbox: string; uid: number } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { mailbox?: unknown; uid?: unknown };
    return typeof parsed.mailbox === 'string' && typeof parsed.uid === 'number' && parsed.uid > 0
      ? { mailbox: parsed.mailbox, uid: parsed.uid }
      : null;
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
      return await fn(client);
    } finally {
      await client.logout().catch(() => undefined);
    }
  });
}

async function withMailbox<T>(mailbox: string, fn: (client: ImapFlow) => Promise<T>) {
  return withClient(async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      return await fn(client);
    } finally {
      lock.release();
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

function mapMailboxes(mailboxes: MailboxInfo[]) {
  return mailboxes.map((box) => ({
    path: box.path,
    name: box.name,
    delimiter: box.delimiter ?? null,
    flags: box.flags ? Array.from(box.flags as Set<string>) : [],
    specialUse: box.specialUse ?? null,
    subscribed: box.subscribed ?? false
  }));
}

async function fetchMessageSummary(client: ImapFlow, mailbox: string, uid: number): Promise<EmailSummary | null> {
  for await (const msg of client.fetch(String(uid), { uid: true, envelope: true, flags: true, source: true })) {
    const parsed = await simpleParser(msg.source);
    return {
      uid: msg.uid,
      mailbox,
      messageId: parsed.messageId ?? null,
      from: parsed.from?.text ?? '',
      subject: parsed.subject ?? '(sin asunto)',
      date: parsed.date?.toISOString() ?? null,
      isUnread: !msg.flags?.has('\\Seen'),
      snippet: summarizeText(parsed.text)
    };
  }
  return null;
}

export async function getUnreadCount(mailbox = config.imap.mailbox) {
  return withMailbox(mailbox, async (client) => {
    const status = await withTimeout(client.status(mailbox, { unseen: true, messages: true }), IMAP_OPERATION_TIMEOUT_MS, 'status');
    return { mailbox, unread: status.unseen ?? 0, total: status.messages ?? 0 };
  });
}

export async function listFolders() {
  return withClient(async (client) => {
    const boxes = await withTimeout(client.list(), IMAP_OPERATION_TIMEOUT_MS, 'list-folders');
    return mapMailboxes(boxes as MailboxInfo[]);
  });
}

export async function listRecentEmails(limit = 10, cursor?: string, mailbox = config.imap.mailbox): Promise<PaginationResult<EmailSummary>> {
  return withMailbox(mailbox, async (client) => {
    const allUidsResult = await withTimeout(client.search({ all: true }, { uid: true }), IMAP_OPERATION_TIMEOUT_MS, 'search-recent-uids');
    const allUids = Array.isArray(allUidsResult) ? allUidsResult : [];
    const cursorUid = decodeCursor(cursor);
    const eligibleUids = cursorUid ? allUids.filter((uid: number) => uid < cursorUid.uid) : allUids;
    const selected = eligibleUids.slice(-limit);

    const out: EmailSummary[] = [];
    for (const uid of selected) {
      const item = await fetchMessageSummary(client, mailbox, uid);
      if (item) out.push(item);
    }

    const items = out.sort((a, b) => b.uid - a.uid);
    const hasMore = eligibleUids.length > selected.length;
    const nextCursor = hasMore && items.length > 0 ? encodeCursor({ mailbox, uid: items[items.length - 1].uid }) : null;

    return { items, hasMore, nextCursor };
  });
}

export async function getEmail(uid: number, mailbox = config.imap.mailbox): Promise<EmailDetail | null> {
  return withMailbox(mailbox, async (client) => {
    for await (const msg of client.fetch(String(uid), { uid: true, envelope: true, flags: true, source: true })) {
      const parsed = await simpleParser(msg.source);
      return {
        uid: msg.uid,
        mailbox,
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
        })),
        inReplyTo: parsed.inReplyTo ?? null,
        references: Array.isArray(parsed.references)
          ? parsed.references
          : typeof parsed.references === 'string'
            ? parsed.references.split(/\s+/).filter(Boolean)
            : []
      };
    }
    return null;
  });
}

async function searchMailbox(mailbox: string, searchCriteria: Record<string, unknown>, limit: number, cursor?: { mailbox: string; uid: number } | null) {
  return withMailbox(mailbox, async (client) => {
    const uidsResult = await withTimeout(client.search(searchCriteria as never, { uid: true }), IMAP_OPERATION_TIMEOUT_MS, 'search');
    const uids = Array.isArray(uidsResult) ? uidsResult : [];
    const eligibleUids = cursor && cursor.mailbox === mailbox ? uids.filter((uid: number) => uid < cursor.uid) : uids;
    const selected = eligibleUids.slice(-limit);

    const results: EmailSummary[] = [];
    for (const uid of selected) {
      const item = await fetchMessageSummary(client, mailbox, uid);
      if (item) results.push(item);
    }

    return {
      items: results,
      hasMore: eligibleUids.length > selected.length,
      nextCursor: results.length ? encodeCursor({ mailbox, uid: results[results.length - 1].uid }) : null
    };
  });
}

export async function searchEmails(query: SearchQuery): Promise<PaginationResult<EmailSummary>> {
  const limit = query.limit ?? 10;
  const cursor = decodeCursor(query.cursor);
  const search = buildQueryCriteria(query);
  const { mailboxes: _ignored, ...criteria } = search;
  const mailboxes = query.mailboxes?.length ? query.mailboxes : [config.imap.mailbox];

  const allResults: EmailSummary[] = [];
  for (const mailbox of mailboxes) {
    const page = await searchMailbox(mailbox, criteria, limit, cursor);
    allResults.push(...page.items);
  }

  const items = allResults.sort((a, b) => {
    const dateA = a.date ? Date.parse(a.date) : 0;
    const dateB = b.date ? Date.parse(b.date) : 0;
    if (dateA !== dateB) return dateB - dateA;
    if (a.mailbox !== b.mailbox) return a.mailbox.localeCompare(b.mailbox);
    return b.uid - a.uid;
  }).slice(0, limit);

  return {
    items,
    hasMore: allResults.length > items.length,
    nextCursor: items.length ? encodeCursor({ mailbox: items[items.length - 1].mailbox, uid: items[items.length - 1].uid }) : null
  };
}

export async function moveEmail(uid: number, destinationMailbox: string, mailbox = config.imap.mailbox) {
  return withMailbox(mailbox, async (client) => {
    await client.messageMove(String(uid), destinationMailbox, { uid: true });
    return { ok: true };
  });
}

export async function deleteEmail(uid: number, mailbox = config.imap.mailbox) {
  return withMailbox(mailbox, async (client) => {
    await client.messageDelete(String(uid), { uid: true });
    return { ok: true };
  });
}

export async function updateEmailFlags(
  uid: number,
  flags: { seen?: boolean; flagged?: boolean; deleted?: boolean; draft?: boolean; answered?: boolean },
  mailbox = config.imap.mailbox
) {
  return withMailbox(mailbox, async (client) => {
    if (typeof flags.seen === 'boolean') {
      if (flags.seen) await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      else await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true });
    }
    if (typeof flags.flagged === 'boolean') {
      if (flags.flagged) await client.messageFlagsAdd(String(uid), ['\\Flagged'], { uid: true });
      else await client.messageFlagsRemove(String(uid), ['\\Flagged'], { uid: true });
    }
    if (typeof flags.deleted === 'boolean') {
      if (flags.deleted) await client.messageFlagsAdd(String(uid), ['\\Deleted'], { uid: true });
      else await client.messageFlagsRemove(String(uid), ['\\Deleted'], { uid: true });
    }
    if (typeof flags.draft === 'boolean') {
      if (flags.draft) await client.messageFlagsAdd(String(uid), ['\\Draft'], { uid: true });
      else await client.messageFlagsRemove(String(uid), ['\\Draft'], { uid: true });
    }
    if (typeof flags.answered === 'boolean') {
      if (flags.answered) await client.messageFlagsAdd(String(uid), ['\\Answered'], { uid: true });
      else await client.messageFlagsRemove(String(uid), ['\\Answered'], { uid: true });
    }
    return { ok: true };
  });
}

export async function appendRawMessage(mailbox: string, rawMessage: string, flags: string[] = []) {
  return withMailbox(mailbox, async (client) => {
    await client.append(mailbox, rawMessage, flags);
    return { ok: true };
  });
}

export function buildSearchCriteria(query: SearchQuery): Record<string, unknown> {
  return buildQueryCriteria(query);
}
