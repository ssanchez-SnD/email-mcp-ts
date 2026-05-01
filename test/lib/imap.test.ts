import test from 'node:test';
import assert from 'node:assert/strict';

function setEnvForModuleImports() {
  process.env.API_KEY = 'test-key';
  process.env.IMAP_HOST = 'imap.example.com';
  process.env.IMAP_USERNAME = 'user';
  process.env.IMAP_PASSWORD = 'pass';
}

test('buildSearchCriteria maps unseen=true to seen=false', async () => {
  setEnvForModuleImports();
  const { buildSearchCriteria } = await import('../../src/lib/imap.js');
  const criteria = buildSearchCriteria({ unseen: true });
  assert.equal(criteria.seen, false);
});

test('buildSearchCriteria maps unseen=false to seen=true', async () => {
  setEnvForModuleImports();
  const { buildSearchCriteria } = await import('../../src/lib/imap.js');
  const criteria = buildSearchCriteria({ unseen: false });
  assert.equal(criteria.seen, true);
});

test('buildSearchCriteria maps from/subject/text fields', async () => {
  setEnvForModuleImports();
  const { buildSearchCriteria } = await import('../../src/lib/imap.js');
  const criteria = buildSearchCriteria({ from: 'a@b.com', subject: 'Factura', text: 'Pago' });
  assert.deepEqual(criteria, { from: 'a@b.com', subject: 'Factura', body: 'Pago' });
});
