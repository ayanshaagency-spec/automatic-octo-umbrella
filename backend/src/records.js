const { getDb } = require('./db');

async function listPatientRecords(phone) {
  const db = await getDb();
  if (!db) return [];
  const { rows } = await db.query(
    `SELECT id, type, title, details, created_at AS "createdAt"
       FROM patient_records
      WHERE patient_phone = $1
      ORDER BY created_at DESC`, [phone]
  );
  return rows;
}

async function addPatientRecord(phone, record) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(
    `INSERT INTO patient_records (patient_phone, type, title, details)
     VALUES ($1,$2,$3,$4)
     RETURNING id, type, title, details, created_at AS "createdAt"`,
    [phone, record.type, record.title, record.details || null]
  );
  return rows[0];
}

module.exports = { listPatientRecords, addPatientRecord };
