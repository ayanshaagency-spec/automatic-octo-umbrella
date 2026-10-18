'use strict';

function parseAllowedOrigins(env = process.env) {
  return String(env.CORS_ALLOWED_ORIGINS || '')
    .split(/[,\s]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getCorsHeaders(origin, env = process.env) {
  const headers = {};
  const isProduction = env.NODE_ENV === 'production';
  const allowedOrigins = parseAllowedOrigins(env);

  // CORS only grants a browser origin access when it matches the explicit allowlist.
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
    return headers;
  }

  // Wildcard and localhost are for local development only; never expose production
  // API responses to an arbitrary browser origin.
  if (!isProduction && origin) {
    if (allowedOrigins.includes('*')) {
      headers['Access-Control-Allow-Origin'] = '*';
      return headers;
    }
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers.Vary = 'Origin';
    }
  } else if (!isProduction && !origin && allowedOrigins.length === 0) {
    // Preserve simple local smoke checks where no Origin header is sent.
    headers['Access-Control-Allow-Origin'] = '*';
  }

  return headers;
}

module.exports = { getCorsHeaders, parseAllowedOrigins };
