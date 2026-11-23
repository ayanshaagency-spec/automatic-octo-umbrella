const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

const PORT = 3917;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WEBHOOK_SECRET = 'smoke-webhook-secret';
const ADMIN_TOKEN = 'smoke-admin-token';
const JWT_SECRET = 'smoke-jwt-secret-that-is-long-enough-for-hmac';

function startServer() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL: '',
    JWT_SECRET,
    ADMIN_EMAIL: 'admin@example.test',
    ADMIN_PASSWORD: 'test-only-admin-password',
    NODE_ENV: 'development',
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    PAYMENT_STATUS_ADMIN_TOKEN: ADMIN_TOKEN,
    CORS_ALLOWED_ORIGINS: 'http://allowed.example'
  };
  delete env.WHATSAPP_PROVIDER_URL;
  delete env.WHATSAPP_ACCESS_TOKEN;
  delete env.WHATSAPP_PHONE_NUMBER_ID;
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return child;
}

async function waitForHealth(child) {
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API server exited early: ${output}`);
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not become ready: ${output}`);
}

function webhookSignature(payload) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload, 'utf8').digest('hex');
}

test('Phase 5 API smoke/E2E contract', async t => {
  const server = startServer();
  t.after(() => server.kill());
  await waitForHealth(server);

  const health = await fetch(`${BASE_URL}/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('x-frame-options'), 'DENY');
  assert.equal(health.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await health.json(), { ok: true, service: 'Ayansha Health Care' });

  const home = await fetch(`${BASE_URL}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  const webScript = await fetch(`${BASE_URL}/web/app.js`);
  assert.equal(webScript.status, 200);
  assert.match(webScript.headers.get('content-type'), /javascript/);
  const doctorPage = await fetch(`${BASE_URL}/doctor-panel`);
  assert.equal(doctorPage.status, 200);
  assert.match(doctorPage.headers.get('content-type'), /text\/html/);
  assert.equal(doctorPage.headers.get('cache-control'), 'no-store');
  assert.match(await doctorPage.text(), /Doctor Panel/);
  const doctorScript = await fetch(`${BASE_URL}/doctor-panel/app.js`);
  assert.equal(doctorScript.status, 200);
  assert.match(doctorScript.headers.get('content-type'), /javascript/);
  const webTraversal = await fetch(`${BASE_URL}/web/%2e%2e/backend/package.json`);
  assert.ok([400,404].includes(webTraversal.status));

  const adminPage = await fetch(`${BASE_URL}/admin`);
  assert.equal(adminPage.status, 200);
  assert.match(adminPage.headers.get('content-type'), /text\/html/);
  assert.equal(adminPage.headers.get('cache-control'), 'no-store');
  assert.match(await adminPage.text(), /Ayansha Health Care Admin/);
  const traversal = await fetch(`${BASE_URL}/admin/..%2Fbackend%2Fpackage.json`);
  assert.equal(traversal.status, 404);

  const adminNoEmail = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-only-admin-password' })
  });
  assert.equal(adminNoEmail.status, 401);
  assert.equal((await adminNoEmail.json()).error, 'Invalid admin credentials');
  const adminWrongEmail = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'wrong@example.test', password: 'test-only-admin-password' })
  });
  assert.equal(adminWrongEmail.status, 401);
  const adminWrongPassword = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.test', password: 'wrong' })
  });
  assert.equal(adminWrongPassword.status, 401);
  const adminLogin = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ADMIN@example.test', password: 'test-only-admin-password' })
  });
  assert.equal(adminLogin.status, 200);
  const adminSession = await adminLogin.json();
  assert.equal(adminSession.user.role, 'admin');
  assert.ok(adminSession.token);
  const noAdminAuth = await fetch(`${BASE_URL}/api/admin/appointments`);
  assert.equal(noAdminAuth.status, 401);
  assert.equal((await noAdminAuth.json()).error, 'Admin authentication required');
  const adminAuthButNoDb = await fetch(`${BASE_URL}/api/admin/appointments`, {
    headers: { Authorization: `Bearer ${adminSession.token}` }
  });
  assert.equal(adminAuthButNoDb.status, 503);
  assert.equal((await adminAuthButNoDb.json()).error, 'DATABASE_URL not configured');

  // Sensitive clinical routes must reject unauthenticated and non-doctor writes.
  const healthRecordNoToken = await fetch(`${BASE_URL}/api/health-records`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9000000000', recordType: 'report', title: 'test' }) });
  assert.equal(healthRecordNoToken.status, 403);
  assert.equal((await healthRecordNoToken.json()).error, 'Doctor authorization required');
  const prescriptionNoToken = await fetch(`${BASE_URL}/api/prescriptions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9000000000', appointmentId: 1, diagnosis: 'test', medicines: [{ medicineName: 'M', dosage: '1', frequency: 'daily', duration: '1 day' }] }) });
  assert.equal(prescriptionNoToken.status, 403);
  assert.equal((await prescriptionNoToken.json()).error, 'Doctor authorization required');
  const healthRecordsNoPatientToken = await fetch(`${BASE_URL}/api/health-records?phone=9000000000`);
  assert.equal(healthRecordsNoPatientToken.status, 401);
  const prescriptionsNoPatientToken = await fetch(`${BASE_URL}/api/prescriptions?phone=9000000000`);
  assert.equal(prescriptionsNoPatientToken.status, 401);

  const options = await fetch(`${BASE_URL}/api/payments`, { method: 'OPTIONS' });
  assert.equal(options.status, 204);
  assert.match(options.headers.get('access-control-allow-methods'), /POST/);
  assert.match(options.headers.get('access-control-allow-headers'), /Authorization/);

  const invalidJson = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid-json'
  });
  assert.equal(invalidJson.status, 401);
  assert.equal((await invalidJson.json()).error, 'Authentication required');

  const invalidPayment = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9999999999', amount: 100 })
  });
  assert.equal(invalidPayment.status, 401);
  assert.equal((await invalidPayment.json()).error, 'Authentication required');

  const missingPhone = await fetch(`${BASE_URL}/api/payments`, { method: 'GET' });
  assert.equal(missingPhone.status, 401);
  assert.equal((await missingPhone.json()).error, 'Authentication required');

  const orderMissingPhone = await fetch(`${BASE_URL}/api/payments/1/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(orderMissingPhone.status, 401);
  assert.equal((await orderMissingPhone.json()).error, 'Authentication required');

  const unauthorizedStatus = await fetch(`${BASE_URL}/api/payments/1/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'paid' })
  });
  assert.equal(unauthorizedStatus.status, 403);
  assert.equal((await unauthorizedStatus.json()).error, 'Payment status update is restricted');

  const authorizedButUnavailable = await fetch(`${BASE_URL}/api/payments/1/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_TOKEN}`
    },
    body: JSON.stringify({ status: 'paid' })
  });
  assert.equal(authorizedButUnavailable.status, 503);
  assert.equal((await authorizedButUnavailable.json()).error, 'DATABASE_URL not configured');

  const invalidSignature = await fetch(`${BASE_URL}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Signature': 'invalid-signature'
    },
    body: JSON.stringify({ paymentId: 1, status: 'paid' })
  });
  assert.equal(invalidSignature.status, 401);
  assert.equal((await invalidSignature.json()).error, 'Invalid webhook signature');

  const validWebhookPayload = JSON.stringify({ id: 'evt_smoke_1', event: 'payment.captured', payload: { payment: { entity: { id: 'pay_smoke_1', order_id: 'order_smoke_1', amount: 10000, currency: 'INR' } } } });
  const validSignatureButUnavailable = await fetch(`${BASE_URL}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Signature': webhookSignature(validWebhookPayload)
    },
    body: validWebhookPayload
  });
  assert.equal(validSignatureButUnavailable.status, 503);
  assert.equal((await validSignatureButUnavailable.json()).error, 'DATABASE_URL not configured');

  const notFound = await fetch(`${BASE_URL}/api/definitely-not-a-route`);
  assert.equal(notFound.status, 404);
  assert.equal((await notFound.json()).error, 'Not found');
});

test('authenticated patient access and ownership contract', async t => {
  const server = startServer();
  t.after(() => server.kill());
  await waitForHealth(server);

  const unauthenticated = await fetch(`${BASE_URL}/api/appointments`);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error, 'Authentication required');

  const requestOtp = await fetch(`${BASE_URL}/api/auth/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919999999999' })
  });
  assert.equal(requestOtp.status, 200);
  const otpResult = await requestOtp.json();
  assert.equal(otpResult.delivery, 'development');
  assert.match(otpResult.devOtp, /^\d{6}$/);

  const verifyOtp = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919999999999', otp: otpResult.devOtp })
  });
  assert.equal(verifyOtp.status, 200);
  const session = await verifyOtp.json();
  assert.ok(session.token);

  const authHeaders = { Authorization: `Bearer ${session.token}` };

  const ownAppointments = await fetch(`${BASE_URL}/api/appointments`, { headers: authHeaders });
  assert.equal(ownAppointments.status, 503);
  assert.equal((await ownAppointments.json()).error, 'DATABASE_URL not configured');

  const foreignAppointments = await fetch(`${BASE_URL}/api/appointments?phone=+919888888888`, { headers: authHeaders });
  assert.equal(foreignAppointments.status, 403);
  assert.equal((await foreignAppointments.json()).error, 'Patient access denied');

  const foreignPayment = await fetch(`${BASE_URL}/api/payments?phone=+919888888888`, { headers: authHeaders });
  assert.equal(foreignPayment.status, 403);
  assert.equal((await foreignPayment.json()).error, 'Patient access denied');

  const invalidSession = await fetch(`${BASE_URL}/api/appointments`, {
    headers: { Authorization: 'Bearer invalid.token.value' }
  });
  assert.equal(invalidSession.status, 401);
  assert.equal((await invalidSession.json()).error, 'Authentication required');

  const prescriptionOwnership = await fetch(`${BASE_URL}/api/prescriptions`, {
    method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919999999999', appointmentId: 1, diagnosis: 'test', medicines: [{ medicineName: 'Test', dosage: '1', frequency: 'daily', duration: '1 day' }] })
  });
  assert.equal(prescriptionOwnership.status, 403);
  assert.equal((await prescriptionOwnership.json()).error, 'Doctor authorization required');

  const healthRecord = await fetch(`${BASE_URL}/api/health-records`, {
    method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919999999999', recordType: 'lab', title: 'Test' })
  });
  assert.equal(healthRecord.status, 403);
  assert.equal((await healthRecord.json()).error, 'Doctor authorization required');

  const labOrder = await fetch(`${BASE_URL}/api/lab-orders`, {
    method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919999999999', testName: 'CBC' })
  });
  assert.equal(labOrder.status, 503);
  assert.equal((await labOrder.json()).error, 'DATABASE_URL not configured');

  const payment = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919999999999', amount: 100, appointmentId: 1 })
  });
  assert.equal(payment.status, 503);
  assert.equal((await payment.json()).error, 'DATABASE_URL not configured');

  const paymentOrderUnavailable = await fetch(`${BASE_URL}/api/payments/1/order`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919999999999' })
  });
  assert.equal(paymentOrderUnavailable.status, 503);
  assert.equal((await paymentOrderUnavailable.json()).error, 'DATABASE_URL not configured');

  const whatsappStatus = await fetch(`${BASE_URL}/api/notifications/whatsapp/status`);
  assert.equal(whatsappStatus.status, 200);
  assert.equal((await whatsappStatus.json()).configured, false);

  const aiStatus = await fetch(`${BASE_URL}/api/ai/status`);
  assert.equal(aiStatus.status, 200);
  assert.equal((await aiStatus.json()).configured, false);

  const emergency = await fetch(`${BASE_URL}/api/emergency`);
  assert.equal(emergency.status, 200);
  assert.equal((await emergency.json()).emergency, true);

  const invalidHospitalCoordinates = await fetch(`${BASE_URL}/api/hospitals/nearby?latitude=999&longitude=0`);
  assert.equal(invalidHospitalCoordinates.status, 422);
});


