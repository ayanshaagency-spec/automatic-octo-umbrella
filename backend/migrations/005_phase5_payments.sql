-- Phase 5: payment MVP
-- Provider-agnostic payment order/transaction record. Gateway credentials/webhooks are integrated separately.
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  appointment_id INTEGER REFERENCES appointments(id),
  lab_order_id INTEGER REFERENCES lab_orders(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  provider VARCHAR(40),
  provider_order_id VARCHAR(160),
  provider_payment_id VARCHAR(160),
  status VARCHAR(30) NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','paid','failed','refunded','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (appointment_id IS NOT NULL OR lab_order_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_order ON payments(provider, provider_order_id) WHERE provider_order_id IS NOT NULL;
