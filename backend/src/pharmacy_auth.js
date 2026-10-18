'use strict';

const crypto = require('crypto');

const base64url = value => Buffer.from(value).toString('base64url');
const safeEqual = (a, b) => {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

function hashStaffPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    const error = new Error('password must be between 12 and 256 characters');
    error.statusCode = 422;
    throw error;
  }
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyStaffPassword(password, storedHash) {
  try {
    if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
    const [scheme, salt, expected] = storedHash.split('$');
    if (scheme !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/i.test(expected || '')) return false;
    const actual = crypto.scryptSync(password, salt, 64).toString('hex');
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

function getSigningSecret(env = process.env) {
  const secret = env.JWT_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    const error = new Error('JWT_SECRET must be configured with at least 32 characters');
    error.statusCode = 503;
    throw error;
  }
  return secret;
}

function issuePharmacyStaffToken(staff, env = process.env, now = Math.floor(Date.now() / 1000)) {
  const secret = getSigningSecret(env);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    role: 'pharmacy_staff',
    sub: String(staff.id),
    pharmacyId: Number(staff.pharmacy_id),
    staffRole: staff.staff_role,
    iat: now,
    exp: now + 6 * 60 * 60
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function verifyPharmacyStaffToken(token, env = process.env, now = Math.floor(Date.now() / 1000)) {
  try {
    const secret = getSigningSecret(env);
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const unsigned = `${parts[0]}.${parts[1]}`;
    const expected = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
    if (!safeEqual(expected, parts[2])) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const staffId = Number(payload.sub);
    const pharmacyId = Number(payload.pharmacyId);
    if (header.alg !== 'HS256' || payload.role !== 'pharmacy_staff' ||
        !Number.isSafeInteger(staffId) || staffId < 1 ||
        !Number.isSafeInteger(pharmacyId) || pharmacyId < 1 ||
        !['manager', 'pharmacist', 'staff'].includes(payload.staffRole) ||
        !Number.isFinite(payload.exp) || payload.exp <= now) return null;
    return { staffId, pharmacyId, staffRole: payload.staffRole, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

module.exports = {
  hashStaffPassword,
  verifyStaffPassword,
  issuePharmacyStaffToken,
  verifyPharmacyStaffToken
};
