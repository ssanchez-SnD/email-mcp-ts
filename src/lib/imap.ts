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

async function withClient<T>(fn: (client: ImapFlow) => Promise<T>) {
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: config.imap.auth
  });
  await client.connect();
  try {
    await client.mailboxOpen(config.imap.mailbox);
    return await fn(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

function summarizeText(input?: string | null, max = 220) {
  const clean = (input ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

export async function getUnreadCount() {
  return withClient(async (client) => {
    const status = await client.status(config.imap.mailbox, { unseen: true, messages: true });
    return { mailbox: config.imap.mailbox, unread: status.unseen ?? 0, total: status.messages ?? 0 };
  });
}

export async function listFolders() {
  return withClient(async (client) => {
    const folders: { path: string; name: string }[] = [];
    for await (const box of client.list()) folders.push({ path: box.path, name: box.name });
    return folders;
  });
}

export async function listRecentEmails(limit = 10): Promise<EmailSummary[]> {
  return withClient(async (client) => {
    const out: EmailSummary[] = [];
    const range = `${Math.max(1, (await client.mailboxOpen(config.imap.mailbox)).exists - limit + 1)}:*`;
    for await (const msg of client.fetch(range, { uid: true, envelope: true, flags: true, source: true })) {
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
    return out.reverse().slice(0, limit);
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
        to: parsed.to?.value.map(v => v.address ?? '').filter(Boolean) ?? [],
        cc: parsed.cc?.value.map(v => v.address ?? '').filter(Boolean) ?? [],
        subject: parsed.subject ?? '(sin asunto)',
        date: parsed.date?.toISOString() ?? null,
        isUnread: !msg.flags?.has('\\Seen'),
        snippet: summarizeText(parsed.text),
        flags: Array.from(msg.flags ?? []).map(String),
        textBody: parsed.text ?? '',
        htmlBodySanitized: typeof parsed.html === 'string' ? parsed.html : null,
        attachments: parsed.attachments.map(a => ({
          filename: a.filename ?? 'attachment',
          mimeType: a.contentType,
          sizeBytes: a.size ?? 0
        }))
      };
    }
    return null;
  });
}

export async function searchEmails(query: { from?: string; subject?: string; text?: string; unseen?: boolean; limit?: number; }) {
  const limit = query.limit ?? 10;
  return withClient(async (client) => {
    const search: Record<string, unknown> = {};
    if (query.from) search.from = query.from;
    if (query.subject) search.subject = query.subject;
    if (query.text) search.body = query.text;
    if (query.unseen) search.seen = false;
    const uids = await client.search(search);
    const selected = uids.slice(-limit);
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
    return results.reverse();
  });
}
