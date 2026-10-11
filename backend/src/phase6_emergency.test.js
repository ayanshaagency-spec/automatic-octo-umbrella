const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCoordinates, distanceKm, emergencyResponse } = require('./phase6_emergency');

test('validates latitude and longitude', () => {
  assert.deepEqual(validateCoordinates(28.6139, 77.2090), { latitude: 28.6139, longitude: 77.209 });
});

test('rejects invalid coordinates', () => {
  assert.throws(() => validateCoordinates(91, 77), error => error.statusCode === 422);
  assert.throws(() => validateCoordinates(28, 181), error => error.statusCode === 422);
});

test('calculates zero distance for identical coordinates', () => {
  assert.equal(distanceKm(28.6139, 77.2090, 28.6139, 77.2090), 0);
});

test('returns emergency contact response', () => {
  const result = emergencyResponse();
  assert.equal(result.emergency, true);
  assert.ok(result.contacts.some(contact => contact.service === 'Ambulance' && contact.number === '112'));
  assert.match(result.disclaimer, /life-threatening emergencies/i);
});
