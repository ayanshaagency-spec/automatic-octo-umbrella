const crypto = require('crypto');

function getWebhookSecret() {
  return (process.env.PAYMENT_WEBHOOK_SECRET || '').trim();
}

function verifyWebhookSignature(rawBody, signature, secret = getWebhookSecret()) {
  if (!secret || (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') || typeof signature !== 'string') return false;
  const provided = signature.trim();
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  const bytes = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const expected = crypto.createHmac('sha256', secret).update(bytes).digest();
  const supplied = Buffer.from(provided, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function parseWebhookEvent(rawBody) {
  let event;
  try {
    event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody);
  } catch {
    const error = new Error('Invalid webhook JSON');
    error.statusCode = 400;
    throw error;
  }
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.event !== 'string' || !event.event.trim()) {
    const error = new Error('Invalid webhook payload');
    error.statusCode = 400;
    throw error;
  }
  return event;
}

function normalizeRazorpayPaymentEvent(event) {
  if (!event || typeof event.event !== 'string') {
    const error = new Error('Invalid webhook event');
    error.statusCode = 400;
    throw error;
  }
  if (event.event !== 'payment.captured' && event.event !== 'payment.failed') return null;
  const payment = event.payload?.payment?.entity;
  if (!payment || typeof payment !== 'object' || Array.isArray(payment) ||
      typeof payment.id !== 'string' || !payment.id.trim() ||
      typeof payment.order_id !== 'string' || !payment.order_id.trim() ||
      !Number.isSafeInteger(payment.amount) || payment.amount <= 0 ||
      typeof payment.currency !== 'string' || !/^[A-Z]{3}$/.test(payment.currency)) {
    const error = new Error('Invalid Razorpay payment entity');
    error.statusCode = 422;
    throw error;
  }
  if (event.event === 'payment.captured' && payment.status !== 'captured') {
    const error = new Error('Captured event must contain a captured payment');
    error.statusCode = 422;
    throw error;
  }
  if (event.event === 'payment.failed' && payment.status !== 'failed') {
    const error = new Error('Failed event must contain a failed payment');
    error.statusCode = 422;
    throw error;
  }
  return {
    eventId: typeof event.id === 'string' ? event.id : null,
    orderId: payment.order_id,
    providerPaymentId: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    status: event.event === 'payment.captured' ? 'paid' : 'failed'
  };
}

module.exports = { getWebhookSecret, verifyWebhookSignature, parseWebhookEvent, normalizeRazorpayPaymentEvent };
