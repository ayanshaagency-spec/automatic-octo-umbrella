-- Phase 3: digital prescriptions + patient health records
-- Safe upgrade: supports databases that already have the legacy prescriptions table
-- from backend/db/schema.sql.

CREATE TABLE IF NOT EXISTS prescriptions (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id INTEGER REFERENCES doctors(id) ON DELETE RESTRICT,
  diagnosis TEXT,
  notes TEXT,
  prescribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade the legacy prescriptions table when it already exists.
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS patient_id INTEGER;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS doctor_id INTEGER;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS diagnosis TEXT;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS prescribed_at TIMESTAMPTZ;

-- Backfill new prescription ownership fields from the appointment relationship.
UPDATE prescriptions p
   SET patient_id = a.patient_id,
       doctor_id = a.doctor_id
  FROM appointments a
 WHERE p.appointment_id = a.id
   AND (p.patient_id IS NULL OR p.doctor_id IS NULL);

UPDATE prescriptions
   SET prescribed_at = COALESCE(prescribed_at, created_at, NOW())
 WHERE prescribed_at IS NULL;

-- Legacy rows may not have a diagnosis. Keep the upgrade deployable and require
-- diagnosis only for newly-created prescriptions at the API layer.
ALTER TABLE prescriptions ALTER COLUMN prescribed_at SET DEFAULT NOW();
ALTER TABLE prescriptions ALTER COLUMN prescribed_at SET NOT NULL;

-- Add foreign keys only if the columns are not already constrained.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prescriptions_patient_id_fkey'
      AND conrelid = 'prescriptions'::regclass
  ) THEN
    ALTER TABLE prescriptions
      ADD CONSTRAINT prescriptions_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prescriptions_doctor_id_fkey'
      AND conrelid = 'prescriptions'::regclass
  ) THEN
    ALTER TABLE prescriptions
      ADD CONSTRAINT prescriptions_doctor_id_fkey
      FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS prescription_items (
  id SERIAL PRIMARY KEY,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  duration TEXT NOT NULL,
  instructions TEXT
);

CREATE TABLE IF NOT EXISTS health_records (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  record_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id, prescribed_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_appointment ON prescriptions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_health_records_patient ON health_records(patient_id, record_date DESC);
