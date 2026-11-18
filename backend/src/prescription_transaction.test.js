const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const repositoryPath = require.resolve('./phase3_repository');

function loadRepository(fakePool) {
  delete require.cache[repositoryPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getDb: async () => fakePool } };
  return require('./phase3_repository');
}

function createTransactionPool() {
  const poolCalls = [];
  const clientCalls = [];
  let released = false;
  const client = {
    async query(sql, params = []) {
      clientCalls.push({ sql, params });
      if (sql.includes('SELECT a.id, a.patient_id, a.doctor_id')) return { rowCount: 1, rows: [{ id: 9, patient_id: 7, doctor_id: 3 }] };
      if (sql.includes('INSERT INTO prescriptions')) return { rowCount: 1, rows: [{ id: 77, appointment_id: 9, patient_id: 7, doctor_id: 3 }] };
      if (sql.includes('INSERT INTO prescription_items')) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    },
    release() { released = true; }
  };
  const pool = {
    connect: async () => client,
    async query(sql) { poolCalls.push(sql); throw new Error('transaction queries must not run on the shared pool'); }
  };
  return { pool, poolCalls, clientCalls, get released() { return released; };
}

test('prescription transaction uses a dedicated client and releases it after commit', async () => {
  const fixture = createTransactionPool();
  const { createPrescription } = loadRepository(fixture.pool);
  const result = await createPrescription({
    appointmentId: 9, phone: '9000000000', doctorPhone: '9000000003', diagnosis: 'test',
    medicines: [{ medicineName: 'M', dosage: '1', frequency: 'daily', duration: '1 day' }]
  });
  assert.equal(result.id, 77);
  assert.deepEqual(fixture.poolCalls, [], 'shared pool must not execute transaction queries');
  assert.ok(fixture.clientCalls.some(c => c.sql === 'BEGIN'));
  assert.ok(fixture.clientCalls.some(c => c.sql === 'COMMIT'));
  assert.equal(fixture.released, true);
});

test('prescription transaction rolls back and releases client on medicine insert error', async () => {
  const fixture = createTransactionPool();
  const client = fixture.pool.connect ? await fixture.pool.connect() : null;
  const badClient = {
    ...client,
    async query(sql, params) {
      if (sql.includes('INSERT INTO prescription_items')) throw new Error('item insert failed');
      return client.query(sql, params);
    },
    release() { client.release(); }
  };
  fixture.pool.connect = async () => badClient;
  const { createPrescription } = loadRepository(fixture.pool);
  await assert.rejects(() => createPrescription({
    appointmentId: 9, phone: '9000000000', doctorPhone: '9000000003', diagnosis: 'test',
    medicines: [{ medicineName: 'M', dosage: '1', frequency: 'daily', duration: '1 day' }]
  }), /item insert failed/);
  assert.equal(fixture.released, true);
});

test.after(() => { delete require.cache[repositoryPath]; delete require.cache[dbPath]; });
