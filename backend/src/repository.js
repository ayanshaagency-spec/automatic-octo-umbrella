const { getDb } = require('./db');

async function listDoctors() {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query('SELECT id, name, specialty FROM doctors ORDER BY id');
  return rows;
}

async function createAppointment(data) {
  const db = await getDb();
  if (!db) return null;

  const doctor = await db.query('SELECT id FROM doctors WHERE id = $1', [data.doctorId]);
  if (doctor.rowCount === 0) {
    const error = new Error('Doctor not found');
    error.statusCode = 422;
    throw error;
  }

  const mode = data.mode || 'Video';
  if (!['Video', 'In-clinic'].includes(mode)) {
    const error = new Error('mode must be Video or In-clinic');
    error.statusCode = 422;
    throw error;
  }

  const appointmentAt = new Date(data.appointmentAt);
  if (Number.isNaN(appointmentAt.getTime()) || appointmentAt <= new Date()) {
    const error = new Error('appointmentAt must be a valid future date');
    error.statusCode = 422;
    throw error;
  }

  const existing = await db.query(
    'SELECT id FROM appointments WHERE doctor_id = $1 AND appointment_at = $2 AND status <> $3 LIMIT 1',
    [data.doctorId, appointmentAt.toISOString(), 'cancelled']
  );
  if (existing.rowCount > 0) {
    const error = new Error('Selected appointment slot is already booked');
    error.statusCode = 409;
    throw error;
  }

  const patient = await db.query(
    `INSERT INTO patients (name, phone) VALUES ($1,$2)
     ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name
     RETURNING id`, [data.patientName, data.phone]
  );

  const { rows } = await db.query(
    `INSERT INTO appointments (patient_id, doctor_id, appointment_at, mode, status)
     VALUES ($1,$2,$3,$4,'confirmed')
     RETURNING id, patient_id, doctor_id, appointment_at, mode, status`,
    [patient.rows[0].id, data.doctorId, appointmentAt.toISOString(), mode]
  );
  return rows[0];
}

module.exports = { listDoctors, createAppointment };
