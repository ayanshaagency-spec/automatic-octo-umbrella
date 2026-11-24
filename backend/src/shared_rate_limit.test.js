const test = require('node:test');
const assert = require('node:assert/strict');
const { limited } = require('./shared_rate_limit');

test('rate limiter validates its configuration before accessing storage', async () => {
  await assert.rejects(limited('', 1, 1000), TypeError);
  await assert.rejects(limited('key', 0, 1000), TypeError);
  await assert.rejects(limited('key', 1.5, 1000), TypeError);
  await assert.rejects(limited('key', 1, 0), TypeError);
  await assert.rejects(limited('key', 1, Number.MAX_SAFE_INTEGER + 1), TypeError);
});

test('in-memory fallback allows the configured number and blocks the next request', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.DATABASE_URL = '';
  process.env.NODE_ENV = 'test';
  try {
    const key = 'rate-limit-boundary-' + process.pid + '-' + Date.now();
    assert.equal(await limited(key, 2, 60_000), false);
    assert.equal(await limited(key, 2, 60_000), false);
    assert.equal(await limited(key, 2, 60_000), true);
    assert.equal(await limited(key, 2, 60_000), true);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('in-memory fallback resets an expired time window', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  const originalNow = Date.now;
  let now = 1_800_000_000_000;
  process.env.DATABASE_URL = '';
  process.env.NODE_ENV = 'test';
  Date.now = () => now;
  try {
    const key = 'rate-limit-expiry-' + process.pid;
    assert.equal(await limited(key, 1, 1000), false);
    assert.equal(await limited(key, 1, 1000), true);
    now += 1001;
    assert.equal(await limited(key, 1, 1000), false);
    assert.equal(await limited(key, 1, 1000), true);
  } finally {
    Date.now = originalNow;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('production rate limiting fails closed when the database is unavailable', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.DATABASE_URL = '';
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(
      limited('production-no-db-' + process.pid, 1, 1000),
      /Database unavailable for rate limiting/
    );
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
