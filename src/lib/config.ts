import 'dotenv/config';

function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? '3000'),
  mcpPath: process.env.MCP_PATH ?? '/mcp',
  apiKey: required('API_KEY'),
  imap: {
    host: required('IMAP_HOST'),
    port: Number(process.env.IMAP_PORT ?? '993'),
    secure: (process.env.IMAP_SECURE ?? 'true') === 'true',
    auth: {
      user: required('IMAP_USERNAME'),
      pass: required('IMAP_PASSWORD')
    },
    mailbox: process.env.IMAP_MAILBOX ?? 'INBOX'
  }
};
