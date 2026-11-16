'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

const LOCK_KEY = 'ayansha-health-care-staging-schema';

async function main() {
  const connectionString = (process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({
    connectionString,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
    connectionTimeoutMillis: 10000,
    statement_timeout: 120000
  });

  let connected = false;
  let locked = false;

  try {
    await client.connect();
    connected = true;

    // Prevent overlapping deploys from replaying the schema concurrently.
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_KEY]);
    locked = true;

    const databaseRoot = path.resolve(__dirname, '../db');
    const schemaPath = path.join(databaseRoot, 'schema.sql');
    const migrationDirectory = path.join(databaseRoot, 'migrations');

    const schemaSql = await fs.readFile(schemaPath, 'utf8');
    await client.query(schemaSql);
    console.log('Applied db/schema.sql');

    const migrationFiles = (await fs.readdir(migrationDirectory))
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sql = await fs.readFile(path.join(migrationDirectory, file), 'utf8');
      await client.query(sql);
      console.log(`Applied db/migrations/${file}`);
    }

    console.log(`Staging schema preparation completed (${migrationFiles.length} migration files).`);
  } finally {
    if (connected) {
      if (locked) {
        try {
          await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]);
        } catch {
          // The server releases a session advisory lock when the connection closes.
        }
      }
      await client.end();
    }
  }
}

main().catch(error => {
  // Never print the connection string or full driver error; provider messages can contain host details.
  const code = typeof error?.code === 'string' && /^[A-Z0-9]+$/.test(error.code)
    ? error.code
    : 'UNKNOWN';
  console.error(`Staging schema preparation failed (${code}). Check provider logs with secrets redacted.`);
  process.exitCode = 1;
});
