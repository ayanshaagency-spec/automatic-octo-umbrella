const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb, closeDb } = require('./db');

test('shared PostgreSQL pool serves concurrent queries on multiple connections', async t => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is required for the PostgreSQL pool concurrency test');
    return;
  }

  t.after(async () => {
    await closeDb();
  });

  const db = await getDb();
  assert.ok(db, 'database pool should be available');
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, requestId) =>
      db.query('SELECT pg_sleep(0.05), $1::integer AS request_id', [requestId])
    )
  );

  assert.deepEqual(
    results.map(result => result.rows[0].request_id).sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7]
  );
  assert.ok(db.totalCount > 1, 'parallel requests should be served by more than one PostgreSQL connection');
});
