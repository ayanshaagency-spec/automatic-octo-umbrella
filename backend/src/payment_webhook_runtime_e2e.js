'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.PAYMENT_WEBHOOK_E2E_CI !== '1') {
    throw new Error('Payment webhook E2E is restricted to the disposable GitHub Actions database.');
  }
  if (!process.env.DATABASE_URL || !process.env.PAYMENT_WEBHOOK_SECRET || !process.env.PHARMACY_E2E_BASE_URL) {
    throw new Error('DATABASE_URL, PAYMENT_WEBHOOK_SECRET and PHARMACY_E2E_BASE_URL are required.');
  }
  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(databaseUrl.hostname) ||
      databaseUrl.pathname.replace(/^\//, '') !== 'ayansha_healthcare') {
    throw new Error('Refusing to run payment webhook E2E outside the disposable local CI database.');
  }

  const baseUrl = process.env.PHARMACY_E2E_BASE_URL;
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const phone = '+919988770001';
  const orderId = 'order_ci_razorpay_001';
  const providerPaymentId = 'pay_ci_razorpay_001';

  async function request(route, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(new URL(route, baseUrl), {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = { raw }; }
    return { status: response.status, body };
  }

  const otpResponse = await request('/api/auth/request-otp', { method: 'POST', body: { phone } });
  assert.equal(otpResponse.status, 200);
  assert.match(otpResponse.body.devOtp, /^[0-9]{6}$/);
  const login = await request('/api/auth/verify-otp', {
    method: 'POST', body: { phone, otp: otpResponse.body.devOtp, name: 'CI Payment Patient' }
  });
  assert.equal(login.status, 200);
  const auth = { Authorization: `Bearer ${login.body.token}` };

  const labOrder = await request('/api/lab-orders', {
    method: 'POST', headers: auth,
    body: { phone, testName: 'CI Payment Webhook Test', amount: 125.5 }
  });
  assert.equal(labOrder.status, 201);
  const createdPayment = await request('/api/payments', {
    method: 'POST', headers: auth,
    body: {
      phone, labOrderId: labOrder.body.id, amount: 125.5, currency: 'INR',
      idempotencyKey: 'ci-razorpay-webhook-001'
    }
  });
  assert.equal(createdPayment.status, 201);
  const internalPaymentId = createdPayment.body.id;

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const result = await db.query(
      "UPDATE payments SET provider = 'razorpay', provider_order_id = $1, status = 'pending' WHERE id = $2 RETURNING id",
      [orderId, internalPaymentId]
    );
    assert.equal(result.rowCount, 1);
  } finally {
    await db.end();
  }

  const makeEvent = (eventType, status, amount = 12550) => ({
    entity: 'event',
    event: eventType,
    contains: ['payment'],
    payload: { payment: { entity: {
      id: providerPaymentId, entity: 'payment', order_id: orderId, amount,
      currency: 'INR', status, captured: status === 'captured'
    } } }
  });
  async function sendEvent(event, signatureOverride) {
    const rawBody = Buffer.from(JSON.stringify(event), 'utf8');
    const signature = signatureOverride || crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const response = await fetch(new URL('/api/payments/webhook', baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature },
      body: rawBody
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }

  assert.equal((await sendEvent(makeEvent('payment.captured', 'captured'), '0'.repeat(64))).status, 401);
  assert.equal((await sendEvent(makeEvent('payment.captured', 'captured', 9999))).status, 422);
  const captured = await sendEvent(makeEvent('payment.captured', 'captured'));
  assert.equal(captured.status, 200);
  assert.equal(captured.body.payment.status, 'paid');
  assert.equal(captured.body.payment.provider_payment_id, providerPaymentId);

  const duplicate = await sendEvent(makeEvent('payment.captured', 'captured'));
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.duplicate, true);
  const lateFailure = await sendEvent(makeEvent('payment.failed', 'failed'));
  assert.equal(lateFailure.status, 200);
  assert.equal(lateFailure.body.ignored, true);

  const payments = await request(`/api/payments?phone=${encodeURIComponent(phone)}`, { headers: auth });
  assert.equal(payments.status, 200);
  assert.equal(payments.body.find(item => item.id === internalPaymentId).status, 'paid');
  console.log('Razorpay webhook E2E passed: raw-body signature, order/amount/currency match, capture, duplicate and late-failure handling.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
