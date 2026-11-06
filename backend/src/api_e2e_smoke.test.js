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
  assert.deepEqual(await health.json(), { ok: true, service: 'Ayansha Health Care' });
  const doctorsUnavailable = await fetch(`${BASE_URL}/api/doctors`);
  assert.equal(doctorsUnavailable.status, 503);
  assert.equal((await doctorsUnavailable.json()).error, 'DATABASE_URL not configured');

  const home = await fetch(`${BASE_URL}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  const portalPage = await fetch(`${BASE_URL}/portal`);
  assert.equal(portalPage.status, 200);
  assert.match(portalPage.headers.get('content-type'), /(?:text\/html)/);
  assert.equal(portalPage.headers.get('cache-control'), 'no-store');
  const portalHtml = await portalPage.text();
  assert.match(portalHtml, /Patient Workspace/);
  assert.match(portalHtml, /Doctor Workspace/);
  assert.match(portalHtml, /Admin Workspace/);
  assert.ok(portalHtml.includes('href="/doctor"'));
  assert.ok(portalHtml.includes('href="/admin"'));
  const portalStyles = await fetch(`${BASE_URL}/web/portal.css`);
  assert.equal(portalStyles.status, 200);
  assert.ok((portalStyles.headers.get('content-type') || '').includes('text/css'));
  const webScript = await fetch(`${BASE_URL}/web/app.js`);
  assert.equal(webScript.status, 200);
  assert.match(webScript.headers.get('content-type'), /javascript/);
  const adminPage = await fetch(`${BASE_URL}/admin`);
  assert.equal(adminPage.status, 200);
  assert.match(adminPage.headers.get('content-type'), /text\/html/);
  assert.equal(adminPage.headers.get('cache-control'), 'no-store');
  assert.match(await adminPage.text(), /Ayansha Health Care Admin/);
  const doctorPage = await fetch(`${BASE_URL}/doctor`);
  assert.equal(doctorPage.status, 200);
  assert.match(doctorPage.headers.get('content-type'), /text\/html/);
  assert.match(await doctorPage.text(), /Doctor Sign In/);
  const doctorScript = await fetch(`${BASE_URL}/doctor/app.js`);
  assert.equal(doctorScript.status, 200);
  assert.match(await doctorScript.text(), /api\/doctor\/appointments/);
  const doctorStyles = await fetch(`${BASE_URL}/doctor/styles.css`);
  assert.equal(doctorStyles.status, 200);
  const anonymousDoctorQueue = await fetch(`${BASE_URL}/api/doctor/appointments`);
  assert.equal(anonymousDoctorQueue.status, 401);
  const unknownDoctorAsset = await fetch(`${BASE_URL}/doctor/server.js`);
  assert.equal(unknownDoctorAsset.status, 404);
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
  const anonymousDoctorDirectory = await fetch(`${BASE_URL}/api/admin/doctors`);
  assert.equal(anonymousDoctorDirectory.status, 401);
  const adminDoctorDirectory = await fetch(`${BASE_URL}/api/admin/doctors`, {
    headers: { Authorization: `Bearer ${adminSession.token}` }
  });
  assert.equal(adminDoctorDirectory.status, 503);
  assert.equal((await adminDoctorDirectory.json()).error, 'DATABASE_URL not configured');
  const invalidDoctor = await fetch(`${BASE_URL}/api/admin/doctors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSession.token}` },
    body: JSON.stringify({ name: 'A', specialty: '', phone: '123' })
  });
  assert.equal(invalidDoctor.status, 422);
  const validDoctorWithoutDatabase = await fetch(`${BASE_URL}/api/admin/doctors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSession.token}` },
    body: JSON.stringify({ name: 'Dr Test', specialty: 'General Medicine', phone: '+919876543210' })
  });
  assert.equal(validDoctorWithoutDatabase.status, 503);
  assert.equal((await validDoctorWithoutDatabase.json()).error, 'DATABASE_URL not configured');
  const noAdminAuth = await fetch(`${BASE_URL}/api/admin/appointments`);
  assert.equal(noAdminAuth.status, 401);
  assert.equal((await noAdminAuth.json()).error, 'Admin authentication required');
  const adminAuthButNoDb = await fetch(`${BASE_URL}/api/admin/appointments`, {
    headers: { Authorization: `Bearer ${adminSession.token}` }
  });
  assert.equal(adminAuthButNoDb.status, 503);
  assert.equal((await adminAuthButNoDb.json()).error, 'DATABASE_URL not configured');

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
      'X-Razorpay-Signature': 'invalid-signature'
    },
    body: JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: {
        id: 'pay_invalid', order_id: 'order_invalid', amount: 10000, currency: 'INR', status: 'captured'
      } } }
    })
  });
  assert.equal(invalidSignature.status, 401);
  assert.equal((await invalidSignature.json()).error, 'Invalid webhook signature');

  const unavailableEvent = JSON.stringify({
    entity: 'event',
    event: 'payment.captured',
    payload: { payment: { entity: {
      id: 'pay_unavailable', order_id: 'order_unavailable',
      amount: 10000, currency: 'INR', status: 'captured'
    } } }
  });
  const validSignatureButUnavailable = await fetch(`${BASE_URL}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': webhookSignature(unavailableEvent)
    },
    body: unavailableEvent
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
  assert.equal(prescriptionOwnership.status, 503);
  assert.equal((await prescriptionOwnership.json()).error, 'DATABASE_URL not configured');

  const healthRecord = await fetch(`${BASE_URL}/api/health-records`, {
    method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919999999999', recordType: 'lab', title: 'Test' })
  });
  assert.equal(healthRecord.status, 503);
  assert.equal((await healthRecord.json()).error, 'DATABASE_URL not configured');

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

