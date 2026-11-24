const { getDb } = require('./db');
const { validatePaymentInput, validateStatusTransition } = require('./phase5_payment_validation');

async function listPayments(phone) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(`
    SELECT pay.id, pay.patient_id, p.name AS patient_name, p.phone,
           pay.appointment_id, pay.lab_order_id, pay.amount, pay.currency,
           pay.provider, pay.provider_order_id, pay.provider_payment_id,
           pay.idempotency_key, pay.status, pay.notes, pay.created_at, pay.updated_at
      FROM payments pay
      JOIN patients p ON p.id = pay.patient_id
     WHERE p.phone = $1
     ORDER BY pay.created_at DESC`, [phone]);
  return rows;
}

async function getPaymentById(id) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(`
    SELECT pay.id, pay.patient_id, p.phone,
           pay.appointment_id, pay.lab_order_id, pay.amount, pay.currency,
           pay.provider, pay.provider_order_id, pay.provider_payment_id,
           pay.idempotency_key, pay.status, pay.notes, pay.created_at, pay.updated_at
      FROM payments pay
      JOIN patients p ON p.id = pay.patient_id
     WHERE pay.id = $1`, [id]);
  return rows[0] || null;
}

async function setProviderOrderId(id, provider, providerOrderId) {
  const db = await getDb();
  if (!db) return null;
  // First gateway order wins: concurrent checkout requests cannot overwrite it.
  const { rows } = await db.query(`
    UPDATE payments
       SET provider = $1,
           provider_order_id = $2,
           status = CASE WHEN status = 'created' THEN 'pending' ELSE status END,
           updated_at = NOW()
     WHERE id = $3 AND provider_order_id IS NULL
     RETURNING id, patient_id, appointment_id, lab_order_id, amount, currency, provider,
               provider_order_id, provider_payment_id, idempotency_key, status, notes, created_at, updated_at`,
    [provider, providerOrderId, id]
  );
  if (rows[0]) return rows[0];
  // A competing request may have saved an order; return that persisted winner.
  const existing = await getPaymentById(id);
  if (existing && existing.provider_order_id) return existing;
  return null;
}


function assertIdempotentPaymentMatches(existing, data, patientId) {
  const expected = {
    patient_id: patientId,
    appointment_id: data.appointmentId || null,
    lab_order_id: data.labOrderId || null,
    amount: Number(data.amount),
    currency: data.currency || 'INR'
  };
  const actual = {
    patient_id: existing.patient_id,
    appointment_id: existing.appointment_id || null,
    lab_order_id: existing.lab_order_id || null,
    amount: Number(existing.amount),
    currency: existing.currency || 'INR'
  };
  if (Object.keys(expected).some(key => expected[key] !== actual[key])) {
    const error = new Error('Idempotency key was already used with different payment details');
    error.statusCode = 409;
    throw error;
  }
  return existing;
}

async function createPayment(data) {
  const validationError = validatePaymentInput(data);
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 422;
    throw error;
  }
  const db = await getDb();
  if (!db) return null;
  const amount = Number(data.amount);
  const patient = await db.query('SELECT id FROM patients WHERE phone = $1', [data.phone]);
  if (!patient.rowCount) {
    const error = new Error('Patient not found');
    error.statusCode = 404;
    throw error;
  }

  if (data.appointmentId) {
    const appointment = await db.query(
      'SELECT id FROM appointments WHERE id = $1 AND patient_id = $2',
      [data.appointmentId, patient.rows[0].id]
    );
    if (!appointment.rowCount) {
      const error = new Error('Appointment does not belong to patient');
      error.statusCode = 403;
      throw error;
    }
  }

  if (data.labOrderId) {
    const labOrder = await db.query(
      'SELECT id FROM lab_orders WHERE id = $1 AND patient_id = $2',
      [data.labOrderId, patient.rows[0].id]
    );
    if (!labOrder.rowCount) {
      const error = new Error('Lab order does not belong to patient');
      error.statusCode = 403;
      throw error;
    }
  }

  if (data.idempotencyKey) {
    const existing = await db.query(`
      SELECT id, patient_id, appointment_id, lab_order_id, amount, currency, provider,
             provider_order_id, provider_payment_id, idempotency_key, status, notes, created_at, updated_at
        FROM payments
       WHERE patient_id = $1 AND idempotency_key = $2`,
      [patient.rows[0].id, data.idempotencyKey]
    );
    if (existing.rowCount) return assertIdempotentPaymentMatches(existing.rows[0], data, patient.rows[0].id);
  }

  try {
    const { rows } = await db.query(`
      INSERT INTO payments
        (patient_id, appointment_id, lab_order_id, amount, currency, provider, provider_order_id, idempotency_key, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'created',$9)
      RETURNING id, patient_id, appointment_id, lab_order_id, amount, currency, provider, provider_order_id,
                provider_payment_id, idempotency_key, status, notes, created_at, updated_at`,
      [patient.rows[0].id, data.appointmentId || null, data.labOrderId || null, amount,
       data.currency || 'INR', null, null, data.idempotencyKey || null, data.notes || null]
    );
    return rows[0];
  } catch (error) {
    if (data.idempotencyKey && error.code === '23505') {
      const existing = await db.query(`
        SELECT id, patient_id, appointment_id, lab_order_id, amount, currency, provider,
               provider_order_id, provider_payment_id, idempotency_key, status, notes, created_at, updated_at
          FROM payments
         WHERE patient_id = $1 AND idempotency_key = $2`,
        [patient.rows[0].id, data.idempotencyKey]
      );
      if (existing.rowCount) return assertIdempotentPaymentMatches(existing.rows[0], data, patient.rows[0].id);
    }
    throw error;
  }
}

async function updatePaymentStatus(id, status, providerPaymentId) {
  const db = await getDb();
  if (!db) return null;
  const current = await db.query('SELECT status FROM payments WHERE id = $1', [id]);
  if (!current.rowCount) {
    const error = new Error('Payment not found');
    error.statusCode = 404;
    throw error;
  }
  const validationError = validateStatusTransition(current.rows[0].status, status);
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 422;
    throw error;
  }
  // Guard the write with the status observed above. This prevents concurrent
  // webhook/API updates from overwriting a transition validated against stale state.
  const { rows } = await db.query(`
    UPDATE payments
       SET status = $1,
           provider_payment_id = COALESCE($2, provider_payment_id),
           updated_at = NOW()
     WHERE id = $3 AND status = $4
     RETURNING id, patient_id, appointment_id, lab_order_id, amount, currency, provider,
               provider_order_id, provider_payment_id, idempotency_key, status, notes, created_at, updated_at`,
    [status, providerPaymentId || null, id, current.rows[0].status]
  );
  if (rows[0]) return rows[0];

  const conflict = new Error('Payment status changed concurrently; retry with the latest status');
  conflict.statusCode = 409;
  throw conflict;
}

module.exports = { listPayments, getPaymentById, setProviderOrderId, createPayment, updatePaymentStatus };
