const { timingSafeEqual } = require('node:crypto');

function isAuthorizedPaymentStatusUpdate(headers, expectedToken = process.env.PAYMENT_STATUS_ADMIN_TOKEN) {
  if (typeof expectedToken !== 'string' || expectedToken.length === 0) return false;
  const authorization = headers && headers.authorization;
  if (typeof authorization !== 'string') return false;

  const expected = Buffer.from(`Bearer ${expectedToken}`, 'utf8');
  const supplied = Buffer.from(authorization, 'utf8');
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}

module.exports = { isAuthorizedPaymentStatusUpdate };
