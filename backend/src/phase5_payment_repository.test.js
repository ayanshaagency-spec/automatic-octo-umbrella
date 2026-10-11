const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('./db');
const repositoryPath = require.resolve('./phase5_payment_repository');

function installFakeDb(fakeDb) {
  delete require.cache[repositoryPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { getDb: async () => fakeDb }
  };
  return require(repositoryPath);
}

function createPaymentDb() {
  let nextId = 1;
  const patients = [{ id: 7, phone: '9999999999' }];
  const payments = [];
  const calls = [];

  const findPayment = id => payments.find(payment => payment.id === Number(id));

  const db = {
    calls,
    payments,
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (sql.includes('SELECT id FROM patients WHERE phone = $1')) {
        const patient = patients.find(item => item.phone === params[0]);
        return { rowCount: patient ? 1 : 0, rows: patient ? [patient] : [] };
      }

      if (sql.includes('SELECT id FROM appointments WHERE id = $1 AND patient_id = $2')) {
        return { rowCount: 1, rows: [{ id: params[0] }] };
      }

      if (sql.includes('SELECT id FROM lab_orders WHERE id = $1 AND patient_id = $2')) {
        return { rowCount: 1, rows: [{ id: params[0] }] };
      }

      if (sql.includes('WHERE patient_id = $1 AND idempotency_key = $2')) {
        const payment = payments.find(item => item.patient_id === params[0] && item.idempotency_key === params[1]);
        return { rowCount: payment ? 1 : 0, rows: payment ? [payment] : [] };
      }

      if (sql.includes('INSERT INTO payments')) {
        const [patientId, appointmentId, labOrderId, amount, currency, provider, providerOrderId, idempotencyKey, notes] = params;
        const existing = payments.find(item => item.patient_id === patientId && item.idempotency_key === idempotencyKey && idempotencyKey);
        if (existing) {
          const error = new Error('duplicate key');
          error.code = '23505';
          throw error;
        }
        const payment = {
          id: nextId++, patient_id: patientId, appointment_id: appointmentId, lab_order_id: labOrderId,
          amount, currency, provider, provider_order_id: providerOrderId, provider_payment_id: null,
          idempotency_key: idempotencyKey, status: 'created', notes,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        };
        payments.push(payment);
        return { rowCount: 1, rows: [payment] };
      }

      if (sql.includes('SELECT status FROM payments WHERE id = $1')) {
        const payment = findPayment(params[0]);
        return { rowCount: payment ? 1 : 0, rows: payment ? [{ status: payment.status }] : [] };
      }

      if (sql.includes('UPDATE payments') && sql.includes('SET provider = $1')) {
        const payment = findPayment(params[2]);
        if (!payment) return { rowCount: 0, rows: [] };
        payment.provider = params[0];
        payment.provider_order_id = params[1];
        if (payment.status === 'created') payment.status = 'pending';
        return { rowCount: 1, rows: [payment] };
      }

      if (sql.includes('UPDATE payments') && sql.includes('SET status = $1')) {
        const payment = findPayment(params[2]);
        if (!payment) return { rowCount: 0, rows: [] };
        payment.status = params[0];
        if (params[1]) payment.provider_payment_id = params[1];
        return { rowCount: 1, rows: [payment] };
      }

      if (sql.includes('SELECT pay.id, pay.patient_id, p.phone')) {
        const payment = findPayment(params[0]);
        return { rowCount: payment ? 1 : 0, rows: payment ? [{ ...payment, phone: '9999999999' }] : [] };
      }

      throw new Error(`Unhandled SQL in fake DB: ${sql}`);
    }
  };
  return db;
}

test.after(() => {
  delete require.cache[repositoryPath];
  delete require.cache[dbPath];
});

test('Phase 5 payment repository: create, idempotency and gateway order lifecycle', async () => {
  const fakeDb = createPaymentDb();
  const { createPayment, getPaymentById, setProviderOrderId } = installFakeDb(fakeDb);

  const first = await createPayment({ phone: '9999999999', appointmentId: 41, amount: 499, currency: 'INR', idempotencyKey: 'checkout-41-1' });
  assert.equal(first.status, 'created');
  assert.equal(first.amount, 499);
  assert.equal(first.idempotency_key, 'checkout-41-1');

  const repeated = await createPayment({ phone: '9999999999', appointmentId: 41, amount: 499, currency: 'INR', idempotencyKey: 'checkout-41-1' });
  assert.equal(repeated.id, first.id);
  assert.equal(fakeDb.payments.length, 1);

  const withOrder = await setProviderOrderId(first.id, 'razorpay', 'order_smoke_123');
  assert.equal(withOrder.provider, 'razorpay');
  assert.equal(withOrder.provider_order_id, 'order_smoke_123');
  assert.equal(withOrder.status, 'pending');

  const fetched = await getPaymentById(first.id);
  assert.equal(fetched.phone, '9999999999');
  assert.equal(fetched.provider_order_id, 'order_smoke_123');
});

test('Phase 5 payment repository: status lifecycle and invalid transition protection', async () => {
  const fakeDb = createPaymentDb();
  const { createPayment, updatePaymentStatus } = installFakeDb(fakeDb);

  const payment = await createPayment({ phone: '9999999999', labOrderId: 52, amount: 799, currency: 'INR' });
  const pending = await updatePaymentStatus(payment.id, 'pending');
  assert.equal(pending.status, 'pending');

  const paid = await updatePaymentStatus(payment.id, 'paid', 'pay_smoke_456');
  assert.equal(paid.status, 'paid');
  assert.equal(paid.provider_payment_id, 'pay_smoke_456');

  const refunded = await updatePaymentStatus(payment.id, 'refunded');
  assert.equal(refunded.status, 'refunded');

  await assert.rejects(
    () => updatePaymentStatus(payment.id, 'paid'),
    error => error.statusCode === 422 && /invalid payment status transition: refunded -> paid/.test(error.message)
  );
});
