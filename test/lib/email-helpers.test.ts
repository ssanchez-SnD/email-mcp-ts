import test from 'node:test';
import assert from 'node:assert/strict';

test('resolveSpecialUseFolders prefers special-use mailbox names', async () => {
  const { resolveSpecialUseFolders } = await import('../../src/lib/mailboxes.js');

  const folders = resolveSpecialUseFolders([
    { path: 'Archive', specialUse: '\\Archive' },
    { path: 'Sent Items', specialUse: '\\Sent' },
    { path: 'Drafts', specialUse: '\\Drafts' },
    { path: 'Trash', specialUse: '\\Trash' }
  ]);

  assert.deepEqual(folders, {
    sent: 'Sent Items',
    drafts: 'Drafts',
    trash: 'Trash'
  });
});

test('resolveSpecialUseFolders falls back to configured folder names', async () => {
  const { resolveSpecialUseFolders } = await import('../../src/lib/mailboxes.js');

  const folders = resolveSpecialUseFolders(
    [{ path: 'INBOX' }, { path: 'Mailbox' }],
    {
      sent: 'Sent',
      drafts: 'Drafts',
      trash: 'Trash'
    }
  );

  assert.deepEqual(folders, {
    sent: 'Sent',
    drafts: 'Drafts',
    trash: 'Trash'
  });
});

test('composeEmailMessage includes threading headers and attachments', async () => {
  const { composeEmailMessage } = await import('../../src/lib/mime.js');

  const raw = await composeEmailMessage({
    from: 'agent@example.com',
    to: ['person@example.com'],
    subject: 'Re: Invoice',
    text: 'Gracias, señor',
    html: '<p>Gracias, señor</p>',
    inReplyTo: '<message-id@example.com>',
    references: ['<root@example.com>', '<message-id@example.com>'],
    attachments: [
      {
        filename: 'report.pdf',
        content: Buffer.from('pdf-bytes'),
        contentType: 'application/pdf'
      }
    ]
  });

  assert.match(raw, /In-Reply-To: <message-id@example.com>/i);
  assert.match(raw, /References: <root@example.com> <message-id@example.com>/i);
  assert.match(raw, /multipart\/mixed/i);
  assert.match(raw, /multipart\/alternative/i);
  assert.match(raw, /Content-Transfer-Encoding: base64/i);
  assert.doesNotMatch(raw, /Content-Transfer-Encoding: 7bit/i);
  assert.match(raw, /filename="?report\.pdf"?/i);
  assert.match(raw, /Content-Type: text\/html/i);
});

test('redactSecrets replaces secret values in text', async () => {
  const { redactSecrets } = await import('../../src/lib/security.js');

  const redacted = redactSecrets('API_KEY=abcd1234 IMAP_PASSWORD=s3cr3t SMTP_PASSWORD=hunter2');

  assert.equal(redacted.includes('abcd1234'), false);
  assert.equal(redacted.includes('s3cr3t'), false);
  assert.equal(redacted.includes('hunter2'), false);
  assert.match(redacted, /API_KEY=\[redacted\]/);
  assert.match(redacted, /IMAP_PASSWORD=\[redacted\]/);
  assert.match(redacted, /SMTP_PASSWORD=\[redacted\]/);
});

test('buildSearchCriteria supports mailbox and flag filters', async () => {
  const { buildSearchCriteria } = await import('../../src/lib/query.js');

  const criteria = buildSearchCriteria({
    mailboxes: ['INBOX', 'Archive'],
    from: 'a@example.com',
    to: 'b@example.com',
    subject: 'invoice',
    text: 'paid',
    unseen: true,
    flagged: true,
    deleted: false,
    draft: true,
    answered: false,
    after: '2026-01-01',
    before: '2026-02-01'
  });

  assert.deepEqual(criteria, {
    mailboxes: ['INBOX', 'Archive'],
    from: 'a@example.com',
    to: 'b@example.com',
    subject: 'invoice',
    body: 'paid',
    seen: false,
    flagged: true,
    deleted: false,
    draft: true,
    answered: false,
    after: '2026-01-01',
    before: '2026-02-01'
  });
});
