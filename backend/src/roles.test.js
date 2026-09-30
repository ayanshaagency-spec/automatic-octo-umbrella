const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyAdminCredentials, createAdminToken, verifyRoleToken } = require('./roles');

test('admin credentials require configured server-side values', () => {
  const oldEmail = process.env.ADMIN_EMAIL;
  const oldPassword = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  assert.throws(() => verifyAdminCredentials('admin@example.com', 'secret'));
  if (oldEmail === undefined) delete process.env.ADMIN_EMAIL; else process.env.ADMIN_EMAIL = oldEmail;
  if (oldPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = oldPassword;
});

test('admin token carries admin role and is verifiable', () => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'ci-admin-role-secret-long-enough-for-hmac';
  const token = createAdminToken('Admin@Example.com');
  const payload = verifyRoleToken(token, 'admin');
  assert.equal(payload.sub, 'admin@example.com');
  assert.equal(payload.role, 'admin');
  process.env.JWT_SECRET = oldSecret;
});