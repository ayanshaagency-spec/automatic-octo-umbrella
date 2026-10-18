const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashStaffPassword,
  verifyStaffPassword,
  issuePharmacyStaffToken,
  verifyPharmacyStaffToken
} = require('./pharmacy_auth');

const env = { JWT_SECRET: 'test-only-jwt-secret-that-is-long-enough-123456' };

test('staff passwords are scrypt hashed and not stored in plaintext', () => {
  const hash = hashStaffPassword('A-strong-demo-password-123');
  assert.notEqual(hash, 'A-strong-demo-password-123');
  assert.equal(verifyStaffPassword('A-strong-demo-password-123', hash), true);
  assert.equal(verifyStaffPassword('wrong-password', hash), false);
  assert.throws(() => hashStaffPassword('short'), error => error.statusCode === 422);
});

test('staff token is scoped to a store and has a distinct pharmacy_staff role', () => {
  const now = 2_000_000_000;
  const token = issuePharmacyStaffToken({ id: 9, pharmacy_id: 5, staff_role: 'pharmacist' }, env, now);
  assert.deepEqual(verifyPharmacyStaffToken(token, env, now), {
    staffId: 9, pharmacyId: 5, staffRole: 'pharmacist', expiresAt: now + 21600
  });
  assert.equal(verifyPharmacyStaffToken(token, env, now + 21600), null);
  assert.equal(verifyPharmacyStaffToken(token + 'tampered', env, now), null);
});
