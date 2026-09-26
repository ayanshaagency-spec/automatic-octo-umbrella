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
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: '',
      JWT_SECRET,
      NODE_ENV: 'development',
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      PAYMENT_STATUS_ADMIN_TOKEN: ADMIN_TOKEN,
      CORS_ALLOWED_ORIGINS: 'http://allowed.example'
    },
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

  const validSignatureButUnavailable = await fetch(`${BASE_URL}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Signature': webhookSignature(JSON.stringify({ paymentId: 1, status: 'paid' }))
    },
    body: JSON.stringify({ paymentId: 1, status: 'paid' })
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

  const whatsappStatus = await fetch(`${BASE_URL}/api/notifications/whatsapp/status`);
  assert.equal(whatsappStatus.status, 200);
  assert.equal((await whatsappStatus.json()).configured, false);
});
