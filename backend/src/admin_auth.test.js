const test = require('node:test');
const assert = require('node:assert/strict');
const { isAdminConfigured, authenticateAdmin, issueAdminToken, verifyAdminToken } = require('./admin_auth');
const { verifyAccessToken } = require('./auth');

const env = {
  NODE_ENV: 'production',
  ADMIN_EMAIL: 'ADMIN@example.com',
  ADMIN_PASSWORD: 'test-only-admin-password',
  JWT_SECRET: 'test-only-secret-with-more-than-32-characters'
};

test('admin credentials must be configured with a strong JWT secret', () => {
  assert.equal(isAdminConfigured(env), true);
  assert.equal(isAdminConfigured({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'pw', JWT_SECRET: 'short' }), false);
  assert.deepEqual(authenticateAdmin('admin@example.com', 'pw', {}), { configured: false, authenticated: false });
});

test('admin login matches email case-insensitively and password exactly', () => {
  assert.deepEqual(authenticateAdmin('admin@example.com', 'test-only-admin-password', env), { configured: true, authenticated: true });
  assert.deepEqual(authenticateAdmin('ADMIN@example.com', 'wrong-password', env), { configured: true, authenticated: false });
});

test('admin token is signed, scoped to the admin role, and expires', () => {
  const now = 2_000_000_000;
  const token = issueAdminToken('ignored-input-email', env, now);
  assert.deepEqual(verifyAdminToken(token, env, now), { email: 'admin@example.com', role: 'admin', expiresAt: now + 3600 });
  assert.equal(verifyAdminToken(token, env, now + 3600), null);
  assert.equal(verifyAdminToken(token + 'tampered', env, now), null);
  assert.equal(verifyAdminToken('bad-token', env, now), null);
});

test('admin token is rejected by patient token verification', () => {
  const token = issueAdminToken('admin@example.com', env, 2_000_000_000);
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = env.JWT_SECRET;
  try {
    assert.equal(verifyAccessToken(token), null);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
