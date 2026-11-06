'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_DOCUMENT_BYTES,
  validatePolicyInput,
  validateDocumentInput,
  sanitizeFilename,
  validatePolicyTransition
} = require('./insurance_validation');

test('policy metadata validation keeps only policy number last four characters', () => {
  const result = validatePolicyInput({
    insurerName: '  Ayansha Test Insurer ',
    policyType: 'family',
    policyNumber: 'POL-1234-ABCD-9876',
    policyExpiry: '2027-12-31'
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.insurerName, 'Ayansha Test Insurer');
  assert.equal(result.value.policyType, 'family');
  assert.equal(result.value.policyNumberLast4, '9876');
  assert.equal(result.value.policyExpiry, '2027-12-31');
  assert.equal(Object.hasOwn(result.value, 'policyNumber'), false);
});

test('policy validation rejects missing insurer, malformed policy number and invalid dates', () => {
  assert.ok(validatePolicyInput({ policyNumber: '1234' }).error);
  assert.ok(validatePolicyInput({ insurerName: 'Insurer', policyNumber: '***' }).error);
  assert.ok(validatePolicyInput({ insurerName: 'Insurer', policyNumber: '1234', policyExpiry: '2027-02-31' }).error);
  assert.ok(validatePolicyInput({ insurerName: 'Insurer', policyType: 'unknown', policyNumber: '1234' }).error);
});

test('document validation allows only PDF/JPEG/PNG and limits size to 10 MB', () => {
  const valid = validateDocumentInput({
    documentType: 'insurance_card',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    filename: 'insurance-card.pdf'
  });
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.contentType, 'application/pdf');
  assert.ok(validateDocumentInput({
    documentType: 'other', contentType: 'image/svg+xml', sizeBytes: 100, filename: 'unsafe.svg'
  }).error);
  assert.ok(validateDocumentInput({
    documentType: 'other', contentType: 'image/jpeg', sizeBytes: MAX_DOCUMENT_BYTES + 1, filename: 'large.jpg'
  }).error);
  assert.ok(validateDocumentInput({
    documentType: 'script', contentType: 'image/jpeg', sizeBytes: 100, filename: 'bad.jpg'
  }).error);
});

test('filename sanitization strips paths and control characters', () => {
  assert.equal(sanitizeFilename('C:\\fakepath\\policy.pdf'), 'policy.pdf');
  assert.equal(sanitizeFilename('bad\nname.pdf'), 'badname.pdf');
  assert.equal(sanitizeFilename('../'), null);
});

test('insurance policy review transitions are controlled', () => {
  assert.equal(validatePolicyTransition('submitted', 'under_review'), null);
  assert.equal(validatePolicyTransition('under_review', 'verified'), null);
  assert.equal(validatePolicyTransition('submitted', 'verified'), 'Cannot change insurance policy status from submitted to verified');
  assert.equal(validatePolicyTransition('rejected', 'under_review'), 'Cannot change insurance policy status from rejected to under_review');
  assert.ok(validatePolicyTransition('under_review', 'unknown'));
});
