const crypto = require('crypto');

const otpStore = new Map();
const otpRequestStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const OTP_REQUEST_LIMIT = 3;
const OTP_VERIFY_ATTEMPT_LIMIT = 5;
const OTP_RATE_STORE_MAX_KEYS = 10000;
const TOKEN_TTL_SECONDS = 24 * 60 * 60;

function pruneOtpRequestStore(now = Date.now()) {
  for (const [phone, record] of otpRequestStore) {
    if (!record.timestamps.length || record.timestamps[record.timestamps.length - 1] <= now - OTP_REQUEST_WINDOW_MS) {
      otpRequestStore.delete(phone);
    }
  }
  // Bound process memory if an attacker sends many different phone numbers.
  while (otpRequestStore.size > OTP_RATE_STORE_MAX_KEYS) {
    otpRequestStore.delete(otpRequestStore.keys().next().value);
  }
}

function enforceOtpRequestLimit(phone, now = Date.now()) {
  pruneOtpRequestStore(now);
  const record = otpRequestStore.get(phone) || { timestamps: [] };
  record.timestamps = record.timestamps.filter(timestamp => timestamp > now - OTP_REQUEST_WINDOW_MS);
  if (record.timestamps.length >= OTP_REQUEST_LIMIT) {
    throw new AuthError('Too many OTP requests. Please try again later.', 429);
  }
  record.timestamps.push(now);
  otpRequestStore.set(phone, record);
}

class AuthError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getJwtSecret() {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (!secret || secret === 'replace_with_secure_secret' || secret.length < 32) {
    throw new AuthError('JWT_SECRET is not securely configured');
  }
  return secret;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(input, secret) {
  return crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

function createToken(phone) {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: String(phone),
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  }));
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload?.sub || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  let expected;
  try {
    expected = sign(`${parts[0]}.${parts[1]}`, getJwtSecret());
  } catch {
    return null;
  }
  const provided = Buffer.from(parts[2]);
  const calculated = Buffer.from(expected);
  if (provided.length !== calculated.length || !crypto.timingSafeEqual(provided, calculated)) return null;
  return payload;
}

async function sendOtp(phone, otp) {
  const providerUrl = (process.env.OTP_PROVIDER_URL || '').trim();
  const accessToken = (process.env.OTP_PROVIDER_TOKEN || '').trim();
  if (!providerUrl || !accessToken) {
    if (process.env.NODE_ENV === 'production') {
      throw new AuthError('OTP provider is not configured');
    }
    return { delivery: 'development', devOtp: otp };
  }

  const response = await fetch(providerUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: String(phone),
      message: `Your Ayansha Health Care verification code is ${otp}. It expires in 5 minutes.`
    })
  });
  if (!response.ok) throw new AuthError('OTP provider rejected the request', 502);
  return { delivery: 'provider_accepted' };
}

async function issueOtp(phone) {
  const normalizedPhone = String(phone).trim();
  if (!/^\+?[1-9]\d{9,14}$/.test(normalizedPhone)) {
    throw new AuthError('phone must be a valid international phone number', 422);
  }
  enforceOtpRequestLimit(normalizedPhone);
  const otp = String(crypto.randomInt(100000, 1000000));
  otpStore.set(normalizedPhone, { otp, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  try {
    const delivery = await sendOtp(normalizedPhone, otp);
    return { ...delivery, expiresInSeconds: OTP_TTL_MS / 1000 };
  } catch (error) {
    otpStore.delete(normalizedPhone);
    throw error;
  }
}

function verifyOtp(phone, otp) {
  const normalizedPhone = String(phone).trim();
  const record = otpStore.get(normalizedPhone);
  if (!record) return false;
  if (record.expiresAt < Date.now()) {
    otpStore.delete(normalizedPhone);
    return false;
  }
  if (record.otp !== String(otp).trim()) {
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts >= OTP_VERIFY_ATTEMPT_LIMIT) otpStore.delete(normalizedPhone);
    return false;
  }
  otpStore.delete(normalizedPhone);
  return true;
}

module.exports = { issueOtp, verifyOtp, createToken, verifyToken, AuthError };
