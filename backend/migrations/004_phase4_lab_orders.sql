-- Phase 4: lab test booking
-- Safe upgrade for the legacy lab_orders table.
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS lab_name TEXT;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(patient_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON lab_orders(status);
