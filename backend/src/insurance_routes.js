'use strict';

const { verifyToken } = require('./auth');
const { verifyRoleToken } = require('./roles');
const {
  validatePolicyInput,
  validateDocumentInput,
  validatePolicyTransition,
  MAX_DOCUMENT_BYTES,
  POLICY_STATUSES
} = require('./insurance_validation');
const repository = require('./insurance_repository');
const storage = require('./insurance_storage');
const scanner = require('./insurance_scanner');

function readBearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function getPatient(req) {
  const payload = verifyToken(readBearerToken(req));
  // Admin/doctor role tokens must never be accepted as patient sessions.
  if (!payload || payload.role || !payload.sub) return null;
  return { phone: String(payload.sub) };
}

function getAdmin(req) {
  const payload = verifyRoleToken(readBearerToken(req), 'admin');
  return payload ? { subject: String(payload.sub) } : null;
}

function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 64 * 1024) tooLarge = true;
    });
    req.on('end', () => {
      if (tooLarge) return resolve({ error: { statusCode: 413, message: 'Request body is too large' } });
      try { resolve({ value: JSON.parse(body || '{}') }); }
      catch (_) { resolve({ error: { statusCode: 400, message: 'Invalid JSON' } }); }
    });
    req.on('error', () => resolve({ error: { statusCode: 400, message: 'Unable to read request body' } }));
  });
}

function publicPolicy(row) {
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
    documents: row.documents || []
  };
}

function errorStatus(error) {
  return Number.isInteger(error?.statusCode) ? error.statusCode : 503;
}

