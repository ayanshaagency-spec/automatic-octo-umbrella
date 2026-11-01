-- Phase 8: health insurance metadata only. Binary files belong in a private S3-compatible bucket.
-- Never put patient-uploaded file bytes or credentials in PostgreSQL/GitHub.
CREATE TABLE IF NOT EXISTS insurance_policies (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  insurer_name VARCHAR(160) NOT NULL,
  policy_type VARCHAR(20) NOT NULL CHECK (policy_type IN ('individual','family','group','other')),
  policy_number_last4 VARCHAR(4) NOT NULL,
  policy_expiry DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','under_review','need_more_documents','verified','rejected')),
  review_note VARCHAR(500),
  reviewed_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insurance_policies_patient_created
  ON insurance_policies(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_status_created
  ON insurance_policies(status, created_at DESC);

CREATE TABLE IF NOT EXISTS insurance_documents (
  id SERIAL PRIMARY KEY,
  policy_id INTEGER NOT NULL REFERENCES insurance_policies(id) ON DELETE RESTRICT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  document_type VARCHAR(32) NOT NULL
    CHECK (document_type IN ('policy_document','insurance_card','claim_bill','discharge_summary','prescription','lab_report','other')),
  original_filename VARCHAR(160) NOT NULL,
  content_type VARCHAR(80) NOT NULL
    CHECK (content_type IN ('application/pdf','image/jpeg','image/png')),
  expected_size_bytes INTEGER NOT NULL CHECK (expected_size_bytes > 0 AND expected_size_bytes <= 10485760),
  object_key VARCHAR(500) NOT NULL UNIQUE,
  upload_key VARCHAR(500) UNIQUE,
  scan_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending','clean','infected','error')),
  status VARCHAR(24) NOT NULL DEFAULT 'upload_pending'
    CHECK (status IN ('upload_pending','submitted','quarantined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ,
  CONSTRAINT insurance_documents_uploaded_consistency
    CHECK ((status = 'upload_pending' AND uploaded_at IS NULL) OR (status IN ('submitted','quarantined') AND uploaded_at IS NOT NULL)),
  CONSTRAINT insurance_documents_scan_state_consistency
    CHECK ((status = 'submitted' AND scan_status = 'clean') OR (status = 'upload_pending' AND scan_status = 'pending') OR (status = 'quarantined' AND scan_status IN ('infected','error')))
);

CREATE INDEX IF NOT EXISTS idx_insurance_documents_policy_created
  ON insurance_documents(policy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_documents_patient_created
  ON insurance_documents(patient_id, created_at DESC);