test('production CORS ignores wildcard origins and allows exact configured origins only', async t => {
  const port = 3921;
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      DATABASE_URL: '',
      JWT_SECRET: 'production-cors-test-secret-long-enough-for-hs256',
      CORS_ALLOWED_ORIGINS: 'https://safe.example,*'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Production CORS API exited early: ${output}`);
    try { const response = await fetch(`${base}/health`); if (response.ok) { ready = true; break; } } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'Production-mode API should start');

  const safe = await fetch(`${base}/health`, { headers: { Origin: 'https://safe.example' } });
  assert.equal(safe.status, 200);
  assert.equal(safe.headers.get('access-control-allow-origin'), 'https://safe.example');

  const evil = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.status, 200);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);

  const productionAdminLoginWithoutLimiterDatabase = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Real-IP': '203.0.113.240' },
    body: JSON.stringify({ email: 'admin@example.test', password: 'not-used-without-limiter-db' })
  });
  assert.equal(productionAdminLoginWithoutLimiterDatabase.status, 503,
    'Production Admin login must fail closed when the shared rate-limit database is unavailable');
  assert.equal((await productionAdminLoginWithoutLimiterDatabase.json()).error,
    'Authentication protection is temporarily unavailable');
});


test('OTP and Admin authentication endpoints enforce shared rate limits', async t => {
  const server = startServer();
  t.after(() => server.kill());
  await waitForHealth(server);

  const clientIp = '203.0.113.121';
  for (let index = 0; index < 9; index += 1) {
    const response = await fetch(`${BASE_URL}/api/auth/request-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Real-IP': clientIp,
        // Changing X-Forwarded-For must not evade the trusted client-IP bucket.
        'X-Forwarded-For': `198.51.100.${index + 1}`
      },
      body: JSON.stringify({ phone: `+9191000010${String(index).padStart(2, '0')}` })
    });
    assert.equal(response.status, 200);
  }

  // Patient and Doctor OTP entry points share one source-IP bucket.
  const doctorAttempt = await fetch(`${BASE_URL}/api/doctor/auth/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Real-IP': clientIp },
    body: JSON.stringify({ phone: '+919100001099' })
  });
  assert.equal(doctorAttempt.status, 503, 'the local smoke environment has no database-backed doctor directory');
  const otpBlocked = await fetch(`${BASE_URL}/api/auth/request-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Real-IP': clientIp,
      'X-Forwarded-For': '192.0.2.250'
    },
    body: JSON.stringify({ phone: '+919100001100' })
  });
  assert.equal(otpBlocked.status, 429);
  assert.ok((await otpBlocked.json()).retryAfterSeconds >= 1);

  const verifyIp = '203.0.113.123';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Real-IP': verifyIp },
      body: JSON.stringify({ phone: `+9191000020${String(attempt).padStart(2, '0')}`, otp: '000000' })
    });
    assert.equal(response.status, 401);
  }
  const doctorVerifyBlocked = await fetch(`${BASE_URL}/api/doctor/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Real-IP': verifyIp },
    body: JSON.stringify({ phone: '+919100002099', otp: '000000' })
  });
  assert.equal(doctorVerifyBlocked.status, 429, 'Patient and Doctor OTP verification share the source-IP throttle');

  const adminIp = '203.0.113.122';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Real-IP': adminIp },
      body: JSON.stringify({
        email: attempt % 2 ? 'ADMIN@example.test' : 'admin@example.test',
        password: 'incorrect-password'
      })
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'Invalid admin credentials');
  }
  const adminBlocked = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Real-IP': adminIp },
    body: JSON.stringify({ email: 'Admin@Example.Test', password: 'incorrect-password' })
  });
  assert.equal(adminBlocked.status, 429, 'email matching is case-insensitive for the shared bucket');
});
