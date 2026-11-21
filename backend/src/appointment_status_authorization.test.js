const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const repositoryPath = require.resolve('./repository');

function loadRepository(fakeDb) {
  delete require.cache[repositoryPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getDb: async () => fakeDb } };
  return require('./repository');
}

test('doctor status update SQL is scoped to appointment and authenticated doctor phone', async () => {
  let captured;
  const db = { async query(sql, params) {
    captured = { sql, params };
    return { rows: [{ id: 7, status: 'completed' }] };
  }};
  const repo = loadRepository(db);
  const result = await repo.updateDoctorAppointmentStatus(7, '+919000000001', 'completed');
  assert.equal(result.id, 7);
  assert.match(captured.sql, /a\.id = \$2 AND a\.doctor_id = d\.id AND d\.phone = \$3/);
  assert.deepEqual(captured.params, ['completed', 7, '+919000000001']);
});

test('doctor status update rejects invalid status without issuing SQL', async () => {
  let queries = 0;
  const repo = loadRepository({ async query() { queries++; return { rows: [] }; } });
  await assert.rejects(repo.updateDoctorAppointmentStatus(7, '+919000000001', 'unknown'), e => e.statusCode === 422);
  assert.equal(queries, 0);
});

test('admin status update rejects invalid status without issuing SQL', async () => {
  let queries = 0;
  const repo = loadRepository({ async query() { queries++; return { rows: [] }; } });
  await assert.rejects(repo.updateAppointmentStatus(7, 'unknown'), e => e.statusCode === 422);
  assert.equal(queries, 0);
});

test('doctor status update returns not-found for appointment outside doctor scope', async () => {
  let capturedParams;
  const repo = loadRepository({ async query(sql, params) { capturedParams = params; return { rows: [] }; } });
  await assert.rejects(repo.updateDoctorAppointmentStatus(7, '+919000000001', 'confirmed'), e => e.statusCode === 404);
  assert.deepEqual(capturedParams, ['confirmed', 7, '+919000000001']);
});

test.after(() => { delete require.cache[repositoryPath]; delete require.cache[dbPath]; });
