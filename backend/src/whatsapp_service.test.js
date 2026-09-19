const test = require('node:test');
const assert = require('node:assert/strict');

const original = {
  access: process.env.WHATSAPP_ACCESS_TOKEN,
  phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID
};

const service = require('./whatsapp_service');

test('normalizePhone keeps digits and rejects invalid values', () => {
  assert.equal(service.normalizePhone('+91 98765-43210'), '919876543210');
  assert.equal(service.normalizePhone('123'), null);
  assert.equal(service.normalizePhone(null), null);
});

test('WhatsApp is not configured without credentials', () => {
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  assert.equal(service.isConfigured(), false);
});

test('sendTemplateMessage fails closed when WhatsApp is not configured', async () => {
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  await assert.rejects(
    service.sendTemplateMessage({ phone: '+91 9876543210' }),
    error => error.statusCode === 503
  );
});

process.env.WHATSAPP_ACCESS_TOKEN = original.access;
process.env.WHATSAPP_PHONE_NUMBER_ID = original.phoneId;
