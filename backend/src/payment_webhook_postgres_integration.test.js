const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { processRazorpayWebhook } = require('./payment_webhook_processor');

const SAFE_DATABASES = new Set(['ayansha_healthcare', 'healthcare_ci']);
function safeTarget(url) {
  if (!url || process.env.NODE_ENV === 'production') return false;
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) && SAFE_DATABASES.has(name);
  } catch { return false; }
}

test('PostgreSQL webhook integration: success, duplicate event, mismatch rollback', async t => {
  if (!process.env.DATABASE_URL || !safeTarget(process.env.DATABASE_URL)) {
    t.skip('Only disposable local CI PostgreSQL databases are allowed');
    return;
  }
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  // Keep generated phone values below patients.phone VARCHAR(30).\n  const suffix = 'wh-' + Date.now().toString().slice(-8) + '-' + Math.floor(Math.random()*1000);
  let patientId, doctorId, appointmentId, paymentId;
  try {
    patientId = (await db.query('INSERT INTO patients(name,phone) VALUES($1,$2) RETURNING id', ['CI webhook patient', suffix+'-p'])).rows[0].id;
    doctorId = (await db.query('INSERT INTO doctors(name,specialty) VALUES($1,$2) RETURNING id', ['CI webhook doctor','CI'])).rows[0].id;
    appointmentId = (await db.query("INSERT INTO appointments(patient_id,doctor_id,appointment_at,mode,status) VALUES($1,$2,NOW()+INTERVAL '1 day','Video','confirmed') RETURNING id", [patientId,doctorId])).rows[0].id;
    paymentId = (await db.query("INSERT INTO payments(patient_id,appointment_id,amount,currency,provider,provider_order_id,status) VALUES($1,$2,100.00,'INR','razorpay',$3,'pending') RETURNING id", [patientId,appointmentId,suffix+'-order'])).rows[0].id;

    const normalized = { eventId:suffix+'-event', event:'payment.captured', status:'paid', providerPaymentId:suffix+'-pay', providerOrderId:suffix+'-order', amountMinor:10000, currency:'INR' };
    const first = await processRazorpayWebhook(normalized);
    assert.equal(first.duplicate,false);
    assert.equal(first.payment.status,'paid');
    const duplicate = await processRazorpayWebhook(normalized);
    assert.equal(duplicate.duplicate,true);
    const stored = await db.query('SELECT status,provider_payment_id FROM payments WHERE id=$1',[paymentId]);
    assert.equal(stored.rows[0].status,'paid');
    assert.equal(stored.rows[0].provider_payment_id,suffix+'-pay');

    const mismatch = { ...normalized, eventId:suffix+'-mismatch', amountMinor:9900, status:'refunded' };
    await assert.rejects(processRazorpayWebhook(mismatch), /amount or currency mismatch/);
    const ledger = await db.query('SELECT event_id FROM payment_webhook_events WHERE payment_id=$1',[paymentId]);
    assert.deepEqual(ledger.rows.map(r=>r.event_id),[normalized.eventId]);
  } finally {
    if (paymentId) await db.query('DELETE FROM payment_webhook_events WHERE payment_id=$1',[paymentId]);
    if (paymentId) await db.query('DELETE FROM payments WHERE id=$1',[paymentId]);
    if (appointmentId) await db.query('DELETE FROM appointments WHERE id=$1',[appointmentId]);
    if (patientId) await db.query('DELETE FROM patients WHERE id=$1',[patientId]);
    if (doctorId) await db.query('DELETE FROM doctors WHERE id=$1',[doctorId]);
    await db.end();
  }
});
