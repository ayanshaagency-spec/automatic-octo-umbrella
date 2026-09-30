const { getDb } = require('./db');

async function listLabOrders(phone) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(`
    SELECT lo.id, lo.patient_id, p.name AS patient_name, p.phone,
           lo.test_name, lo.lab_name, lo.scheduled_at, lo.status,
           lo.amount, lo.notes, lo.created_at
      FROM lab_orders lo
      JOIN patients p ON p.id = lo.patient_id
     WHERE p.phone = $1
     ORDER BY lo.scheduled_at DESC NULLS LAST, lo.created_at DESC`, [phone]);
  return rows;
}

async function createLabOrder(data) {
  const db = await getDb();
  if (!db) return null;
  if (!data.phone || !data.testName) {
    const error = new Error('phone and testName are required');
    error.statusCode = 422;
    throw error;
  }

  const patient = await db.query('SELECT id FROM patients WHERE phone = $1', [data.phone]);
  if (patient.rowCount === 0) {
    const error = new Error('Patient not found');
    error.statusCode = 404;
    throw error;
  }

  let scheduledAt = null;
  if (data.scheduledAt) {
    const parsed = new Date(data.scheduledAt);
    if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
      const error = new Error('scheduledAt must be a valid future date');
      error.statusCode = 422;
      throw error;
    }
    scheduledAt = parsed.toISOString();
  }

  const amount = data.amount == null || data.amount === '' ? null : Number(data.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    const error = new Error('amount must be a non-negative number');
    error.statusCode = 422;
    throw error;
  }

  const { rows } = await db.query(`
    INSERT INTO lab_orders
      (patient_id, test_name, lab_name, scheduled_at, status, amount, notes)
    VALUES ($1,$2,$3,$4,'booked',$5,$6)
    RETURNING id, patient_id, test_name, lab_name, scheduled_at, status, amount, notes, created_at`,
    [patient.rows[0].id, data.testName, data.labName || null, scheduledAt, amount, data.notes || null]
  );
  return rows[0];
}

async function updateLabOrderStatus(id, status) {
  const db = await getDb();
  if (!db) return null;
  const allowed = ['booked', 'confirmed', 'sample-collected', 'completed', 'cancelled'];
  if (!allowed.includes(status)) {
    const error = new Error(`status must be one of: ${allowed.join(', ')}`);
    error.statusCode = 422;
    throw error;
  }
  const { rows } = await db.query(
    'UPDATE lab_orders SET status = $1 WHERE id = $2 RETURNING id, patient_id, test_name, lab_name, scheduled_at, status, amount, notes, created_at',
    [status, id]
  );
  if (!rows.length) {
    const error = new Error('Lab order not found');
    error.statusCode = 404;
    throw error;
  }
  return rows[0];
}

module.exports = { listLabOrders, createLabOrder, updateLabOrderStatus };
