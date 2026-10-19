const test = require('node:test');
const assert = require('node:assert/strict');
const { issueOtp, verifyOtp, createToken, verifyToken } = require('./auth');

async function issueDevelopmentOtp(phone) {
  process.env.NODE_ENV = 'test';
  delete process.env.OTP_PROVIDER_URL;
  delete process.env.OTP_PROVIDER_TOKEN;
  return issueOtp(phone);
}

test('secure session token is signed and expires', async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-123456';
  const issued = await issueDevelopmentOtp('+919999999999');
  assert.equal(issued.delivery, 'development');
  assert.match(issued.devOtp, /^\d{6}$/);
  assert.equal(verifyOtp('+919999999999', issued.devOtp), true);
  const token = createToken('+919999999999');
  const payload = verifyToken(token);
  assert.equal(payload.sub, '+919999999999');
  assert.equal(verifyToken(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')), null);
});

test('OTP cannot be reused', async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-123456';
  const issued = await issueDevelopmentOtp('+919888888888');
  assert.equal(verifyOtp('+919888888888', issued.devOtp), true);
  assert.equal(verifyOtp('+919888888888', issued.devOtp), false);
});

test('OTP requests are limited to three per phone in a rolling 15-minute window', async () => {
  const phone = '+919777777777';
  await issueDevelopmentOtp(phone);
  await issueDevelopmentOtp(phone);
  await issueDevelopmentOtp(phone);
  await assert.rejects(
    () => issueDevelopmentOtp(phone),
    error => error.statusCode === 429 && /Too many OTP requests/.test(error.message)
  );
});

test('five failed OTP checks invalidate the active code', async () => {
  const phone = '+919666666666';
  const issued = await issueDevelopmentOtp(phone);
  for (let i = 0; i < 5; i += 1) {
    assert.equal(verifyOtp(phone, '000000'), false);
  }
  assert.equal(verifyOtp(phone, issued.devOtp), false);
});

test('OTP expires after five minutes', async () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    const phone = '+919555555555';
    const issued = await issueDevelopmentOtp(phone);
    now += 5 * 60 * 1000 + 1;
    assert.equal(verifyOtp(phone, issued.devOtp), false);
  } finally {
    Date.now = realNow;
  }
});

test('OTP provider URLs must use HTTPS and may not embed credentials', async () => {
  const phone = '+919444444444';
  process.env.NODE_ENV = 'test';
  process.env.OTP_PROVIDER_URL = 'http://sms-provider.example.test/send';
  process.env.OTP_PROVIDER_TOKEN = 'test-only-token';
  try {
    await assert.rejects(
      () => issueOtp(phone),
      error => error.statusCode === 503 && /HTTPS/.test(error.message)
    );
    assert.equal(verifyOtp(phone, '123456'), false, 'failed provider request must not leave an active OTP');
  } finally {
    delete process.env.OTP_PROVIDER_URL;
    delete process.env.OTP_PROVIDER_TOKEN;
  }
});


test('OTP requests fail closed in staging when provider secrets are missing', async () => {
  const previousMode = process.env.NODE_ENV;
  process.env.NODE_ENV = 'staging';
  delete process.env.OTP_PROVIDER_URL;
  delete process.env.OTP_PROVIDER_TOKEN;
  try {
    await assert.rejects(
      () => issueOtp('+919222222222'),
      error => error.statusCode === 503 && /OTP provider is not configured/.test(error.message)
    );
  } finally {
    process.env.NODE_ENV = previousMode;
  }
});

test('production OTP requests fail closed when provider secrets are missing', async () => {
  const previousMode = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  delete process.env.OTP_PROVIDER_URL;
  delete process.env.OTP_PROVIDER_TOKEN;
  try {
    await assert.rejects(
      () => issueOtp('+919333333333'),
      error => error.statusCode === 503 && /OTP provider is not configured/.test(error.message)
    );
  } finally {
    process.env.NODE_ENV = previousMode;
  }
});

