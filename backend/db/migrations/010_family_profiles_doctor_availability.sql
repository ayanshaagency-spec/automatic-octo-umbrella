-- Phase 10: Family profiles and doctor-published appointment availability.
-- Additive only: preserve existing patient, doctor, appointment and clinical records.

CREATE TABLE IF NOT EXISTS family_members (
  id BIGSERIAL PRIMARY KEY,
  owner_patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL,
  relationship VARCHAR(24) NOT NULL CHECK (relationship IN ('child','parent','spouse','sibling','other')),
  date_of_birth DATE NOT NULL,
  phone VARCHAR(30),
  consent_status VARCHAR(32) NOT NULL CHECK (consent_status IN ('guardian_managed','pending_member_verification','member_verified','revoked')),
  access_scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS family_members_owner_idx
  ON family_members(owner_patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS family_members_phone_idx
  ON family_members(phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS doctor_availability_slots (
  id BIGSERIAL PRIMARY KEY,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  slot_start TIMESTAMPTZ NOT NULL,
  duration_minutes SMALLINT NOT NULL DEFAULT 30 CHECK (duration_minutes IN (15,30,45,60)),
  created_by_phone VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS doctor_availability_unique_start_idx
  ON doctor_availability_slots(doctor_id, slot_start)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS doctor_availability_date_idx
  ON doctor_availability_slots(doctor_id, slot_start)
  WHERE cancelled_at IS NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS slot_id BIGINT REFERENCES doctor_availability_slots(id),
  ADD COLUMN IF NOT EXISTS family_member_id BIGINT REFERENCES family_members(id);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot_unique_idx
  ON appointments(slot_id)
  WHERE slot_id IS NOT NULL AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS appointments_family_member_idx
  ON appointments(family_member_id, appointment_at DESC)
  WHERE family_member_id IS NOT NULL;
