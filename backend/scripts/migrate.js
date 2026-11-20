const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

async function readSqlFiles(directory) {
  return (await fs.readdir(directory))
    .filter(file => file.endsWith('.sql'))
    .sort()
    .map(file => path.join(directory, file));
}

async function main() {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required for migrations');

  const client = new Client({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
  });

  await client.connect();
  try {
    await client.query('BEGIN');

    // Establish the legacy base schema before additive migrations that alter it.
    const baseSchema = path.join(__dirname, '../db/schema.sql');
    await client.query(await fs.readFile(baseSchema, 'utf8'));
    console.log('Applied db/schema.sql (base schema)');

    // Phase feature migrations are stored in backend/migrations.
    const phaseMigrations = await readSqlFiles(path.join(__dirname, '../migrations'));
    for (const filePath of phaseMigrations) {
      await client.query(await fs.readFile(filePath, 'utf8'));
      console.log(`Applied migrations/${path.basename(filePath)}`);
    }

    // Additional alignment/hardening migrations are stored in backend/db/migrations.
    const hardeningMigrations = await readSqlFiles(path.join(__dirname, '../db/migrations'));
    for (const filePath of hardeningMigrations) {
      await client.query(await fs.readFile(filePath, 'utf8'));
      console.log(`Applied db/migrations/${path.basename(filePath)}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
