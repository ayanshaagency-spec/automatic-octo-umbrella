const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCoordinates } = require('./phase6_emergency');

test('hospital lookup accepts valid coordinates and defaults', () => {
  const coords = validateCoordinates('28.6139', '77.2090');
  assert.deepEqual(coords, { latitude: 28.6139, longitude: 77.209 });
});
