-- Scope OTP challenges to the authentication role. Existing pending OTPs
-- are classified as patient challenges to preserve the legacy patient flow.
ALTER TABLE auth_otp_state
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(16) NOT NULL DEFAULT 'patient';
DO $$ BEGIN
  ALTER TABLE auth_otp_state ADD CONSTRAINT auth_otp_state_purpose_check
    CHECK (purpose IN ('patient', 'doctor'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
