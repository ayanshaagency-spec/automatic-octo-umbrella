const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCoordinates } = require('./phase6_emergency');
const { listNearbyHospitals } = require('./phase6_hospital_repository');

test('hospital lookup accepts valid coordinates and normalizes values', () => {
  const coords = validateCoordinates('28.6139', '77.2090');
  assert.deepEqual(coords, { latitude: 28.6139, longitude: 77.209 });
});

test('hospital lookup rejects invalid radius', async () => {
  await assert.rejects(
    () => listNearbyHospitals(28.6139, 77.209, 0),
    error => error.statusCode === 422
  );
  await assert.rejects(
    () => listNearbyHospitals(28.6139, 77.209, 201),
    error => error.statusCode === 422
  );
});

test('hospital lookup rejects invalid limit', async () => {
  await assert.rejects(
    () => listNearbyHospitals(28.6139, 77.209, 25, 0),
    error => error.statusCode === 422
  );
  await assert.rejects(
    () => listNearbyHospitals(28.6139, 77.209, 25, 51),
    error => error.statusCode === 422
  );
});

test('hospital lookup fails safely when database is not configured', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const hospitals = await listNearbyHospitals(28.6139, 77.209);
    assert.equal(hospitals, null);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
