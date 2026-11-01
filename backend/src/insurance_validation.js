'use strict';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const DOCUMENT_TYPES = new Set([
  'policy_document', 'insurance_card', 'claim_bill', 'discharge_summary',
  'prescription', 'lab_report', 'other'
]);
const POLICY_TYPES = new Set(['individual', 'family', 'group', 'other']);
const POLICY_STATUSES = new Set([
  'draft', 'submitted', 'under_review', 'need_more_documents', 'verified', 'rejected'
]);
const STATUS_TRANSITIONS = {
  draft: new Set(['submitted']),
  submitted: new Set(['under_review', 'need_more_documents', 'rejected']),
  under_review: new Set(['verified', 'need_more_documents', 'rejected']),
  need_more_documents: new Set(['under_review', 'rejected']),
  verified: new Set(['under_review']),
  rejected: new Set()
};

function validatePolicyInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Invalid policy details' };
  const insurerName = typeof data.insurerName === 'string' ? data.insurerName.trim() : '';
  if (!insurerName || insurerName.length > 160) return { error: 'insurerName is required (maximum 160 characters)' };

  const policyNumber = typeof data.policyNumber === 'string' ? data.policyNumber.trim() : '';
  const compactPolicyNumber = policyNumber.replace(/[\s-]/g, '');
  if (!/^[A-Za-z0-9]{4,80}$/.test(compactPolicyNumber)) {
    return { error: 'policyNumber must contain 4 to 80 letters or numbers' };
  }

  const policyType = String(data.policyType || 'individual');
  if (!POLICY_TYPES.has(policyType)) return { error: 'Invalid policyType' };

  let policyExpiry = null;
  if (data.policyExpiry !== undefined && data.policyExpiry !== null && data.policyExpiry !== '') {
    const value = String(data.policyExpiry);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value) {
      return { error: 'policyExpiry must be a valid YYYY-MM-DD date' };
    }
    policyExpiry = value;
  }

  // The full policy number is deliberately not persisted; only its last four characters are kept.
  return {
    value: {
      insurerName,
      policyType,
      policyNumberLast4: compactPolicyNumber.slice(-4).toUpperCase(),
      policyExpiry
    }
  };
}

function sanitizeFilename(value) {
  if (typeof value !== 'string') return null;
  const base = value.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!base || base.length > 160 || base === '.' || base === '..') return null;
  return base;
}

function validateDocumentInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Invalid document details' };
  const documentType = String(data.documentType || '');
  if (!DOCUMENT_TYPES.has(documentType)) return { error: 'Invalid documentType' };
  const contentType = String(data.contentType || '').toLowerCase().trim();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) return { error: 'Only PDF, JPEG, and PNG files are supported' };
  const sizeBytes = Number(data.sizeBytes);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_DOCUMENT_BYTES) {
    return { error: 'Document size must be between 1 byte and 10 MB' };
  }
  const filename = sanitizeFilename(data.filename);
  if (!filename) return { error: 'A valid filename is required (maximum 160 characters)' };
  return { value: { documentType, contentType, sizeBytes, filename } };
}

function validatePolicyTransition(currentStatus, nextStatus) {
  if (!POLICY_STATUSES.has(nextStatus)) return 'Invalid insurance policy status';
  if (!STATUS_TRANSITIONS[currentStatus]) return 'Current insurance policy status is invalid';
  if (!STATUS_TRANSITIONS[currentStatus].has(nextStatus)) {
    return 'Cannot change insurance policy status from ' + currentStatus + ' to ' + nextStatus;
  }
  return null;
}

module.exports = {
  MAX_DOCUMENT_BYTES,
  ALLOWED_CONTENT_TYPES,
  DOCUMENT_TYPES,
  POLICY_TYPES,
  POLICY_STATUSES,
  STATUS_TRANSITIONS,
  validatePolicyInput,
  validateDocumentInput,
  sanitizeFilename,
  validatePolicyTransition
};
