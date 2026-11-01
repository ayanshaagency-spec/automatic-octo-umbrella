'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const PORT = 3924;
const BASE_URL = 'http://127.0.0.1:' + PORT;
const ADMIN_EMAIL = 'insurance-ci-admin@example.test';
const ADMIN_PASSWORD = 'ci-only-insurance-admin-password';
const JWT_SECRET = 'insurance-ci-jwt-secret-long-enough-for-hs256';

async function request(route, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(BASE_URL + route, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

test('insurance endpoints enforce patient/admin auth and fail closed without private storage', async t => {
  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      DATABASE_URL: '',
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      JWT_SECRET,
      INSURANCE_S3_BUCKET: 'ci-only-private-insurance-bucket',
      INSURANCE_S3_REGION: 'us-east-1',
      INSURANCE_S3_ACCESS_KEY_ID: 'ci-only-test-access-key',
      INSURANCE_S3_SECRET_ACCESS_KEY: 'ci-only-test-secret-key',
      INSURANCE_S3_ENDPOINT: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => server.kill());
  let output = '';
  server.stdout.on('data', chunk => { output += chunk.toString(); });
  server.stderr.on('data', chunk => { output += chunk.toString(); });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode !== null) throw new Error('API exited early: ' + output);
    try {
      const health = await fetch(BASE_URL + '/health');
      if (health.ok) { ready = true; break; }
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'API should start for isolated auth tests');

  assert.equal((await request('/api/insurance/policies')).status, 401);
  assert.equal((await request('/api/admin/insurance/policies')).status, 401);
  assert.equal((await request('/api/insurance/documents/1/download')).status, 401);

  const otpRequest = await request('/api/auth/request-otp', {
    method: 'POST', body: { phone: '+919900000123' }
  });
  assert.equal(otpRequest.status, 200);
  assert.match(otpRequest.body.devOtp, /^\d{6}$/);
  const login = await request('/api/auth/verify-otp', {
    method: 'POST', body: { phone: '+919900000123', otp: otpRequest.body.devOtp, name: 'Insurance CI Patient' }
  });
  assert.equal(login.status, 200);
  const patientHeaders = { Authorization: 'Bearer ' + login.body.token };

  // Private file storage is a release prerequisite. Do not accept a policy upload
  // into a database record when secure object storage has not been configured.
  const policyWhenStorageMissing = await request('/api/insurance/policies', {
    method: 'POST', headers: patientHeaders,
    body: { insurerName: 'CI Insurer', policyType: 'individual', policyNumber: 'TEST1234' }
  });
  assert.equal(policyWhenStorageMissing.status, 503);
  assert.match(policyWhenStorageMissing.body.error, /storage and malware scanning must be configured/i);

  const intentWhenStorageMissing = await request('/api/insurance/policies/1/documents', {
    method: 'POST', headers: patientHeaders,
    body: { documentType: 'insurance_card', contentType: 'application/pdf', sizeBytes: 100, filename: 'card.pdf' }
  });
  assert.equal(intentWhenStorageMissing.status, 503);

  const patientCannotAccessAdminQueue = await request('/api/admin/insurance/policies', { headers: patientHeaders });
  assert.equal(patientCannotAccessAdminQueue.status, 401);

  const adminLogin = await request('/api/admin/login', {
    method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
  });
  assert.equal(adminLogin.status, 200);
  const adminHeaders = { Authorization: 'Bearer ' + adminLogin.body.token };
  const adminQueueWithoutDb = await request('/api/admin/insurance/policies', { headers: adminHeaders });
  assert.equal(adminQueueWithoutDb.status, 503);
});
