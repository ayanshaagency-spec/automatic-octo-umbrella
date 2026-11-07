'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const PORT = 3924;
const BASE_URL = 'http://127.0.0.1:' + PORT;
const ADMIN_EMAIL = 'insurance-ci-admin@example.test';
const ADMIN_PASSWORD = 'ci-only-insurance-admin-password';
const JWT_SECRET = 'insurance-ci-jwt-secret-long-enough-for-hs256';
let server = null;
let output = '';

async function request(route, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(BASE_URL + route, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch (error) {
    throw new Error(`Request to ${route} failed (serverExit=${server?.exitCode}): ${error.message}\n${output}`);
  }
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

test('insurance endpoints enforce patient/admin auth and fail closed without private storage', async t => {
  server = spawn(process.execPath, ['src/server.js'], {
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
      INSURANCE_S3_ENDPOINT: '',
      INSURANCE_CLAMAV_HOST: '',
      INSURANCE_CLAMAV_PORT: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => server.kill());
  output = '';
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
  const readiness = await request('/api/insurance/status');
  assert.equal(readiness.status, 200);
  assert.deepEqual(Object.keys(readiness.body).sort(), ['storageConfigured', 'scannerConfigured', 'uploadsEnabled'].sort());
  assert.equal(readiness.body.storageConfigured, true);
  assert.equal(readiness.body.scannerConfigured, false);
  assert.equal(readiness.body.uploadsEnabled, false);
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

  // Policy metadata may be saved independently. File uploads remain blocked until
  // both private object storage and the malware scanner are configured.
  const policyWhenStorageMissing = await request('/api/insurance/policies', {
    method: 'POST', headers: patientHeaders,
    body: { insurerName: 'CI Insurer', policyType: 'individual', policyNumber: 'TEST1234' }
  });
  assert.equal(policyWhenStorageMissing.status, 503);
  assert.match(policyWhenStorageMissing.body.error, /database is not configured/i);

  const intentWhenScannerMissing = await request('/api/insurance/policies/1/documents', {
    method: 'POST', headers: patientHeaders,
    body: { documentType: 'insurance_card', contentType: 'application/pdf', sizeBytes: 100, filename: 'card.pdf' }
  });
  assert.equal(intentWhenScannerMissing.status, 503);
  assert.match(intentWhenScannerMissing.body.error, /storage and malware scanning must be configured/i);

  const completeWhenScannerMissing = await request('/api/insurance/documents/1/complete', {
    method: 'POST', headers: patientHeaders, body: {}
  });
  assert.equal(completeWhenScannerMissing.status, 503);
  assert.match(completeWhenScannerMissing.body.error, /storage and malware scanning must be configured/i);

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
