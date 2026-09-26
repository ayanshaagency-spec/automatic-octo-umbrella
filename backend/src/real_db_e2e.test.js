const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { Client } = require('pg');

const PORT = 3920;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PHONE = '+919900000001';
const JWT_SECRET = 'ci-real-e2e-jwt-secret-long-enough-for-hmac';

async function dbClient() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

function startServer() {
  return spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET,
      NODE_ENV: 'test',
      PAYMENT_STATUS_ADMIN_TOKEN: 'ci-admin-token',
      CORS_ALLOWED_ORIGINS: 'http://allowed.example'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function waitForHealth(child) {
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API server exited early: ${output}`);
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not become ready: ${output}`);
}

test('real PostgreSQL patient journey E2E', async t => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is required for the real database E2E test');
    return;
  }

  const db = await dbClient();
  const doctor = await db.query(
    `INSERT INTO doctors (name, specialty) VALUES ('CI E2E Doctor', 'General Medicine')
     RETURNING id`
  );
  const doctorId = doctor.rows[0].id;
  const hospital = await db.query(
    `INSERT INTO hospitals (name, address, city, state, latitude, longitude, phone, emergency_available, active)
     VALUES ('CI E2E Hospital', 'Test Address', 'Delhi', 'Delhi', 28.6139, 77.2090, '01100000000', TRUE, TRUE)
     RETURNING id`
  );
  const hospitalId = hospital.rows[0].id;

  const server = startServer();
  t.after(async () => {
    server.kill();
    await db.query('DELETE FROM payments WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1)', [PHONE]);
    await db.query('DELETE FROM health_records WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1)', [PHONE]);
    await db.query('DELETE FROM lab_orders WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1)', [PHONE]);
    await db.query('DELETE FROM prescription_items WHERE prescription_id IN (SELECT id FROM prescriptions WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1))', [PHONE]);
    await db.query('DELETE FROM prescriptions WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1)', [PHONE]);
    await db.query('DELETE FROM appointments WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1)', [PHONE]);
    await db.query('DELETE FROM patients WHERE phone = $1', [PHONE]);
    await db.query('DELETE FROM hospitals WHERE id = $1', [hospitalId]);
    await db.query('DELETE FROM doctors WHERE id = $1', [doctorId]);
    await db.end();
  });

  await waitForHealth(server);

  const requestOtp = await fetch(`${BASE_URL}/api/auth/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE })
  });
  assert.equal(requestOtp.status, 200);
  const otp = await requestOtp.json();

  const verifyOtp = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, otp: otp.devOtp })
  });
  assert.equal(verifyOtp.status, 200);
  const session = await verifyOtp.json();
  const auth = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };

  const appointment = await fetch(`${BASE_URL}/api/appointments`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      patientName: 'CI E2E Patient',
      phone: PHONE,
      doctorId,
      appointmentAt: new Date(Date.now() + 86400000).toISOString(),
      mode: 'Video'
    })
  });
  assert.equal(appointment.status, 201);
  const appointmentBody = await appointment.json();
  assert.equal(appointmentBody.doctor_id, doctorId);

  const appointments = await fetch(`${BASE_URL}/api/appointments`, { headers: { Authorization: auth.Authorization } });
  assert.equal(appointments.status, 200);
  assert.equal((await appointments.json()).length, 1);

  const healthRecord = await fetch(`${BASE_URL}/api/health-records`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ phone: PHONE, recordType: 'lab', title: 'CI CBC' })
  });
  assert.equal(healthRecord.status, 201);

  const lab = await fetch(`${BASE_URL}/api/lab-orders`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ phone: PHONE, testName: 'CBC', labName: 'CI Lab' })
  });
  assert.equal(lab.status, 201);
  const labBody = await lab.json();

  const prescription = await fetch(`${BASE_URL}/api/prescriptions`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      phone: PHONE,
      appointmentId: appointmentBody.id,
      diagnosis: 'CI test',
      medicines: [{ medicineName: 'Test Medicine', dosage: '1 tablet', frequency: 'daily', duration: '1 day' }]
    })
  });
  assert.equal(prescription.status, 201);

  const payment = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      phone: PHONE,
      amount: 100,
      appointmentId: appointmentBody.id,
      idempotencyKey: 'ci-e2e-payment-1'
    })
  });
  assert.equal(payment.status, 201);
  const paymentBody = await payment.json();

  const foreignAuth = { Authorization: `Bearer ${session.token}` };
  const foreignLab = await fetch(`${BASE_URL}/api/lab-orders?phone=+919900000002`, { headers: foreignAuth });
  assert.equal(foreignLab.status, 403);

  const hospitalResponse = await fetch(`${BASE_URL}/api/hospitals/nearby?latitude=28.6139&longitude=77.2090&radiusKm=5`);
  assert.equal(hospitalResponse.status, 200);
  const hospitals = await hospitalResponse.json();
  assert.equal(hospitals.hospitals.some(item => item.id === hospitalId), true);

  const adminStatus = await fetch(`${BASE_URL}/api/appointments/${appointmentBody.id}/status`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ci-admin-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(adminStatus.status, 200);

  const payments = await fetch(`${BASE_URL}/api/payments?phone=${encodeURIComponent(PHONE)}`, {
    headers: { Authorization: auth.Authorization }
  });
  assert.equal(payments.status, 200);
  assert.equal((await payments.json()).some(item => item.id === paymentBody.id), true);
  assert.ok(labBody.id);
});
