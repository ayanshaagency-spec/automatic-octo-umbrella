const test = require('node:test');
const assert = require('node:assert/strict');
const { getCorsHeaders, parseAllowedOrigins } = require('./cors');

test('production allows only an explicitly configured origin', () => {
  const env = { NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://demo.example, https://portal.example' };
  assert.deepEqual(getCorsHeaders('https://demo.example', env), {
    'Access-Control-Allow-Origin': 'https://demo.example',
    Vary: 'Origin'
  });
  assert.deepEqual(getCorsHeaders('https://evil.example', env), {});
});

test('production fails closed when no CORS origins are configured', () => {
  assert.deepEqual(getCorsHeaders('https://demo.example', { NODE_ENV: 'production' }), {});
});

test('production never accepts wildcard CORS configuration', () => {
  assert.deepEqual(getCorsHeaders('https://demo.example', {
    NODE_ENV: 'production',
    CORS_ALLOWED_ORIGINS: '*'
  }), {});
});

test('legacy ALLOWED_ORIGIN stays supported', () => {
  assert.deepEqual(getCorsHeaders('https://demo.example', {
    NODE_ENV: 'production',
    ALLOWED_ORIGIN: 'https://demo.example'
  }), {
    'Access-Control-Allow-Origin': 'https://demo.example',
    Vary: 'Origin'
  });
});

test('development defaults to wildcard when no CORS configuration is set', () => {
  assert.deepEqual(getCorsHeaders('http://localhost:5173', { NODE_ENV: 'development' }), {
    'Access-Control-Allow-Origin': '*'
  });
});

test('origin list supports commas and whitespace', () => {
  assert.deepEqual(parseAllowedOrigins({
    CORS_ALLOWED_ORIGINS: 'https://one.example,\nhttps://two.example https://three.example'
  }), ['https://one.example','https://two.example','https://three.example']);
});
