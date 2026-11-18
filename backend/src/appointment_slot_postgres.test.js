const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

test('PostgreSQL enforces one active doctor slot and permits rebooking after cancellation', async t => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is required for PostgreSQL constraint test');
    return;
  }
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const suffix = `ci-slot-${Date.now()}-${Math.floor(Math.random()*100000)}`;
  let doctorId, patientA, patientB;
  const slot = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  try {
    doctorId = (await db.query(
      'INSERT INTO doctors(name,specialty) VALUES($1,$2) RETURNING id',
      [suffix, 'Test Specialty']
    )).rows[0].id;
    patientA = (await db.query(
      'INSERT INTO patients(name,phone) VALUES($1,$2) RETURNING id',
      ['CI Patient A', suffix + '-a']
    )).rows[0].id;
    patientB = (await db.query(
      'INSERT INTO patients(name,phone) VALUES($1,$2) RETURNING id',
      ['CI Patient B', suffix + '-b']
    )).rows[0].id;

    const insert = (patientId) => db.query(
      `INSERT INTO appointments(patient_id,doctor_id,appointment_at,mode,status)
       VALUES($1,$2,$3,'Video','confirmed') RETURNING id`,
      [patientId, doctorId, slot]
    );
    const outcomes = await Promise.allSettled([insert(patientA), insert(patientB)]);
    assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
    const rejected = outcomes.find(o => o.status === 'rejected');
    assert.equal(rejected.reason.code, '23505');

    const winner = outcomes.find(o => o.status === 'fulfilled').value.rows[0];
    await db.query('UPDATE appointments SET status = $1 WHERE id = $2', ['cancelled', winner.id]);
    const rebook = await insert(patientB);
    assert.ok(rebook.rows[0].id, 'cancelled slot should be bookable again');
  } finally {
    if (doctorId) await db.query('DELETE FROM appointments WHERE doctor_id = $1', [doctorId]);
    if (patientA) await db.query('DELETE FROM patients WHERE id = $1', [patientA]);
    if (patientB) await db.query('DELETE FROM patients WHERE id = $1', [patientB]);
    if (doctorId) await db.query('DELETE FROM doctors WHERE id = $1', [doctorId]);
    await db.end();
  }
});
