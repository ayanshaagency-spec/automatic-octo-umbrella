const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyWebhookSignature, parseWebhookEvent, normalizeRazorpayPaymentEvent } = require('./payment_webhook');
const { validateStatusTransition } = require('./phase5_payment_validation');

const secret = 'test-webhook-secret';
const capturedEvent = {
  entity: 'event',
  account_id: 'acc_test',
  event: 'payment.captured',
  contains: ['payment'],
  payload: { payment: { entity: {
    id: 'pay_test_123',
    entity: 'payment',
    amount: 12550,
    currency: 'INR',
    status: 'captured',
    order_id: 'order_test_123',
    captured: true
  } } }
};
const rawPayload = Buffer.from(JSON.stringify(capturedEvent), 'utf8');
const signature = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');

test('accepts a valid Razorpay signature over exact raw request bytes', () => {
  assert.equal(verifyWebhookSignature(rawPayload, signature, secret), true);
});

test('rejects tampered bytes, malformed signature, missing signature and wrong secret', () => {
  assert.equal(verifyWebhookSignature(Buffer.concat([rawPayload, Buffer.from('x')]), signature, secret), false);
  assert.equal(verifyWebhookSignature(rawPayload, 'bad', secret), false);
  assert.equal(verifyWebhookSignature(rawPayload, undefined, secret), false);
  assert.equal(verifyWebhookSignature(rawPayload, signature, 'wrong-secret'), false);
});

test('parses valid Razorpay JSON from raw bytes and rejects malformed payloads', () => {
  assert.deepEqual(parseWebhookEvent(rawPayload), capturedEvent);
  assert.throws(() => parseWebhookEvent(Buffer.from('{bad')), /Invalid webhook JSON/);
  assert.throws(() => parseWebhookEvent(Buffer.from('{}')), /Invalid webhook payload/);
});

test('normalizes payment.captured to paid with its stored-order correlation fields', () => {
  assert.deepEqual(normalizeRazorpayPaymentEvent(capturedEvent), {
    eventId: null,
    orderId: 'order_test_123',
    providerPaymentId: 'pay_test_123',
    amount: 12550,
    currency: 'INR',
    status: 'paid'
  });
});

test('normalizes payment.failed and ignores unrelated events', () => {
  const failed = {
    event: 'payment.failed',
    payload: { payment: { entity: {
      id: 'pay_test_failed', order_id: 'order_test_failed',
      amount: 7500, currency: 'INR', status: 'failed'
    } } }
  };
  assert.equal(normalizeRazorpayPaymentEvent(failed).status, 'failed');
  assert.equal(normalizeRazorpayPaymentEvent({ event: 'payment.authorized' }), null);
  assert.equal(normalizeRazorpayPaymentEvent({ event: 'order.paid' }), null);
});

test('rejects malformed payment entities and event/entity state mismatches', () => {
  assert.throws(() => normalizeRazorpayPaymentEvent({
    event: 'payment.captured',
    payload: { payment: { entity: {
      id: 'pay_x', order_id: 'order_x', amount: 0, currency: 'INR', status: 'captured'
    } } }
  }), /Invalid Razorpay payment entity/);
  assert.throws(() => normalizeRazorpayPaymentEvent({
    event: 'payment.captured',
    payload: { payment: { entity: {
      id: 'pay_x', order_id: 'order_x', amount: 100, currency: 'INR', status: 'authorized'
    } } }
  }), /must contain a captured payment/);
});

test('allows a verified capture to recover failed/cancelled, never paid to failed', () => {
  assert.equal(validateStatusTransition('failed', 'paid'), null);
  assert.equal(validateStatusTransition('cancelled', 'paid'), null);
  assert.match(validateStatusTransition('paid', 'failed'), /invalid payment status transition/);
});
