const crypto = require('crypto');

function getWebhookSecret() {
  return (process.env.PAYMENT_WEBHOOK_SECRET || '').trim();
}

function verifyWebhookSignature(rawBody, signature, secret = getWebhookSecret()) {
  if (!secret || typeof rawBody !== 'string' || typeof signature !== 'string') return false;

  const provided = signature.trim().toLowerCase();
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function parseWebhookEvent(rawBody) {
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    const error = new Error('Invalid webhook JSON');
    error.statusCode = 400;
    throw error;
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    const error = new Error('Invalid webhook payload');
    error.statusCode = 400;
    throw error;
  }

  return event;
}

// Normalize only known Razorpay payment events. This helper does not persist
// anything or authorize a status transition; callers must verify linkage,
// amount/currency and transition rules against their database record.
function normalizeRazorpayEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    const error = new Error('Invalid webhook payload');
    error.statusCode = 400;
    throw error;
  }

  const payment = event.payload?.payment?.entity;
  if (!payment || typeof payment !== 'object') {
    const error = new Error('Missing Razorpay payment entity');
    error.statusCode = 422;
    throw error;
  }

  const mapping = {
    'payment.captured': 'paid',
    'payment.failed': 'failed'
  };
  const status = mapping[event.event];
  if (!status) {
    const error = new Error('Unsupported Razorpay payment event');
    error.statusCode = 422;
    throw error;
  }

  if (typeof payment.id !== 'string' || !payment.id.trim() ||
      typeof payment.order_id !== 'string' || !payment.order_id.trim() ||
      !Number.isSafeInteger(payment.amount) || payment.amount <= 0 ||
      typeof payment.currency !== 'string' || !/^[A-Z]{3}$/.test(payment.currency)) {
    const error = new Error('Invalid Razorpay payment entity');
    error.statusCode = 422;
    throw error;
  }

  return {
    eventId: typeof event.id === 'string' && event.id.trim() ? event.id : null,
    event: event.event,
    status,
    providerPaymentId: payment.id,
    providerOrderId: payment.order_id,
    amountMinor: payment.amount,
    currency: payment.currency
  };
}

module.exports = { getWebhookSecret, verifyWebhookSignature, parseWebhookEvent, normalizeRazorpayEvent };
