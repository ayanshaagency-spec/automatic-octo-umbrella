'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIntegrationReadiness } = require('./integration_readiness');

test('integration readiness returns configuration booleans only and never provider secrets', () => {
  const snapshot = buildIntegrationReadiness({
    aiStatus: { configured: true, provider: 'provider', token: 'ai-secret-token' },
    whatsappStatus: { configured: true, accessToken: 'whatsapp-secret-token' },
    storageConfigured: true,
    scannerConfigured: false
  });

  assert.deepEqual(snapshot, {
    ai: { configured: true },
    whatsapp: { configured: true, deliveryVerified: false },
    insurance: {
      privateStorageConfigured: true,
      malwareScannerConfigured: false,
      uploadPrerequisitesConfigured: false
    }
  });
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes('secret'), false);
  assert.equal(serialized.includes('provider'), false);
});

test('missing provider and insurance configuration reports pending prerequisites', () => {
  assert.deepEqual(buildIntegrationReadiness(), {
    ai: { configured: false },
    whatsapp: { configured: false, deliveryVerified: false },
    insurance: {
      privateStorageConfigured: false,
      malwareScannerConfigured: false,
      uploadPrerequisitesConfigured: false
    }
  });
});
