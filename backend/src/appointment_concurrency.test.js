const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const repositoryPath = require.resolve('./repository');

function loadRepository(fakeDb) {
  delete require.cache[repositoryPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getDb: async () => fakeDb } };
  return require('./repository');
}

function createRaceDb() {
  let bookings = [];
  let insertCount = 0;
  let selectBarrierCount = 0;
  let releaseSelects;
  const selectBarrier = new Promise(resolve => { releaseSelects = resolve; });
  const db = {
    bookings,
    async query(sql, params = []) {
      if (sql.includes('SELECT id FROM doctors')) return { rowCount: 1, rows: [{ id: 22 }] };
      if (sql.includes('SELECT id FROM appointments WHERE doctor_id')) {
        selectBarrierCount++;
        if (selectBarrierCount === 2) releaseSelects();
        await selectBarrier;
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('INSERT INTO patients')) return { rowCount: 1, rows: [{ id: 55 }] };
      if (sql.includes('INSERT INTO appointments')) {
        insertCount++;
        if (insertCount === 1) {
          const row = { id: 101, patient_id: 55, doctor_id: 22, appointment_at: params[2], mode: params[3], status: 'confirmed' };
          bookings.push(row);
          return { rowCount: 1, rows: [row] };
        }
        const error = new Error('duplicate doctor slot');
        error.code = '23505';
        throw error;
      }
      throw new Error('Unexpected SQL: ' + sql);
    }
  };
  return db;
}

test('concurrent appointment requests for the same doctor slot: one succeeds and the other returns conflict', async () => {
  const fakeDb = createRaceDb();
  const { createAppointment } = loadRepository(fakeDb);
  const slot = new Date(Date.now() + 86_400_000).toISOString();
  const base = { doctorId: 22, appointmentAt: slot, mode: 'Video' };
  const results = await Promise.allSettled([
    createAppointment({ ...base, patientName: 'Patient A', phone: '9000000001' }),
    createAppointment({ ...base, patientName: 'Patient B', phone: '9000000002' })
  ]);
  const successes = results.filter(r => r.status === 'fulfilled');
  const failures = results.filter(r => r.status === 'rejected');
  assert.equal(successes.length, 1, 'only one concurrent booking should succeed');
  assert.equal(failures.length, 1, 'the competing booking should fail');
  assert.equal(failures[0].reason.statusCode, 409, 'database unique violation should map to HTTP conflict');
  assert.equal(fakeDb.bookings.length, 1);
});

test.after(() => { delete require.cache[repositoryPath]; delete require.cache[dbPath]; });
