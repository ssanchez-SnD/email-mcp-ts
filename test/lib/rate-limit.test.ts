import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../../src/lib/rate-limit.js';

test('rate limiter evicts expired counters during cleanup', () => {
  let now = 0;
  const limiter = createRateLimiter({
    windowMs: 1_000,
    limit: 2,
    keyFn: (req) => req.socket?.remoteAddress ?? 'unknown',
    message: 'Too many requests'
  }, {
    now: () => now
  });

  const reqA = { socket: { remoteAddress: '10.0.0.1' }, header: () => undefined };
  const reqB = { socket: { remoteAddress: '10.0.0.2' }, header: () => undefined };
  const res = {
    setHeader() {},
    status() {
      return this;
    },
    json() {
      return this;
    }
  };

  limiter.handle(reqA, res, () => undefined);
  limiter.handle(reqB, res, () => undefined);
  assert.equal(limiter.getEntryCount(), 2);

  now = 1_500;
  limiter.handle({ socket: { remoteAddress: '10.0.0.3' }, header: () => undefined }, res, () => undefined);

  assert.equal(limiter.getEntryCount(), 1);
});
