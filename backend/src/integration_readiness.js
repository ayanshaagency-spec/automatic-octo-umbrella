'use strict';

function buildIntegrationReadiness({
  aiStatus = {},
  whatsappStatus = {},
  storageConfigured = false,
  scannerConfigured = false
} = {}) {
  const privateStorageConfigured = storageConfigured === true;
  const malwareScannerConfigured = scannerConfigured === true;
  return {
    ai: {
      configured: aiStatus.configured === true
    },
    whatsapp: {
      configured: whatsappStatus.configured === true,
      deliveryVerified: false
    },
    insurance: {
      privateStorageConfigured,
      malwareScannerConfigured,
      uploadPrerequisitesConfigured: privateStorageConfigured && malwareScannerConfigured
    }
  };
}

function getIntegrationReadiness() {
  const { getAiStatus } = require('./ai');
  const { status: getWhatsAppStatus } = require('./whatsapp');
  const { isStorageConfigured } = require('./insurance_storage');
  const { isScannerConfigured } = require('./insurance_scanner');
  return buildIntegrationReadiness({
    aiStatus: getAiStatus(),
    whatsappStatus: getWhatsAppStatus(),
    storageConfigured: isStorageConfigured(),
    scannerConfigured: isScannerConfigured()
  });
}

module.exports = { buildIntegrationReadiness, getIntegrationReadiness };
