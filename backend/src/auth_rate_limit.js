'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const { Pool } = require('pg');

const memoryBuckets = new Map();
let cleanupCounter = 0;
let limiterPool;

function getLimiterPool() {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) throw new Error('DATABASE_URL is required for shared authentication rate limiting');
  if (!limiterPool) {
    limiterPool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    // Do not log identifiers, SQL parameters, connection strings or authentication material.
    limiterPool.on('error', () => {});
  }
  return limiterPool;
}

function getTrustedClientIp(req) {
  // Railway's public HTTP edge overwrites X-Real-IP for public requests.
  // Do not trust X-Forwarded-For: its chain/hop count is not fixed.
  const edgeIp = req?.headers?.['x-real-ip'];
  if (typeof edgeIp === 'string' && net.isIP(edgeIp.trim())) {
    return edgeIp.trim().toLowerCase();
  }

  // Safe fallback for local/test requests and requests that bypass the public edge.
  // A shared proxy address may collapse callers into one bucket, which is safer
  // than accepting an untrusted forwarding header.
  const peerIp = String(req?.socket?.remoteAddress || '').trim();
  return net.isIP(peerIp) ? peerIp.toLowerCase() : 'unknown';
}

function hashBucket(namespace, identifier) {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret || secret === 'replace_with_secure_secret' || secret.length < 32) {
    throw new Error('JWT_SECRET is not securely configured for authentication rate limiting');
  }
  return crypto.createHmac('sha256', secret)
    .update('ayansha-auth-rate-limit\0')
    .update(namespace)
    .update('\0')
    .update(identifier)
    .digest('hex');
}

function consumeMemoryBucket(bucketHash, limit, windowMs, now) {
  const current = memoryBuckets.get(bucketHash);
  let record;
  if (!current || current.windowStartedAt + windowMs <= now) {
    record = { windowStartedAt: now, count: 1 };
  } else {
    record = { windowStartedAt: current.windowStartedAt, count: current.count + 1 };
  }
  memoryBuckets.set(bucketHash, record);
  const retryAfterSeconds = Math.max(1, Math.ceil((record.windowStartedAt + windowMs - now) / 1000));
  return {
    allowed: record.count <= limit,
    limit,
    remaining: Math.max(0, limit - record.count),
    retryAfterSeconds
  };
}

async function consumeAuthRateLimit({ namespace, identifier, limit, windowMs, now = Date.now() }) {
  if (typeof namespace !== 'string' || !/^[a-z0-9:_-]{1,80}$/i.test(namespace)) {
    throw new TypeError('A valid authentication rate-limit namespace is required');
  }
  if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 512) {
    throw new TypeError('A valid authentication rate-limit identifier is required');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) {
    throw new TypeError('Authentication rate-limit limit is invalid');
  }
  if (!Number.isSafeInteger(windowMs) || windowMs < 1000 || windowMs > 24 * 60 * 60 * 1000) {
    throw new TypeError('Authentication rate-limit window is invalid');
  }

  const bucketHash = hashBucket(namespace, identifier.trim());
  if (!process.env.DATABASE_URL && ['development', 'test'].includes(process.env.NODE_ENV)) {
    return consumeMemoryBucket(bucketHash, limit, windowMs, now);
  }

  const db = getLimiterPool();

  // One atomic upsert serializes concurrent requests across application replicas.
  const result = await db.query(
    `INSERT INTO auth_rate_limit_buckets
       (bucket_hash, window_started_at, request_count, expires_at)
     VALUES ($1, NOW(), 1, NOW() + ($3::bigint * INTERVAL '1 millisecond'))
     ON CONFLICT (bucket_hash) DO UPDATE SET
       request_count = CASE
         WHEN auth_rate_limit_buckets.window_started_at <= NOW() - ($3::bigint * INTERVAL '1 millisecond')
           THEN 1
         ELSE auth_rate_limit_buckets.request_count + 1
       END,
       window_started_at = CASE
         WHEN auth_rate_limit_buckets.window_started_at <= NOW() - ($3::bigint * INTERVAL '1 millisecond')
           THEN NOW()
         ELSE auth_rate_limit_buckets.window_started_at
       END,
       expires_at = CASE
         WHEN auth_rate_limit_buckets.window_started_at <= NOW() - ($3::bigint * INTERVAL '1 millisecond')
           THEN NOW() + ($3::bigint * INTERVAL '1 millisecond')
         ELSE auth_rate_limit_buckets.expires_at
       END
     RETURNING request_count,
       (request_count <= $2) AS within_limit,
       GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
         window_started_at + ($3::bigint * INTERVAL '1 millisecond') - NOW()
       ))))::int AS retry_after_seconds`,
    [bucketHash, limit, windowMs]
  );

  // Bound stale-key growth if a source rotates identifiers. Cleanup is best-effort;
  // failure here does not weaken the atomic counter used for the current request.
  cleanupCounter += 1;
  if (cleanupCounter % 50 === 0) {
    await db.query(
      `DELETE FROM auth_rate_limit_buckets
        WHERE bucket_hash IN (
          SELECT bucket_hash
            FROM auth_rate_limit_buckets
           WHERE expires_at <= NOW()
           ORDER BY expires_at
           LIMIT 500
        )`
    ).catch(() => {});
  }

  const count = Number(result.rows[0]?.request_count || 0);
  return {
    allowed: result.rows[0]?.within_limit === true,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Number(result.rows[0]?.retry_after_seconds || 1))
  };
}

function resetMemoryRateLimitsForTests() {
  memoryBuckets.clear();
}

async function closeAuthRateLimitPool() {
  if (limiterPool) {
    const current = limiterPool;
    limiterPool = undefined;
    await current.end();
  }
}

module.exports = {
  getTrustedClientIp,
  consumeAuthRateLimit,
  resetMemoryRateLimitsForTests,
  hashBucket,
  closeAuthRateLimitPool
};
