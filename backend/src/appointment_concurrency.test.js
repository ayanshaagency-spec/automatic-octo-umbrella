const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const repositoryPath = require.resolve('./repository');

function loadRepository(fakePool) {
  delete require.cache[repositoryPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getDb: async () => fakePool } };
  return require('./repository');
}

function createRacePool() {
  const committedSlots = new Set();
  const committedPatients = [];
  let selectBarrierCount = 0;
  let releaseSelects;
  const selectBarrier = new Promise(resolve => { releaseSelects = resolve; });
  let patientCounter = 0;
  const pool = {
    async connect() {
      let ownSlot = null;
      let pendingPatient = null;
      return {
        async query(sql, params = []) {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            if (sql === 'COMMIT' && pendingPatient) committedPatients.push(pendingPatient);
            if (sql === 'ROLLBACK' && ownSlot) committedSlots.delete(ownSlot);
            return { rowCount: 0, rows: [] };
          }
          if (sql.includes('SELECT id FROM doctors')) return { rowCount: 1, rows: [{ id: 22 }] };
          if (sql.includes('SELECT id FROM appointments WHERE doctor_id')) {
            selectBarrierCount++;
            if (selectBarrierCount === 2) releaseSelects();
            await selectBarrier;
            return { rowCount: 0, rows: [] };
          }
          if (sql.includes('INSERT INTO patients')) {
            pendingPatient = { id: ++patientCounter, phone: params[1] };
            return { rowCount: 1, rows: [{ id: pendingPatient.id }] };
          }
          if (sql.includes('INSERT INTO appointments')) {
            const slotKey = `${params[1]}|${params[2]}`;
            if (committedSlots.has(slotKey)) {
              const error = new Error('duplicate doctor slot');
              error.code = '23505';
              throw error;
            }
            committedSlots.add(slotKey);
            ownSlot = slotKey;
            return { rowCount: 1, rows: [{ id: 101, patient_id: params[0], doctor_id: params[1], appointment_at: params[2], mode: params[3], status: 'confirmed' }] };
          }
          throw new Error('Unexpected SQL: ' + sql);
        },
        release() {}
      };
    }
  };
  return { pool, committedSlots, committedPatients };
}

test('concurrent same-slot appointment requests use separate transactions; one commits and one conflicts', async () => {
  const fixture = createRacePool();
  const { createAppointment } = loadRepository(fixture.pool);
  const slot = new Date(Date.now() + 86_400_000).toISOString();
  const base = { doctorId: 22, appointmentAt: slot, mode: 'Video' };
  const results = await Promise.allSettled([
    createAppointment({ ...base, patientName: 'Patient A', phone: '9000000001' }),
    createAppointment({ ...base, patientName: 'Patient B', phone: '9000000002' })
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, 'exactly one booking commits; outcomes: ' + JSON.stringify(results.map(r => r.status === 'rejected' ? { error: r.reason.message, code: r.reason.code, statusCode: r.reason.statusCode } : { value: r.value })));
  const failures = results.filter(r => r.status === 'rejected');
  assert.equal(failures.length, 1, 'competing booking is rejected');
  assert.equal(failures[0].reason.statusCode, 409, 'unique violation becomes HTTP conflict');
  assert.equal(fixture.committedSlots.size, 1);
  assert.equal(fixture.committedPatients.length, 1, 'losing transaction must not persist its patient upsert');
});

test.after(() => { delete require.cache[repositoryPath]; delete require.cache[dbPath]; });
