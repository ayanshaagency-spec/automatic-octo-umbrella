const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const PORT = 3919;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function startServer() {
  return spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
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

test('Phase 7 pharmacy API smoke and fail-closed contract', async t => {
  const server = startServer();
  t.after(() => server.kill());
  await waitForHealth(server);

  const options = await fetch(`${BASE_URL}/api/pharmacy/orders`, { method: 'OPTIONS' });
  assert.equal(options.status, 204);

  const stores = await fetch(`${BASE_URL}/api/pharmacy/stores`);
  assert.equal(stores.status, 503);
  assert.match((await stores.json()).error, /database/i);

  const invalidProducts = await fetch(`${BASE_URL}/api/pharmacy/products?storeId=0`);
  assert.equal(invalidProducts.status, 422);
  assert.match((await invalidProducts.json()).error, /storeId/i);

  const missingPhone = await fetch(`${BASE_URL}/api/pharmacy/orders`);
  assert.equal(missingPhone.status, 422);
  assert.match((await missingPhone.json()).error, /phone/i);

  const invalidOrder = await fetch(`${BASE_URL}/api/pharmacy/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9876543210', storeId: 1, items: [] })
  });
  assert.equal(invalidOrder.status, 422);
  assert.match((await invalidOrder.json()).error, /deliveryMethod|items/i);

  const validOrderWithoutDb = await fetch(`${BASE_URL}/api/pharmacy/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: '9876543210',
      storeId: 1,
      deliveryMethod: 'home',
      deliveryAddress: { line1: '22 Main Road', city: 'Muzaffarnagar', state: 'Uttar Pradesh', pincode: '251001' },
      items: [{ productId: 1, quantity: 1 }]
    })
  });
  assert.equal(validOrderWithoutDb.status, 503);
  assert.match((await validOrderWithoutDb.json()).error, /database/i);
});
