const EARTH_RADIUS_KM = 6371;

const emergencyContacts = [
  { service: 'Ambulance', number: '112', description: 'National emergency response' },
  { service: 'Emergency', number: '112', description: 'National emergency response' },
];

function validateCoordinates(latitude, longitude) {
  if (latitude === null || latitude === undefined || latitude === '' || longitude === null || longitude === undefined || longitude === '') {
    const error = new Error('valid latitude and longitude are required');
    error.statusCode = 422;
    throw error;
  }
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    const error = new Error('valid latitude and longitude are required');
    error.statusCode = 422;
    throw error;
  }
  return { latitude: lat, longitude: lon };
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const toRadians = value => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function emergencyResponse() {
  return {
    emergency: true,
    disclaimer: 'For life-threatening emergencies, call the local emergency service immediately.',
    contacts: emergencyContacts,
  };
}

module.exports = { validateCoordinates, distanceKm, emergencyResponse, emergencyContacts };
