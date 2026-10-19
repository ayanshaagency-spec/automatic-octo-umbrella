'use strict';

const { Pool } = require('pg');

let pool;

async function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    pool.on('error', (error) => {
      // Do not log connection strings or credentials.
      console.error('Unexpected database pool error:', error.message);
    });
  }
  return pool;
}

module.exports = { getDb };
