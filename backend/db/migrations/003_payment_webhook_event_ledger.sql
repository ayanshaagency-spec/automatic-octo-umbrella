-- Durable provider webhook deduplication ledger (additive only).
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  event_id VARCHAR(160) PRIMARY KEY,
  provider VARCHAR(40) NOT NULL DEFAULT 'razorpay',
  payment_id INTEGER REFERENCES payments(id),
  event_type VARCHAR(120) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_webhook_events_payment_idx
  ON payment_webhook_events(payment_id, processed_at DESC);
