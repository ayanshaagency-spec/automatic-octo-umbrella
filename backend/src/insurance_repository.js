'use strict';

const { getDb } = require('./db');
const { validatePolicyTransition, POLICY_STATUSES } = require('./insurance_validation');

function repositoryError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw repositoryError('Insurance records are not available because the database is not configured');
  return db;
}

async function findPatientId(phone) {
  const db = await requireDb();
  const result = await db.query('SELECT id FROM patients WHERE phone = $1', [String(phone).trim()]);
  if (!result.rowCount) throw repositoryError('Patient profile was not found. Please sign in again.', 404);
  return Number(result.rows[0].id);
}

async function createPolicy(patientId, policy) {
  const db = await requireDb();
  const result = await db.query(`
    INSERT INTO insurance_policies
      (patient_id, insurer_name, policy_type, policy_number_last4, policy_expiry, status)
    VALUES ($1, $2, $3, $4, $5, 'draft')
    RETURNING id, insurer_name AS "insurerName", policy_type AS "policyType",
      policy_number_last4 AS "policyNumberLast4", policy_expiry AS "policyExpiry",
      status, review_note AS "reviewNote", created_at AS "createdAt", updated_at AS "updatedAt"
  `, [patientId, policy.insurerName, policy.policyType, policy.policyNumberLast4, policy.policyExpiry]);
  return result.rows[0];
}

async function listPatientPolicies(patientId) {
  const db = await requireDb();
  const result = await db.query(`
    SELECT p.id, p.insurer_name AS "insurerName", p.policy_type AS "policyType",
      p.policy_number_last4 AS "policyNumberLast4", p.policy_expiry AS "policyExpiry",
      p.status, p.review_note AS "reviewNote", p.created_at AS "createdAt",
      p.updated_at AS "updatedAt",
      COALESCE(json_agg(json_build_object(
        'id', d.id, 'documentType', d.document_type, 'filename', d.original_filename,
        'contentType', d.content_type, 'sizeBytes', d.expected_size_bytes,
        'status', d.status, 'createdAt', d.created_at, 'uploadedAt', d.uploaded_at
      ) ORDER BY d.created_at DESC) FILTER (WHERE d.id IS NOT NULL), '[]') AS documents
    FROM insurance_policies p
    LEFT JOIN insurance_documents d ON d.policy_id = p.id
    WHERE p.patient_id = $1
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT 100
  `, [patientId]);
  return result.rows;
}

async function createDocumentIntent(patientId, policyId, document, objectKey) {
  const db = await requireDb();
  const policyResult = await db.query(
    'SELECT id, status FROM insurance_policies WHERE id = $1 AND patient_id = $2',
    [policyId, patientId]
  );
  if (!policyResult.rowCount) throw repositoryError('Insurance policy was not found', 404);
  if (!['draft', 'need_more_documents'].includes(policyResult.rows[0].status)) {
    throw repositoryError('Documents can only be added while a policy is a draft or needs more documents', 409);
  }

  const countResult = await db.query(
    'SELECT COUNT(*)::int AS count FROM insurance_documents WHERE policy_id = $1',
    [policyId]
  );
  if (Number(countResult.rows[0].count) >= 15) {
    throw repositoryError('A policy can contain at most 15 documents', 422);
  }

  const result = await db.query(`
    INSERT INTO insurance_documents
      (policy_id, patient_id, document_type, original_filename, content_type, expected_size_bytes, object_key)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, document_type AS "documentType", original_filename AS filename,
      content_type AS "contentType", expected_size_bytes AS "sizeBytes", status
  `, [policyId, patientId, document.documentType, document.filename,
       document.contentType, document.sizeBytes, objectKey]);
  return result.rows[0];
}

async function getDocumentForPatient(patientId, documentId) {
  const db = await requireDb();
  const result = await db.query(`
    SELECT d.id, d.policy_id AS "policyId", d.patient_id AS "patientId",
      d.document_type AS "documentType", d.original_filename AS filename,
      d.content_type AS "contentType", d.expected_size_bytes AS "sizeBytes",
      d.object_key AS "objectKey", d.status, p.status AS "policyStatus"
    FROM insurance_documents d
    JOIN insurance_policies p ON p.id = d.policy_id
    WHERE d.id = $1 AND d.patient_id = $2
  `, [documentId, patientId]);
  return result.rows[0] || null;
}

