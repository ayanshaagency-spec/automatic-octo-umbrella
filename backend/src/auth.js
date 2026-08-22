const crypto = require('crypto');

// Development OTP service. Production should replace this with an SMS provider.
const otpStore = new Map();
const issueOtp = (phone) => {
  const otp = String(crypto.randomInt(100000, 1000000));
  otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
  return otp;
};
const verifyOtp = (phone, otp) => {
  const record = otpStore.get(phone);
  if (!record || record.expiresAt < Date.now() || record.otp !== otp) return false;
  otpStore.delete(phone);
  return true;
};

const base64url = (value) => Buffer.from(value).toString('base64url');
const createDevToken = (phone) => {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ sub: phone, iat: Math.floor(Date.now()/1000) }));
  return `${header}.${payload}.development-token`;
};

module.exports = { issueOtp, verifyOtp, createDevToken };
