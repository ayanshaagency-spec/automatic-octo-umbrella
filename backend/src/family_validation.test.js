'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ageOn,
  parseDateOfBirth,
  validateFamilyMember,
  validateGrantedScopes
} = require('./family_validation');

function yearsAgo(years, current = new Date()) {
  const value = new Date(Date.UTC(current.getUTCFullYear() - years, current.getUTCMonth(), current.getUTCDate()));
  return value.toISOString().slice(0, 10);
}

test('minor dependent becomes guardian-managed with appointment-only scope', () => {
  const member = validateFamilyMember({
    fullName: '  Child Example  ',
    relationship: 'child',
    dateOfBirth: yearsAgo(10)
  });
  assert.equal(member.fullName, 'Child Example');
  assert.equal(member.consentStatus, 'guardian_managed');
  assert.deepEqual(member.accessScopes, ['appointments']);
});

test('adult dependent requires own phone and begins with no access pending consent', () => {
  const member = validateFamilyMember({
    fullName: 'Adult Example',
    relationship: 'parent',
    dateOfBirth: yearsAgo(40),
    phone: '+919876543210'
  });
  assert.equal(member.consentStatus, 'pending_member_verification');
  assert.deepEqual(member.accessScopes, []);
});

test('adult dependent without a verified phone is rejected', () => {
  assert.throws(() => validateFamilyMember({
    fullName: 'Adult Example',
    relationship: 'spouse',
    dateOfBirth: yearsAgo(30)
  }), error => error.statusCode === 422 && /own phone/i.test(error.message));
});

test('invalid relationship, invalid dates and impossible ages are rejected', () => {
  assert.throws(() => validateFamilyMember({
    fullName: 'Example', relationship: 'friend', dateOfBirth: yearsAgo(12)
  }), error => error.statusCode === 422);
  assert.throws(() => parseDateOfBirth('2025-02-29'), error => error.statusCode === 422);
  assert.throws(() => parseDateOfBirth('not-a-date'), error => error.statusCode === 422);
  assert.throws(() => parseDateOfBirth('2099-01-01'), error => error.statusCode === 422);
});

test('only appointment access can be granted and duplicate scopes are normalised', () => {
  assert.deepEqual(validateGrantedScopes(['appointments', 'appointments']), ['appointments']);
  assert.throws(() => validateGrantedScopes(['appointments', 'health_records']),
    error => error.statusCode === 422);
  assert.throws(() => validateGrantedScopes('appointments'),
    error => error.statusCode === 422);
});

test('age calculation respects whether the birthday has occurred this year', () => {
  const now = new Date('2026-11-01T12:00:00.000Z');
  assert.equal(ageOn(new Date('2008-11-02T00:00:00.000Z'), now), 17);
  assert.equal(ageOn(new Date('2008-10-31T00:00:00.000Z'), now), 18);
});
