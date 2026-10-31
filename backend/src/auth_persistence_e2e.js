'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

function assertCiDatabase() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.PHARMACY_E2E_CI !== '1') {
    throw new Error('Shared OTP E2E is CI-only and refuses non-CI execution.');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const url = new URL(process.env.DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
      url.pathname.replace(/^\//, '') !== 'ayansha_healthcare') {
    throw new Error('Refusing to run outside the disposable local ayansha_healthcare CI database.');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('A CI-only JWT_SECRET of at least 32 characters is required.');
  }
}

function phoneHash(phone) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(phone).digest('hex');
}

async function main() {
  assertCiDatabase();
  process.env.NODE_ENV = 'staging';
  process.env.OTP_PROVIDER_URL = 'https://otp-provider.example.test/send';
  process.env.OTP_PROVIDER_TOKEN = 'ci-only-provider-token';

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const nativeFetch = globalThis.fetch;
  let providerFailure = false;
  const deliveries = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).protocol, 'https:');
    assert.match(options.headers.Authorization, /^Bearer /);
    deliveries.push(JSON.parse(options.body));
    return { ok: !providerFailure, status: providerFailure ? 502 : 200 };
  };

  const { issueOtp, verifyOtp, AuthError, closeOtpStore } = require('./auth');
  try {
    const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '009_shared_patient_otp_store.sql');
    await pool.query(fs.readFileSync(migrationPath, 'utf8'));
    await pool.query('TRUNCATE patient_otp_challenges, patient_otp_request_events RESTART IDENTITY');

    // Staging must use the shared database and provider adapter, never return a development OTP.
    const firstPhone = '+919100000001';
    const first = await issueOtp(firstPhone);
    assert.equal(first.delivery, 'provider_accepted');
    assert.equal(first.devOtp, undefined);
    assert.equal(first.expiresInSeconds, 300);
    const firstCode = deliveries.at(-1).message.match(/code is (\d{6})/)[1];
    const firstStored = await pool.query(
      'SELECT phone_hash, otp_hash FROM patient_otp_challenges WHERE phone_hash = $1',
      [phoneHash(firstPhone)]
    );
    assert.equal(firstStored.rowCount, 1);
    assert.notEqual(firstStored.rows[0].phone_hash, firstPhone);
    assert.notEqual(firstStored.rows[0].otp_hash, firstCode);
    assert.equal(await verifyOtp(firstPhone, firstCode), true);
    assert.equal(await verifyOtp(firstPhone, firstCode), false, 'a verified code must be single-use');

    // Rolling limits persist in PostgreSQL and permit no more than three sends per phone.
    const limitedPhone = '+919100000002';
    await issueOtp(limitedPhone);
    await issueOtp(limitedPhone);
    await issueOtp(limitedPhone);
    await assert.rejects(
      () => issueOtp(limitedPhone),
      error => error instanceof AuthError && error.statusCode === 429
    );
    const limitEvents = await pool.query(
      'SELECT COUNT(*)::int AS count FROM patient_otp_request_events WHERE phone_hash = $1',
      [phoneHash(limitedPhone)]
    );
    assert.equal(limitEvents.rows[0].count, 3);

    // Advisory locking makes the per-phone limit safe under concurrent API replicas/requests.
    const concurrentPhone = '+919100000003';
    const concurrent = await Promise.allSettled(
      Array.from({ length: 6 }, () => issueOtp(concurrentPhone))
    );
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 3);
    assert.equal(concurrent.filter(result => result.status === 'rejected' && result.reason.statusCode === 429).length, 3);

    // Five failed checks invalidate a challenge, even after the correct code was issued.
    const lockoutPhone = '+919100000004';
    await issueOtp(lockoutPhone);
    const lockoutCode = deliveries.at(-1).message.match(/code is (\d{6})/)[1];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal(await verifyOtp(lockoutPhone, '000000'), false);
    }
    assert.equal(await verifyOtp(lockoutPhone, lockoutCode), false);

    // Expiry is enforced by the persisted challenge timestamp.
    const expiryPhone = '+919100000005';
    await issueOtp(expiryPhone);
    await pool.query(
      "UPDATE patient_otp_challenges SET expires_at = NOW() - INTERVAL '1 second' WHERE phone_hash = $1",
      [phoneHash(expiryPhone)]
    );
    assert.equal(await verifyOtp(expiryPhone, deliveries.at(-1).message.match(/code is (\d{6})/)[1]), false);

    // Failed provider delivery removes the challenge but preserves its throttling event.
    const failurePhone = '+919100000006';
    providerFailure = true;
    await assert.rejects(
      () => issueOtp(failurePhone),
      error => error instanceof AuthError && error.statusCode === 502
    );
    providerFailure = false;
    const failedState = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM patient_otp_challenges WHERE phone_hash = $1) AS challenges,
         (SELECT COUNT(*)::int FROM patient_otp_request_events WHERE phone_hash = $1) AS events`,
      [phoneHash(failurePhone)]
    );
    assert.equal(failedState.rows[0].challenges, 0);
    assert.equal(failedState.rows[0].events, 1);

    console.log('Shared OTP persistence E2E passed: hashed storage, single-use, rolling limit, concurrent limit, lockout, expiry and provider failure cleanup.');
  } finally {
    globalThis.fetch = nativeFetch;
    await pool.query('TRUNCATE patient_otp_challenges, patient_otp_request_events RESTART IDENTITY').catch(() => {});
    await closeOtpStore();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
