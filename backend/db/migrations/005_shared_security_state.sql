-- Shared, concurrency-safe OTP and API abuse-control state. Additive only.
CREATE TABLE IF NOT EXISTS auth_otp_state (
  phone VARCHAR(20) PRIMARY KEY,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS auth_otp_request_state (
  phone VARCHAR(20) PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  last_request_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS api_rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS api_rate_limit_reset_idx ON api_rate_limit_buckets(reset_at);
