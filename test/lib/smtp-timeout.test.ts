import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

class FakeSocket extends EventEmitter {
  destroyed = false;
  ended = false;

  setEncoding() {}
  write() {}
  end() {
    this.ended = true;
  }
  destroy() {
    this.destroyed = true;
    this.emit('close');
  }
}

function seedEnv() {
  process.env.API_KEY = 'test-key';
  process.env.IMAP_HOST = 'imap.example.com';
  process.env.IMAP_USERNAME = 'user';
  process.env.IMAP_PASSWORD = 'pass';
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_USERNAME = 'smtp-user';
  process.env.SMTP_PASSWORD = 'smtp-pass';
  process.env.SMTP_FROM = 'agent@example.com';
}

test('waitForConnection times out and destroys the socket', async () => {
  seedEnv();
  const { waitForConnection } = await import('../../src/lib/smtp.js');
  const socket = new FakeSocket();

  await assert.rejects(() => waitForConnection(socket as never, 5), /SMTP connection timeout after 5ms/);
  assert.equal(socket.destroyed, true);
});

test('readResponse times out and destroys the socket', async () => {
  seedEnv();
  const { readResponse } = await import('../../src/lib/smtp.js');
  const socket = new FakeSocket();

  await assert.rejects(() => readResponse(socket as never, 5), /SMTP read timeout after 5ms/);
  assert.equal(socket.destroyed, true);
});
