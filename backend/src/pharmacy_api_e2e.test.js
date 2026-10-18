const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const PORT = 3921;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function startServer() {
  return spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT), DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function waitForHealth(child) {
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API server exited early: ${output}`);
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not become ready: ${output}`);
}

test('Pharmacy API routes fail safely without a database and protect staff/admin actions', async t => {
  const server = startServer();
  t.after(() => server.kill());
  await waitForHealth(server);

  const pharmacyDirectory = await fetch(`${BASE_URL}/api/pharmacies`);
  assert.equal(pharmacyDirectory.status, 503);
  assert.match((await pharmacyDirectory.json()).error, /DATABASE_URL not configured/i);

  const staffOrders = await fetch(`${BASE_URL}/api/pharmacy/staff/orders`);
  assert.equal(staffOrders.status, 401);

  const staffStatus = await fetch(`${BASE_URL}/api/pharmacy/staff/orders/1/status`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'accepted' })
  });
  assert.equal(staffStatus.status, 401);

  const adminCreateStore = await fetch(`${BASE_URL}/api/admin/pharmacies`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Unsafe Demo Store' })
  });
  assert.equal(adminCreateStore.status, 401);

  const missingPatientIdentity = await fetch(`${BASE_URL}/api/pharmacy/orders`);
  assert.equal(missingPatientIdentity.status, 422);

  const invalidOrder = await fetch(`${BASE_URL}/api/pharmacy/orders`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: [] })
  });
  assert.equal(invalidOrder.status, 422);
});
