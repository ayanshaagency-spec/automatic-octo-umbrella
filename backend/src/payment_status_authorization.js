function isAuthorizedPaymentStatusUpdate(headers, expectedToken = process.env.PAYMENT_STATUS_ADMIN_TOKEN) {
  if (!expectedToken) return false;
  const authorization = headers && headers.authorization;
  return typeof authorization === 'string' && authorization === `Bearer ${expectedToken}`;
}

module.exports = { isAuthorizedPaymentStatusUpdate };
