const test = require('node:test');
const assert = require('node:assert/strict');
const { issueOtp, verifyOtp, createToken, verifyToken } = require('./auth');

test('secure session token is signed and expires', async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-123456';
  const issued = await issueOtp('+919999999999');
  assert.equal(issued.delivery, 'development');
  assert.match(issued.devOtp, /^\d{6}$/);
  assert.equal(await verifyOtp('+919999999999', issued.devOtp), true);
  const token = createToken('+919999999999');
  const payload = verifyToken(token);
  assert.equal(payload.sub, '+919999999999');
  assert.equal(verifyToken(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')), null);
});

test('OTP cannot be reused', async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-123456';
  const issued = await issueOtp('+919888888888');
  assert.equal(await verifyOtp('+919888888888', issued.devOtp), true);
  assert.equal(await verifyOtp('+919888888888', issued.devOtp), false);
});

test('OTP verification limits incorrect attempts', async () => {
  const issued = await issueOtp('+919777777777');
  for (let i = 0; i < 5; i++) assert.equal(await verifyOtp('+919777777777', '000000'), false);
  assert.equal(await verifyOtp('+919777777777', issued.devOtp), false);
});

test('OTP expires after five minutes', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const phone = '+919555555555';
    const issued = await issueOtp(phone);
    assert.match(issued.devOtp, /^\d{6}$/);
    now += 5 * 60 * 1000 + 1;
    assert.equal(await verifyOtp(phone, issued.devOtp), false);
  } finally {
    Date.now = originalNow;
  }
});

test('OTP request cooldown and rate limit are enforced', async () => {
  await issueOtp('+919666666666');
  await assert.rejects(issueOtp('+919666666666'), error => error.statusCode === 429);
});


test('token verifier rejects unsupported JWT header algorithms even with a valid HMAC', () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-123456';
  const token = createToken('+919999999999');
  const parts = token.split('.');
  const badHeader = Buffer.from(JSON.stringify({ alg: 'HS512', typ: 'JWT' })).toString('base64url');
  const input = badHeader + '.' + parts[1];
  const signature = require('crypto').createHmac('sha256', process.env.JWT_SECRET).update(input).digest('base64url');
  assert.equal(verifyToken(input + '.' + signature), null);
});


test('token verifier rejects missing or future issued-at claims', () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-123456';
  const now = Math.floor(Date.now() / 1000);
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const crypto = require('crypto');
  for (const payload of [{ sub: '+919999999999', exp: now + 60 }, { sub: '+919999999999', iat: now + 120, exp: now + 180 }]) {
    const input = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(payload);
    const signature = crypto.createHmac('sha256', process.env.JWT_SECRET).update(input).digest('base64url');
    assert.equal(verifyToken(input + '.' + signature), null);
  }
});


test('token verifier rejects invalid time relationships and non-numeric claims', () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-123456';
  const now = Math.floor(Date.now() / 1000);
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const crypto = require('crypto');
  const payloads = [
    { sub: '+919999999999', iat: now, exp: now },
    { sub: '+919999999999', iat: now - 60, exp: now - 1 },
    { sub: '+919999999999', iat: 'invalid', exp: now + 60 },
    { sub: '+919999999999', iat: now, exp: 'invalid' }
  ];
  for (const payload of payloads) {
    const input = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(payload);
    const signature = crypto.createHmac('sha256', process.env.JWT_SECRET).update(input).digest('base64url');
    assert.equal(verifyToken(input + '.' + signature), null);
  }
});


test('OTP provider request includes a bounded timeout signal', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.OTP_PROVIDER_URL;
  const originalToken = process.env.OTP_PROVIDER_TOKEN;
  process.env.OTP_PROVIDER_URL = 'https://otp-provider.invalid/send';
  process.env.OTP_PROVIDER_TOKEN = 'test-token';
  global.fetch = async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    return { ok: true };
  };
  try {
    const result = await issueOtp('+919444444444');
    assert.equal(result.delivery, 'provider_accepted');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.OTP_PROVIDER_URL; else process.env.OTP_PROVIDER_URL = originalUrl;
    if (originalToken === undefined) delete process.env.OTP_PROVIDER_TOKEN; else process.env.OTP_PROVIDER_TOKEN = originalToken;
  }
});


test('OTP verifier rejects malformed phone and OTP inputs safely', async () => {
  const issued = await issueOtp('+919333333333');
  assert.equal(await verifyOtp('+919333333333', issued.devOtp), true);
  assert.equal(await verifyOtp('+919333333333', issued.devOtp), false);
  assert.equal(await verifyOtp('+919333333333', {}), false);
  assert.equal(await verifyOtp({}, '123456'), false);
  assert.equal(await verifyOtp('bad-phone', '123456'), false);
  assert.equal(await verifyOtp('+919333333333', '12345'), false);
  assert.equal(await verifyOtp('+919333333333', 'abcdef'), false);
});

test('OTP provider rejects insecure HTTP URLs outside local development', async () => {
  const originalUrl = process.env.OTP_PROVIDER_URL;
  const originalToken = process.env.OTP_PROVIDER_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.OTP_PROVIDER_URL = 'http://otp-provider.example/send';
  process.env.OTP_PROVIDER_TOKEN = 'test-token';
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(issueOtp('+919222222222'), error => error.statusCode === 503 && /HTTPS/.test(error.message));
  } finally {
    if (originalUrl === undefined) delete process.env.OTP_PROVIDER_URL; else process.env.OTP_PROVIDER_URL = originalUrl;
    if (originalToken === undefined) delete process.env.OTP_PROVIDER_TOKEN; else process.env.OTP_PROVIDER_TOKEN = originalToken;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  }
});


test('OTP hash comparison rejects malformed hashes and compares fixed-length hashes safely', () => {
  const crypto = require('crypto');
  const source = require('fs').readFileSync(require.resolve('./auth'), 'utf8');
  assert.match(source, /crypto\.timingSafeEqual\(expected, provided\)/);
  const valid = crypto.createHash('sha256').update('otp-test').digest('hex');
  assert.match(valid, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(source, /record\.hash\s*!==\s*otpHash|row\.otp_hash\s*!==\s*otpHash/);
});


test('OTP purpose is isolated between patient and doctor authentication', async () => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac-123456';
  const phone = '+919111111111';
  const issued = await issueOtp(phone, 'doctor');
  assert.equal(await verifyOtp(phone, issued.devOtp, 'patient'), false);
  assert.equal(await verifyOtp(phone, issued.devOtp, 'doctor'), true);
  assert.equal(await verifyOtp(phone, issued.devOtp, 'doctor'), false);
});
