-- Phase 8: health insurance metadata only. Binary files belong in a private S3-compatible bucket.
-- Never put patient-uploaded file bytes or credentials in PostgreSQL/GitHub.
CREATE TABLE IF NOT EXISTS insurance_policies (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
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
  policy_id INTEGER NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  document_type VARCHAR(32) NOT NULL
    CHECK (document_type IN ('policy_document','insurance_card','claim_bill','discharge_summary','prescription','lab_report','other')),
  original_filename VARCHAR(160) NOT NULL,
  content_type VARCHAR(80) NOT NULL
    CHECK (content_type IN ('application/pdf','image/jpeg','image/png')),
  expected_size_bytes INTEGER NOT NULL CHECK (expected_size_bytes > 0 AND expected_size_bytes <= 10485760),
  object_key VARCHAR(500) NOT NULL UNIQUE,
  upload_key VARCHAR(500) UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'upload_pending'
    CHECK (status IN ('upload_pending','submitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ,
  CONSTRAINT insurance_documents_uploaded_consistency
    CHECK ((status = 'upload_pending' AND uploaded_at IS NULL) OR (status = 'submitted' AND uploaded_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_insurance_documents_policy_created
  ON insurance_documents(policy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_documents_patient_created
  ON insurance_documents(patient_id, created_at DESC);