test('API per-IP rate limits reject excess patient/doctor OTP and admin attempts', async t => {
  const server = startServer();
  t.after(() => server.kill());
  await waitForHealth(server);

  const postJson = (route, body) => fetch(`${BASE_URL}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  // Patient OTP request limit: use distinct phones so the per-phone cooldown is not hit.
  for (let i = 1; i <= 5; i++) {
    const response = await postJson('/api/auth/request-otp', { phone: `+91910000000${i}` });
    assert.equal(response.status, 200);
  }
  assert.equal((await postJson('/api/auth/request-otp', { phone: '+919100000006' })).status, 429);

  // Doctor OTP request rate limit is reached before the missing CI database is checked.
  for (let i = 0; i < 5; i++) {
    assert.equal((await postJson('/api/doctor/auth/request-otp', { phone: '+919200000001' })).status, 503);
  }
  assert.equal((await postJson('/api/doctor/auth/request-otp', { phone: '+919200000001' })).status, 429);

  // Verification endpoints reject the eleventh attempt from the same client IP.
  for (let i = 0; i < 10; i++) {
    assert.equal((await postJson('/api/auth/verify-otp', { phone: '+919300000001', otp: '000000' })).status, 401);
  }
  assert.equal((await postJson('/api/auth/verify-otp', { phone: '+919300000001', otp: '000000' })).status, 429);

  for (let i = 0; i < 10; i++) {
    assert.equal((await postJson('/api/doctor/auth/verify-otp', { phone: '+919400000001', otp: '000000' })).status, 401);
  }
  assert.equal((await postJson('/api/doctor/auth/verify-otp', { phone: '+919400000001', otp: '000000' })).status, 429);

  // Admin login rate limit: five failures, then a blocked sixth request.
  for (let i = 0; i < 5; i++) {
    assert.equal((await postJson('/api/admin/login', { email: 'admin@example.test', password: 'wrong-password' })).status, 401);
  }
  assert.equal((await postJson('/api/admin/login', { email: 'admin@example.test', password: 'wrong-password' })).status, 429);
});

test('OTP verification trims phone consistently in the returned session', async t => {
  const server = startServer();
  t.after(() => server.kill());
  await waitForHealth(server);

  const phone = '+919999999991';
  const requested = await fetch(`${BASE_URL}/api/auth/request-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone })
  });
  assert.equal(requested.status, 200);
  const otp = (await requested.json()).devOtp;

  const verified = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: `  ${phone}  `, otp })
  });
  assert.equal(verified.status, 200);
  const session = await verified.json();
  assert.equal(session.user.phone, phone);
  assert.ok(session.token);
});

