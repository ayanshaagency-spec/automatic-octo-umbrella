const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyWebhookSignature, parseWebhookEvent, normalizeRazorpayEvent } = require('./payment_webhook');

const secret = 'test-webhook-secret';
const payload = JSON.stringify({ paymentId: 42, status: 'paid', providerPaymentId: 'pay_123' });
const signature = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

test('accepts a valid webhook signature', () => {
  assert.equal(verifyWebhookSignature(payload, signature, secret), true);
});

test('rejects a tampered webhook payload', () => {
  assert.equal(verifyWebhookSignature(payload + 'x', signature, secret), false);
});

test('rejects a missing or incorrect signature', () => {
  assert.equal(verifyWebhookSignature(payload, undefined, secret), false);
  assert.equal(verifyWebhookSignature(payload, signature, 'wrong-secret'), false);
});

test('parses valid webhook JSON', () => {
  assert.deepEqual(parseWebhookEvent(payload), { paymentId: 42, status: 'paid', providerPaymentId: 'pay_123' });
});

test('rejects invalid webhook JSON', () => {
  assert.throws(() => parseWebhookEvent('{bad'), /Invalid webhook JSON/);
});

test('normalizes Razorpay payment.captured and preserves linkage and amount', () => {
  const event = { id: 'evt_1', event: 'payment.captured', payload: { payment: { entity: {
    id: 'pay_1', order_id: 'order_1', amount: 49900, currency: 'INR'
  } } } };
  assert.deepEqual(normalizeRazorpayEvent(event), {
    eventId: 'evt_1', event: 'payment.captured', status: 'paid',
    providerPaymentId: 'pay_1', providerOrderId: 'order_1', amountMinor: 49900, currency: 'INR'
  });
});

test('normalizes payment.failed', () => {
  const event = { event: 'payment.failed', payload: { payment: { entity: {
    id: 'pay_2', order_id: 'order_2', amount: 2500, currency: 'INR'
  } } } };
  assert.equal(normalizeRazorpayEvent(event).status, 'failed');
});

test('rejects unsupported Razorpay events and incomplete entities', () => {
  assert.throws(() => normalizeRazorpayEvent({ event: 'order.paid', payload: { payment: { entity: {} } } }), { statusCode: 422 });
  assert.throws(() => normalizeRazorpayEvent({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay', order_id: 'order', amount: 0, currency: 'INR' } } } }), { statusCode: 422 });
});
