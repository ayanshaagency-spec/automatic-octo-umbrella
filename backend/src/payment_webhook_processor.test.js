const test = require('node:test');
const assert = require('node:assert/strict');
const { amountToMinorUnits } = require('./payment_webhook_processor');

test('converts decimal amounts exactly to minor units', () => {
  assert.equal(amountToMinorUnits('499.00'), 49900);
  assert.equal(amountToMinorUnits('0.5'), 50);
  assert.equal(amountToMinorUnits('1'), 100);
  assert.equal(amountToMinorUnits('001.05'), 105);
});

test('rejects malformed or unsafe decimal amounts', () => {
  for (const value of ['499.999', '-1', '1e2', 'abc', '', '1.']) assert.equal(amountToMinorUnits(value), null, value);
});


function makeFakeDb({ payment = {}, failUpdate = false } = {}) {
  const state = {
    payment: { id: 7, amount: '100.00', currency: 'INR', provider: 'razorpay',
      provider_order_id: 'order_ci_1', provider_payment_id: null, status: 'pending', ...payment },
    events: new Map(), queries: [], failUpdate, committed: false, rolledBack: false
  };
  const client = {
    async query(sql, params = []) {
      state.queries.push(sql.trim().split(/\\s+/).slice(0,3).join(' '));
      if (sql === 'BEGIN') return {};
      if (sql === 'COMMIT') { state.committed = true; return {}; }
      if (sql === 'ROLLBACK') { state.rolledBack = true; return {}; }
      if (sql.includes('SELECT id, amount')) return { rowCount: 1, rows: [state.payment] };
      if (sql.includes('INSERT INTO payment_webhook_events')) {
        if (state.events.has(params[0])) return { rowCount: 0, rows: [] };
        state.events.set(params[0], { provider: params[1], payment_id: params[2], event_type: params[3] }); return { rowCount: 1, rows: [{ event_id: params[0] }] };
      }
      if (sql.includes('SELECT provider, payment_id, event_type FROM payment_webhook_events')) { const prior=state.events.get(params[0]); return { rowCount: prior ? 1 : 0, rows: prior ? [prior] : [] }; }
      if (sql.includes('UPDATE payments SET status')) {
        if (state.failUpdate) throw new Error('simulated update failure');
        state.payment.status=params[0]; state.payment.provider_payment_id=params[1];
        return { rowCount: 1, rows: [{ ...state.payment }] };
      }
      throw new Error('Unexpected query in fake DB: '+sql);
    },
    release() { state.released=true; }
  };
  return { state, db: { async connect(){ return client; } } };
}

test('webhook processor commits a valid captured event and stores payment ID', async () => {
  const fake=makeFakeDb();
  const result=await require('./payment_webhook_processor').processRazorpayWebhook({
    eventId:'evt_ci_1',event:'payment.captured',status:'paid',
    providerPaymentId:'pay_ci_1',providerOrderId:'order_ci_1',amountMinor:10000,currency:'INR'
  }, fake.db);
  assert.equal(result.duplicate,false);
  assert.equal(result.payment.status,'paid');
  assert.equal(fake.state.committed,true);
  assert.equal(fake.state.rolledBack,false);
});

test('webhook processor reports duplicate event IDs without updating payment', async () => {
  const fake=makeFakeDb(); fake.state.events.set('evt_duplicate',{provider:'razorpay',payment_id:7,event_type:'payment.captured'});
  const result=await require('./payment_webhook_processor').processRazorpayWebhook({
    eventId:'evt_duplicate',event:'payment.captured',status:'paid',
    providerPaymentId:'pay_ci_1',providerOrderId:'order_ci_1',amountMinor:10000,currency:'INR'
  }, fake.db);
  assert.equal(result.duplicate,true);
  assert.equal(fake.state.committed,true);
  assert.equal(fake.state.payment.status,'pending');
});

test('webhook processor rejects amount or currency mismatch and rolls back', async () => {
  for (const normalized of [
    { amountMinor:9999,currency:'INR' },
    { amountMinor:10000,currency:'USD' }
  ]) {
    const fake=makeFakeDb();
    await assert.rejects(require('./payment_webhook_processor').processRazorpayWebhook({
      eventId:'evt_mismatch',event:'payment.captured',status:'paid',
      providerPaymentId:'pay_ci_1',providerOrderId:'order_ci_1',
      amountMinor:normalized.amountMinor,currency:normalized.currency
    }, fake.db), /mismatch/);
    assert.equal(fake.state.rolledBack,true);
  }
});

