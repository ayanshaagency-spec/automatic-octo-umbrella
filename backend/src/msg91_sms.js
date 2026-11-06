'use strict';

const MSG91_FLOW_ENDPOINT = 'https://control.msg91.com/api/v5/flow';
const VARIABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;

function getMsg91Config(env = process.env) {
  const authKey = String(env.MSG91_AUTH_KEY || '').trim();
  const templateId = String(env.MSG91_TEMPLATE_ID || '').trim();
  const variableName = String(env.MSG91_OTP_VARIABLE || 'otp').trim();
  return { authKey, templateId, variableName };
}

function isMsg91Configured(env = process.env) {
  const config = getMsg91Config(env);
  return Boolean(
    config.authKey &&
    config.templateId &&
    VARIABLE_NAME_PATTERN.test(config.variableName)
  );
}

class Msg91SmsError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'Msg91SmsError';
    this.statusCode = statusCode;
  }
}

async function sendMsg91Otp({ phone, otp, env = process.env, fetchImpl = globalThis.fetch }) {
  const config = getMsg91Config(env);
  if (!config.authKey || !config.templateId || !VARIABLE_NAME_PATTERN.test(config.variableName)) {
    throw new Msg91SmsError('MSG91 auth key, template ID and a valid OTP variable name are required', 503);
  }
  if (typeof fetchImpl !== 'function') {
    throw new Msg91SmsError('MSG91 HTTP client is unavailable', 503);
  }

  const mobile = String(phone || '').trim().replace(/^\+/, '');
  if (!/^\d{10,15}$/.test(mobile)) {
    throw new Msg91SmsError('A valid international mobile number is required', 422);
  }
  const code = String(otp || '').trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Msg91SmsError('A six-digit OTP is required', 422);
  }

  const recipient = { mobiles: mobile, [config.variableName]: code };
  let response;
  try {
    response = await fetchImpl(MSG91_FLOW_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authkey: config.authKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        template_id: config.templateId,
        recipients: [recipient]
      }),
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new Msg91SmsError('MSG91 request failed or timed out', 502);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // MSG91's Flow API may return a request identifier in a non-JSON response.
    // HTTP status remains the primary transport success signal.
  }

  const responseType = String(payload?.type || '').trim().toLowerCase();
  if (!response?.ok || responseType === 'error') {
    throw new Msg91SmsError('MSG91 rejected the OTP request', 502);
  }

  return { accepted: true };
}

module.exports = {
  MSG91_FLOW_ENDPOINT,
  getMsg91Config,
  isMsg91Configured,
  sendMsg91Otp,
  Msg91SmsError
};
