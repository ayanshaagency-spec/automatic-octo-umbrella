'use strict';

const assert = require('node:assert/strict');

async function main() {
  if (process.env.DOCTOR_ADMIN_E2E_CI !== '1') {
    throw new Error('Doctor admin E2E is restricted to the CI disposable database.');
  }
  const databaseUrl = new URL(process.env.DATABASE_URL || '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(databaseUrl.hostname) ||
      databaseUrl.pathname !== '/ayansha_healthcare') {
    throw new Error('Refusing to run doctor admin E2E outside the isolated localhost CI database.');
  }

  const baseUrl = process.env.PHARMACY_E2E_BASE_URL || 'http://127.0.0.1:3918';
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error('CI-only admin credentials are required.');

  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, options);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  };
  const jsonHeaders = token => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  });

  const denied = await request('/api/admin/doctors');
  assert.equal(denied.status, 401, 'admin doctor directory must require admin authentication');

  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email: adminEmail, password: adminPassword })
  });
  assert.equal(login.status, 200, 'CI admin login should succeed');
  const adminToken = login.body.token;
  assert.ok(adminToken, 'admin token should be returned');

  const timestamp = String(Date.now()).slice(-5);
  const phone = `+9199999${timestamp}`;
  const doctorInput = {
    name: `CI Doctor ${timestamp}`,
    specialty: 'General Medicine',
    phone
  };

  const invalid = await request('/api/admin/doctors', {
    method: 'POST',
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ ...doctorInput, phone: '123' })
  });
  assert.equal(invalid.status, 422, 'invalid doctor phone should be rejected');

  const created = await request('/api/admin/doctors', {
    method: 'POST',
    headers: jsonHeaders(adminToken),
    body: JSON.stringify(doctorInput)
  });
  assert.equal(created.status, 201, 'admin should register a valid doctor');
  assert.equal(created.body.phone, phone);
  assert.ok(created.body.id, 'registered doctor should have a database id');

  const duplicate = await request('/api/admin/doctors', {
    method: 'POST',
    headers: jsonHeaders(adminToken),
    body: JSON.stringify(doctorInput)
  });
  assert.equal(duplicate.status, 409, 'duplicate doctor phone must be rejected');

  const directory = await request('/api/admin/doctors', {
    headers: jsonHeaders(adminToken)
  });
  assert.equal(directory.status, 200);
  assert.ok(directory.body.some(doctor => Number(doctor.id) === Number(created.body.id)));

  const publicDirectory = await request('/api/doctors');
  assert.equal(publicDirectory.status, 200);
  const publicDoctor = publicDirectory.body.find(doctor => Number(doctor.id) === Number(created.body.id));
  assert.ok(publicDoctor, 'new doctor should appear in the public directory');
  assert.equal(Object.prototype.hasOwnProperty.call(publicDoctor, 'phone'), false,
    'public doctor directory must not expose registered phone numbers');

  const otpRequest = await request('/api/doctor/auth/request-otp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ phone })
  });
  assert.equal(otpRequest.status, 200, 'provisioned doctor should be eligible for CI OTP sign-in');
  assert.equal(otpRequest.body.delivery, 'development');
  assert.match(otpRequest.body.devOtp, /^[0-9]{6}$/);

  const verified = await request('/api/doctor/auth/verify-otp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ phone, otp: otpRequest.body.devOtp })
  });
  assert.equal(verified.status, 200, 'doctor OTP verification should create a doctor role session');
  assert.equal(verified.body.user.role, 'doctor');
  assert.ok(verified.body.token);

  const appointments = await request('/api/doctor/appointments', {
    headers: jsonHeaders(verified.body.token)
  });
  assert.equal(appointments.status, 200, 'doctor should be able to view the doctor-scoped queue');
  assert.ok(Array.isArray(appointments.body));

  const doctorCannotOpenAdmin = await request('/api/admin/doctors', {
    headers: jsonHeaders(verified.body.token)
  });
  assert.equal(doctorCannotOpenAdmin.status, 401, 'doctor token must not grant admin access');

  console.log('Doctor admin registration, duplicate prevention, privacy and CI OTP sign-in E2E passed.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
