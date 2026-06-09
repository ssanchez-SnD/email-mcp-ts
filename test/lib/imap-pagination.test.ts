import test from 'node:test';
import assert from 'node:assert/strict';

test('isOlderThanCursor respects global search ordering across mailboxes', async () => {
  const { isOlderThanCursor } = await import('../../src/lib/search-cursor.js');

  const cursor = {
    mailbox: 'Inbox',
    uid: 42,
    date: '2026-06-09T12:00:00.000Z'
  };

  assert.equal(
    isOlderThanCursor(
      {
        mailbox: 'Inbox',
        uid: 41,
        date: '2026-06-09T12:00:00.000Z'
      },
      cursor
    ),
    true
  );

  assert.equal(
    isOlderThanCursor(
      {
        mailbox: 'Inbox',
        uid: 43,
        date: '2026-06-09T12:00:00.000Z'
      },
      cursor
    ),
    false
  );

  assert.equal(
    isOlderThanCursor(
      {
        mailbox: 'Sent',
        uid: 99,
        date: '2026-06-09T12:00:00.000Z'
      },
      cursor
    ),
    true
  );
});

test('isOlderThanCursor tolerates legacy cursors without date information', async () => {
  const { isOlderThanCursor } = await import('../../src/lib/search-cursor.js');

  const cursor = {
    mailbox: 'Inbox',
    uid: 42
  };

  assert.equal(
    isOlderThanCursor(
      {
        mailbox: 'Inbox',
        uid: 41,
        date: '2026-06-09T12:00:00.000Z'
      },
      cursor
    ),
    true
  );
});
