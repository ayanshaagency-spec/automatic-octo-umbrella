class PaymentGatewayError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.name = 'PaymentGatewayError';
    this.statusCode = statusCode;
  }
}

function getConfiguredProvider() {
  return (process.env.PAYMENT_PROVIDER || '').trim().toLowerCase() || null;
}

function verifyRazorpayCheckoutSignature(orderId, paymentId, signature, secret) {
  if (typeof orderId !== 'string' || !/^order_[A-Za-z0-9]+$/.test(orderId) ||
      typeof paymentId !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(paymentId) ||
      typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature) ||
      typeof secret !== 'string' || !secret) return false;
  const crypto = require('crypto');
  const expected = crypto.createHmac('sha256', secret).update(orderId + '|' + paymentId, 'utf8').digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function getPaymentProviderStatus() {
  const provider = getConfiguredProvider();
  const providerSupported = provider === 'razorpay';
  const credentialsConfigured = providerSupported && Boolean(
    (process.env.RAZORPAY_KEY_ID || '').trim() &&
    (process.env.RAZORPAY_KEY_SECRET || '').trim()
  );
  const webhookConfigured = Boolean(require('./payment_webhook').getWebhookSecret());
  return {
    provider: provider || null,
    providerSupported,
    credentialsConfigured,
    webhookConfigured,
    configured: providerSupported && credentialsConfigured && webhookConfigured
  };
}

function getRazorpayCredentials(env = process.env) {
  const keyId = (env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) {
    throw new PaymentGatewayError('Razorpay credentials are not configured');
  }
  return { keyId, keySecret };
}

async function verifyRazorpayCheckout({
  orderId, paymentId, signature, expectedAmount, expectedCurrency = 'INR',
  env = process.env, fetchImpl = globalThis.fetch
}) {
  const credentials = getRazorpayCredentials(env);
  if (!verifyRazorpayCheckoutSignature(orderId, paymentId, signature, credentials.keySecret)) {
    throw new PaymentGatewayError('Invalid Razorpay checkout signature', 401);
  }
  if (!Number.isFinite(Number(expectedAmount)) || Number(expectedAmount) <= 0 ||
      typeof expectedCurrency !== 'string' || !/^[A-Z]{3}$/.test(expectedCurrency)) {
    throw new PaymentGatewayError('Stored payment amount or currency is invalid', 422);
  }
  if (typeof fetchImpl !== 'function') throw new PaymentGatewayError('Razorpay HTTP client is unavailable', 503);

  const auth = Buffer.from(credentials.keyId + ':' + credentials.keySecret).toString('base64');
  let response;
  try {
    response = await fetchImpl('https://api.razorpay.com/v1/payments/' + encodeURIComponent(paymentId), {
      method: 'GET',
      headers: { Authorization: 'Basic ' + auth },
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new PaymentGatewayError('Unable to verify payment with Razorpay', 502);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    throw new PaymentGatewayError('Unable to verify payment with Razorpay', 502);
  }
  if (payload.id !== paymentId || payload.order_id !== orderId ||
      payload.amount !== Math.round(Number(expectedAmount) * 100) ||
      payload.currency !== expectedCurrency) {
    throw new PaymentGatewayError('Razorpay payment does not match the stored order', 422);
  }
  if (payload.status === 'captured' && payload.captured === true) {
    return { status: 'paid', providerPaymentId: payload.id };
  }
  if (payload.status === 'failed') return { status: 'failed', providerPaymentId: payload.id };
  return { status: 'pending', providerPaymentId: payload.id };
}

async function createRazorpayOrder({ amount, currency = 'INR', receipt }) {
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new PaymentGatewayError('Payment amount must be positive', 422);
  }
  const { keyId, keySecret } = getRazorpayCredentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: String(receipt).slice(0, 40),
      payment_capture: 1
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    throw new PaymentGatewayError(payload?.error?.description || 'Unable to create Razorpay order', 502);
  }
  return { provider: 'razorpay', keyId, orderId: payload.id, amount: payload.amount, currency: payload.currency };
}

async function createPaymentGatewayOrder(data) {
  const provider = getConfiguredProvider();
  if (provider === 'razorpay') return createRazorpayOrder(data);
  if (!provider) throw new PaymentGatewayError('Payment gateway is not configured');
  throw new PaymentGatewayError(`Unsupported payment provider: ${provider}`, 503);
}

function createPaymentGateway() {
  return { provider: getConfiguredProvider(), createOrder: createPaymentGatewayOrder };
}

module.exports = {
  PaymentGatewayError,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayCheckout,
  getConfiguredProvider,
  getPaymentProviderStatus,
  createPaymentGateway,
  createPaymentGatewayOrder
};
