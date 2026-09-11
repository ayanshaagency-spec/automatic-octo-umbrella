const assert = require('node:assert/strict');
const { validatePaymentInput, validateStatusTransition } = require('./phase5_payment_validation');

assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500, appointmentId: 1 }), null);
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500, labOrderId: 2, currency: 'INR' }), null);
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 0, appointmentId: 1 }), 'amount must be a positive number');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500 }), 'appointmentId or labOrderId is required');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500, appointmentId: 1, currency: 'inr' }), 'currency must be an uppercase ISO-style code');

assert.equal(validateStatusTransition('created', 'pending'), null);
assert.equal(validateStatusTransition('pending', 'paid'), null);
assert.equal(validateStatusTransition('paid', 'refunded'), null);
assert.match(validateStatusTransition('created', 'paid'), /invalid payment status transition/);
assert.match(validateStatusTransition('refunded', 'paid'), /invalid payment status transition/);
assert.equal(validateStatusTransition('paid', 'paid'), null);

console.log('Phase 5 payment validation tests passed');
