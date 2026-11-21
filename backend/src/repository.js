const { getDb } = require('./db');

async function listDoctors() {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query('SELECT id, name, specialty FROM doctors ORDER BY id');
  return rows;
}

async function listAppointments(phone) {
  const db = await getDb();
  if (!db) return null;
  const params = [];
  let where = '';
  if (phone) {
    params.push(phone);
    where = 'WHERE p.phone = $1';
  }
  const { rows } = await db.query(
    `SELECT a.id, a.patient_id, a.doctor_id, p.name AS patient_name, p.phone,
            d.name AS doctor_name, d.specialty, a.appointment_at, a.mode, a.status
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN doctors d ON d.id = a.doctor_id
       ${where}
      ORDER BY a.appointment_at DESC`,
    params
  );
  return rows;
}

async function updateAppointmentStatus(id, status) {
  const db = await getDb();
  if (!db) return null;
  const allowed = ['confirmed', 'completed', 'cancelled', 'in-progress'];
  if (!allowed.includes(status)) {
    const error = new Error(`status must be one of: ${allowed.join(', ')}`);
    error.statusCode = 422;
    throw error;
  }
  const { rows } = await db.query(
    `UPDATE appointments SET status = $1 WHERE id = $2
     RETURNING id, patient_id, doctor_id, appointment_at, mode, status`,
    [status, id]
  );
  if (!rows.length) {
    const error = new Error('Appointment not found');
    error.statusCode = 404;
    throw error;
  }
  return rows[0];
}

async function createAppointment(data) {
  if (!data || typeof data !== 'object') {
    const error = new Error('appointment details are required');
    error.statusCode = 422;
    throw error;
  }
  const patientName = typeof data.patientName === 'string' ? data.patientName.trim() : '';
  const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
  if (!patientName || patientName.length > 120) {
    const error = new Error('patientName must be 1-120 characters');
    error.statusCode = 422;
    throw error;
  }
  if (!/^\\+?[1-9]\\d{9,14}$/.test(phone)) {
    const error = new Error('phone must be a valid phone number');
    error.statusCode = 422;
    throw error;
  }
  if (!Number.isSafeInteger(Number(data.doctorId)) || Number(data.doctorId) <= 0) {
    const error = new Error('doctorId must be a positive integer');
    error.statusCode = 422;
    throw error;
  }
  const doctorId = Number(data.doctorId);
  const mode = data.mode || 'Video';
  if (!['Video', 'In-clinic'].includes(mode)) {
    const error = new Error('mode must be Video or In-clinic');
    error.statusCode = 422;
    throw error;
  }

  const appointmentAt = new Date(data.appointmentAt);
  const pool = await getDb();
  if (!pool) return null;
  if (Number.isNaN(appointmentAt.getTime()) || appointmentAt <= new Date()) {
    const error = new Error('appointmentAt must be a valid future date');
    error.statusCode = 422;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const doctor = await client.query('SELECT id FROM doctors WHERE id = $1', [doctorId]);
    if (doctor.rowCount === 0) {
      const error = new Error('Doctor not found');
      error.statusCode = 422;
      throw error;
    }

    const existing = await client.query(
      'SELECT id FROM appointments WHERE doctor_id = $1 AND appointment_at = $2 AND status IS DISTINCT FROM $3 LIMIT 1',
      [doctorId, appointmentAt.toISOString(), 'cancelled']
    );
    if (existing.rowCount > 0) {
      const error = new Error('Selected appointment slot is already booked');
      error.statusCode = 409;
      throw error;
    }

    const patient = await client.query(
      `INSERT INTO patients (name, phone) VALUES ($1,$2)
       ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name
       RETURNING id`,
      [patientName, phone]
    );

    const { rows } = await client.query(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_at, mode, status)
       VALUES ($1,$2,$3,$4,'confirmed')
       RETURNING id, patient_id, doctor_id, appointment_at, mode, status`,
      [patient.rows[0].id, doctorId, appointmentAt.toISOString(), mode]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    if (error.code === '23505') {
      const conflict = new Error('Selected appointment slot is already booked');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function getDoctorByPhone(phone) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query('SELECT id, name, specialty, phone FROM doctors WHERE phone = $1', [phone]);
  return rows[0] || null;
}

async function listDoctorAppointments(phone) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(
    `SELECT a.id, a.patient_id, a.doctor_id, p.name AS patient_name, p.phone,
            d.name AS doctor_name, d.specialty, a.appointment_at, a.mode, a.status
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN doctors d ON d.id = a.doctor_id
      WHERE d.phone = $1
      ORDER BY a.appointment_at DESC`, [phone]);
  return rows;
}

async function updateDoctorAppointmentStatus(id, doctorPhone, status) {
  const db = await getDb();
  if (!db) return null;
  const allowed = ['confirmed', 'completed', 'cancelled', 'in-progress'];
  if (!allowed.includes(status)) { const e = new Error(`status must be one of: ${allowed.join(', ')}`); e.statusCode=422; throw e; }
  const { rows } = await db.query(
    `UPDATE appointments a SET status = $1
       FROM doctors d
      WHERE a.id = $2 AND a.doctor_id = d.id AND d.phone = $3
      RETURNING a.id, a.patient_id, a.doctor_id, a.appointment_at, a.mode, a.status`,
    [status,id,doctorPhone]);
  if (!rows.length) { const e=new Error('Appointment not found or not assigned to doctor'); e.statusCode=404; throw e; }
  return rows[0];
}

module.exports = { listDoctors, listAppointments, updateAppointmentStatus, createAppointment, getDoctorByPhone, listDoctorAppointments, updateDoctorAppointmentStatus };
