const { getDb } = require('./db');

const DEFAULT_SLOTS = [
  '09:00','09:30','10:00','10:30','11:00','11:30',
  '14:00','14:30','15:00','15:30','16:00','16:30'
];

async function getDoctorAvailability(doctorId, date) {
  const db = await getDb();
  if (!db) return DEFAULT_SLOTS;
  try {
    const { rows } = await db.query(
      `SELECT to_char(appointment_at, 'HH24:MI') AS slot
         FROM appointments
        WHERE doctor_id = $1 AND appointment_at::date = $2
          AND status IN ('confirmed','scheduled')`,
      [doctorId, date]
    );
    const booked = new Set(rows.map(r => r.slot));
    return DEFAULT_SLOTS.filter(slot => !booked.has(slot));
  } catch (_) {
    return DEFAULT_SLOTS;
  }
}

module.exports = { getDoctorAvailability };
