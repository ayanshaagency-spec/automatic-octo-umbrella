const test = require('node:test');
const assert = require('node:assert/strict');
const { isAuthorizedPaymentStatusUpdate } = require('./payment_status_authorization');

test('direct payment status update requires configured admin token', () => {
  assert.equal(isAuthorizedPaymentStatusUpdate({ authorization: 'Bearer secret' }, 'secret'), true);
  assert.equal(isAuthorizedPaymentStatusUpdate({ authorization: 'Bearer wrong' }, 'secret'), false);
  assert.equal(isAuthorizedPaymentStatusUpdate({}, 'secret'), false);
  assert.equal(isAuthorizedPaymentStatusUpdate({ authorization: 'Bearer secret' }, ''), false);
});
