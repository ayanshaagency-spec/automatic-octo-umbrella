const test = require('node:test');
const assert = require('node:assert/strict');
const { getCorsHeaders, parseAllowedOrigins } = require('./cors');

test('production allows an exact configured origin and varies by origin', () => {
  const env = { NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://demo.example, https://portal.example' };
  assert.deepEqual(getCorsHeaders('https://demo.example', env), {
    'Access-Control-Allow-Origin': 'https://demo.example',
    Vary: 'Origin'
  });
});

test('production rejects an origin outside the allowlist', () => {
  const env = { NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://demo.example' };
  assert.deepEqual(getCorsHeaders('https://evil.example', env), {});
});

test('production fails closed if CORS origins are missing', () => {
  assert.deepEqual(getCorsHeaders('https://demo.example', { NODE_ENV: 'production' }), {});
});

test('production does not allow wildcard CORS', () => {
  assert.deepEqual(getCorsHeaders('https://demo.example', {
    NODE_ENV: 'production',
    CORS_ALLOWED_ORIGINS: '*'
  }), {});
});

test('development still allows localhost for local testing', () => {
  assert.deepEqual(getCorsHeaders('http://localhost:5173', { NODE_ENV: 'development' }), {
    'Access-Control-Allow-Origin': 'http://localhost:5173',
    Vary: 'Origin'
  });
});

test('CORS origin parser accepts comma and whitespace-separated origins', () => {
  assert.deepEqual(parseAllowedOrigins({
    CORS_ALLOWED_ORIGINS: 'https://one.example,\nhttps://two.example https://three.example'
  }), ['https://one.example', 'https://two.example', 'https://three.example']);
});
