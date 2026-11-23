const test = require('node:test');
const assert = require('node:assert/strict');
const { assertLabStatusTransition } = require('./lab_status_transition');

test('allows valid forward transitions and cancellation where allowed', () => {
  for (const [a,b] of [['booked','confirmed'],['booked','cancelled'],['confirmed','sample-collected'],['confirmed','cancelled'],['sample-collected','completed']]) assert.doesNotThrow(() => assertLabStatusTransition(a,b));
});
test('allows idempotent status update', () => { assert.doesNotThrow(() => assertLabStatusTransition('confirmed','confirmed')); });
test('rejects backwards transitions and terminal-state changes', () => {
  for (const [a,b] of [['confirmed','booked'],['sample-collected','confirmed'],['completed','cancelled'],['cancelled','confirmed'],['booked','completed']]) assert.throws(() => assertLabStatusTransition(a,b), {statusCode:422});
});
test('rejects unknown statuses', () => assert.throws(() => assertLabStatusTransition('unknown','completed'), {statusCode:422}));
