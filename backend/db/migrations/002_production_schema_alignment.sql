-- Ayansha Health Care production schema alignment
-- Additive/idempotent migration. Does not drop or replace existing tables/data.

CREATE TABLE IF NOT EXISTS hospitals (
  id SERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  address TEXT,
  city VARCHAR(120),
  state VARCHAR(120),
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  phone VARCHAR(30),
  emergency_available BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES patients(id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES doctors(id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS diagnosis TEXT;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS prescribed_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS prescription_items (
  id SERIAL PRIMARY KEY,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_name VARCHAR(180) NOT NULL,
  dosage VARCHAR(120) NOT NULL,
  frequency VARCHAR(120) NOT NULL,
  duration VARCHAR(120) NOT NULL,
  instructions TEXT
);

CREATE TABLE IF NOT EXISTS health_records (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  record_type VARCHAR(80) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  record_date TIMESTAMPTZ DEFAULT NOW(),
  source VARCHAR(120),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS lab_name VARCHAR(180);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES appointments(id),
  lab_order_id INTEGER REFERENCES lab_orders(id),
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  provider VARCHAR(40),
  provider_order_id VARCHAR(160),
  provider_payment_id VARCHAR(160),
  idempotency_key VARCHAR(160),
  status VARCHAR(40) NOT NULL DEFAULT 'created',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_patient_idempotency_key_uq
  ON payments(patient_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS hospitals_active_lat_lon_idx
  ON hospitals(active, latitude, longitude);

CREATE INDEX IF NOT EXISTS health_records_patient_date_idx
  ON health_records(patient_id, record_date DESC);

CREATE INDEX IF NOT EXISTS lab_orders_patient_date_idx
  ON lab_orders(patient_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS payments_patient_created_idx
  ON payments(patient_id, created_at DESC);
