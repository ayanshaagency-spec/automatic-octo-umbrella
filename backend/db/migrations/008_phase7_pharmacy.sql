-- Ayansha Health Care — Phase 7 Pharmacy Integration MVP
-- Safe/idempotent schema migration. Does not seed fake pharmacies/products
-- and does not modify existing patient, appointment, prescription, payment or hospital rows.
-- Apply explicitly after reviewing the target database:
---   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/migrations/008_phase7_pharmacy.sql

BEGIN;

CREATE TABLE IF NOT EXISTS pharmacy_stores (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  store_type TEXT NOT NULL CHECK (store_type IN ('hospital', 'partner')),
  hospital_id INTEGER REFERENCES hospitals(id) ON DELETE RESTRICT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  phone TEXT,
  supports_hospital_delivery BOOLEAN NOT NULL DEFAULT FALSE,
  supports_home_delivery BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (store_type <> 'hospital' OR hospital_id IS NOT NULL),
  CHECK (supports_hospital_delivery OR supports_home_delivery)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_stores_live_directory
  ON pharmacy_stores (is_active, approved_at, store_type, city);

CREATE TABLE IF NOT EXISTS pharmacy_products (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES pharmacy_stores(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 180),
  brand TEXT,
  strength TEXT,
  pack_size TEXT,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  requires_prescription BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_products_store_live
  ON pharmacy_products (store_id, is_active, name);

CREATE TABLE IF NOT EXISTS pharmacy_orders (
  id BIGSERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  store_id BIGINT NOT NULL REFERENCES pharmacy_stores(id) ON DELETE RESTRICT,
  prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE RESTRICT,
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('hospital', 'home')),
  delivery_hospital_id INTEGER REFERENCES hospitals(id) ON DELETE RESTRICT,
  delivery_address_line1 TEXT,
  delivery_address_line2 TEXT,
  delivery_city TEXT,
  delivery_state TEXT,
  delivery_pincode TEXT,
  status TEXT NOT NULL DEFAULT 'placed'
    CHECK (status IN ('placed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
  payment_method TEXT NOT NULL DEFAULT 'cash_on_delivery'
    CHECK (payment_method IN ('cash_on_delivery')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (delivery_method = 'hospital' AND delivery_hospital_id IS NOT NULL
      AND delivery_address_line1 IS NULL AND delivery_city IS NULL AND delivery_state IS NULL AND delivery_pincode IS NULL)
    OR
    (delivery_method = 'home' AND delivery_hospital_id IS NULL
      AND delivery_address_line1 IS NOT NULL AND delivery_city IS NOT NULL AND delivery_state IS NOT NULL AND delivery_pincode IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_patient_created
  ON pharmacy_orders (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_store_status
  ON pharmacy_orders (store_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS pharmacy_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES pharmacy_orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES pharmacy_products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_order_items_order
  ON pharmacy_order_items (order_id);

COMMIT;
