import test from 'node:test';
import assert from 'node:assert/strict';

function seedRequiredEnv() {
  process.env.API_KEY = 'test-key';
  process.env.IMAP_HOST = 'imap.example.com';
  process.env.IMAP_USERNAME = 'user';
  process.env.IMAP_PASSWORD = 'pass';
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_USERNAME = 'smtp-user';
  process.env.SMTP_PASSWORD = 'smtp-pass';
  process.env.SMTP_FROM = 'agent@example.com';
}

test('requiredNumber parses valid numeric env var', async () => {
  seedRequiredEnv();
  process.env.PORT = '3100';
  const { requiredNumber } = await import('../../src/lib/config.js');
  assert.equal(requiredNumber('PORT', '3000'), 3100);
});

test('requiredNumber throws for invalid numeric env var', async () => {
  seedRequiredEnv();
  process.env.IMAP_PORT = '993';
  process.env.BAD_PORT = 'not-a-number';
  const { requiredNumber } = await import('../../src/lib/config.js');
  assert.throws(() => requiredNumber('BAD_PORT', '993'), /Invalid numeric env var: BAD_PORT/);
});
