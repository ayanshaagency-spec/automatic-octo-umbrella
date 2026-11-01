'use strict';

const RELATIONSHIPS = new Set(['child', 'parent', 'spouse', 'sibling', 'other']);
const SCOPES = new Set(['appointments']);

function fail(message) {
  const error = new Error(message);
  error.statusCode = 422;
  throw error;
}

function ageOn(dateOfBirth, now = new Date()) {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (now.getUTCMonth() === dateOfBirth.getUTCMonth() && now.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function parseDateOfBirth(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail('dateOfBirth must use YYYY-MM-DD');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail('dateOfBirth must be a valid calendar date');
  }
  const age = ageOn(date);
  if (age < 0 || age > 120) fail('dateOfBirth must be in the past and within 120 years');
  return { date, age };
}

function validateFamilyMember(input) {
  const fullName = typeof input?.fullName === 'string' ? input.fullName.trim() : '';
  const relationship = typeof input?.relationship === 'string' ? input.relationship.trim().toLowerCase() : '';
  if (fullName.length < 2 || fullName.length > 120) fail('fullName must be between 2 and 120 characters');
  if (!RELATIONSHIPS.has(relationship)) fail('relationship must be child, parent, spouse, sibling or other');
  const { date, age } = parseDateOfBirth(input?.dateOfBirth);
  const phone = typeof input?.phone === 'string' ? input.phone.trim() : '';
  if (phone && !/^\+?[1-9][0-9]{9,14}$/.test(phone)) fail('phone must be a valid international phone number');
  if (age >= 18 && !phone) fail('an adult family member requires their own phone number to verify consent');
  return {
    fullName,
    relationship,
    dateOfBirth: date.toISOString().slice(0, 10),
    phone: phone || null,
    consentStatus: age < 18 ? 'guardian_managed' : 'pending_member_verification',
    accessScopes: age < 18 ? ['appointments'] : [],
    age
  };
}

function validateGrantedScopes(value) {
  if (!Array.isArray(value) || value.some(scope => typeof scope !== 'string' || !SCOPES.has(scope))) {
    fail('scopes may only contain appointments');
  }
  return [...new Set(value)];
}

module.exports = { RELATIONSHIPS, SCOPES, ageOn, parseDateOfBirth, validateFamilyMember, validateGrantedScopes };
