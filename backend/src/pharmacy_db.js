'use strict';

const { Pool } = require('pg');

let pool;

async function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    pool.on('error', (error) => {
      // Do not log connection strings or credentials.
      console.error('Unexpected pharmacy database pool error:', error.message);
    });
  }
  return pool;
}

module.exports = { getDb };
