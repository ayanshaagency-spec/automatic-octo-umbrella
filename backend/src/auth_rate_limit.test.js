'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getTrustedClientIp,
  consumeAuthRateLimit,
  resetMemoryRateLimitsForTests
} = require('./auth_rate_limit');

const SECRET = 'auth-rate-limit-test-secret-long-enough-for-hmac';

async function withTestEnvironment(fn) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET
  };
  process.env.NODE_ENV = 'test';
  delete process.env.DATABASE_URL;
  process.env.JWT_SECRET = SECRET;
  resetMemoryRateLimitsForTests();
  try {
    return await fn();
  } finally {
    resetMemoryRateLimitsForTests();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Railway X-Real-IP is preferred; X-Forwarded-For is never trusted', () => {
  const req = {
    headers: {
      'x-real-ip': '203.0.113.20',
      'x-forwarded-for': '198.51.100.10'
    },
    socket: { remoteAddress: '100.64.0.2' }
  };
  assert.equal(getTrustedClientIp(req), '203.0.113.20');
  assert.equal(getTrustedClientIp({
    headers: { 'x-forwarded-for': '198.51.100.99' },
    socket: { remoteAddress: '100.64.0.3' }
  }), '100.64.0.3');
});

test('invalid X-Real-IP falls back to the socket peer instead of trusting forwarded headers', () => {
  assert.equal(getTrustedClientIp({
    headers: { 'x-real-ip': '203.0.113.1, 198.51.100.1', 'x-forwarded-for': '192.0.2.55' },
    socket: { remoteAddress: '::ffff:127.0.0.1' }
  }), '::ffff:127.0.0.1');
});

test('a shared limit admits only the configured number of requests and reports retry time', async () => {
  await withTestEnvironment(async () => {
    const options = { namespace: 'otp:ip', identifier: '203.0.113.50', limit: 3, windowMs: 90000, now: 100000 };
    const results = await Promise.all(Array.from({ length: 5 }, () => consumeAuthRateLimit(options)));
    assert.equal(results.filter(result => result.allowed).length, 3);
    assert.equal(results.filter(result => !result.allowed).length, 2);
    assert.equal(results.at(-1).remaining, 0);
    assert.equal(results.at(-1).retryAfterSeconds, 90);
  });
});

test('rate-limit namespaces are isolated and an expired window resets', async () => {
  await withTestEnvironment(async () => {
    const common = { identifier: '203.0.113.51', limit: 1, windowMs: 60000, now: 100000 };
    assert.equal((await consumeAuthRateLimit({ ...common, namespace: 'otp:ip' })).allowed, true);
    assert.equal((await consumeAuthRateLimit({ ...common, namespace: 'admin:ip' })).allowed, true);
    assert.equal((await consumeAuthRateLimit({ ...common, namespace: 'otp:ip' })).allowed, false);
    assert.equal((await consumeAuthRateLimit({ ...common, namespace: 'otp:ip', now: 160001 })).allowed, true);
  });
});

test('invalid rate-limit options are rejected before accessing the database', async () => {
  await withTestEnvironment(async () => {
    await assert.rejects(
      () => consumeAuthRateLimit({ namespace: 'otp:ip', identifier: '', limit: 3, windowMs: 60000 }),
      /identifier/
    );
    await assert.rejects(
      () => consumeAuthRateLimit({ namespace: 'otp:ip', identifier: 'ip', limit: 0, windowMs: 60000 }),
      /limit/
    );
  });
});
