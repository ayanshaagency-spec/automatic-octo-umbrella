const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { spawn } = require('node:child_process');
const { Client } = require('pg');

const PORT = 3920;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PHONE = '+919900000001';
const DOCTOR_PHONE = '+919900000099';
const JWT_SECRET = 'ci-real-e2e-jwt-secret-long-enough-for-hmac';
const PAYMENT_WEBHOOK_SECRET = 'ci-e2e-webhook-secret';

const SAFE_TEST_DATABASES = new Set(['healthcare_ci', 'ayansha_healthcare']);

function isSafeE2eDatabaseUrl(value) {
  if (process.env.NODE_ENV === 'production' || !value) return false;
  try {
    const parsed = new URL(value);
    const databaseName = decodeURIComponent(parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) && SAFE_TEST_DATABASES.has(databaseName);
  } catch {
    return false;
  }
}


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
      PAYMENT_WEBHOOK_SECRET,
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
  if (!isSafeE2eDatabaseUrl(process.env.DATABASE_URL)) {
    t.skip('Destructive E2E cleanup is limited to known local CI databases; refusing remote or production targets');
    return;
  }

  const db = await dbClient();
  const doctor = await db.query(
    `INSERT INTO doctors (name, specialty, phone) VALUES ('CI E2E Doctor', 'General Medicine', $1)
     RETURNING id`, [DOCTOR_PHONE]
  );
  const doctorId = doctor.rows[0].id;
  const secondDoctor = await db.query(`INSERT INTO doctors (name, specialty, phone) VALUES ('CI E2E Other Doctor', 'Dermatology', $1) RETURNING id`, ['+919900000098']);
  const secondDoctorId = secondDoctor.rows[0].id;
  const hospital = await db.query(
    `INSERT INTO hospitals (name, address, city, state, latitude, longitude, phone, emergency_available, active)
     VALUES ('CI E2E Hospital', 'Test Address', 'Delhi', 'Delhi', 28.6139, 77.2090, '01100000000', TRUE, TRUE)
     RETURNING id`
  );
  const hospitalId = hospital.rows[0].id;

  const server = startServer();
  t.after(async () => {
    server.kill();
    await db.query('DELETE FROM payment_webhook_events WHERE payment_id IN (SELECT id FROM payments WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1))', [PHONE]);
    await db.query('DELETE FROM payments WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1)', [PHONE]);
    await db.query('DELETE FROM health_records WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1)', [PHONE]);
    await db.query('DELETE FROM lab_orders WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1)', [PHONE]);
    await db.query('DELETE FROM prescription_items WHERE prescription_id IN (SELECT id FROM prescriptions WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1))', [PHONE]);
    await db.query('DELETE FROM prescriptions WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1)', [PHONE]);
    await db.query('DELETE FROM appointments WHERE patient_id IN (SELECT id FROM patients WHERE phone = $1)', [PHONE]);
    await db.query('DELETE FROM patients WHERE phone = $1', [PHONE]);
    await db.query('DELETE FROM hospitals WHERE id = $1', [hospitalId]);
    await db.query('DELETE FROM doctors WHERE id = $1', [secondDoctorId]);
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
  const patientAfterLogin = await db.query('SELECT name FROM patients WHERE phone = $1', [PHONE]);
  assert.equal(patientAfterLogin.rowCount, 1, 'verified OTP should provision a patient profile');
  assert.equal(patientAfterLogin.rows[0].name, 'Patient');
  const auth = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };

  const appointment = await fetch(`${BASE_URL}/api/appointments`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      patientName: 'CI E2E Patient',
      phone: PHONE,
      doctorId,
      appointmentAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      mode: 'Video'
    })
  });
  assert.equal(appointment.status, 201);
  const appointmentBody = await appointment.json();
  assert.equal(appointmentBody.doctor_id, doctorId);

  const mismatchedPatientAppointments = await fetch(BASE_URL + '/api/appointments?phone=+919900000002', { headers: auth });
  assert.equal(mismatchedPatientAppointments.status, 403);
  const mismatchedPatientBooking = await fetch(BASE_URL + '/api/appointments', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ patientName: 'Other Patient', phone: '+919900000002', doctorId, appointmentAt: new Date(Date.now() + 5 * 86400000).toISOString(), mode: 'Video' })
  });
  assert.equal(mismatchedPatientBooking.status, 403);
  const patientStatusAttempt = await fetch(BASE_URL + '/api/appointments/' + appointmentBody.id + '/status', {
    method: 'PATCH', headers: auth, body: JSON.stringify({ status: 'cancelled' })
  });
  assert.equal(patientStatusAttempt.status, 403);

  // CI-only fixture: a second doctor appointment checks doctor scoping.
  const otherAppointment = await db.query(
    `INSERT INTO appointments (patient_id, doctor_id, appointment_at, mode, status)
     SELECT p.id, $2, $3, 'Video', 'confirmed' FROM patients p WHERE p.phone = $1 RETURNING id`,
    [PHONE, secondDoctorId, new Date(Date.now() + 4 * 86400000).toISOString()]
  );
  const secondDoctorOtpReq = await fetch(BASE_URL + '/api/doctor/auth/request-otp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+919900000098' })
  });
  assert.equal(secondDoctorOtpReq.status, 200);
  const secondOtp = await secondDoctorOtpReq.json();
  const secondDoctorLogin = await fetch(BASE_URL + '/api/doctor/auth/verify-otp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+919900000098', otp: secondOtp.devOtp })
  });
  assert.equal(secondDoctorLogin.status, 200);
  const secondDoctorSession = await secondDoctorLogin.json();
  const secondDoctorAuth = { Authorization: 'Bearer ' + secondDoctorSession.token, 'Content-Type': 'application/json' };

  const doctorOtpRequest = await fetch(`${BASE_URL}/api/doctor/auth/request-otp`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({phone: DOCTOR_PHONE})
  });
  assert.equal(doctorOtpRequest.status, 200);
  const doctorOtpBody = await doctorOtpRequest.json();
  assert.ok(doctorOtpBody.devOtp);
  const doctorOtpVerify = await fetch(`${BASE_URL}/api/doctor/auth/verify-otp`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({phone: DOCTOR_PHONE, otp: doctorOtpBody.devOtp})
  });
  assert.equal(doctorOtpVerify.status, 200);
  const doctorAuthBody = await doctorOtpVerify.json();
  const doctorAuth = {Authorization: `Bearer ${doctorAuthBody.token}`, 'Content-Type':'application/json'};


  const scopedAppointments = await fetch(BASE_URL + '/api/doctor/appointments', { headers: doctorAuth });
  assert.equal(scopedAppointments.status, 200);
  assert.equal((await scopedAppointments.json()).some(a => a.id === otherAppointment.rows[0].id), false);
  const crossDoctorStatus = await fetch(BASE_URL + '/api/doctor/appointments/' + otherAppointment.rows[0].id + '/status', {
    method: 'PATCH', headers: doctorAuth, body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(crossDoctorStatus.status, 404);
  const crossDoctorPrescription = await fetch(BASE_URL + '/api/prescriptions', {
    method: 'POST', headers: secondDoctorAuth,
    body: JSON.stringify({ phone: PHONE, appointmentId: appointmentBody.id, diagnosis: 'scope test', medicines: [{ medicineName: 'Test', dosage: '1', frequency: 'daily', duration: '1 day' }] })
  });
  assert.equal(crossDoctorPrescription.status, 404);
  const patientAfterBooking = await db.query('SELECT name FROM patients WHERE phone = $1', [PHONE]);
  assert.equal(patientAfterBooking.rows[0].name, 'CI E2E Patient');


  const appointments = await fetch(`${BASE_URL}/api/appointments`, { headers: { Authorization: auth.Authorization } });
  assert.equal(appointments.status, 200);
  assert.equal((await appointments.json()).length, 1);

  const healthRecord = await fetch(`${BASE_URL}/api/health-records`, {
    method: 'POST', headers: doctorAuth,
    body: JSON.stringify({ phone: PHONE, doctorPhone: DOCTOR_PHONE, recordType: 'lab', title: 'CI CBC' })
  });
  assert.equal(healthRecord.status, 201);

  const lab = await fetch(`${BASE_URL}/api/lab-orders`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ phone: PHONE, testName: 'CBC', labName: 'CI Lab' })
  });
  assert.equal(lab.status, 201);
  const labBody = await lab.json();

  const prescription = await fetch(`${BASE_URL}/api/prescriptions`, {
    method: 'POST', headers: doctorAuth,
    body: JSON.stringify({
      phone: PHONE, doctorPhone: DOCTOR_PHONE,
      appointmentId: appointmentBody.id,
      diagnosis: 'CI test',
      medicines: [{ medicineName: 'Test Medicine', dosage: '1 tablet', frequency: 'daily', duration: '1 day' }]
    })
  });
  assert.equal(prescription.status, 201);

  const prescriptions = await fetch(`${BASE_URL}/api/prescriptions?phone=${encodeURIComponent(PHONE)}`, {
    headers: { Authorization: auth.Authorization }
  });
  assert.equal(prescriptions.status, 200);
  assert.equal((await prescriptions.json()).length, 1);

  const healthRecords = await fetch(`${BASE_URL}/api/health-records?phone=${encodeURIComponent(PHONE)}`, {
    headers: { Authorization: auth.Authorization }
  });
  assert.equal(healthRecords.status, 200);
  assert.equal((await healthRecords.json()).length, 1);

  const labOrders = await fetch(`${BASE_URL}/api/lab-orders?phone=${encodeURIComponent(PHONE)}`, {
    headers: { Authorization: auth.Authorization }
  });
  assert.equal(labOrders.status, 200);
  assert.equal((await labOrders.json()).length, 1);

  const aiStatus = await fetch(`${BASE_URL}/api/ai/status`);
  assert.equal(aiStatus.status, 200);
  assert.equal((await aiStatus.json()).configured, false);

  const whatsappStatus = await fetch(`${BASE_URL}/api/notifications/whatsapp/status`);
  assert.equal(whatsappStatus.status, 200);
  assert.equal((await whatsappStatus.json()).configured, false);

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

  // Exercise the signed webhook route and durable replay ledger against real PostgreSQL.
  await db.query("UPDATE payments SET provider = 'razorpay', provider_order_id = $1, status = 'pending' WHERE id = $2", ['order_ci_e2e_1', paymentBody.id]);
  const webhookPayload = JSON.stringify({ id: 'evt_ci_e2e_1', event: 'payment.captured', payload: { payment: { entity: { id: 'pay_ci_e2e_1', order_id: 'order_ci_e2e_1', amount: 10000, currency: 'INR' } } } });
  const webhookSignature = crypto.createHmac('sha256', PAYMENT_WEBHOOK_SECRET).update(webhookPayload, 'utf8').digest('hex');
  const webhookHeaders = { 'Content-Type': 'application/json', 'X-Payment-Signature': webhookSignature };
  const firstWebhook = await fetch(BASE_URL + '/api/payments/webhook', { method: 'POST', headers: webhookHeaders, body: webhookPayload });
  assert.equal(firstWebhook.status, 200);
  const firstWebhookBody = await firstWebhook.json();
  assert.equal(firstWebhookBody.payment.status, 'paid');
  const persistedPayment = await db.query('SELECT status, provider_payment_id FROM payments WHERE id = $1', [paymentBody.id]);
  assert.equal(persistedPayment.rows[0].status, 'paid');
  assert.equal(persistedPayment.rows[0].provider_payment_id, 'pay_ci_e2e_1');
  const replayWebhook = await fetch(BASE_URL + '/api/payments/webhook', { method: 'POST', headers: webhookHeaders, body: webhookPayload });
  assert.equal(replayWebhook.status, 200);
  assert.equal((await replayWebhook.json()).duplicate, true);
  const ledgerCount = await db.query('SELECT COUNT(*)::int AS count FROM payment_webhook_events WHERE event_id = $1', ['evt_ci_e2e_1']);
  assert.equal(ledgerCount.rows[0].count, 1);

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

  // Lifecycle checks: cancelled appointments are terminal and cannot be reopened.
  const cancelOther = await fetch(BASE_URL + '/api/appointments/' + otherAppointment.rows[0].id + '/status', {
    method: 'PATCH', headers: { Authorization: 'Bearer ci-admin-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' })
  });
  assert.equal(cancelOther.status, 200);
  assert.equal((await cancelOther.json()).status, 'cancelled');
  const reopenCancelled = await fetch(BASE_URL + '/api/appointments/' + otherAppointment.rows[0].id + '/status', {
    method: 'PATCH', headers: { Authorization: 'Bearer ci-admin-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' })
  });
  assert.equal(reopenCancelled.status, 409);
  const repeatCancel = await fetch(BASE_URL + '/api/appointments/' + otherAppointment.rows[0].id + '/status', {
    method: 'PATCH', headers: { Authorization: 'Bearer ci-admin-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' })
  });
  assert.equal(repeatCancel.status, 200);

  const payments = await fetch(`${BASE_URL}/api/payments?phone=${encodeURIComponent(PHONE)}`, {
    headers: { Authorization: auth.Authorization }
  });
  assert.equal(payments.status, 200);
  assert.equal((await payments.json()).some(item => item.id === paymentBody.id), true);
  assert.ok(labBody.id);

  // Race two authenticated bookings for the same doctor and exact slot.
  const raceSlot = new Date(Date.now() + 6 * 86400000).toISOString();
  const racePayload = { patientName: 'CI E2E Patient', phone: PHONE, doctorId, appointmentAt: raceSlot, mode: 'Video' };
  const raceResponses = await Promise.all([1, 2].map(() => fetch(BASE_URL + '/api/appointments', {
    method: 'POST', headers: auth, body: JSON.stringify(racePayload)
  })));
  const raceStatuses = raceResponses.map(response => response.status).sort((a, b) => a - b);
  assert.deepEqual(raceStatuses, [201, 409], 'exactly one concurrent booking should succeed and the other conflict');
});
