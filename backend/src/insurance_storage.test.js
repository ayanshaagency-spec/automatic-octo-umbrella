'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectContentType, isStorageConfigured, makeObjectKey, makeUploadKey } = require('./insurance_storage');

test('insurance document file signature detection recognises supported formats', () => {
  assert.equal(detectContentType(Buffer.from('%PDF-1.7\n')), 'application/pdf');
  assert.equal(
    detectContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])),
    'image/png'
  );
  assert.equal(detectContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])), 'image/jpeg');
  assert.equal(detectContentType(Buffer.from('not an allowed file')), null);
  assert.equal(detectContentType(Buffer.from([0x00, 0x01])), null);
});

test('insurance object keys are opaque and do not include patient identifiers or filenames', () => {
  const key = makeObjectKey();
  assert.match(key, /^insurance-documents\/[0-9a-f-]{36}$/i);
  assert.equal(key.includes('patient'), false);
  assert.equal(key.includes('.pdf'), false);
});

test('temporary and final object keys use distinct private prefixes', () => {
  assert.match(makeUploadKey(), /^insurance-uploads\\/[0-9a-f-]{36}$/i);
  assert.match(makeObjectKey(), /^insurance-documents\\/[0-9a-f-]{36}$/i);
});

test('private insurance storage fails closed when storage secrets are not configured', () => {
  const names = [
    'INSURANCE_S3_BUCKET', 'INSURANCE_S3_REGION',
    'INSURANCE_S3_ACCESS_KEY_ID', 'INSURANCE_S3_SECRET_ACCESS_KEY',
    'INSURANCE_S3_ENDPOINT', 'INSURANCE_S3_FORCE_PATH_STYLE'
  ];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.equal(isStorageConfigured(), false);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
