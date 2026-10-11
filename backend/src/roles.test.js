const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyAdminCredentials, createAdminToken, createDoctorToken, verifyRoleToken } = require('./roles');

const SECRET = 'ci-admin-role-secret-long-enough-for-hmac';
function withEnv(values, fn) {
  const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  try { for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } return fn(); }
  finally { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
function sign(payload, secret = SECRET, header = { alg: 'HS256', typ: 'JWT' }) {
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = b64(header) + '.' + b64(payload);
  return input + '.' + crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

test('admin credentials reject missing server-side email or password without leaking details', () => {
  withEnv({ ADMIN_EMAIL: undefined, ADMIN_PASSWORD: 'not-used' }, () => assert.throws(() => verifyAdminCredentials('admin@example.com', 'anything'), /not securely configured/));
  withEnv({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: undefined }, () => assert.throws(() => verifyAdminCredentials('admin@example.com', 'anything'), /not securely configured/));
});

test('configured admin credentials accept the matching email case-insensitively and exact password only', () => {
  withEnv({ ADMIN_EMAIL: ' Admin@Example.com ', ADMIN_PASSWORD: 'test-password-only' }, () => {
    assert.equal(verifyAdminCredentials('ADMIN@example.com', 'test-password-only'), true);
    assert.equal(verifyAdminCredentials('someone@example.com', 'test-password-only'), false);
    assert.equal(verifyAdminCredentials('admin@example.com', 'wrong-password'), false);
  });
});

test('admin token carries admin role and is verifiable; doctor token is not an admin token', () => {
  withEnv({ JWT_SECRET: SECRET }, () => {
    const token = createAdminToken('Admin@Example.com');
    const payload = verifyRoleToken(token, 'admin');
    assert.equal(payload.sub, 'admin@example.com');
    assert.equal(payload.role, 'admin');
    assert.equal(verifyRoleToken(createDoctorToken('+919900000001'), 'admin'), null);
  });
});

test('role-token verifier rejects missing, malformed, tampered, expired, wrong-role and invalid-signature tokens', () => {
  withEnv({ JWT_SECRET: SECRET }, () => {
    assert.equal(verifyRoleToken(undefined, 'admin'), null);
    assert.equal(verifyRoleToken('not-a-token', 'admin'), null);
    const now = Math.floor(Date.now() / 1000);
    const valid = sign({ sub: 'admin@example.com', role: 'admin', iat: now, exp: now + 60 });
    const parts = valid.split('.');
    assert.equal(verifyRoleToken(valid, 'admin')?.sub, 'admin@example.com');
    assert.equal(verifyRoleToken(parts[0] + '.' + parts[1] + '.invalidsignature', 'admin'), null);
    const changedPayload = Buffer.from(JSON.stringify({ sub: 'attacker', role: 'admin', iat: now, exp: now + 60 })).toString('base64url');
    assert.equal(verifyRoleToken(parts[0] + '.' + changedPayload + '.' + parts[2], 'admin'), null);
    assert.equal(verifyRoleToken(sign({ sub: 'admin@example.com', role: 'admin', iat: now - 100, exp: now - 1 }), 'admin'), null);
    assert.equal(verifyRoleToken(sign({ sub: 'admin@example.com', role: 'patient', iat: now, exp: now + 60 }), 'admin'), null);
  });
});

test('role-token creation preserves JWT_SECRET strength validation', () => {
  withEnv({ JWT_SECRET: 'short' }, () => assert.throws(() => createAdminToken('admin@example.com'), /JWT_SECRET is not securely configured/));
});
