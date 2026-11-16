const test = require('node:test');
const assert = require('node:assert/strict');
const { issueOtp, verifyOtp, createDevToken, createAccessToken, verifyAccessToken } = require('./auth');

test('OTP is disabled unless explicit staging flags are enabled', () => {
  const previous = { appEnv: process.env.APP_ENV, enabled: process.env.ENABLE_TEST_OTP, nodeEnv: process.env.NODE_ENV };
  delete process.env.APP_ENV;
  delete process.env.ENABLE_TEST_OTP;
  process.env.NODE_ENV = 'development';
  try {
    assert.equal(issueOtp('+919999000001'), null);
    assert.equal(verifyOtp('+919999000001', '123456'), false);
  } finally {
    if (previous.appEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = previous.appEnv;
    if (previous.enabled === undefined) delete process.env.ENABLE_TEST_OTP; else process.env.ENABLE_TEST_OTP = previous.enabled;
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
  }
});

test('staging OTP is single-use and issues a verifiable signed token', () => {
  const previous = {
    appEnv: process.env.APP_ENV,
    enabled: process.env.ENABLE_TEST_OTP,
    nodeEnv: process.env.NODE_ENV,
    jwt: process.env.JWT_SECRET
  };
  process.env.APP_ENV = 'staging';
  process.env.ENABLE_TEST_OTP = 'true';
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'test-only-secret-with-more-than-32-characters';
  try {
    const phone = '+919999000001';
    const otp = issueOtp(phone);
    assert.match(otp, /^\d{6}$/);
    assert.equal(verifyOtp(phone, otp), true);
    assert.equal(verifyOtp(phone, otp), false);
    const token = createDevToken(phone);
    assert.equal(verifyAccessToken(token)?.phone, phone);
  } finally {
    if (previous.appEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = previous.appEnv;
    if (previous.enabled === undefined) delete process.env.ENABLE_TEST_OTP; else process.env.ENABLE_TEST_OTP = previous.enabled;
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.jwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous.jwt;
  }
});

test('production refuses staging OTP even if its flag is accidentally enabled', () => {
  const previous = { appEnv: process.env.APP_ENV, enabled: process.env.ENABLE_TEST_OTP, nodeEnv: process.env.NODE_ENV };
  process.env.APP_ENV = 'production';
  process.env.ENABLE_TEST_OTP = 'true';
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(issueOtp('+919999000002'), null);
    assert.equal(verifyOtp('+919999000002', '123456'), false);
    assert.throws(() => createDevToken('+919999000002'), /disabled/);
  } finally {
    if (previous.appEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = previous.appEnv;
    if (previous.enabled === undefined) delete process.env.ENABLE_TEST_OTP; else process.env.ENABLE_TEST_OTP = previous.enabled;
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
  }
});

test('signed access tokens validate signature and expiry claims', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-secret-with-more-than-32-characters';
  try {
    const token = createAccessToken('+919999000003');
    assert.equal(verifyAccessToken(token)?.phone, '+919999000003');
    assert.equal(verifyAccessToken(token + 'tampered'), null);
    assert.equal(verifyAccessToken('not-a-token'), null);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
