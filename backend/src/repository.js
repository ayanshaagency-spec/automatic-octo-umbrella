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
  const patient = await db.query(
    `INSERT INTO patients (name, phone) VALUES ($1,$2)
     ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name
     RETURNING id`, [data.patientName, data.phone]
  );
  const { rows } = await db.query(
    `INSERT INTO appointments (patient_id, doctor_id, appointment_at, mode, status)
     VALUES ($1,$2,$3,$4,'confirmed')
     RETURNING id, patient_id, doctor_id, appointment_at, mode, status`,
    [patient.rows[0].id, data.doctorId, data.appointmentAt, data.mode || 'Video']
  );
  return rows[0];
}

module.exports = { listDoctors, createAppointment };
