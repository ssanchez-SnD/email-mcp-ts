import fs from 'node:fs';
import path from 'node:path';

function loadDotEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    const value = rawValue.replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
}

loadDotEnvFile();

function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function parseTrustProxy(rawValue?: string): boolean | number {
  if (rawValue === undefined || rawValue.trim() === '') return false;

  const normalized = rawValue.trim().toLowerCase();
  if (['false', 'off', 'no', '0'].includes(normalized)) return false;
  if (['true', 'on', 'yes'].includes(normalized)) return true;

  const parsed = Number(normalized);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;

  throw new Error('Invalid TRUST_PROXY env var');
}

export function requiredNumber(name: string, fallback: string): number {
  const raw = required(name, fallback);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric env var: ${name}`);
  return parsed;
}

export const config = {
  port: requiredNumber('PORT', '3000'),
  mcpPath: process.env.MCP_PATH ?? '/mcp',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  apiKey: required('API_KEY'),
  imap: {
    host: required('IMAP_HOST'),
    port: requiredNumber('IMAP_PORT', '993'),
    secure: (process.env.IMAP_SECURE ?? 'true') === 'true',
    auth: {
      user: required('IMAP_USERNAME'),
      pass: required('IMAP_PASSWORD')
    },
    mailbox: process.env.IMAP_MAILBOX ?? 'INBOX'
  },
  smtp: {
    host: required('SMTP_HOST'),
    port: requiredNumber('SMTP_PORT', '465'),
    secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
    user: required('SMTP_USERNAME'),
    pass: required('SMTP_PASSWORD'),
    from: required('SMTP_FROM'),
    ehloHost: process.env.SMTP_EHLO_HOST ?? 'localhost'
  },
  mailboxes: {
    sent: process.env.SENT_MAILBOX ?? null,
    drafts: process.env.DRAFTS_MAILBOX ?? null,
    trash: process.env.TRASH_MAILBOX ?? null
  }
};
