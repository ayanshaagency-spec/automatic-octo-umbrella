'use strict';

const crypto = require('crypto');

const base64url = (value) => Buffer.from(value).toString('base64url');

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue ?? ''));
  const right = Buffer.from(String(rightValue ?? ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isAdminConfigured(env = process.env) {
  return Boolean(
    typeof env.ADMIN_EMAIL === 'string' &&
    env.ADMIN_EMAIL.trim() &&
    typeof env.ADMIN_PASSWORD === 'string' &&
    env.ADMIN_PASSWORD.length > 0 &&
    typeof env.JWT_SECRET === 'string' &&
    env.JWT_SECRET.length >= 32
  );
}

function authenticateAdmin(email, password, env = process.env) {
  if (!isAdminConfigured(env)) return { configured: false, authenticated: false };
  const emailMatches = safeEqual(String(email ?? '').trim().toLowerCase(), env.ADMIN_EMAIL.trim().toLowerCase());
  const passwordMatches = safeEqual(password, env.ADMIN_PASSWORD);
  return { configured: true, authenticated: emailMatches && passwordMatches };
}

function issueAdminToken(email, env = process.env, now = Math.floor(Date.now() / 1000)) {
  if (!isAdminConfigured(env)) throw new Error('Admin credentials and JWT_SECRET are not securely configured');
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: env.ADMIN_EMAIL.trim().toLowerCase(),
    role: 'admin',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', env.JWT_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function verifyAdminToken(token, env = process.env, now = Math.floor(Date.now() / 1000)) {
  try {
    if (!isAdminConfigured(env) || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const unsigned = `${parts[0]}.${parts[1]}`;
    const expected = crypto.createHmac('sha256', env.JWT_SECRET).update(unsigned).digest('base64url');
    if (!safeEqual(expected, parts[2])) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || payload.role !== 'admin' ||
        typeof payload.sub !== 'string' ||
        payload.sub !== env.ADMIN_EMAIL.trim().toLowerCase() ||
        !Number.isFinite(payload.exp) || payload.exp <= now) return null;
    return { email: payload.sub, role: 'admin', expiresAt: payload.exp };
  } catch {
    return null;
  }
}

module.exports = { isAdminConfigured, authenticateAdmin, issueAdminToken, verifyAdminToken };
