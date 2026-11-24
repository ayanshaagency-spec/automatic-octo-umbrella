const { getDb } = require('./db');

const fallbackBuckets = new Map();
const FALLBACK_BUCKET_MAX = 10000;
const FALLBACK_PRUNE_EVERY = 128;
let fallbackOperations = 0;

function pruneFallbackBuckets(nowMs) {
  for (const [key, bucket] of fallbackBuckets) {
    if (!bucket || bucket.resetAt <= nowMs) fallbackBuckets.delete(key);
  }
  while (fallbackBuckets.size >= FALLBACK_BUCKET_MAX) {
    const oldestKey = fallbackBuckets.keys().next().value;
    if (oldestKey === undefined) break;
    fallbackBuckets.delete(oldestKey);
  }
}

async function limited(key, limit, windowMs) {
  if (typeof key !== 'string' || !key || !Number.isSafeInteger(limit) || limit < 1 ||
      !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new TypeError('Invalid rate-limit configuration');
  }

  const db = await getDb();
  if (!db) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database unavailable for rate limiting');
    }
    const nowMs = Date.now();
    fallbackOperations += 1;
    if (fallbackOperations % FALLBACK_PRUNE_EVERY === 0 ||
        fallbackBuckets.size >= FALLBACK_BUCKET_MAX) {
      pruneFallbackBuckets(nowMs);
    }
    let bucket = fallbackBuckets.get(key);
    if (!bucket || bucket.resetAt <= nowMs) {
      bucket = { count: 0, resetAt: nowMs + windowMs };
    }
    bucket.count += 1;
    fallbackBuckets.set(key, bucket);
    return bucket.count > limit;
  }

  const now = new Date();
  const reset = new Date(now.getTime() + windowMs);
  const result = await db.query(
    `INSERT INTO api_rate_limit_buckets(bucket_key,count,reset_at) VALUES($1,1,$2)
     ON CONFLICT(bucket_key) DO UPDATE SET
       count=CASE WHEN api_rate_limit_buckets.reset_at <= $3 THEN 1 ELSE api_rate_limit_buckets.count+1 END,
       reset_at=CASE WHEN api_rate_limit_buckets.reset_at <= $3 THEN $2 ELSE api_rate_limit_buckets.reset_at END
     RETURNING count`,
    [key, reset, now]
  );

  // Periodically remove expired shared buckets without adding a random DB query per request.
  if (result.rows[0] && Number(result.rows[0].count) % 128 === 0) {
    await db.query('DELETE FROM api_rate_limit_buckets WHERE reset_at <= $1', [now]);
  }
  return Number(result.rows[0].count) > limit;
}

module.exports = { limited };
