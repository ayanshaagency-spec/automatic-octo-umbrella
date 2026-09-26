const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PaymentGatewayError,
  getConfiguredProvider,
  createPaymentGatewayOrder
} = require('./payment_gateway');

const originalEnv = {
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET
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
      json: async () => ({ id: 'order_test_123', amount: 12550, currency: 'INR' })
    };
  };

  const result = await createPaymentGatewayOrder({
    amount: 125.5,
    currency: 'INR',
    receipt: 'PAYMENT-123'
  });

  assert.deepEqual(result, {
    provider: 'razorpay',
    orderId: 'order_test_123',
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