async function handleInsuranceRoute(req, res, url, context) {
  const send = (status, body) => context.send(status, body);
  const pathname = url.pathname;

  const patientCollection = pathname === '/api/insurance/policies';
  const patientCreateDocument = pathname.match(/^\/api\/insurance\/policies\/(\d+)\/documents$/);
  const patientCompleteDocument = pathname.match(/^\/api\/insurance\/documents\/(\d+)\/complete$/);
  const documentDownload = pathname.match(/^\/api\/insurance\/documents\/(\d+)\/download$/);
  const adminCollection = pathname === '/api/admin/insurance/policies';
  const adminReview = pathname.match(/^\/api\/admin\/insurance\/policies\/(\d+)\/status$/);

  if (!(patientCollection || patientCreateDocument || patientCompleteDocument ||
        documentDownload || adminCollection || adminReview)) return false;

  try {
    if (patientCollection && req.method === 'GET') {
      const patient = getPatient(req);
      if (!patient) { send(401, { error: 'Patient authentication required' }); return true; }
      const patientId = await repository.findPatientId(patient.phone);
      const policies = await repository.listPatientPolicies(patientId);
      send(200, policies.map(publicPolicy));
      return true;
    }

    if (patientCollection && req.method === 'POST') {
      const patient = getPatient(req);
      if (!patient) { send(401, { error: 'Patient authentication required' }); return true; }
      if (!storage.isStorageConfigured() || !scanner.isScannerConfigured()) {
        send(503, { error: 'Private document storage and malware scanning must be configured before insurance submission is enabled' });
        return true;
      }
      const parsed = await parseBody(req);
      if (parsed.error) { send(parsed.error.statusCode, { error: parsed.error.message }); return true; }
      const validated = validatePolicyInput(parsed.value);
      if (validated.error) { send(422, { error: validated.error }); return true; }
      const patientId = await repository.findPatientId(patient.phone);
      const policy = await repository.createPolicy(patientId, validated.value);
      send(201, publicPolicy({ ...policy, documents: [] }));
      return true;
    }

    if (patientCreateDocument && req.method === 'POST') {
      const patient = getPatient(req);
      if (!patient) { send(401, { error: 'Patient authentication required' }); return true; }
      if (!storage.isStorageConfigured() || !scanner.isScannerConfigured()) {
        send(503, { error: 'Private document storage and malware scanning must be configured before insurance submission is enabled' });
        return true;
      }
      const parsed = await parseBody(req);
      if (parsed.error) { send(parsed.error.statusCode, { error: parsed.error.message }); return true; }
      const validated = validateDocumentInput(parsed.value);
      if (validated.error) { send(422, { error: validated.error }); return true; }
      const patientId = await repository.findPatientId(patient.phone);
      const objectKey = storage.makeObjectKey();
      const uploadKey = storage.makeUploadKey();
      // The signed form writes only to a temporary key; completion promotes it to a different final key.
      const uploadForm = await storage.createUploadForm({ objectKey: uploadKey, contentType: validated.value.contentType });
      const document = await repository.createDocumentIntent(
        patientId, Number(patientCreateDocument[1]), validated.value, objectKey, uploadKey
      );
      send(201, {
        document,
        uploadUrl: uploadForm.url,
        uploadMethod: 'POST',
        uploadFields: uploadForm.fields,
        expiresInSeconds: 300,
        maxSizeBytes: MAX_DOCUMENT_BYTES
      });
      return true;
    }

    if (patientCompleteDocument && req.method === 'POST') {
      const patient = getPatient(req);
      if (!patient) { send(401, { error: 'Patient authentication required' }); return true; }
      if (!storage.isStorageConfigured() || !scanner.isScannerConfigured()) {
        send(503, { error: 'Private document storage and malware scanning must be configured before insurance submission is enabled' });
        return true;
      }
      const patientId = await repository.findPatientId(patient.phone);
      const documentId = Number(patientCompleteDocument[1]);
      const document = await repository.getDocumentForPatient(patientId, documentId);
      if (!document) { send(404, { error: 'Insurance document was not found' }); return true; }
      if (document.status === 'submitted') { send(200, { id: document.id, status: document.status }); return true; }
      let stored;
      try {
        stored = await storage.inspectObject({ objectKey: document.uploadKey });
      } catch (_) {
        send(422, { error: 'Uploaded document was not found. Please upload the file again.' });
        return true;
      }
      if (stored.sizeBytes !== Number(document.sizeBytes) || stored.sizeBytes < 1 ||
          stored.sizeBytes > MAX_DOCUMENT_BYTES || stored.contentType !== document.contentType || stored.detectedContentType !== document.contentType) {
        send(422, { error: 'Uploaded file size or type did not match the upload request' });
        return true;
      }

      // Scan before a file reaches the submitted/final prefix. Scanner errors fail closed and are quarantined too.
      let scanResult;
      try {
        const objectStream = await storage.openObjectStream({ objectKey: document.uploadKey });
        scanResult = await scanner.scanStream(objectStream, { maxBytes: MAX_DOCUMENT_BYTES });
      } catch (_) {
        const quarantineKey = storage.makeQuarantineKey();
        try {
          await storage.promoteUpload({ uploadKey: document.uploadKey, objectKey: quarantineKey });
          await repository.markDocumentQuarantined(patientId, documentId, quarantineKey, 'error');
          await storage.deleteObject({ objectKey: document.uploadKey }).catch(() => {});
        } catch (_) {
          // Object remains in the private temporary prefix and must never be submitted or downloaded.
        }
        send(503, { error: 'The security scan could not be completed. The document was not accepted; please retry with a new upload later.' });
        return true;
      }

      if (scanResult.status !== 'clean') {
        const quarantineKey = storage.makeQuarantineKey();
        try {
          await storage.promoteUpload({ uploadKey: document.uploadKey, objectKey: quarantineKey });
          await repository.markDocumentQuarantined(patientId, documentId, quarantineKey, 'infected');
          await storage.deleteObject({ objectKey: document.uploadKey }).catch(() => {});
        } catch (_) {
          // Never promote into the submitted prefix when malware is detected.
        }
        send(422, { error: 'This file did not pass the security scan and was not accepted. Please choose another file.' });
        return true;
      }

      await storage.promoteUpload({ uploadKey: document.uploadKey, objectKey: document.objectKey });
      let saved;
      try {
        saved = await repository.markDocumentSubmitted(patientId, documentId);
      } catch (error) {
        await storage.deleteObject({ objectKey: document.objectKey }).catch(() => {});
        throw error;
      }
      // The upload form can remain valid briefly, so remove the temporary key after promotion.
      await storage.deleteObject({ objectKey: document.uploadKey }).catch(() => {});
      send(200, { id: saved.id, status: saved.status });
      return true;
    }

    if (documentDownload && req.method === 'GET') {
      const patient = getPatient(req);
      const admin = patient ? null : getAdmin(req);
      if (!patient && !admin) { send(401, { error: 'Authentication required' }); return true; }
      if (!storage.isStorageConfigured()) {
        send(503, { error: 'Private insurance document storage is not configured yet' });
        return true;
      }
      let document;
      if (patient) {
        const patientId = await repository.findPatientId(patient.phone);
        document = await repository.getDocumentForPatient(patientId, Number(documentDownload[1]));
      } else {
        document = await repository.getDocumentForAdmin(Number(documentDownload[1]));
      }
      if (!document || document.status !== 'submitted' || document.scanStatus !== 'clean') {
        send(404, { error: 'Insurance document was not found' });
        return true;
      }
      const downloadUrl = await storage.createDownloadUrl({
        objectKey: document.objectKey,
        filename: document.filename
      });
      send(200, { downloadUrl, expiresInSeconds: 60 });
      return true;
    }

    if (adminCollection && req.method === 'GET') {
      const admin = getAdmin(req);
      if (!admin) { send(401, { error: 'Admin authentication required' }); return true; }
      const status = url.searchParams.get('status') || null;
      if (status && !POLICY_STATUSES.has(status)) {
        send(422, { error: 'Invalid insurance policy status filter' });
        return true;
      }
      const policies = await repository.listAdminPolicies(status);
      send(200, policies.map(policy => ({
        ...publicPolicy(policy),
        patientId: policy.patientId,
        patientName: policy.patientName,
        patientPhone: policy.patientPhone,
        reviewedBy: policy.reviewedBy
      })));
      return true;
    }

    if (adminReview && req.method === 'PATCH') {
      const admin = getAdmin(req);
      if (!admin) { send(401, { error: 'Admin authentication required' }); return true; }
      const parsed = await parseBody(req);
      if (parsed.error) { send(parsed.error.statusCode, { error: parsed.error.message }); return true; }
      const status = String(parsed.value.status || '');
      const reviewNote = typeof parsed.value.reviewNote === 'string' ? parsed.value.reviewNote.trim() : '';
      if (reviewNote.length > 500) { send(422, { error: 'reviewNote must be 500 characters or fewer' }); return true; }
      // Require explanatory notes for rejection / missing-document outcomes.
      if (['need_more_documents', 'rejected'].includes(status) && !reviewNote) {
        send(422, { error: 'A review note is required for this status' });
        return true;
      }
      const result = await repository.reviewPolicy(Number(adminReview[1]), status, reviewNote, admin.subject);
      send(200, result);
      return true;
    }

    return false;
  } catch (error) {
    if (error && Number.isInteger(error.statusCode)) {
      send(error.statusCode, { error: error.message });
    } else {
      // Do not leak storage credentials, object keys, database details, or signed URLs in error responses.
      send(503, { error: 'Insurance service is temporarily unavailable' });
    }
    return true;
  }
}

module.exports = { handleInsuranceRoute };
