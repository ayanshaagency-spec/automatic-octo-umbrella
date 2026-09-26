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

function getRazorpayCredentials() {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) {
    throw new PaymentGatewayError('Razorpay credentials are not configured');
  }
  return { keyId, keySecret };
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
  return { provider: 'razorpay', orderId: payload.id, amount: payload.amount, currency: payload.currency };
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
  getConfiguredProvider,
  createPaymentGateway,
  createPaymentGatewayOrder
};
