const { getDb } = require('./db');
const { validateStatusTransition } = require('./phase5_payment_validation');

function amountToMinorUnits(value) {
  const s = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const minor = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return Number.isSafeInteger(minor) ? minor : null;
}

async function processRazorpayWebhook(normalized, dbOverride = null) {
  if (!normalized || typeof normalized.eventId !== 'string' || !normalized.eventId.trim()) {
    const error = new Error('Webhook event ID is required for durable deduplication'); error.statusCode = 422; throw error;
  }
  const db = dbOverride || await getDb();
  if (!db) return null;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const paymentResult = await client.query('SELECT id, amount, currency, provider, provider_order_id, provider_payment_id, status FROM payments WHERE provider_order_id = $1 FOR UPDATE', [normalized.providerOrderId]);
    if (!paymentResult.rowCount) { const error = new Error('Payment linked to provider order was not found'); error.statusCode = 404; throw error; }
    const payment = paymentResult.rows[0];
    if (payment.provider && payment.provider.toLowerCase() !== 'razorpay') { const error = new Error('Payment provider mismatch'); error.statusCode = 409; throw error; }
    if (payment.provider_payment_id && payment.provider_payment_id !== normalized.providerPaymentId) { const error = new Error('Provider payment ID mismatch'); error.statusCode = 409; throw error; }
    if (amountToMinorUnits(payment.amount) !== normalized.amountMinor || String(payment.currency).toUpperCase() !== normalized.currency) { const error = new Error('Payment amount or currency mismatch'); error.statusCode = 409; throw error; }
    const eventInsert = await client.query('INSERT INTO payment_webhook_events (event_id, provider, payment_id, event_type) VALUES ($1,$2,$3,$4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id', [normalized.eventId, 'razorpay', payment.id, normalized.event]);
    if (!eventInsert.rowCount) {
      const prior = await client.query('SELECT provider, payment_id, event_type FROM payment_webhook_events WHERE event_id = $1', [normalized.eventId]);
      if (!prior.rowCount || prior.rows[0].provider !== 'razorpay' || Number(prior.rows[0].payment_id) !== Number(payment.id) || prior.rows[0].event_type !== normalized.event) { const error = new Error('Webhook event ID collision'); error.statusCode = 409; throw error; }
      await client.query('COMMIT'); return { duplicate: true };
    }
    const transitionError = validateStatusTransition(payment.status, normalized.status);
    if (transitionError) { const error = new Error(transitionError); error.statusCode = 409; throw error; }
    const update = await client.query('UPDATE payments SET status=$1, provider_payment_id=$2, updated_at=NOW() WHERE id=$3 RETURNING id, patient_id, appointment_id, lab_order_id, amount, currency, provider, provider_order_id, provider_payment_id, idempotency_key, status, notes, created_at, updated_at', [normalized.status, normalized.providerPaymentId, payment.id]);
    await client.query('COMMIT');
    return { duplicate: false, payment: update.rows[0] };
  } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
  finally { client.release(); }
}
module.exports = { processRazorpayWebhook, amountToMinorUnits };
