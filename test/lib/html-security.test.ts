import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEmailHtml } from '../../src/lib/html.js';

test('sanitizeEmailHtml escapes executable markup', () => {
  const unsafe = '<div onclick="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">click</a></div>';
  const sanitized = sanitizeEmailHtml(unsafe);

  assert.equal(
    sanitized,
    '&lt;div onclick=&quot;alert(1)&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;&lt;a href=&quot;javascript:alert(3)&quot;&gt;click&lt;/a&gt;&lt;/div&gt;'
  );
});
