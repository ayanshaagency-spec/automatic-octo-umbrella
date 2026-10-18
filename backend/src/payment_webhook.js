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

module.exports = { getWebhookSecret, verifyWebhookSignature, parseWebhookEvent };
