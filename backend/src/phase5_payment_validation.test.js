const assert = require('node:assert/strict');
const { validatePaymentInput, validateStatusTransition } = require('./phase5_payment_validation');

assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500, appointmentId: 1 }), null);
assert.equal(validatePaymentInput({ phone: '9999999999', amount: '500.50', appointmentId: 1 }), null);
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500, appointmentId: 1, idempotencyKey: 'checkout-123' }), null);
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500, labOrderId: 2, currency: 'INR' }), null);
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 0, appointmentId: 1 }), 'amount must be a positive number');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500 }), 'appointmentId or labOrderId is required');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500, appointmentId: 1, labOrderId: 2 }), 'payment must reference either an appointment or a lab order, not both');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: '1.001', appointmentId: 1 }), 'amount must be a positive decimal with up to 2 decimal places');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: '1e3', appointmentId: 1 }), 'amount must be a positive decimal with up to 2 decimal places');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: '99999999999', appointmentId: 1 }), 'amount must be a positive decimal with up to 2 decimal places');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: true, appointmentId: 1 }), 'amount must be a positive decimal with up to 2 decimal places');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500, appointmentId: '1abc' }), 'appointmentId must be a positive integer');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500, labOrderId: 0 }), 'labOrderId must be a positive integer');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500, appointmentId: 1, currency: 'inr' }), 'currency must be an uppercase ISO-style code');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500, appointmentId: 1, idempotencyKey: '   ' }), 'idempotencyKey must be a non-empty string up to 160 characters');
assert.equal(validatePaymentInput({ phone: '9999999999', amount: 500, appointmentId: 1, idempotencyKey: 'x'.repeat(161) }), 'idempotencyKey must be a non-empty string up to 160 characters');

assert.equal(validateStatusTransition('created', 'pending'), null);
assert.equal(validateStatusTransition('pending', 'paid'), null);
assert.equal(validateStatusTransition('paid', 'refunded'), null);
assert.match(validateStatusTransition('created', 'paid'), /invalid payment status transition/);
assert.match(validateStatusTransition('refunded', 'paid'), /invalid payment status transition/);
assert.equal(validateStatusTransition('paid', 'paid'), null);

console.log('Phase 5 payment validation tests passed');
