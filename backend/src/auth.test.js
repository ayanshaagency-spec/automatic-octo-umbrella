const test = require('node:test');
const assert = require('node:assert/strict');
const { issueOtp, verifyOtp, createToken, verifyToken } = require('./auth');

test('secure session token is signed and expires', async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-123456';
  const issued = await issueOtp('+919999999999');
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
  const issued = await issueOtp('+919888888888');
  assert.equal(verifyOtp('+919888888888', issued.devOtp), true);
  assert.equal(verifyOtp('+919888888888', issued.devOtp), false);
});

test('OTP verification limits incorrect attempts', async () => {
  const issued = await issueOtp('+919777777777');
  for (let i = 0; i < 5; i++) assert.equal(verifyOtp('+919777777777', '000000'), false);
  assert.equal(verifyOtp('+919777777777', issued.devOtp), false);
});

test('OTP expires after five minutes', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const phone = '+919555555555';
    const issued = await issueOtp(phone);
    assert.match(issued.devOtp, /^\\d{6}$/);
    now += 5 * 60 * 1000 + 1;
    assert.equal(verifyOtp(phone, issued.devOtp), false);
  } finally {
    Date.now = originalNow;
  }
});

test('OTP request cooldown and rate limit are enforced', async () => {
  await issueOtp('+919666666666');
  await assert.rejects(issueOtp('+919666666666'), error => error.statusCode === 429);
});
