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

test('trust proxy parses numeric and boolean values', async () => {
  seedRequiredEnv();
  process.env.TRUST_PROXY = '2';
  const { config } = await import('../../src/lib/config.js?trust-proxy');
  assert.equal(config.trustProxy, 2);
});
