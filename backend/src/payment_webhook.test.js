const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyWebhookSignature, parseWebhookEvent } = require('./payment_webhook');

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

console.log('Payment webhook security tests passed');
