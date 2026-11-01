'use strict';

const assert = require('node:assert/strict');

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.DOCTOR_ADMIN_E2E_CI !== '1') {
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

  const anonymousFamily = await request('/api/family-members');
  assert.equal(anonymousFamily.status, 401, 'family profiles must require patient authentication');

  const ownerPhone = `+9188888${timestamp}`;
  const ownerOtp = await request('/api/auth/request-otp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ phone: ownerPhone })
  });
  assert.equal(ownerOtp.status, 200);
  const ownerLogin = await request('/api/auth/verify-otp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ phone: ownerPhone, otp: ownerOtp.body.devOtp, name: 'CI Family Owner' })
  });
  assert.equal(ownerLogin.status, 200);
  const ownerToken = ownerLogin.body.token;

  const dateYearsAgo = years => {
    const date = new Date();
    date.setUTCFullYear(date.getUTCFullYear() - years);
    return date.toISOString().slice(0, 10);
  };
  const childProfile = await request('/api/family-members', {
    method: 'POST',
    headers: jsonHeaders(ownerToken),
    body: JSON.stringify({
      fullName: 'CI Dependent Child',
      relationship: 'child',
      dateOfBirth: dateYearsAgo(10)
    })
  });
  assert.equal(childProfile.status, 201, 'patient may create a guardian-managed child profile');
  assert.equal(childProfile.body.consent_status, 'guardian_managed');
  assert.deepEqual(childProfile.body.access_scopes, ['appointments']);

  const adultPhone = `+9177777${timestamp}`;
  const adultProfile = await request('/api/family-members', {
    method: 'POST',
    headers: jsonHeaders(ownerToken),
    body: JSON.stringify({
      fullName: 'CI Adult Dependent',
      relationship: 'parent',
      dateOfBirth: dateYearsAgo(35),
      phone: adultPhone
    })
  });
  assert.equal(adultProfile.status, 201);
  assert.equal(adultProfile.body.consent_status, 'pending_member_verification');
  assert.deepEqual(adultProfile.body.access_scopes, []);

  const adultCannotBookBeforeConsent = await request('/api/appointments', {
    method: 'POST',
    headers: jsonHeaders(ownerToken),
    body: {
      patientName: 'CI Family Owner',
      phone: ownerPhone,
      doctorId: Number(created.body.id),
      slotId: 999999,
      familyMemberId: Number(adultProfile.body.id),
      mode: 'In-clinic'
    }
  });
  assert.equal(adultCannotBookBeforeConsent.status, 403,
    'adult family profile must not be used before the member verifies consent');

  const adultOtp = await request('/api/auth/request-otp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ phone: adultPhone })
  });
  assert.equal(adultOtp.status, 200);
  const adultLogin = await request('/api/auth/verify-otp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ phone: adultPhone, otp: adultOtp.body.devOtp, name: 'CI Adult Dependent' })
  });
  assert.equal(adultLogin.status, 200);
  const memberConsent = await request(`/api/family-members/${adultProfile.body.id}/verify-consent`, {
    method: 'POST',
    headers: jsonHeaders(adultLogin.body.token),
    body: JSON.stringify({ scopes: ['appointments'] })
  });
  assert.equal(memberConsent.status, 200, 'adult member may grant the explicit appointments scope');
  assert.equal(memberConsent.body.consent_status, 'member_verified');
  assert.deepEqual(memberConsent.body.access_scopes, ['appointments']);

  const ownerFamilyList = await request('/api/family-members', {
    headers: jsonHeaders(ownerToken)
  });
  assert.equal(ownerFamilyList.status, 200);
  assert.equal(ownerFamilyList.body.length, 2);
  assert.ok(ownerFamilyList.body.some(member => Number(member.id) === Number(childProfile.body.id)));
  assert.ok(ownerFamilyList.body.some(member => Number(member.id) === Number(adultProfile.body.id)));

  const nextDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
  nextDate.setUTCHours(9, 0, 0, 0);
  const slotStartOne = new Date(nextDate);
  const slotStartTwo = new Date(nextDate.getTime() + 30 * 60 * 1000);
  const createSlot = async startsAt => request('/api/doctor/availability-slots', {
    method: 'POST',
    headers: jsonHeaders(verified.body.token),
    body: JSON.stringify({ startsAt: startsAt.toISOString(), durationMinutes: 30 })
  });

  const slotOne = await createSlot(slotStartOne);
  assert.equal(slotOne.status, 201, 'doctor may publish a 30-minute slot');
  const slotTwo = await createSlot(slotStartTwo);
  assert.equal(slotTwo.status, 201);
  const duplicateSlot = await createSlot(slotStartOne);
  assert.equal(duplicateSlot.status, 409, 'doctor cannot publish duplicate or overlapping 30-minute slots');

  const dayFrom = slotStartOne.toISOString().slice(0, 10);
  const dayToDate = new Date(slotStartOne.getTime() + 24 * 60 * 60 * 1000);
  const publicSlots = await request(
    `/api/doctors/${created.body.id}/availability?from=${dayFrom}&to=${dayToDate.toISOString().slice(0, 10)}`
  );
  assert.equal(publicSlots.status, 200, 'patients may read only public availability, not private doctor details');
  assert.equal(publicSlots.body.length, 2);
  assert.ok(publicSlots.body.every(slot => Number(slot.duration_minutes) === 30));

  const unauthorisedSlotCreate = await request('/api/doctor/availability-slots', {
    method: 'POST',
    headers: jsonHeaders(ownerToken),
    body: JSON.stringify({ startsAt: slotStartOne.toISOString(), durationMinutes: 30 })
  });
  assert.equal(unauthorisedSlotCreate.status, 401, 'patient token cannot publish doctor availability');

  const childAppointment = await request('/api/appointments', {
    method: 'POST',
    headers: jsonHeaders(ownerToken),
    body: {
      patientName: 'CI Family Owner',
      phone: ownerPhone,
      doctorId: Number(created.body.id),
      slotId: Number(slotOne.body.id),
      familyMemberId: Number(childProfile.body.id),
      mode: 'In-clinic'
    }
  });
  assert.equal(childAppointment.status, 201, 'guardian may book a published slot for a child');
  assert.equal(Number(childAppointment.body.family_member_id), Number(childProfile.body.id));
  assert.equal(Number(childAppointment.body.slot_id), Number(slotOne.body.id));

  const duplicateBooking = await request('/api/appointments', {
    method: 'POST',
    headers: jsonHeaders(ownerToken),
    body: {
      patientName: 'CI Family Owner',
      phone: ownerPhone,
      doctorId: Number(created.body.id),
      slotId: Number(slotOne.body.id),
      mode: 'In-clinic'
    }
  });
  assert.equal(duplicateBooking.status, 409, 'database prevents two active appointments from booking the same slot');

  const adultAppointment = await request('/api/appointments', {
    method: 'POST',
    headers: jsonHeaders(ownerToken),
    body: {
      patientName: 'CI Family Owner',
      phone: ownerPhone,
      doctorId: Number(created.body.id),
      slotId: Number(slotTwo.body.id),
      familyMemberId: Number(adultProfile.body.id),
      mode: 'Video'
    }
  });
  assert.equal(adultAppointment.status, 201, 'adult dependent may be booked only after verified consent');

  const doctorQueue = await request('/api/doctor/appointments', {
    headers: jsonHeaders(verified.body.token)
  });
  assert.equal(doctorQueue.status, 200);
  const dependentQueueItem = doctorQueue.body.find(item => Number(item.id) === Number(childAppointment.body.id));
  assert.ok(dependentQueueItem, 'doctor queue should contain the dependent appointment');
  assert.equal(dependentQueueItem.patient_name, 'CI Dependent Child');
  assert.equal(Number(dependentQueueItem.family_member_id), Number(childProfile.body.id));

  const bookedSlots = await request(
    `/api/doctors/${created.body.id}/availability?from=${dayFrom}&to=${dayToDate.toISOString().slice(0, 10)}`
  );
  assert.equal(bookedSlots.status, 200);
  assert.equal(bookedSlots.body.length, 0, 'booked slots must disappear from public availability');

  const childCancelled = await request(`/api/doctor/appointments/${childAppointment.body.id}/status`, {
    method: 'PATCH',
    headers: jsonHeaders(verified.body.token),
    body: JSON.stringify({ status: 'cancelled' })
  });
  assert.equal(childCancelled.status, 200);
  const reopenedSlots = await request(
    `/api/doctors/${created.body.id}/availability?from=${dayFrom}&to=${dayToDate.toISOString().slice(0, 10)}`
  );
  assert.equal(reopenedSlots.status, 200);
  assert.equal(reopenedSlots.body.length, 1, 'cancelling an appointment releases its slot');

  const otherPhone = `+9166666${timestamp}`;
  const otherOtp = await request('/api/auth/request-otp', {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ phone: otherPhone })
  });
  const otherLogin = await request('/api/auth/verify-otp', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ phone: otherPhone, otp: otherOtp.body.devOtp, name: 'Other Owner' })
  });
  const otherFamilyList = await request('/api/family-members', { headers: jsonHeaders(otherLogin.body.token) });
  assert.equal(otherFamilyList.status, 200);
  assert.equal(otherFamilyList.body.length, 0, 'family profiles must be isolated by owner account');

  const revokedAdult = await request(`/api/family-members/${adultProfile.body.id}`, {
    method: 'DELETE',
    headers: jsonHeaders(ownerToken)
  });
  assert.equal(revokedAdult.status, 200);
  assert.equal(revokedAdult.body.consent_status, 'revoked');
  assert.deepEqual(revokedAdult.body.access_scopes, []);

  const revokedCannotBook = await request('/api/appointments', {
    method: 'POST',
    headers: jsonHeaders(ownerToken),
    body: {
      patientName: 'CI Family Owner',
      phone: ownerPhone,
      doctorId: Number(created.body.id),
      slotId: Number(reopenedSlots.body[0].id),
      familyMemberId: Number(adultProfile.body.id),
      mode: 'In-clinic'
    }
  });
  assert.equal(revokedCannotBook.status, 403, 'revoked family member access cannot be used for booking');

  console.log('Family Profiles, adult consent, guardian booking, doctor availability, slot uniqueness, race-safe booking, dependent queue scoping and doctor admin OTP E2E passed.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
