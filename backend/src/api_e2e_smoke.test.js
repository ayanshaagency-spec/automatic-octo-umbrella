const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const PORT = 3917;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function startServer() {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return child;
}

async function waitForHealth(child) {
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API server exited early: ${output}`);
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not become ready: ${output}`);
}

test('Phase 5 API smoke/E2E contract', async t => {
  const server = startServer();
  t.after(() => server.kill());
  await waitForHealth(server);

  const health = await fetch(`${BASE_URL}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: 'Ayansha Health Care' });

  const options = await fetch(`${BASE_URL}/api/payments`, { method: 'OPTIONS' });
  assert.equal(options.status, 204);
  assert.match(options.headers.get('access-control-allow-methods'), /POST/);

  const invalidJson = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid-json'
  });
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error, 'Invalid JSON');

  const missingPhone = await fetch(`${BASE_URL}/api/payments`, { method: 'GET' });
  assert.equal(missingPhone.status, 422);
  assert.equal((await missingPhone.json()).error, 'phone is required');

  const missingWebhookSecret = await fetch(`${BASE_URL}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId: 1, status: 'paid' })
  });
  assert.equal(missingWebhookSecret.status, 503);
  assert.equal((await missingWebhookSecret.json()).error, 'Payment webhook is not configured');

  const notFound = await fetch(`${BASE_URL}/api/definitely-not-a-route`);
  assert.equal(notFound.status, 404);
  assert.equal((await notFound.json()).error, 'Not found');
});
