-- Additive Phase 7 foundation. This migration does not alter existing patient,
-- appointment, prescription, payment, or hospital rows.
CREATE TABLE IF NOT EXISTS pharmacies (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  store_type VARCHAR(24) NOT NULL CHECK (store_type IN ('hospital', 'partner_store')),
  hospital_id BIGINT REFERENCES hospitals(id) ON DELETE RESTRICT,
  license_number VARCHAR(120) NOT NULL,
  license_valid_until DATE,
  pharmacist_name VARCHAR(160),
  phone VARCHAR(40),
  email VARCHAR(180),
  address TEXT NOT NULL,
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  latitude DOUBLE PRECISION CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  operating_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (store_type <> 'hospital' OR hospital_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pharmacies_license_number
  ON pharmacies (license_number);
CREATE INDEX IF NOT EXISTS idx_pharmacies_search
  ON pharmacies (active, is_verified, store_type, city);

CREATE TABLE IF NOT EXISTS pharmacy_staff (
  id BIGSERIAL PRIMARY KEY,
  pharmacy_id BIGINT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  email VARCHAR(180) NOT NULL,
  password_hash TEXT NOT NULL,
  staff_role VARCHAR(24) NOT NULL CHECK (staff_role IN ('manager', 'pharmacist', 'staff')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pharmacy_staff_email
  ON pharmacy_staff (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_pharmacy_staff_store
  ON pharmacy_staff (pharmacy_id, active);

CREATE TABLE IF NOT EXISTS medicine_catalog (
  id BIGSERIAL PRIMARY KEY,
  medicine_name VARCHAR(240) NOT NULL,
  generic_name VARCHAR(240),
  brand_name VARCHAR(180),
  strength VARCHAR(100),
  dosage_form VARCHAR(100),
  pack_size VARCHAR(100),
  prescription_required BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_medicine_catalog_name
  ON medicine_catalog (LOWER(medicine_name));
CREATE INDEX IF NOT EXISTS idx_medicine_catalog_generic
  ON medicine_catalog (LOWER(generic_name));

CREATE TABLE IF NOT EXISTS pharmacy_inventory (
  id BIGSERIAL PRIMARY KEY,
  pharmacy_id BIGINT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  medicine_id BIGINT NOT NULL REFERENCES medicine_catalog(id) ON DELETE RESTRICT,
  batch_number VARCHAR(120) NOT NULL,
  expiry_date DATE NOT NULL,
  mrp NUMERIC(10,2) NOT NULL CHECK (mrp >= 0),
  selling_price NUMERIC(10,2) NOT NULL CHECK (selling_price >= 0 AND selling_price <= mrp),
  quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0 AND quantity_reserved <= quantity_available),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pharmacy_id, medicine_id, batch_number)
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_inventory_available
  ON pharmacy_inventory (pharmacy_id, active, medicine_id, expiry_date);

CREATE TABLE IF NOT EXISTS pharmacy_orders (
  id BIGSERIAL PRIMARY KEY,
  order_number VARCHAR(40) NOT NULL UNIQUE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  patient_phone VARCHAR(40) NOT NULL,
  pharmacy_id BIGINT NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
  prescription_id BIGINT REFERENCES prescriptions(id) ON DELETE RESTRICT,
  destination_type VARCHAR(16) NOT NULL CHECK (destination_type IN ('hospital', 'home')),
  hospital_id BIGINT REFERENCES hospitals(id) ON DELETE RESTRICT,
  address_line TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  recipient_name VARCHAR(180),
  recipient_phone VARCHAR(40),
  delivery_instructions TEXT,
  order_status VARCHAR(32) NOT NULL DEFAULT 'requested'
    CHECK (order_status IN ('requested', 'accepted', 'rejected', 'packed', 'out_for_delivery', 'ready_at_hospital', 'delivered', 'cancelled')),
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  idempotency_key VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (destination_type = 'hospital' AND hospital_id IS NOT NULL)
    OR
    (destination_type = 'home' AND address_line IS NOT NULL AND LENGTH(TRIM(address_line)) > 0)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pharmacy_orders_idempotency
  ON pharmacy_orders (patient_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_patient
  ON pharmacy_orders (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_store
  ON pharmacy_orders (pharmacy_id, order_status, created_at DESC);

CREATE TABLE IF NOT EXISTS pharmacy_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES pharmacy_orders(id) ON DELETE CASCADE,
  inventory_id BIGINT NOT NULL REFERENCES pharmacy_inventory(id) ON DELETE RESTRICT,
  medicine_name VARCHAR(240) NOT NULL,
  generic_name VARCHAR(240),
  strength VARCHAR(100),
  dosage_form VARCHAR(100),
  prescription_required BOOLEAN NOT NULL,
  dosage VARCHAR(120),
  frequency VARCHAR(120),
  duration VARCHAR(120),
  instructions TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 100),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_order_items_order
  ON pharmacy_order_items (order_id);

CREATE TABLE IF NOT EXISTS pharmacy_order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES pharmacy_orders(id) ON DELETE CASCADE,
  old_status VARCHAR(32),
  new_status VARCHAR(32) NOT NULL,
  actor_type VARCHAR(24) NOT NULL CHECK (actor_type IN ('patient', 'pharmacy_staff', 'admin', 'system')),
  actor_id BIGINT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_order_events_order
  ON pharmacy_order_events (order_id, created_at);
