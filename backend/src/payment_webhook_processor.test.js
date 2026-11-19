const test = require('node:test');
const assert = require('node:assert/strict');
const { amountToMinorUnits } = require('./payment_webhook_processor');

test('converts decimal amounts exactly to minor units', () => {
  assert.equal(amountToMinorUnits('499.00'), 49900);
  assert.equal(amountToMinorUnits('0.5'), 50);
  assert.equal(amountToMinorUnits('1'), 100);
  assert.equal(amountToMinorUnits('001.05'), 105);
});

test('rejects malformed or unsafe decimal amounts', () => {
  for (const value of ['499.999', '-1', '1e2', 'abc', '', '1.']) assert.equal(amountToMinorUnits(value), null, value);
});
