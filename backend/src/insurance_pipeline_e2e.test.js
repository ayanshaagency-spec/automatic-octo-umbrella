'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand
} = require('@aws-sdk/client-s3');

const enabled = process.env.INSURANCE_PIPELINE_E2E === '1';
const PORT = 3926;
const BASE_URL = 'http://127.0.0.1:' + PORT;
const BUCKET = process.env.INSURANCE_S3_BUCKET || 'insurance-ci-documents';

async function request(route, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(BASE_URL + route, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body, response };
}

async function createUpload(intent, bytes, contentType, filename) {
  const data = new FormData();
  Object.entries(intent.uploadFields || {}).forEach(([key, value]) => data.append(key, value));
  data.append('file', new Blob([bytes], { type: contentType }), filename);
  return fetch(intent.uploadUrl, { method: 'POST', body: data });
}

function makeEmbeddedTestSignaturePdf() {
  // Uncompressed EmbeddedFile stream lets ClamAV scan a harmless test-only signature.
  const eicar = Buffer.from('AYANSHA-CLAMAV-TEST-INFECTED', 'ascii');
  const objects = [
    Buffer.from('1 0 obj\\n<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles 6 0 R >> >>\\nendobj\\n'),
    Buffer.from('2 0 obj\\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\\nendobj\\n'),
    Buffer.from('3 0 obj\\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> >>\\nendobj\\n'),
    Buffer.from('4 0 obj\\n<< /Type /Filespec /F (eicar.txt) /EF << /F 5 0 R >> >>\\nendobj\\n'),
    Buffer.concat([
      Buffer.from('5 0 obj\\n<< /Type /EmbeddedFile /Length ' + eicar.length + ' >>\\nstream\\n', 'ascii'),
      eicar,
      Buffer.from('\\nendstream\\nendobj\\n', 'ascii')
    ]),
    Buffer.from('6 0 obj\\n<< /Names [(eicar.txt) 4 0 R] >>\\nendobj\\n')
  ];
  const parts = [Buffer.from('%PDF-1.4\\n', 'ascii')];
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.concat(parts).length);
    parts.push(object);
  }
  const xrefOffset = Buffer.concat(parts).length;
  parts.push(Buffer.from('xref\\n0 7\\n0000000000 65535 f \\n', 'ascii'));
  for (const offset of offsets.slice(1)) {
    parts.push(Buffer.from(String(offset).padStart(10, '0') + ' 00000 n \\n', 'ascii'));
  }
  parts.push(Buffer.from('trailer\\n<< /Size 7 /Root 1 0 R >>\\nstartxref\\n' + xrefOffset + '\\n%%EOF\\n', 'ascii'));
  return Buffer.concat(parts);
}

