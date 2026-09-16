const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

const PORT = 3917;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WEBHOOK_SECRET = 'smoke-webhook-secret';
const ADMIN_TOKEN = 'smoke-admin-token';

function startServer() {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: '',
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      PAYMENT_STATUS_ADMIN_TOKEN: ADMIN_TOKEN
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
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error, 'Invalid JSON');

  const invalidPayment = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9999999999', amount: 100 })
  });
  assert.equal(invalidPayment.status, 422);
  assert.equal((await invalidPayment.json()).error, 'appointmentId or labOrderId is required');

  const missingPhone = await fetch(`${BASE_URL}/api/payments`, { method: 'GET' });
  assert.equal(missingPhone.status, 422);
  assert.equal((await missingPhone.json()).error, 'phone is required');

  const orderMissingPhone = await fetch(`${BASE_URL}/api/payments/1/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(orderMissingPhone.status, 422);
  assert.equal((await orderMissingPhone.json()).error, 'phone is required');

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