async function getDocumentForAdmin(documentId) {
  const db = await requireDb();
  const result = await db.query(`
    SELECT id, patient_id AS "patientId", document_type AS "documentType",
      original_filename AS filename, content_type AS "contentType",
      expected_size_bytes AS "sizeBytes", object_key AS "objectKey", status
    FROM insurance_documents WHERE id = $1
  `, [documentId]);
  return result.rows[0] || null;
}

async function markDocumentSubmitted(patientId, documentId) {
  const db = await requireDb();
  const current = await getDocumentForPatient(patientId, documentId);
  if (!current) throw repositoryError('Insurance document was not found', 404);
  if (current.status === 'submitted') return current;

  const result = await db.query(`
    UPDATE insurance_documents SET status = 'submitted', uploaded_at = NOW()
    WHERE id = $1 AND patient_id = $2 AND status = 'upload_pending'
    RETURNING id, policy_id AS "policyId", patient_id AS "patientId",
      document_type AS "documentType", original_filename AS filename,
      content_type AS "contentType", expected_size_bytes AS "sizeBytes",
      object_key AS "objectKey", status
  `, [documentId, patientId]);
  if (!result.rowCount) throw repositoryError('Insurance document state changed; refresh and try again', 409);

  await db.query(`
    UPDATE insurance_policies SET status = 'submitted', review_note = NULL,
      reviewed_by = NULL, updated_at = NOW()
    WHERE id = $1 AND patient_id = $2 AND status IN ('draft', 'need_more_documents')
  `, [current.policyId, patientId]);
  return result.rows[0];
}

async function listAdminPolicies(status = null) {
  const db = await requireDb();
  if (status && !POLICY_STATUSES.has(status)) {
    throw repositoryError('Invalid insurance policy status filter', 422);
  }
  const values = [];
  const where = [];
  if (status) {
    values.push(status);
    where.push(`p.status = $1`);
  }
  const result = await db.query(`
    SELECT p.id, p.patient_id AS "patientId", pt.name AS "patientName", pt.phone AS "patientPhone",
      p.insurer_name AS "insurerName", p.policy_type AS "policyType",
      p.policy_number_last4 AS "policyNumberLast4", p.policy_expiry AS "policyExpiry",
      p.status, p.review_note AS "reviewNote", p.reviewed_by AS "reviewedBy",
      p.created_at AS "createdAt", p.updated_at AS "updatedAt",
      COALESCE(json_agg(json_build_object(
        'id', d.id, 'documentType', d.document_type, 'filename', d.original_filename,
        'contentType', d.content_type, 'sizeBytes', d.expected_size_bytes,
        'status', d.status, 'createdAt', d.created_at, 'uploadedAt', d.uploaded_at
      ) ORDER BY d.created_at DESC) FILTER (WHERE d.id IS NOT NULL), '[]') AS documents
    FROM insurance_policies p
    JOIN patients pt ON pt.id = p.patient_id
    LEFT JOIN insurance_documents d ON d.policy_id = p.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY p.id, pt.id
    ORDER BY p.created_at DESC
    LIMIT 200
  `, values);
  return result.rows;
}

async function reviewPolicy(policyId, nextStatus, reviewNote, reviewer) {
  const db = await requireDb();
  const currentResult = await db.query('SELECT status FROM insurance_policies WHERE id = $1', [policyId]);
  if (!currentResult.rowCount) throw repositoryError('Insurance policy was not found', 404);
  const currentStatus = currentResult.rows[0].status;
  const invalid = validatePolicyTransition(currentStatus, nextStatus);
  if (invalid) throw repositoryError(invalid, 422);
  if (['need_more_documents', 'rejected'].includes(nextStatus) && !reviewNote) {
    throw repositoryError('A review note is required for this status', 422);
  }
  const result = await db.query(`
    UPDATE insurance_policies
       SET status = $1, review_note = $2, reviewed_by = $3, updated_at = NOW()
     WHERE id = $4 AND status = $5
     RETURNING id, insurer_name AS "insurerName", status,
       review_note AS "reviewNote", reviewed_by AS "reviewedBy", updated_at AS "updatedAt"
  `, [nextStatus, reviewNote || null, String(reviewer || '').slice(0, 255) || 'admin', policyId, currentStatus]);
  if (!result.rowCount) throw repositoryError('Insurance policy changed during review; refresh and try again', 409);
  return result.rows[0];
}

module.exports = {
  findPatientId,
  createPolicy,
  listPatientPolicies,
  createDocumentIntent,
  getDocumentForPatient,
  getDocumentForAdmin,
  markDocumentSubmitted,
  listAdminPolicies,
  reviewPolicy
};
