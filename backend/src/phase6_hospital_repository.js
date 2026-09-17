const { getDb } = require('./db');
const { validateCoordinates, distanceKm } = require('./phase6_emergency');

async function listNearbyHospitals(latitude, longitude, radiusKm = 25, limit = 20) {
  const coords = validateCoordinates(latitude, longitude);
  const radius = Number(radiusKm);
  const maxResults = Number(limit);
  if (!Number.isFinite(radius) || radius <= 0 || radius > 200) {
    const error = new Error('radiusKm must be greater than 0 and at most 200');
    error.statusCode = 422;
    throw error;
  }
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50) {
    const error = new Error('limit must be between 1 and 50');
    error.statusCode = 422;
    throw error;
  }

  const db = await getDb();
  if (!db) return null;

  const result = await db.query(
    `SELECT id, name, address, city, state, latitude, longitude, phone, emergency_available
       FROM hospitals
      WHERE active = TRUE
        AND latitude BETWEEN $1 AND $2
        AND longitude BETWEEN $3 AND $4
      LIMIT 200`,
    [Math.max(-90, coords.latitude - radius / 111), Math.min(90, coords.latitude + radius / 111),
     Math.max(-180, coords.longitude - radius / 111), Math.min(180, coords.longitude + radius / 111)]
  );

  return result.rows
    .map(row => ({ ...row, distanceKm: Number(distanceKm(coords.latitude, coords.longitude, Number(row.latitude), Number(row.longitude)).toFixed(2)) }))
    .filter(row => row.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, maxResults);
}

module.exports = { listNearbyHospitals };
