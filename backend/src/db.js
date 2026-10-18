const { Client, Pool } = require('pg');

let client;
let pool;
async function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) {
    client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
    await client.connect();
  }
  return client;
}

async function getTransactionClient() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000
    });
  }
  return pool.connect();
}

module.exports = { getDb, getTransactionClient };
