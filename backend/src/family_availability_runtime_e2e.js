'use strict';

const assert = require('node:assert/strict');

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.FAMILY_AVAILABILITY_E2E_CI !== '1') {
    throw new Error('Family/availability E2E is restricted to GitHub Actions disposable PostgreSQL.');
  }
  const databaseUrl = new URL(process.env.DATABASE_URL || '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(databaseUrl.hostname) ||
      databaseUrl.pathname.replace(/^\//, '') !== 'ayansha_healthcare') {
    throw new Error('Refusing to run family/availability E2E outside the disposable localhost database.');
  }
  const baseUrl = process.env.PHARMACY_E2E_BASE_URL || 'http://127.0.0.1:3918';
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error('CI-only admin credentials are required.');

  const request = async (route, options = {}) => {
    const response = await fetch(new URL(route, baseUrl), {
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {}),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = { raw }; }
    return { status: response.status, body };
  };
  const authHeaders = token => ({ Authorization: 'Bearer ' + token });
  const expectStatus = (result, expected, label) => {
    assert.equal(result.status, expected,
      label + ': expected HTTP ' + expected + ', received ' + result.status + ' ' + JSON.stringify(result.body));
  };
  const loginPatient = async (phone, name) => {
    const challenge = await request('/api/auth/request-otp', {
      method: 'POST', body: { phone }
    });
    expectStatus(challenge, 200, 'Request patient OTP for ' + phone);
    assert.match(challenge.body.devOtp || '', /^[0-9]{6}$/);
    const verified = await request('/api/auth/verify-otp', {
      method: 'POST', body: { phone, otp: challenge.body.devOtp, name }
    });
    expectStatus(verified, 200, 'Verify patient OTP for ' + phone);
    return verified.body.token;
  };
  const loginDoctor = async phone => {
    const challenge = await request('/api/doctor/auth/request-otp', {
      method: 'POST', body: { phone }
    });
    expectStatus(challenge, 200, 'Request doctor OTP');
    assert.match(challenge.body.devOtp || '', /^[0-9]{6}$/);
    const verified = await request('/api/doctor/auth/verify-otp', {
      method: 'POST', body: { phone, otp: challenge.body.devOtp }
    });
    expectStatus(verified, 200, 'Verify doctor OTP');
    assert.equal(verified.body.user.role, 'doctor');
    return verified.body.token;
  };
  const adminLogin = await request('/api/admin/login', {
    method: 'POST', body: { email: adminEmail, password: adminPassword }
  });
  expectStatus(adminLogin, 200, 'Admin sign-in');
  const adminToken = adminLogin.body.token;
  assert.ok(adminToken);

  const ownerPhone = '+919990001101';
  const adultPhone = '+919990001102';
  const otherPhone = '+919990001103';
  const ownerToken = await loginPatient(ownerPhone, 'Family CI Owner');
  const ownerHeaders = authHeaders(ownerToken);

  expectStatus(await request('/api/family-members'), 401, 'Reject anonymous family-list access');
  expectStatus(await request('/api/family-consent-requests'), 401, 'Reject anonymous consent access');

  const child = await request('/api/family-members', {
    method: 'POST', headers: ownerHeaders,
    body: { fullName: 'CI Child Dependent', relationship: 'child', dateOfBirth: '2016-01-01' }
  });
  expectStatus(child, 201, 'Create guardian-managed child dependent');
  assert.equal(child.body.consent_status, 'guardian_managed');
  assert.deepEqual(child.body.access_scopes, ['appointments']);

  const adult = await request('/api/family-members', {
    method: 'POST', headers: ownerHeaders,
    body: { fullName: 'CI Adult Dependent', relationship: 'parent', dateOfBirth: '1980-01-01', phone: adultPhone }
  });
  expectStatus(adult, 201, 'Create adult dependent requiring own consent');
  assert.equal(adult.body.consent_status, 'pending_member_verification');
  assert.deepEqual(adult.body.access_scopes, []);

  const adultToken = await loginPatient(adultPhone, 'CI Adult Dependent');
  const consentRequests = await request('/api/family-consent-requests', { headers: authHeaders(adultToken) });
  expectStatus(consentRequests, 200, 'Adult can see matching consent requests for own phone');
  assert.ok(consentRequests.body.some(row => Number(row.id) === Number(adult.body.id)));

  const invalidConsent = await request('/api/family-members/' + adult.body.id + '/verify-consent', {
    method: 'POST', headers: authHeaders(adultToken), body: { scopes: ['health_records'] }
  });
  expectStatus(invalidConsent, 422, 'Reject family consent outside the allowed appointment-only scope');

  const doctors = await request('/api/admin/doctors', { headers: authHeaders(adminToken) });
  expectStatus(doctors, 200, 'Admin doctor directory');
  const suffix = String(Date.now()).slice(-6);
  const doctorPhone = '+91999001' + suffix;
  const doctorCreated = await request('/api/admin/doctors', {
    method: 'POST', headers: authHeaders(adminToken),
    body: { name: 'Family E2E Doctor ' + suffix, specialty: 'General Medicine', phone: doctorPhone }
  });
  expectStatus(doctorCreated, 201, 'Admin provisions doctor for availability E2E');

  const doctorToken = await loginDoctor(doctorPhone);
  const doctorHeaders = authHeaders(doctorToken);
  expectStatus(await request('/api/doctor/availability-slots'), 200, 'Doctor can read own availability');
  expectStatus(await request('/api/doctor/availability-slots'), 401, 'Patient token cannot access doctor availability')
    .status === 401 ? undefined : undefined;

  function futureAlignedSlot(daysAhead) {
    const date = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    date.setUTCSeconds(0, 0);
    const minute = date.getUTCMinutes();
    date.setUTCMinutes(minute + ((30 - (minute % 30)) % 30));
    return date;
  }
  async function publishSlot(daysAhead) {
    const startsAt = futureAlignedSlot(daysAhead);
    const result = await request('/api/doctor/availability-slots', {
      method: 'POST', headers: doctorHeaders,
      body: { startsAt: startsAt.toISOString(), durationMinutes: 30 }
    });
    expectStatus(result, 201, 'Doctor publishes a 30-minute appointment slot');
    return { id: Number(result.body.id), startsAt };
  }

  const slotOne = await publishSlot(3);
  const slotOneDuplicate = await request('/api/doctor/availability-slots', {
    method: 'POST', headers: doctorHeaders,
    body: { startsAt: slotOne.startsAt.toISOString(), durationMinutes: 30 }
  });
  expectStatus(slotOneDuplicate, 409, 'Reject duplicate doctor/time slot');

  const from = slotOne.startsAt.toISOString().slice(0, 10);
  const toDate = new Date(slotOne.startsAt.getTime() + 24 * 60 * 60 * 1000);
  const to = toDate.toISOString().slice(0, 10);
  const publicAvailability = await request('/api/doctors/' + doctorCreated.body.id + '/availability?from=' + from + '&to=' + to);
  expectStatus(publicAvailability, 200, 'Patient can read published available slots');
  assert.ok(publicAvailability.body.some(row => Number(row.id) === slotOne.id));
  assert.equal(Object.prototype.hasOwnProperty.call(publicAvailability.body[0], 'appointment_id'), false,
    'Public availability must not expose appointment linkage');

  const childAppointment = await request('/api/appointments', {
    method: 'POST', headers: ownerHeaders,
    body: {
      patientName: 'Family CI Owner', phone: ownerPhone, doctorId: Number(doctorCreated.body.id),
      slotId: slotOne.id, familyMemberId: Number(child.body.id), mode: 'In-clinic'
    }
  });
  expectStatus(childAppointment, 201, 'Owner can book for a guardian-managed minor');
  assert.equal(Number(childAppointment.body.family_member_id), Number(child.body.id));

  const slotTwo = await publishSlot(4);
  const adultWithoutConsent = await request('/api/appointments', {
    method: 'POST', headers: ownerHeaders,
    body: {
      patientName: 'Family CI Owner', phone: ownerPhone, doctorId: Number(doctorCreated.body.id),
      slotId: slotTwo.id, familyMemberId: Number(adult.body.id), mode: 'In-clinic'
    }
  });
  expectStatus(adultWithoutConsent, 403, 'Owner cannot book adult dependent without that adult member consent');

  const consentGranted = await request('/api/family-members/' + adult.body.id + '/verify-consent', {
    method: 'POST', headers: authHeaders(adultToken), body: { scopes: ['appointments', 'appointments'] }
  });
  expectStatus(consentGranted, 200, 'Adult can grant appointment-only consent');
  assert.equal(consentGranted.body.consent_status, 'member_verified');
  assert.deepEqual(consentGranted.body.access_scopes, ['appointments']);

  const ownerFamily = await request('/api/family-members', { headers: ownerHeaders });
  expectStatus(ownerFamily, 200, 'Owner can list own family members');
  const savedAdult = ownerFamily.body.find(row => Number(row.id) === Number(adult.body.id));
  assert.equal(savedAdult.consent_status, 'member_verified');
  assert.deepEqual(savedAdult.access_scopes, ['appointments']);

  const otherToken = await loginPatient(otherPhone, 'Other CI Patient');
  const otherHeaders = authHeaders(otherToken);
  const otherFamily = await request('/api/family-members', { headers: otherHeaders });
  expectStatus(otherFamily, 200, 'Other patient family list');
  assert.equal(otherFamily.body.length, 0, 'Family list must be scoped to the signed-in owner');
  expectStatus(await request('/api/family-members/' + child.body.id, {
    method: 'DELETE', headers: otherHeaders
  }), 404, 'Other patient cannot revoke someone else family member');

  const adultAppointment = await request('/api/appointments', {
    method: 'POST', headers: ownerHeaders,
    body: {
      patientName: 'Family CI Owner', phone: ownerPhone, doctorId: Number(doctorCreated.body.id),
      slotId: slotTwo.id, familyMemberId: Number(adult.body.id), mode: 'In-clinic'
    }
  });
  expectStatus(adultAppointment, 201, 'Owner can book adult dependent after adult grants consent');
  assert.equal(Number(adultAppointment.body.family_member_id), Number(adult.body.id));

  const slotThree = await publishSlot(5);
  const raceBody = {
    patientName: 'Family CI Owner', phone: ownerPhone, doctorId: Number(doctorCreated.body.id),
    slotId: slotThree.id, mode: 'In-clinic'
  };
  const concurrentBookings = await Promise.all([
    request('/api/appointments', { method: 'POST', headers: ownerHeaders, body: raceBody }),
    request('/api/appointments', { method: 'POST', headers: ownerHeaders, body: raceBody })
  ]);
  assert.deepEqual(concurrentBookings.map(item => item.status).sort(), [201, 409],
    'Concurrent patients cannot double-book a doctor availability slot');

  const bookedSlotCancel = await request('/api/doctor/availability-slots/' + slotOne.id, {
    method: 'DELETE', headers: doctorHeaders
  });
  expectStatus(bookedSlotCancel, 409, 'Doctor cannot cancel an already-booked slot');

  const slotFour = await publishSlot(6);
  const cancelledSlot = await request('/api/doctor/availability-slots/' + slotFour.id, {
    method: 'DELETE', headers: doctorHeaders
  });
  expectStatus(cancelledSlot, 200, 'Doctor can cancel an unbooked slot');
  const publicAfterCancel = await request('/api/doctors/' + doctorCreated.body.id + '/availability?from=' + from + '&to=' + to);
  expectStatus(publicAfterCancel, 200, 'Public availability after cancellation');
  assert.equal(publicAfterCancel.body.some(row => Number(row.id) === slotFour.id), false,
    'Cancelled slots must not appear in the public directory');

  const revoked = await request('/api/family-members/' + adult.body.id, {
    method: 'DELETE', headers: ownerHeaders
  });
  expectStatus(revoked, 200, 'Owner revokes adult dependent access');
  assert.equal(revoked.body.consent_status, 'revoked');
  const revokedBooking = await request('/api/appointments', {
    method: 'POST', headers: ownerHeaders,
    body: {
      patientName: 'Family CI Owner', phone: ownerPhone, doctorId: Number(doctorCreated.body.id),
      slotId: slotFour.id, familyMemberId: Number(adult.body.id), mode: 'In-clinic'
    }
  });
  expectStatus(revokedBooking, 403, 'Revoked family access cannot be used for a new booking');

  const doctorSlots = await request('/api/doctor/availability-slots', { headers: doctorHeaders });
  expectStatus(doctorSlots, 200, 'Doctor can inspect own schedule');
  assert.ok(doctorSlots.body.some(slot => Number(slot.id) === slotOne.id && slot.status === 'booked'));
  assert.ok(doctorSlots.body.some(slot => Number(slot.id) === slotFour.id && slot.status === 'available' && slot.cancelled_at === undefined));

  console.log('Family + availability PostgreSQL E2E passed: owner scoping, minor guardian access, adult OTP consent, consent scope limit, revocation, doctor-only slot publishing, unique slots, published-only visibility, concurrent double-booking protection and cancellation rules.');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
