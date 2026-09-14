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

function createPaymentGateway() {
  const provider = getConfiguredProvider();
  if (!provider) {
    return {
      provider: null,
      configured: false,
      async createOrder() {
        throw new PaymentGatewayError('Payment gateway is not configured');
      },
      async verifyPayment() {
        throw new PaymentGatewayError('Payment gateway is not configured');
      }
    };
  }

  // Provider adapters can be added here without changing payment routes/repository code.
  // Live credentials are intentionally read only from environment variables by the adapter.
  throw new PaymentGatewayError(`Unsupported payment provider: ${provider}`, 503);
}

module.exports = { PaymentGatewayError, getConfiguredProvider, createPaymentGateway };
