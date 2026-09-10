const { getDb } = require('./db');

async function listPayments(phone) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(`
    SELECT pay.id, pay.patient_id, p.name AS patient_name, p.phone,
           pay.appointment_id, pay.lab_order_id, pay.amount, pay.currency,
           pay.provider, pay.provider_order_id, pay.provider_payment_id,
           pay.status, pay.notes, pay.created_at, pay.updated_at
      FROM payments pay
      JOIN patients p ON p.id = pay.patient_id
     WHERE p.phone = $1
     ORDER BY pay.created_at DESC`, [phone]);
  return rows;
}

async function createPayment(data) {
  const db = await getDb();
  if (!db) return null;
  if (!data.phone || data.amount == null) {
    const error = new Error('phone and amount are required');
    error.statusCode = 422;
    throw error;
  }
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('amount must be a positive number');
    error.statusCode = 422;
    throw error;
  }
  if (!data.appointmentId && !data.labOrderId) {
    const error = new Error('appointmentId or labOrderId is required');
    error.statusCode = 422;
    throw error;
  }
  const patient = await db.query('SELECT id FROM patients WHERE phone = $1', [data.phone]);
  if (!patient.rowCount) {
    const error = new Error('Patient not found');
    error.statusCode = 404;
    throw error;
  }
  const { rows } = await db.query(`
    INSERT INTO payments
      (patient_id, appointment_id, lab_order_id, amount, currency, provider, provider_order_id, status, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'created',$8)
    RETURNING id, patient_id, appointment_id, lab_order_id, amount, currency, provider, provider_order_id, status, notes, created_at, updated_at`,
    [patient.rows[0].id, data.appointmentId || null, data.labOrderId || null, amount,
     data.currency || 'INR', data.provider || null, data.providerOrderId || null, data.notes || null]
  );
  return rows[0];
}

async function updatePaymentStatus(id, status, providerPaymentId) {
  const db = await getDb();
  if (!db) return null;
  const allowed = ['created', 'pending', 'paid', 'failed', 'refunded', 'cancelled'];
  if (!allowed.includes(status)) {
    const error = new Error(`status must be one of: ${allowed.join(', ')}`);
    error.statusCode = 422;
    throw error;
  }
  const { rows } = await db.query(`
    UPDATE payments
       SET status = $1,
           provider_payment_id = COALESCE($2, provider_payment_id),
           updated_at = NOW()
     WHERE id = $3
     RETURNING id, patient_id, appointment_id, lab_order_id, amount, currency, provider,
               provider_order_id, provider_payment_id, status, notes, created_at, updated_at`,
    [status, providerPaymentId || null, id]
  );
  if (!rows.length) {
    const error = new Error('Payment not found');
    error.statusCode = 404;
    throw error;
  }
  return rows[0];
}

module.exports = { listPayments, createPayment, updatePaymentStatus };
