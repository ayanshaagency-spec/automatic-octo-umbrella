const { Pool } = require('pg');

let pool;

async function getDb() {
  const connectionString = (process.env.DATABASE_URL || '').trim();
  if (!connectionString) return null;

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    // Keep the pool resilient without logging connection details or credentials.
    pool.on('error', () => {
      console.error('Unexpected primary database pool error');
    });
  }

  return pool;
}

async function closeDb() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}

module.exports = { getDb, closeDb };
