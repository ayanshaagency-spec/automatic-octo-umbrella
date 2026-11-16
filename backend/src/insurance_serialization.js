'use strict';

// Explicit allow-list for patient/admin insurance metadata responses.
// Storage object keys, temporary upload keys, signed URLs and policy numbers
// must remain private implementation details.
function publicDocument(row = {}) {
  return {
    id: row.id,
    documentType: row.documentType,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    scanStatus: row.scanStatus,
    createdAt: row.createdAt,
    uploadedAt: row.uploadedAt
  };
}

function publicPolicy(row = {}) {
  return {
    id: row.id,
    insurerName: row.insurerName,
    policyType: row.policyType,
    policyNumberLast4: row.policyNumberLast4,
    policyExpiry: row.policyExpiry,
    status: row.status,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    documents: Array.isArray(row.documents) ? row.documents.map(publicDocument) : []
  };
}

module.exports = { publicDocument, publicPolicy };
