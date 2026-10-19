const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const PORT = 3919;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const ADMIN_EMAIL = 'pharmacy-ci-admin@example.test';
const ADMIN_PASSWORD = 'ci-only-pharmacy-admin-password';
const JWT_SECRET = 'pharmacy-ci-jwt-secret-long-enough-for-hs256';

function startServer() {
  return spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      DATABASE_URL: '',
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      JWT_SECRET,
      OTP_PROVIDER_URL: '',
      OTP_PROVIDER_TOKEN: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function getAdminHeaders(baseUrl = BASE_URL) {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  assert.equal(response.status, 200, 'CI-only admin login should succeed');
  const { token } = await response.json();
  assert.ok(token, 'admin login should return a role token');
  return { Authorization: `Bearer ${token}` };
}

async function getPatientHeaders(baseUrl = BASE_URL, phone = '+919876543210') {
  const requestOtp = await fetch(`${baseUrl}/api/auth/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone })
  });
  assert.equal(requestOtp.status, 200, 'test OTP request should succeed');
  const { devOtp } = await requestOtp.json();
  assert.ok(devOtp, 'non-production test mode should return the test OTP');
  const verifyOtp = await fetch(`${baseUrl}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp: devOtp, name: 'Pharmacy API Test Patient' })
  });
  assert.equal(verifyOtp.status, 200, 'test OTP verification should create a patient session');
  const { token } = await verifyOtp.json();
  assert.ok(token, 'patient sign-in should return a session token');
  return { Authorization: `Bearer ${token}` };
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

  const adminHeaders = await getAdminHeaders();
  const patientHeaders = await getPatientHeaders();

  const unauthenticatedAdmin = await fetch(`${BASE_URL}/api/pharmacy/admin/stores`);
  assert.equal(unauthenticatedAdmin.status, 401, 'admin pharmacy API must reject anonymous access');
  const unauthenticatedPatientOrders = await fetch(`${BASE_URL}/api/pharmacy/orders?phone=%2B919876543210`);
  assert.equal(unauthenticatedPatientOrders.status, 401, 'patient order history must reject anonymous access');
  const unauthenticatedOrderCreate = await fetch(`${BASE_URL}/api/pharmacy/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919876543210', storeId: 1, items: [] })
  });
  assert.equal(unauthenticatedOrderCreate.status, 401, 'order creation must reject anonymous access');

  const options = await fetch(`${BASE_URL}/api/pharmacy/orders`, { method: 'OPTIONS' });
  assert.equal(options.status, 204);

  const stores = await fetch(`${BASE_URL}/api/pharmacy/stores`);
  assert.equal(stores.status, 503);
  assert.match((await stores.json()).error, /database/i);

  const hospitals = await fetch(`${BASE_URL}/api/pharmacy/hospitals`);
  assert.equal(hospitals.status, 503);
  assert.match((await hospitals.json()).error, /database/i);

  const invalidProducts = await fetch(`${BASE_URL}/api/pharmacy/products?storeId=0`);
  assert.equal(invalidProducts.status, 422);
  assert.match((await invalidProducts.json()).error, /storeId/i);

  const missingPhone = await fetch(`${BASE_URL}/api/pharmacy/orders`, { headers: patientHeaders });
  assert.equal(missingPhone.status, 422);
  assert.match((await missingPhone.json()).error, /phone/i);

  const invalidOrder = await fetch(`${BASE_URL}/api/pharmacy/orders`, {
    method: 'POST',
    headers: { ...patientHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9876543210', storeId: 1, items: [] })
  });
  assert.equal(invalidOrder.status, 422);
  assert.match((await invalidOrder.json()).error, /deliveryMethod|items/i);


  const adminOrders = await fetch(`${BASE_URL}/api/pharmacy/admin/orders`, { headers: adminHeaders });
  assert.equal(adminOrders.status, 503);
  assert.match((await adminOrders.json()).error, /database/i);

  const adminStoreList = await fetch(`${BASE_URL}/api/pharmacy/admin/stores`, { headers: adminHeaders });
  assert.equal(adminStoreList.status, 503);
  assert.match((await adminStoreList.json()).error, /database/i);

  const invalidStore = await fetch(`${BASE_URL}/api/pharmacy/admin/stores`, {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(invalidStore.status, 422);
  assert.match((await invalidStore.json()).error, /name/);

  const invalidApproval = await fetch(`${BASE_URL}/api/pharmacy/admin/stores/0/approval`, {
    method: 'PATCH',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved: true, active: true })
  });
  assert.equal(invalidApproval.status, 422);
  assert.match((await invalidApproval.json()).error, /storeId/);

  const invalidProduct = await fetch(`${BASE_URL}/api/pharmacy/admin/stores/1/products`, {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(invalidProduct.status, 422);
  assert.match((await invalidProduct.json()).error, /name/);

  const invalidProductUpdate = await fetch(`${BASE_URL}/api/pharmacy/admin/products/0`, {
    method: 'PATCH',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: true })
  });
  assert.equal(invalidProductUpdate.status, 422);
  assert.match((await invalidProductUpdate.json()).error, /productId/);

  const validOrderWithoutDb = await fetch(`${BASE_URL}/api/pharmacy/orders`, {
    method: 'POST',
    headers: { ...patientHeaders, 'Content-Type': 'application/json' },
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


test('production pharmacy routes enforce distinct patient and admin tokens', async t => {
  const prodPort = 3920;
  const prodBase = `http://127.0.0.1:${prodPort}`;
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: __dirname + '/..',
    env: {
      ...process.env,
      PORT: String(prodPort),
      NODE_ENV: 'production',
      DATABASE_URL: '',
      ADMIN_EMAIL: 'phase7-ci-admin@example.test',
      ADMIN_PASSWORD: 'ci-only-admin-password',
      JWT_SECRET: 'phase7-ci-secret-that-is-long-enough-for-hs256'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });

  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Production-mode API exited early: ${output}`);
    try {
      const response = await fetch(`${prodBase}/health`);
      if (response.ok) { ready = true; break; }
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'Production-mode API should start with isolated test-only credentials');

  const adminDenied = await fetch(`${prodBase}/api/pharmacy/admin/stores`);
  assert.equal(adminDenied.status, 401);
  assert.match((await adminDenied.json()).error, /Admin authentication required/);

  const patientDenied = await fetch(`${prodBase}/api/pharmacy/orders?phone=9876543210`);
  assert.equal(patientDenied.status, 401);
  assert.match((await patientDenied.json()).error, /Authentication required/);

  const adminLogin = await fetch(`${prodBase}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'phase7-ci-admin@example.test', password: 'ci-only-admin-password' })
  });
  assert.equal(adminLogin.status, 200);
  const { token } = await adminLogin.json();
  assert.ok(token);

  const adminStores = await fetch(`${prodBase}/api/pharmacy/admin/stores`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(adminStores.status, 503);
  assert.match((await adminStores.json()).error, /database/i);

  const adminStatus = await fetch(`${prodBase}/api/pharmacy/orders/1/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'accepted' })
  });
  assert.equal(adminStatus.status, 503);
  assert.match((await adminStatus.json()).error, /database/i);
});
