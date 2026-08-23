const { Client } = require('pg');

let client;
async function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) {
    client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
    await client.connect();
  }
  return client;
}

module.exports = { getDb };
