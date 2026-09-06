const { getDb } = require('./db');

async function listPrescriptions(phone) {
  const db = await getDb();
  if (!db) return null;
  const params = [phone];
  const { rows } = await db.query(`
    SELECT p.id, p.appointment_id, p.patient_id, p.doctor_id,
           d.name AS doctor_name, d.specialty,
           p.diagnosis, p.notes, p.prescribed_at,
           COALESCE(json_agg(json_build_object(
             'id', pi.id,
             'medicineName', pi.medicine_name,
             'dosage', pi.dosage,
             'frequency', pi.frequency,
             'duration', pi.duration,
             'instructions', pi.instructions
           ) ORDER BY pi.id) FILTER (WHERE pi.id IS NOT NULL), '[]') AS medicines
      FROM prescriptions p
      JOIN patients pt ON pt.id = p.patient_id
      JOIN doctors d ON d.id = p.doctor_id
      LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
     WHERE pt.phone = $1
     GROUP BY p.id, d.name, d.specialty
     ORDER BY p.prescribed_at DESC`, params);
  return rows;
}

async function createPrescription(data) {
  const db = await getDb();
  if (!db) return null;
  if (!data.appointmentId || !data.diagnosis || !Array.isArray(data.medicines) || data.medicines.length === 0) {
    const error = new Error('appointmentId, diagnosis and at least one medicine are required');
    error.statusCode = 422;
    throw error;
  }

  const appointment = await db.query(
    'SELECT id, patient_id, doctor_id FROM appointments WHERE id = $1',
    [data.appointmentId]
  );
  if (appointment.rowCount === 0) {
    const error = new Error('Appointment not found');
    error.statusCode = 404;
    throw error;
  }

  const a = appointment.rows[0];
  await db.query('BEGIN');
  try {
    const prescription = await db.query(
      `INSERT INTO prescriptions (appointment_id, patient_id, doctor_id, diagnosis, notes)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, appointment_id, patient_id, doctor_id, diagnosis, notes, prescribed_at`,
      [a.id, a.patient_id, a.doctor_id, data.diagnosis, data.notes || null]
    );
    for (const medicine of data.medicines) {
      if (!medicine.medicineName || !medicine.dosage || !medicine.frequency || !medicine.duration) {
        const error = new Error('Each medicine requires medicineName, dosage, frequency and duration');
        error.statusCode = 422;
        throw error;
      }
      await db.query(
        `INSERT INTO prescription_items
          (prescription_id, medicine_name, dosage, frequency, duration, instructions)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [prescription.rows[0].id, medicine.medicineName, medicine.dosage, medicine.frequency, medicine.duration, medicine.instructions || null]
      );
    }
    await db.query('COMMIT');
    return prescription.rows[0];
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function listHealthRecords(phone) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(`
    SELECT hr.id, hr.patient_id, hr.record_type, hr.title,
           hr.description, hr.record_date, hr.source
      FROM health_records hr
      JOIN patients p ON p.id = hr.patient_id
     WHERE p.phone = $1
     ORDER BY hr.record_date DESC`, [phone]);
  return rows;
}

async function createHealthRecord(data) {
  const db = await getDb();
  if (!db) return null;
  if (!data.phone || !data.recordType || !data.title) {
    const error = new Error('phone, recordType and title are required');
    error.statusCode = 422;
    throw error;
  }
  const patient = await db.query('SELECT id FROM patients WHERE phone = $1', [data.phone]);
  if (patient.rowCount === 0) {
    const error = new Error('Patient not found');
    error.statusCode = 404;
    throw error;
  }
  const { rows } = await db.query(
    `INSERT INTO health_records (patient_id, record_type, title, description, record_date, source)
     VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz,NOW()),$6)
     RETURNING id, patient_id, record_type, title, description, record_date, source`,
    [patient.rows[0].id, data.recordType, data.title, data.description || null, data.recordDate || null, data.source || null]
  );
  return rows[0];
}

module.exports = { listPrescriptions, createPrescription, listHealthRecords, createHealthRecord };
