'use strict';

const crypto = require('node:crypto');
const { Pool } = require('pg');

let pool;

function getPool() {
  const connectionString = (process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for the shared OTP store');
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    pool.on('error', error => {
      // Deliberately do not log the connection string, phone, challenge or OTP.
      console.error('Unexpected shared OTP store database error:', error.message);
    });
  }
  return pool;
}

async function saveOtpChallenge({
  phoneHash,
  challengeId,
  otpHash,
  requestLimit,
  windowMs,
  ttlMs
}) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // Serialize requests for one phone across every API replica.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [phoneHash]);

    // Expired request events are no longer useful for the rolling limiter.
    await client.query(
      'DELETE FROM patient_otp_request_events WHERE requested_at <= NOW() - ($1::bigint * INTERVAL \'1 millisecond\')',
      [windowMs]
    );

    const recent = await client.query(
      'SELECT COUNT(*)::int AS count FROM patient_otp_request_events WHERE phone_hash = $1 AND requested_at > NOW() - ($2::bigint * INTERVAL \'1 millisecond\')',
      [phoneHash, windowMs]
    );
    if (Number(recent.rows[0]?.count || 0) >= requestLimit) {
      const error = new Error('Too many OTP requests. Please try again later.');
      error.statusCode = 429;
      throw error;
    }

    await client.query(
      'INSERT INTO patient_otp_request_events (phone_hash) VALUES ($1)',
      [phoneHash]
    );
    await client.query(
      `INSERT INTO patient_otp_challenges
         (phone_hash, challenge_id, otp_hash, attempts, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, 0, NOW() + ($4::bigint * INTERVAL '1 millisecond'), NOW(), NOW())
       ON CONFLICT (phone_hash) DO UPDATE SET
         challenge_id = EXCLUDED.challenge_id,
         otp_hash = EXCLUDED.otp_hash,
         attempts = 0,
         expires_at = EXCLUDED.expires_at,
         updated_at = NOW()`,
      [phoneHash, challengeId, otpHash, ttlMs]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function consumeOtpChallenge({ phoneHash, candidateOtpHash, maxAttempts }) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [phoneHash]);

    const result = await client.query(
      `SELECT challenge_id, otp_hash, attempts, expires_at, (expires_at <= NOW()) AS expired
         FROM patient_otp_challenges
        WHERE phone_hash = $1
        FOR UPDATE`,
      [phoneHash]
    );
    const challenge = result.rows[0];
    if (!challenge) {
      await client.query('COMMIT');
      return false;
    }

    if (challenge.expired) {
      await client.query('DELETE FROM patient_otp_challenges WHERE phone_hash = $1', [phoneHash]);
      await client.query('COMMIT');
      return false;
    }

    const stored = Buffer.from(String(challenge.otp_hash), 'hex');
    const candidate = Buffer.from(String(candidateOtpHash), 'hex');
    const validHash = stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);

    if (!validHash) {
      const attempts = Number(challenge.attempts || 0) + 1;
      if (attempts >= maxAttempts) {
        await client.query('DELETE FROM patient_otp_challenges WHERE phone_hash = $1', [phoneHash]);
      } else {
        await client.query(
          'UPDATE patient_otp_challenges SET attempts = $2, updated_at = NOW() WHERE phone_hash = $1',
          [phoneHash, attempts]
        );
      }
      await client.query('COMMIT');
      return false;
    }

    // Delete under the row/advisory lock so a code can be consumed only once,
    // including when two replicas verify it concurrently.
    await client.query('DELETE FROM patient_otp_challenges WHERE phone_hash = $1', [phoneHash]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function deleteOtpChallenge(phoneHash, challengeId) {
  await getPool().query(
    'DELETE FROM patient_otp_challenges WHERE phone_hash = $1 AND challenge_id = $2',
    [phoneHash, challengeId]
  );
}

async function closeOtpStore() {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}

module.exports = {
  saveOtpChallenge,
  consumeOtpChallenge,
  deleteOtpChallenge,
  closeOtpStore
};
