'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { publicDocument, publicPolicy } = require('./insurance_serialization');

test('patient insurance response allow-lists metadata and excludes storage keys and signed URLs', () => {
  const result = publicPolicy({
    id: 7,
    insurerName: 'Example Insurer',
    policyType: 'family',
    policyNumberLast4: '9876',
    policyNumber: 'FULL-POLICY-NUMBER-SHOULD-NEVER-RETURN',
    objectKey: 'insurance-documents/private-object',
    uploadKey: 'insurance-uploads/pending-object',
    downloadUrl: 'https://private.example/signed-secret',
    patientId: 12,
    documents: [{
      id: 19,
      documentType: 'insurance_card',
      filename: 'card.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      status: 'submitted',
      scanStatus: 'clean',
      objectKey: 'insurance-documents/private-object',
      uploadKey: 'insurance-uploads/pending-object',
      downloadUrl: 'https://private.example/signed-secret'
    }]
  });

  assert.deepEqual(Object.keys(result).sort(), [
    'id', 'insurerName', 'policyType', 'policyNumberLast4',
    'policyExpiry', 'status', 'reviewNote', 'createdAt', 'updatedAt', 'documents'
  ].sort());
  assert.deepEqual(Object.keys(result.documents[0]).sort(), [
    'id', 'documentType', 'filename', 'contentType', 'sizeBytes',
    'status', 'scanStatus', 'createdAt', 'uploadedAt'
  ].sort());
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('insurance-documents/private-object'), false);
  assert.equal(serialized.includes('insurance-uploads/pending-object'), false);
  assert.equal(serialized.includes('signed-secret'), false);
  assert.equal(serialized.includes('FULL-POLICY-NUMBER'), false);
  assert.equal(result.policyNumberLast4, '9876');
});

test('admin and patient policy serialization handles absent document arrays safely', () => {
  const result = publicPolicy({
    id: 3,
    insurerName: 'Insurer',
    policyType: 'individual',
    policyNumberLast4: '1234',
    documents: 'not-an-array',
    internalAuditField: 'do-not-expose'
  });
  assert.deepEqual(result.documents, []);
  assert.equal(Object.hasOwn(result, 'internalAuditField'), false);
});

test('single-document serializer drops all unknown fields', () => {
  const result = publicDocument({
    id: 2,
    filename: 'report.pdf',
    objectKey: 'private-key',
    uploadKey: 'temporary-key',
    presignedPost: { fields: { credential: 'secret' } }
  });
  assert.deepEqual(Object.keys(result).sort(), [
    'id', 'documentType', 'filename', 'contentType', 'sizeBytes',
    'status', 'scanStatus', 'createdAt', 'uploadedAt'
  ].sort());
});
