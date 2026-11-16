const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PaymentGatewayError,
  getConfiguredProvider,
  getPaymentProviderStatus,
  createPaymentGatewayOrder,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayCheckout
} = require('./payment_gateway');

const originalEnv = {
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET
};
const originalFetch = global.fetch;

function restoreEnv() {
  for (const key of Object.keys(originalEnv)) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  global.fetch = originalFetch;
}

test.afterEach(restoreEnv);

test('requires a configured payment provider', async () => {
  delete process.env.PAYMENT_PROVIDER;
  await assert.rejects(
    () => createPaymentGatewayOrder({ amount: 100, currency: 'INR', receipt: 'PAY-1' }),
    (error) => error instanceof PaymentGatewayError && error.statusCode === 503
  );
});

test('rejects unsupported payment providers', async () => {
  process.env.PAYMENT_PROVIDER = 'stripe';
  await assert.rejects(
    () => createPaymentGatewayOrder({ amount: 100, currency: 'INR', receipt: 'PAY-1' }),
    (error) => error instanceof PaymentGatewayError && error.statusCode === 503
  );
});

test('requires Razorpay credentials without making a network request', async () => {
  process.env.PAYMENT_PROVIDER = 'razorpay';
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  global.fetch = () => { throw new Error('network should not be called'); };
  await assert.rejects(
    () => createPaymentGatewayOrder({ amount: 100, currency: 'INR', receipt: 'PAY-1' }),
    (error) => error instanceof PaymentGatewayError && error.statusCode === 503
  );
});

test('creates a Razorpay order with rupee-to-paise conversion', async () => {
  process.env.PAYMENT_PROVIDER = 'razorpay';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';

  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({ id: 'order_test123', amount: 12550, currency: 'INR' })
    };
  };

  const result = await createPaymentGatewayOrder({
    amount: 125.5,
    currency: 'INR',
    receipt: 'PAYMENT-123'
  });

  assert.deepEqual(result, {
    provider: 'razorpay',
    keyId: 'rzp_test_key',
    orderId: 'order_test123',
    amount: 12550,
    currency: 'INR'
  });
  assert.equal(request.url, 'https://api.razorpay.com/v1/orders');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.match(request.options.headers.Authorization, /^Basic /);
  assert.deepEqual(JSON.parse(request.options.body), {
    amount: 12550,
    currency: 'INR',
    receipt: 'PAYMENT-123',
    payment_capture: 1
  });
});

test('maps gateway API failures to a safe 502 error', async () => {
  process.env.PAYMENT_PROVIDER = 'razorpay';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';
  global.fetch = async () => ({
    ok: false,
    json: async () => ({ error: { description: 'Invalid request' } })
  });

  await assert.rejects(
    () => createPaymentGatewayOrder({ amount: 100, currency: 'INR', receipt: 'PAY-2' }),
    (error) => error instanceof PaymentGatewayError && error.statusCode === 502 && error.message === 'Invalid request'
  );
});

test('reports the configured provider without exposing credentials', () => {
  process.env.PAYMENT_PROVIDER = 'razorpay';
  process.env.RAZORPAY_KEY_ID = 'secret-id';
  process.env.RAZORPAY_KEY_SECRET = 'secret-key';
  assert.equal(getConfiguredProvider(), 'razorpay');
});

console.log('Phase 5 payment gateway tests loaded');


test('payment readiness reports provider, credentials and webhook without exposing secrets', () => {
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  assert.deepEqual(getPaymentProviderStatus(), {
    provider: null,
    providerSupported: false,
    credentialsConfigured: false,
    webhookConfigured: false,
    configured: false
  });

  process.env.PAYMENT_PROVIDER = 'razorpay';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key_id';
  process.env.RAZORPAY_KEY_SECRET = 'test-only-razorpay-secret';
  process.env.PAYMENT_WEBHOOK_SECRET = 'test-only-webhook-secret';
  const ready = getPaymentProviderStatus();
  assert.deepEqual(ready, {
    provider: 'razorpay',
    providerSupported: true,
    credentialsConfigured: true,
    webhookConfigured: true,
    configured: true
  });
  const serialized = JSON.stringify(ready);
  assert.equal(serialized.includes('test-only-razorpay-secret'), false);
  assert.equal(serialized.includes('test-only-webhook-secret'), false);
});


test('verifies Razorpay Checkout signature and confirms captured status with the API', async () => {
  const crypto = require('crypto');
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'checkout_test_secret';
  const orderId = 'order_test123', paymentId = 'pay_test123';
  const signature = crypto.createHmac('sha256', 'checkout_test_secret').update(orderId + '|' + paymentId).digest('hex');
  let request;
  const verified = await verifyRazorpayCheckout({
    orderId, paymentId, signature, expectedAmount: 125.5, expectedCurrency: 'INR',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({
        id: paymentId, order_id: orderId, amount: 12550, currency: 'INR', status: 'captured', captured: true
      }) };
    }
  });
  assert.deepEqual(verified, { status: 'paid', providerPaymentId: paymentId });
  assert.equal(request.url, 'https://api.razorpay.com/v1/payments/' + paymentId);
  assert.equal(request.options.method, 'GET');
  assert.match(request.options.headers.Authorization, /^Basic /);
});

test('rejects invalid Checkout signature before contacting Razorpay', async () => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'checkout_test_secret';
  let called = false;
  await assert.rejects(
    () => verifyRazorpayCheckout({
      orderId: 'order_test123', paymentId: 'pay_test123', signature: '0'.repeat(64),
      expectedAmount: 125.5, fetchImpl: async () => { called = true; }
    }),
    error => error.statusCode === 401
  );
  assert.equal(called, false);
});

test('rejects amount, order and currency mismatches in the payment lookup', async () => {
  const crypto = require('crypto');
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'checkout_test_secret';
  const orderId = 'order_test123', paymentId = 'pay_test123';
  const signature = crypto.createHmac('sha256', 'checkout_test_secret').update(orderId + '|' + paymentId).digest('hex');
  await assert.rejects(
    () => verifyRazorpayCheckout({
      orderId, paymentId, signature, expectedAmount: 125.5, expectedCurrency: 'INR',
      fetchImpl: async () => ({ ok: true, json: async () => ({
        id: paymentId, order_id: orderId, amount: 10000, currency: 'INR', status: 'captured', captured: true
      }) })
    }),
    error => error.statusCode === 422
  );
});

test('an authorised but uncaptured payment is not treated as paid', async () => {
  const crypto = require('crypto');
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'checkout_test_secret';
  const orderId = 'order_test123', paymentId = 'pay_test123';
  const signature = crypto.createHmac('sha256', 'checkout_test_secret').update(orderId + '|' + paymentId).digest('hex');
  const verified = await verifyRazorpayCheckout({
    orderId, paymentId, signature, expectedAmount: 125.5, expectedCurrency: 'INR',
    fetchImpl: async () => ({ ok: true, json: async () => ({
      id: paymentId, order_id: orderId, amount: 12550, currency: 'INR', status: 'authorized', captured: false
    }) })
  });
  assert.deepEqual(verified, { status: 'pending', providerPaymentId: paymentId });
});