test('webhook processor rejects provider payment ID mismatch', async () => {
  const fake=makeFakeDb({payment:{provider_payment_id:'pay_other'}});
  await assert.rejects(require('./payment_webhook_processor').processRazorpayWebhook({
    eventId:'evt_id_mismatch',event:'payment.captured',status:'paid',
    providerPaymentId:'pay_ci_1',providerOrderId:'order_ci_1',amountMinor:10000,currency:'INR'
  }, fake.db), /ID mismatch/);
  assert.equal(fake.state.rolledBack,true);
});

test('webhook processor rolls back on update failure', async () => {
  const fake=makeFakeDb({failUpdate:true});
  await assert.rejects(require('./payment_webhook_processor').processRazorpayWebhook({
    eventId:'evt_fail',event:'payment.captured',status:'paid',
    providerPaymentId:'pay_ci_1',providerOrderId:'order_ci_1',amountMinor:10000,currency:'INR'
  }, fake.db), /simulated update failure/);
  assert.equal(fake.state.rolledBack,true);
  assert.equal(fake.state.committed,false);
});



test('webhook processor rejects unknown provider order and rolls back', async () => {
  const fake=makeFakeDb();
  fake.state.payment=null;
  fake.db.connect=async()=>({query:async sql=>{
    if(sql==='BEGIN'||sql==='ROLLBACK'||sql==='COMMIT') return {};
    if(sql.includes('SELECT id, amount')) return {rowCount:0,rows:[]};
    throw new Error('unexpected query');
  },release(){}});
  await assert.rejects(require('./payment_webhook_processor').processRazorpayWebhook({
    eventId:'evt_unknown_order',event:'payment.captured',status:'paid',
    providerPaymentId:'pay_ci_1',providerOrderId:'order_missing',amountMinor:10000,currency:'INR'
  }, fake.db), /not found/);
});

test('webhook processor rejects provider mismatch and rolls back', async () => {
  const fake=makeFakeDb({payment:{provider:'other-provider'}});
  await assert.rejects(require('./payment_webhook_processor').processRazorpayWebhook({
    eventId:'evt_provider_mismatch',event:'payment.captured',status:'paid',
    providerPaymentId:'pay_ci_1',providerOrderId:'order_ci_1',amountMinor:10000,currency:'INR'
  }, fake.db), /provider mismatch/);
  assert.equal(fake.state.rolledBack,true);
});

test('webhook processor rejects invalid status transition and rolls back', async () => {
  const fake=makeFakeDb({payment:{status:'cancelled'}});
  await assert.rejects(require('./payment_webhook_processor').processRazorpayWebhook({
    eventId:'evt_terminal_transition',event:'payment.captured',status:'paid',
    providerPaymentId:'pay_ci_1',providerOrderId:'order_ci_1',amountMinor:10000,currency:'INR'
  }, fake.db), /invalid payment status transition/);
  assert.equal(fake.state.rolledBack,true);
});

test('webhook processor rejects missing event ID before database access', async () => {
  let connected=false;
  const db={async connect(){connected=true;throw new Error('must not connect');}};
  await assert.rejects(require('./payment_webhook_processor').processRazorpayWebhook({
    event:'payment.captured',status:'paid',providerPaymentId:'pay_ci_1',
    providerOrderId:'order_ci_1',amountMinor:10000,currency:'INR'
  }, db), /event ID is required/);
  assert.equal(connected,false);
});


test('webhook processor rejects event ID collision across payment or event type', async () => { const fake=makeFakeDb(); fake.state.events.set('evt_collision',{provider:'razorpay',payment_id:99,event_type:'payment.failed'}); await assert.rejects(require('./payment_webhook_processor').processRazorpayWebhook({eventId:'evt_collision',event:'payment.captured',status:'paid',providerPaymentId:'pay_ci_1',providerOrderId:'order_ci_1',amountMinor:10000,currency:'INR'},fake.db), /event ID collision/); assert.equal(fake.state.rolledBack,true); });
