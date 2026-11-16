const crypto = require('crypto');

const otpStore = new Map();
const isProduction = () => process.env.NODE_ENV === 'production';
const isStagingTestOtpEnabled = () =>
  process.env.APP_ENV === 'staging' && process.env.ENABLE_TEST_OTP === 'true';
const base64url = (value) => Buffer.from(value).toString('base64url');
const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

// Test OTP is allowed only when both staging-only flags are explicitly set.
// Production remains closed even if ENABLE_TEST_OTP is accidentally enabled.
const issueOtp = (phone) => {
  if (!isStagingTestOtpEnabled()) return null;
  if (typeof phone !== 'string' || !/^\+?[1-9]\d{7,14}$/.test(phone.trim())) return null;
  const otp = String(crypto.randomInt(100000, 1000000));
  otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
  return otp;
};

const verifyOtp = (phone, otp) => {
  if (!isStagingTestOtpEnabled()) return false;
  const record = otpStore.get(phone);
  if (!record || record.expiresAt < Date.now() || record.otp !== String(otp)) return false;
  otpStore.delete(phone);
  return true;
};

const createAccessToken = (phone) => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ sub: phone, iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
};

const createDevToken = (phone) => {
  if (!isStagingTestOtpEnabled()) throw new Error('Staging test tokens are disabled');
  return createAccessToken(phone);
};

const verifyAccessToken = (token) => {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32 || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const unsigned = `${parts[0]}.${parts[1]}`;
    const expected = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
    if (!safeEqual(expected, parts[2])) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'HS256' || payload.role !== undefined || typeof payload.sub !== 'string' || !payload.sub ||
        !Number.isFinite(payload.exp) || payload.exp <= now) return null;
    return { phone: payload.sub, expiresAt: payload.exp };
  } catch {
    return null;
  }
};

module.exports = { issueOtp, verifyOtp, createDevToken, createAccessToken, verifyAccessToken };
