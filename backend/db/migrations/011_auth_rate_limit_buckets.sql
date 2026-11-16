BEGIN;

-- Shared authentication throttles for OTP requests and Admin login.
-- Identifiers are HMAC-derived by the application; raw IPs and email addresses
-- are not stored in this table.
CREATE TABLE IF NOT EXISTS auth_rate_limit_buckets (
  bucket_hash CHAR(64) PRIMARY KEY
    CHECK (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_buckets_expiry
  ON auth_rate_limit_buckets(expires_at);

COMMIT;
