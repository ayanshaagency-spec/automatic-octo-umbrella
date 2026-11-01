-- Shared, privacy-preserving OTP challenge and request-rate storage.
-- Stores HMAC hashes only; raw phone numbers and OTP codes are never persisted.
-- Idempotent and additive: does not modify existing patient or pharmacy records.

BEGIN;

CREATE TABLE IF NOT EXISTS patient_otp_challenges (
  phone_hash TEXT PRIMARY KEY CHECK (length(phone_hash) = 64),
  challenge_id UUID NOT NULL,
  otp_hash TEXT NOT NULL CHECK (length(otp_hash) = 64),
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 4),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_otp_challenges_expiry
  ON patient_otp_challenges (expires_at);

CREATE TABLE IF NOT EXISTS patient_otp_request_events (
  id BIGSERIAL PRIMARY KEY,
  phone_hash TEXT NOT NULL CHECK (length(phone_hash) = 64),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_otp_request_events_phone_time
  ON patient_otp_request_events (phone_hash, requested_at);

CREATE INDEX IF NOT EXISTS idx_patient_otp_request_events_time
  ON patient_otp_request_events (requested_at);

COMMIT;
