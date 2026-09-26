-- Phase 5 hardening: idempotency for payment creation.
-- Optional key keeps existing clients compatible; when supplied, it is unique per patient.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_patient_idempotency
  ON payments(patient_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
