'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

function assertStatus(result, expected, label) {
  assert.equal(
    result.status,
    expected,
    label + ': expected HTTP ' + expected + ', got ' + result.status + ' with body ' + JSON.stringify(result.body)
  );
}

async function request(baseUrl, route, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(new URL(route, baseUrl), {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = { raw }; }
  return { status: response.status, body };
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.PHARMACY_E2E_CI !== '1') {
    throw new Error('This test is CI-only. It must not be run against a developer or production database.');
  }
  if (!process.env.DATABASE_URL || !process.env.PHARMACY_E2E_BASE_URL) {
    throw new Error('DATABASE_URL and PHARMACY_E2E_BASE_URL are required.');
  }

  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(databaseUrl.hostname) ||
      databaseUrl.pathname.replace(/^\//, '') !== 'ayansha_healthcare') {
    throw new Error('Refusing to run outside the disposable local ayansha_healthcare CI database.');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // The runtime workflow creates a fresh, disposable PostgreSQL service for every run.
    // These minimal core tables let this test apply the real Phase 7 migration without
    // depending on live data or seeding any non-test pharmacies/products.
    await pool.query([
      'CREATE TABLE IF NOT EXISTS hospitals (',
      '  id SERIAL PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL,',
      '  city TEXT NOT NULL, state TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE',
      ');',
      'CREATE TABLE IF NOT EXISTS patients (',
      '  id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE',
      ');',
      'CREATE TABLE IF NOT EXISTS prescriptions (',
      '  id SERIAL PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id)',
      ');',
      'CREATE TABLE IF NOT EXISTS prescription_items (',
      '  id SERIAL PRIMARY KEY, prescription_id INTEGER NOT NULL REFERENCES prescriptions(id),',
      '  medicine_name TEXT NOT NULL, dosage TEXT NOT NULL DEFAULT \'\',',
      '  frequency TEXT NOT NULL DEFAULT \'\', duration TEXT NOT NULL DEFAULT \'\', instructions TEXT',
      ');'
    ].join('\n'));

    const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '008_phase7_pharmacy.sql');
    await pool.query(fs.readFileSync(migrationPath, 'utf8'));

    const hospitalOne = (await pool.query(
      "INSERT INTO hospitals (name, address, city, state, active) VALUES ('CI Hospital A', '1 Test Road', 'Faridabad', 'Haryana', TRUE) RETURNING id"
    )).rows[0];
    const hospitalTwo = (await pool.query(
      "INSERT INTO hospitals (name, address, city, state, active) VALUES ('CI Hospital B', '2 Test Road', 'Faridabad', 'Haryana', TRUE) RETURNING id"
    )).rows[0];
    const patient = (await pool.query(
      "INSERT INTO patients (name, phone) VALUES ('CI Test Patient', '9990000001') RETURNING id"
    )).rows[0];
    const prescription = (await pool.query(
      'INSERT INTO prescriptions (patient_id) VALUES ($1) RETURNING id', [patient.id]
    )).rows[0];
    await pool.query(
      "INSERT INTO prescription_items (prescription_id, medicine_name) VALUES ($1, 'Amoxicillin 250mg')",
      [prescription.id]
    );

    const baseUrl = process.env.PHARMACY_E2E_BASE_URL;
    const adminLogin = await request(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
    });
    assertStatus(adminLogin, 200, 'Admin sign-in');
    const adminHeaders = { Authorization: 'Bearer ' + adminLogin.body.token };

    const otpRequest = await request(baseUrl, '/api/auth/request-otp', {
      method: 'POST',
      body: { phone: '9990000001' }
    });
    assertStatus(otpRequest, 200, 'CI patient OTP request');
    if (!otpRequest.body.devOtp) throw new Error('CI test mode must return a non-production dev OTP');
    const patientLogin = await request(baseUrl, '/api/auth/verify-otp', {
      method: 'POST',
      body: { phone: '9990000001', otp: otpRequest.body.devOtp, name: 'CI Test Patient' }
    });
    assertStatus(patientLogin, 200, 'Patient sign-in');
    const patientHeaders = { Authorization: 'Bearer ' + patientLogin.body.token };

    const anonymousAdmin = await request(baseUrl, '/api/pharmacy/admin/stores');
    assertStatus(anonymousAdmin, 401, 'Reject anonymous Pharmacy Admin API access');
    const anonymousPatientOrders = await request(baseUrl, '/api/pharmacy/orders?phone=9990000001');
    assertStatus(anonymousPatientOrders, 401, 'Reject anonymous pharmacy order history access');
    const otherPatientOrders = await request(baseUrl, '/api/pharmacy/orders?phone=9990000002', {
      headers: patientHeaders
    });
    assertStatus(otherPatientOrders, 403, 'Reject pharmacy order-history access for another phone');
    const spoofedOrder = await request(baseUrl, '/api/pharmacy/orders', {
      method: 'POST',
      headers: patientHeaders,
      body: { phone: '9990000002', storeId: 1, deliveryMethod: 'home', items: [] }
    });
    assertStatus(spoofedOrder, 403, 'Reject pharmacy order creation using another phone');

    const hospitalStoreResult = await request(baseUrl, '/api/pharmacy/admin/stores', {
      method: 'POST',
      headers: adminHeaders,
      body: {
        name: 'CI Hospital Pharmacy',
        storeType: 'hospital',
        hospitalId: Number(hospitalOne.id),
        address: '1 Test Road',
        city: 'Faridabad',
        state: 'Haryana',
        supportsHospitalDelivery: true,
        supportsHomeDelivery: true,
        phone: '9990000011'
      }
    });
    assertStatus(hospitalStoreResult, 201, 'Create hospital pharmacy');
    const hospitalStoreId = Number(hospitalStoreResult.body.id);

    const partnerStoreResult = await request(baseUrl, '/api/pharmacy/admin/stores', {
      method: 'POST',
      headers: adminHeaders,
      body: {
        name: 'CI Partner Medical Store',
        storeType: 'partner',
        address: '3 Test Road',
        city: 'Faridabad',
        state: 'Haryana',
        supportsHospitalDelivery: true,
        supportsHomeDelivery: true,
        phone: '9990000012'
      }
    });
    assertStatus(partnerStoreResult, 201, 'Create partner medical store');
    const partnerStoreId = Number(partnerStoreResult.body.id);

    for (const storeId of [hospitalStoreId, partnerStoreId]) {
      const approval = await request(baseUrl, '/api/pharmacy/admin/stores/' + storeId + '/approval', {
        method: 'PATCH',
        headers: adminHeaders,
        body: { approved: true, active: true }
      });
      assertStatus(approval, 200, 'Approve store ' + storeId);
    }

    async function createProduct(storeId, name, sku, stockQuantity) {
      const result = await request(baseUrl, '/api/pharmacy/admin/stores/' + storeId + '/products', {
        method: 'POST',
        headers: adminHeaders,
        body: {
          name,
          sku,
          brand: 'CI Test Brand',
          strength: '250mg',
          packSize: '10 tablets',
          price: 25.5,
          stockQuantity,
          requiresPrescription: true,
          active: true
        }
      });
      assertStatus(result, 201, 'Create product ' + name + ' at store ' + storeId);
      return Number(result.body.id);
    }

    const hospitalProductId = await createProduct(hospitalStoreId, 'Amoxicillin 250mg', 'CI-AMOX-H', 5);
    const partnerProductId = await createProduct(partnerStoreId, 'Amoxicillin 250mg', 'CI-AMOX-P', 5);
    const mismatchProductId = await createProduct(partnerStoreId, 'Ibuprofen 200mg', 'CI-IBU-P', 5);

    const partnerDirectory = await request(
      baseUrl,
      '/api/pharmacy/stores?storeType=partner&deliveryMethod=home&city=Faridabad'
    );
    assertStatus(partnerDirectory, 200, 'Filter partner-store directory');
    assert.ok(partnerDirectory.body.some(row => Number(row.id) === partnerStoreId), 'Approved partner store should be discoverable');

    const homeOrder = await request(baseUrl, '/api/pharmacy/orders', {
      method: 'POST',
      headers: patientHeaders,
      body: {
        phone: '9990000001',
        storeId: partnerStoreId,
        prescriptionId: Number(prescription.id),
        deliveryMethod: 'home',
        deliveryAddress: { line1: '22 CI Test Road', city: 'Faridabad', state: 'Haryana', pincode: '121001' },
        items: [{ productId: partnerProductId, quantity: 2 }],
        paymentMethod: 'cash_on_delivery'
      }
    });
    assertStatus(homeOrder, 201, 'Home delivery from partner medical store');
    assert.equal(homeOrder.body.deliveryMethod, 'home');
    assert.equal(homeOrder.body.paymentMethod, 'cash_on_delivery');
    assert.equal(homeOrder.body.paymentStatus, 'pending');

    const hospitalOrder = await request(baseUrl, '/api/pharmacy/orders', {
      method: 'POST',
      headers: patientHeaders,
      body: {
        phone: '9990000001',
        storeId: hospitalStoreId,
        prescriptionId: Number(prescription.id),
        deliveryMethod: 'hospital',
        deliveryHospitalId: Number(hospitalOne.id),
        items: [{ productId: hospitalProductId, quantity: 1 }],
        paymentMethod: 'cash_on_delivery'
      }
    });
    assertStatus(hospitalOrder, 201, 'Hospital delivery from its linked hospital pharmacy');
    assert.equal(hospitalOrder.body.deliveryMethod, 'hospital');
    assert.equal(Number(hospitalOrder.body.deliveryHospitalId), Number(hospitalOne.id));

    const crossHospitalOrder = await request(baseUrl, '/api/pharmacy/orders', {
      method: 'POST',
      headers: patientHeaders,
      body: {
        phone: '9990000001',
        storeId: hospitalStoreId,
        prescriptionId: Number(prescription.id),
        deliveryMethod: 'hospital',
        deliveryHospitalId: Number(hospitalTwo.id),
        items: [{ productId: hospitalProductId, quantity: 1 }]
      }
    });
    assertStatus(crossHospitalOrder, 422, 'Reject hospital pharmacy delivery to an unrelated hospital');

    const prescriptionMismatch = await request(baseUrl, '/api/pharmacy/orders', {
      method: 'POST',
      headers: patientHeaders,
      body: {
        phone: '9990000001',
        storeId: partnerStoreId,
        prescriptionId: Number(prescription.id),
        deliveryMethod: 'home',
        deliveryAddress: { line1: '22 CI Test Road', city: 'Faridabad', state: 'Haryana', pincode: '121001' },
        items: [{ productId: mismatchProductId, quantity: 1 }]
      }
    });
    assertStatus(prescriptionMismatch, 422, 'Reject medicine not present in patient prescription');

    const partnerProducts = await request(baseUrl, '/api/pharmacy/products?storeId=' + partnerStoreId);
    assertStatus(partnerProducts, 200, 'Read partner inventory after checkout');
    const partnerAmoxicillin = partnerProducts.body.find(row => Number(row.id) === partnerProductId);
    const partnerIbuprofen = partnerProducts.body.find(row => Number(row.id) === mismatchProductId);
    assert.equal(Number(partnerAmoxicillin.stockQuantity), 3, 'Successful checkout should reserve inventory');
    assert.equal(Number(partnerIbuprofen.stockQuantity), 5, 'Rejected prescription mismatch must not change inventory');

    console.log('Pharmacy PostgreSQL E2E passed: store types, approval gate, home/hospital delivery, destination restriction, prescription matching, COD state and stock reservation.');
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