test('doctor role token is required for doctor appointment and prescription routes', async t => {
  const server = startServer();
  t.after(() => server.kill());
  await waitForHealth(server);

  const signRoleToken = role => {
    const b64 = value => Buffer.from(value).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const input = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' +
      b64(JSON.stringify({ sub: '+919555555555', role, iat: now, exp: now + 3600 }));
    return input + '.' + crypto.createHmac('sha256', JWT_SECRET).update(input).digest('base64url');
  };
  const patientHeaders = { Authorization: 'Bearer ' + signRoleToken('patient') };
  const doctorHeaders = { Authorization: 'Bearer ' + signRoleToken('doctor') };

  const patientOnDoctorList = await fetch(BASE_URL + '/api/doctor/appointments', { headers: patientHeaders });
  assert.equal(patientOnDoctorList.status, 401);
  assert.equal((await patientOnDoctorList.json()).error, 'Doctor authentication required');

  const patientOnDoctorStatus = await fetch(BASE_URL + '/api/doctor/appointments/1/status', {
    method: 'PATCH', headers: { ...patientHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(patientOnDoctorStatus.status, 401);
  assert.equal((await patientOnDoctorStatus.json()).error, 'Doctor authentication required');

  const patientOnPrescription = await fetch(BASE_URL + '/api/prescriptions', {
    method: 'POST', headers: { ...patientHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919555555555', appointmentId: 1, diagnosis: 'test', medicines: [{ medicineName: 'Test', dosage: '1', frequency: 'daily', duration: '1 day' }] })
  });
  assert.equal(patientOnPrescription.status, 403);
  assert.equal((await patientOnPrescription.json()).error, 'Doctor authorization required');

  // Valid doctor role passes route guards; DB-dependent actions safely fail in this DB-less smoke environment.
  const doctorListUnavailable = await fetch(BASE_URL + '/api/doctor/appointments', { headers: doctorHeaders });
  assert.equal(doctorListUnavailable.status, 503);
  assert.equal((await doctorListUnavailable.json()).error, 'DATABASE_URL not configured');

  const doctorStatusUnavailable = await fetch(BASE_URL + '/api/doctor/appointments/1/status', {
    method: 'PATCH', headers: { ...doctorHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' })
  });
  assert.equal(doctorStatusUnavailable.status, 200);

  const doctorPrescriptionUnavailable = await fetch(BASE_URL + '/api/prescriptions', {
    method: 'POST', headers: { ...doctorHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919555555555', appointmentId: 1, diagnosis: 'test', medicines: [{ medicineName: 'Test', dosage: '1', frequency: 'daily', duration: '1 day' }] })
  });
  assert.equal(doctorPrescriptionUnavailable.status, 503);
  assert.equal((await doctorPrescriptionUnavailable.json()).error, 'DATABASE_URL not configured');
});
