import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailService } from '../../src/lib/email-service.js';

test('replyEmail sends the message, stores a copy in Sent, and marks the original answered', async () => {
  const calls: Array<{ type: string; [key: string]: unknown }> = [];

  const service = createEmailService(
    {
      listFolders: async () => [
        { path: 'INBOX', name: 'INBOX' },
        { path: 'Sent Items', name: 'Sent Items', specialUse: '\\Sent' },
        { path: 'Drafts', name: 'Drafts', specialUse: '\\Drafts' }
      ],
      getEmail: async () => ({
        uid: 12,
        mailbox: 'INBOX',
        messageId: '<msg-12@example.com>',
        from: 'sender@example.com',
        subject: 'Status update',
        date: '2026-06-01T10:00:00.000Z',
        isUnread: true,
        snippet: 'hello',
        to: ['agent@example.com'],
        cc: ['team@example.com'],
        flags: [],
        textBody: 'hello',
        htmlBodySanitized: null,
        attachments: [],
        inReplyTo: null,
        references: ['<root@example.com>']
      }),
      searchEmails: async () => ({ items: [], hasMore: false, nextCursor: null }),
      moveEmail: async () => undefined,
      deleteEmail: async () => undefined,
      updateEmailFlags: async (uid, flags, mailbox) => {
        calls.push({ type: 'updateFlags', mailbox, uid, flags });
      },
      appendMessage: async (mailbox, raw, flags) => {
        calls.push({ type: 'append', mailbox, raw, flags });
      },
      sendRawMessage: async (raw) => {
        calls.push({ type: 'send', raw });
      }
    },
    {
      fromAddress: 'agent@example.com',
      defaultMailbox: 'INBOX'
    }
  );

  const result = await service.replyEmail({
    mailbox: 'INBOX',
    uid: 12,
    text: 'Thanks for the update'
  });

  assert.deepEqual(result, { mailbox: 'Sent Items', ok: true });
  assert.equal(calls[0]?.type, 'send');
  assert.equal(calls[1]?.type, 'append');
  assert.equal((calls[1] as { mailbox: string }).mailbox, 'Sent Items');
  assert.deepEqual((calls[1] as { flags: string[] }).flags, ['\\Seen']);
  assert.equal(calls[2]?.type, 'updateFlags');
  assert.deepEqual((calls[2] as { flags: { answered?: boolean } }).flags, { answered: true });
  assert.match(String((calls[0] as { raw: string }).raw), /In-Reply-To: <msg-12@example.com>/i);
  assert.match(String((calls[0] as { raw: string }).raw), /References: <root@example.com> <msg-12@example.com>/i);
});

test('createDraft stores the draft in the resolved Drafts mailbox', async () => {
  const calls: Array<{ type: string; [key: string]: unknown }> = [];

  const service = createEmailService(
    {
      listFolders: async () => [
        { path: 'INBOX', name: 'INBOX' },
        { path: 'Drafts', name: 'Drafts', specialUse: '\\Drafts' }
      ],
      getEmail: async () => null,
      searchEmails: async () => ({ items: [], hasMore: false, nextCursor: null }),
      moveEmail: async () => undefined,
      deleteEmail: async () => undefined,
      updateEmailFlags: async () => undefined,
      appendMessage: async (mailbox, raw, flags) => {
        calls.push({ type: 'append', mailbox, raw, flags });
      },
      sendRawMessage: async () => undefined
    },
    {
      fromAddress: 'agent@example.com',
      defaultMailbox: 'INBOX'
    }
  );

  const result = await service.createDraft({
    to: ['recipient@example.com'],
    subject: 'Draft subject',
    text: 'Draft text'
  });

  assert.deepEqual(result, { mailbox: 'Drafts', ok: true });
  assert.equal(calls[0]?.type, 'append');
  assert.equal((calls[0] as { mailbox: string }).mailbox, 'Drafts');
  assert.deepEqual((calls[0] as { flags: string[] }).flags, ['\\Draft']);
  assert.match(String((calls[0] as { raw: string }).raw), /Subject: Draft subject/i);
});
