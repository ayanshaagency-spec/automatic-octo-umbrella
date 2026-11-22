const { getDb } = require('./db');
const fallbackBuckets = new Map();
async function limited(key, limit, windowMs) {
  const db = await getDb();
  if (!db) { if(process.env.NODE_ENV==='production') throw new Error('Database unavailable for rate limiting'); const nowMs=Date.now(); let bucket=fallbackBuckets.get(key); if(!bucket||bucket.resetAt<=nowMs)bucket={count:0,resetAt:nowMs+windowMs}; bucket.count++;fallbackBuckets.set(key,bucket);return bucket.count>limit; }
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
  if (Math.random() < 0.02) await db.query('DELETE FROM api_rate_limit_buckets WHERE reset_at <= $1', [now]);
  return Number(result.rows[0].count) > limit;
}
module.exports = { limited };