test('insurance private upload + real ClamAV scan + quarantine end-to-end', { skip: !enabled }, async t => {
  assert.ok(process.env.DATABASE_URL, 'isolated PostgreSQL DATABASE_URL is required');
  assert.ok(process.env.INSURANCE_CLAMAV_HOST, 'private ClamAV endpoint is required');
  assert.ok(process.env.INSURANCE_S3_ENDPOINT, 'ephemeral S3-compatible endpoint is required');

  const storageClient = new S3Client({
    region: process.env.INSURANCE_S3_REGION || 'us-east-1',
    endpoint: process.env.INSURANCE_S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.INSURANCE_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.INSURANCE_S3_SECRET_ACCESS_KEY
    },
    maxAttempts: 2
  });
  await storageClient.send(new CreateBucketCommand({ Bucket: BUCKET }));
  t.after(async () => {
    try { await storageClient.send(new DeleteBucketCommand({ Bucket: BUCKET })); } catch (_) {}
    storageClient.destroy();
  });

  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'test',
    JWT_SECRET: process.env.JWT_SECRET || 'ci-only-insurance-private-storage-test-secret',
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'insurance-ci-admin@example.test',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'ci-only-insurance-admin-password'
  };
  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => server.kill());
  let output = '';
  server.stdout.on('data', chunk => { output += chunk.toString(); });
  server.stderr.on('data', chunk => { output += chunk.toString(); });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error('API exited before readiness: ' + output.slice(-2000));
    try {
      const health = await fetch(BASE_URL + '/health');
      if (health.ok) { ready = true; break; }
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(ready, true, 'API should start against isolated database and private storage');

  const phone = '+919' + String(Date.now()).slice(-9);
  const otp = await request('/api/auth/request-otp', { method: 'POST', body: { phone } });
  assert.equal(otp.status, 200);
  const login = await request('/api/auth/verify-otp', {
    method: 'POST',
    body: { phone, otp: otp.body.devOtp, name: 'Synthetic Insurance E2E Patient' }
  });
  assert.equal(login.status, 200);
  const patientHeaders = { Authorization: 'Bearer ' + login.body.token };

  const policy = await request('/api/insurance/policies', {
    method: 'POST',
    headers: patientHeaders,
    body: {
      insurerName: 'Synthetic E2E Insurance',
      policyType: 'individual',
      policyNumber: 'E2E-POLICY-12345678',
      policyExpiry: '2027-12-31'
    }
  });
  assert.equal(policy.status, 201, JSON.stringify(policy.body));
  assert.equal(policy.body.policyNumberLast4, '5678');
  assert.equal(Object.hasOwn(policy.body, 'policyNumber'), false);
  const policyId = Number(policy.body.id);

  const cleanPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'ascii');
  const intent = await request('/api/insurance/policies/' + policyId + '/documents', {
    method: 'POST',
    headers: patientHeaders,
    body: {
      documentType: 'policy_document',
      filename: 'synthetic-policy.pdf',
      contentType: 'application/pdf',
      sizeBytes: cleanPdf.length
    }
  });
  assert.equal(intent.status, 201, JSON.stringify(intent.body));
  const upload = await createUpload(intent.body, cleanPdf, 'application/pdf', 'synthetic-policy.pdf');
  assert.ok(upload.ok, 'S3-compatible private storage should accept the signed POST; HTTP ' + upload.status);
  const completed = await request('/api/insurance/documents/' + intent.body.document.id + '/complete', {
    method: 'POST',
    headers: patientHeaders,
    body: {}
  });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.status, 'submitted');

  const patientRecords = await request('/api/insurance/policies', { headers: patientHeaders });
  assert.equal(patientRecords.status, 200);
  const submitted = patientRecords.body.find(p => Number(p.id) === policyId);
  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.documents[0].status, 'submitted');
  assert.equal(submitted.documents[0].scanStatus, 'clean');

  const download = await request('/api/insurance/documents/' + intent.body.document.id + '/download', { headers: patientHeaders });
  assert.equal(download.status, 200);
  const downloaded = await fetch(download.body.downloadUrl);
  assert.equal(downloaded.status, 200);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), cleanPdf);

  // The custom ClamAV signature is CI-only and has no malware payload.
  const infectedPdf = makeEmbeddedTestSignaturePdf();
  const infectedIntent = await request('/api/insurance/policies/' + policyId + '/documents', {
    method: 'POST',
    headers: patientHeaders,
    body: {
      documentType: 'other',
      filename: 'synthetic-scan-test.pdf',
      contentType: 'application/pdf',
      sizeBytes: infectedPdf.length
    }
  });
  assert.equal(infectedIntent.status, 201, JSON.stringify(infectedIntent.body));
  const infectedUpload = await createUpload(infectedIntent.body, infectedPdf, 'application/pdf', 'synthetic-eicar-test.pdf');
  assert.ok(infectedUpload.ok, 'private storage should accept the scanner test fixture');
  const rejected = await request('/api/insurance/documents/' + infectedIntent.body.document.id + '/complete', {
    method: 'POST',
    headers: patientHeaders,
    body: {}
  });
  assert.equal(rejected.status, 422, JSON.stringify(rejected.body));
  assert.match(rejected.body.error, /did not pass the security scan/i);

  const afterScan = await request('/api/insurance/policies', { headers: patientHeaders });
  const updatedPolicy = afterScan.body.find(p => Number(p.id) === policyId);
  const quarantined = updatedPolicy.documents.find(d => Number(d.id) === Number(infectedIntent.body.document.id));
  assert.equal(quarantined.status, 'quarantined');
  assert.equal(quarantined.scanStatus, 'infected');
  assert.equal(updatedPolicy.status, 'need_more_documents');

  const patientCannotDownloadQuarantine = await request(
    '/api/insurance/documents/' + infectedIntent.body.document.id + '/download',
    { headers: patientHeaders }
  );
  assert.equal(patientCannotDownloadQuarantine.status, 404);

  const adminLogin = await request('/api/admin/login', {
    method: 'POST',
    body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }
  });
  assert.equal(adminLogin.status, 200);
  const adminHeaders = { Authorization: 'Bearer ' + adminLogin.body.token };
  const adminCannotDownloadQuarantine = await request(
    '/api/insurance/documents/' + infectedIntent.body.document.id + '/download',
    { headers: adminHeaders }
  );
  assert.equal(adminCannotDownloadQuarantine.status, 404);

  const adminQueue = await request('/api/admin/insurance/policies?status=need_more_documents', { headers: adminHeaders });
  assert.equal(adminQueue.status, 200);
  const reviewedRow = adminQueue.body.find(p => Number(p.id) === policyId);
  assert.ok(reviewedRow, 'Admin queue should show the policy requiring another document');
  assert.ok(reviewedRow.documents.some(d => d.status === 'quarantined' && d.scanStatus === 'infected'));
});
