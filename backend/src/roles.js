const crypto = require('crypto');
const { AuthError } = require('./auth');

function getAdminCredentials() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) throw new AuthError('Admin credentials are not securely configured');
  return { email, password };
}

function signRoleToken(subject, role) {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (!secret || secret === 'replace_with_secure_secret' || secret.length < 32) {
    throw new AuthError('JWT_SECRET is not securely configured');
  }
  const now = Math.floor(Date.now() / 1000);
  const b64 = value => Buffer.from(value).toString('base64url');
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ sub: subject, role, iat: now, exp: now + 8 * 60 * 60 }));
  const input = header + '.' + payload;
  const signature = crypto.createHmac('sha256', secret).update(input).digest('base64url');
  return input + '.' + signature;
}

function verifyRoleToken(token, role) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
  if (payload?.role !== role || !payload?.sub || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  const secret = (process.env.JWT_SECRET || '').trim();
  if (!secret || secret.length < 32) return null;
  const expected = crypto.createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest('base64url');
  const a = Buffer.from(parts[2]), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? payload : null;
}

function verifyAdminCredentials(email, password) {
  const expected = getAdminCredentials();
  const actualEmail = String(email || '').trim().toLowerCase();
  const actualPassword = String(password || '');
  if (actualEmail !== expected.email || actualPassword !== expected.password) return false;
  return true;
}

function createAdminToken(email) {
  return signRoleToken(String(email).trim().toLowerCase(), 'admin');
}

module.exports = { verifyAdminCredentials, createAdminToken, verifyRoleToken };