const test = require('node:test');
const assert = require('node:assert/strict');
const { amountToMinorUnits } = require('./payment_webhook_processor');
test('converts decimal amounts exactly to minor units', () => { assert.equal(amountToMinorUnits('499.00'),49900); assert.equal(amountToMinorUnits('0.5'),50); assert.equal(amountToMinorUnits('1'),100); });
test('rejects malformed or unsafe decimal amounts', () => { assert.equal(amountToMinorUnits('499.999'),null); assert.equal(amountToMinorUnits('-1'),null); assert.equal(amountToMinorUnits('1e2'),null); });
