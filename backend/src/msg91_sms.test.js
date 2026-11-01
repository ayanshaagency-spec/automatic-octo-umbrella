'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MSG91_FLOW_ENDPOINT,
  isMsg91Configured,
  sendMsg91Otp
} = require('./msg91_sms');

const config = {
  MSG91_AUTH_KEY: 'unit-test-auth-key',
  MSG91_TEMPLATE_ID: 'unit-test-template-id',
  MSG91_OTP_VARIABLE: 'otp'
};

test('MSG91 Flow request uses the fixed HTTPS endpoint, authkey header and template variable', async () => {
  let captured;
  const result = await sendMsg91Otp({
    phone: '+919876543210',
    otp: '123456',
    env: config,
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return { ok: true, status: 200, json: async () => ({ type: 'success', message: 'request-id' }) };
    }
  });

  assert.deepEqual(result, { accepted: true });
  assert.equal(captured.url, MSG91_FLOW_ENDPOINT);
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.authkey, config.MSG91_AUTH_KEY);
  assert.equal(captured.options.headers.accept, 'application/json');
  assert.equal(captured.body.template_id, config.MSG91_TEMPLATE_ID);
  assert.deepEqual(captured.body.recipients, [{ mobiles: '919876543210', otp: '123456' }]);
});

test('MSG91 Flow supports a configured case-sensitive template variable name', async () => {
  let payload;
  await sendMsg91Otp({
    phone: '919876543210',
    otp: '654321',
    env: { ...config, MSG91_OTP_VARIABLE: 'VAR1' },
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ type: 'success' }) };
    }
  });
  assert.deepEqual(payload.recipients[0], { mobiles: '919876543210', VAR1: '654321' });
});

test('MSG91 configuration is incomplete until the auth key and template ID are present', async () => {
  assert.equal(isMsg91Configured({}), false);
  assert.equal(isMsg91Configured({ ...config, MSG91_TEMPLATE_ID: '' }), false);
  assert.equal(isMsg91Configured({ ...config, MSG91_OTP_VARIABLE: 'bad variable' }), false);
  let called = false;
  await assert.rejects(
    () => sendMsg91Otp({
      phone: '+919876543210',
      otp: '123456',
      env: { MSG91_AUTH_KEY: 'key-only' },
      fetchImpl: async () => { called = true; }
    }),
    error => error.statusCode === 503 && /required/.test(error.message)
  );
  assert.equal(called, false);
});

test('MSG91 rejects invalid mobile numbers and non-six-digit OTPs before any request', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; };
  await assert.rejects(
    () => sendMsg91Otp({ phone: 'not-a-number', otp: '123456', env: config, fetchImpl }),
    error => error.statusCode === 422
  );
  await assert.rejects(
    () => sendMsg91Otp({ phone: '+919876543210', otp: '12345', env: config, fetchImpl }),
    error => error.statusCode === 422
  );
  assert.equal(called, false);
});

test('MSG91 API error payloads and non-2xx responses fail closed', async () => {
  await assert.rejects(
    () => sendMsg91Otp({
      phone: '+919876543210',
      otp: '123456',
      env: config,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ type: 'error', message: 'do not expose provider response' }) })
    }),
    error => error.statusCode === 502 && /rejected/.test(error.message)
  );
  await assert.rejects(
    () => sendMsg91Otp({
      phone: '+919876543210',
      otp: '123456',
      env: config,
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'secret diagnostic' }) })
    }),
    error => error.statusCode === 502 && !/secret diagnostic/.test(error.message)
  );
});

test('MSG91 network errors are converted to a safe provider error', async () => {
  await assert.rejects(
    () => sendMsg91Otp({
      phone: '+919876543210',
      otp: '123456',
      env: config,
      fetchImpl: async () => { throw new Error('network details must not escape'); }
    }),
    error => error.statusCode === 502 && !/network details/.test(error.message)
  );
});
