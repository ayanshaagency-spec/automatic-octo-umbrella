const https = require('https');

function getConfig() {
  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0',
    appointmentTemplate: process.env.WHATSAPP_APPOINTMENT_TEMPLATE || 'appointment_confirmation',
    languageCode: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en'
  };
}

function normalizePhone(phone) {
  if (typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

function isConfigured() {
  const c = getConfig();
  return Boolean(c.accessToken && c.phoneNumberId);
}

function postJson(hostname, path, body, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(raw || '{}'); } catch { parsed = { raw }; }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed);
        const error = new Error(parsed?.error?.message || 'WhatsApp API request failed');
        error.statusCode = res.statusCode;
        error.details = parsed;
        reject(error);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendTemplateMessage({ phone, templateName, languageCode, bodyParameters = [] }) {
  const to = normalizePhone(phone);
  if (!to) {
    const error = new Error('A valid WhatsApp phone number is required');
    error.statusCode = 422;
    throw error;
  }
  const c = getConfig();
  if (!c.accessToken || !c.phoneNumberId) {
    const error = new Error('WhatsApp Cloud API is not configured');
    error.statusCode = 503;
    throw error;
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName || c.appointmentTemplate,
      language: { code: languageCode || c.languageCode },
      ...(bodyParameters.length ? {
        components: [{
          type: 'body',
          parameters: bodyParameters.map(text => ({ type: 'text', text: String(text) }))
        }]
      } : {})
    }
  };

  return postJson(
    'graph.facebook.com',
    `/${c.apiVersion}/${c.phoneNumberId}/messages`,
    JSON.stringify(payload),
    { Authorization: `Bearer ${c.accessToken}` }
  );
}

async function sendAppointmentConfirmation({ phone, appointmentAt }) {
  const dateText = new Date(appointmentAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });
  return sendTemplateMessage({
    phone,
    bodyParameters: [dateText]
  });
}

module.exports = { getConfig, normalizePhone, isConfigured, sendTemplateMessage, sendAppointmentConfirmation };
