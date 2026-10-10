const test = require('node:test');
const assert = require('node:assert/strict');
const { issueOtp, verifyOtp, createDevToken, createAccessToken, verifyAccessToken } = require('./auth');

test('development OTP is single-use and expires by policy', () => {
  const phone = '+919999000001';
  const otp = issueOtp(phone);
  assert.match(otp, /^\d{6}$/);
  assert.equal(verifyOtp(phone, otp), true);
  assert.equal(verifyOtp(phone, otp), false);
});

test('production refuses development OTP and development tokens', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(issueOtp('+919999000002'), null);
    assert.equal(verifyOtp('+919999000002', '123456'), false);
    assert.throws(() => createDevToken('+919999000002'), /disabled in production/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('signed access tokens validate signature and expiry claims', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-secret-with-more-than-32-characters';
  try {
    const token = createAccessToken('+919999000003');
    assert.deepEqual(verifyAccessToken(token)?.phone, '+919999000003');
    assert.equal(verifyAccessToken(token + 'tampered'), null);
    assert.equal(verifyAccessToken('not-a-token'), null);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
