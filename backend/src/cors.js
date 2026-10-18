'use strict';

function parseAllowedOrigins(env) {
  const raw = env.CORS_ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '';
  return String(raw)
    .split(/[\\s,]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getCorsHeaders(origin, env = process.env) {
  const headers = {};
  const isProduction = env.NODE_ENV === 'production';
  const configuredOrigins = parseAllowedOrigins(env);

  // Keep local development convenient, but fail closed in production.
  if (configuredOrigins.length === 0) {
    if (!isProduction) headers['Access-Control-Allow-Origin'] = '*';
    return headers;
  }

  // Never treat '*' as permission to expose a production API to every origin.
  if (!origin) return headers;
  if (configuredOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
    return headers;
  }

  if (!isProduction && configuredOrigins.includes('*')) {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  return headers;
}

module.exports = { getCorsHeaders, parseAllowedOrigins };
