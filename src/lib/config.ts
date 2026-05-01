import 'dotenv/config';

function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
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
  }
};
