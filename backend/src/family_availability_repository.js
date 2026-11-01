'use strict';

const { getDb } = require('./db');
const { validateFamilyMember, validateGrantedScopes } = require('./family_validation');

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function listFamilyMembers(ownerPhone) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(
    `SELECT fm.id, fm.full_name, fm.relationship, fm.date_of_birth,
            fm.phone, fm.consent_status, fm.access_scopes,
            fm.created_at, fm.updated_at
       FROM family_members fm
       JOIN patients owner ON owner.id = fm.owner_patient_id
      WHERE owner.phone = $1 AND fm.revoked_at IS NULL
      ORDER BY fm.created_at DESC, fm.id DESC`,
    [ownerPhone]
  );
  return rows;
}

async function createFamilyMember(ownerPhone, input) {
  const db = await getDb();
  if (!db) return null;
  const member = validateFamilyMember(input);
  const owner = await db.query('SELECT id FROM patients WHERE phone = $1', [ownerPhone]);
  if (!owner.rowCount) throw httpError('Patient profile not found; sign in again before adding a family member', 404);
  const { rows } = await db.query(
    `INSERT INTO family_members
       (owner_patient_id, full_name, relationship, date_of_birth, phone, consent_status, access_scopes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, full_name, relationship, date_of_birth, phone, consent_status, access_scopes, created_at, updated_at`,
    [owner.rows[0].id, member.fullName, member.relationship, member.dateOfBirth,
      member.phone, member.consentStatus, member.accessScopes]
  );
  return rows[0];
}

async function revokeFamilyMember(ownerPhone, memberId) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(
    `UPDATE family_members fm
        SET consent_status = 'revoked', access_scopes = ARRAY[]::TEXT[],
            revoked_at = NOW(), updated_at = NOW()
       FROM patients owner
      WHERE fm.owner_patient_id = owner.id AND owner.phone = $1
        AND fm.id = $2 AND fm.revoked_at IS NULL
      RETURNING fm.id, fm.consent_status, fm.access_scopes, fm.revoked_at`,
    [ownerPhone, memberId]
  );
  if (!rows.length) throw httpError('Family member not found', 404);
  return rows[0];
}

async function listFamilyConsentRequests(memberPhone) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(
    `SELECT fm.id, fm.full_name, fm.relationship, fm.date_of_birth,
            fm.consent_status, owner.name AS owner_name, fm.created_at
       FROM family_members fm
       JOIN patients owner ON owner.id = fm.owner_patient_id
      WHERE fm.phone = $1
        AND fm.consent_status = 'pending_member_verification'
        AND fm.revoked_at IS NULL
      ORDER BY fm.created_at DESC`,
    [memberPhone]
  );
  return rows;
}

async function verifyAdultFamilyMemberConsent(memberId, memberPhone, grantedScopes = []) {
  const db = await getDb();
  if (!db) return null;
  const scopes = validateGrantedScopes(grantedScopes);
  const { rows } = await db.query(
    `UPDATE family_members
        SET consent_status = CASE WHEN cardinality($3::text[]) > 0 THEN 'member_verified' ELSE 'declined' END,
            access_scopes = $3,
            updated_at = NOW()
      WHERE id = $1 AND phone = $2
        AND consent_status = 'pending_member_verification'
        AND revoked_at IS NULL
        AND date_of_birth <= (CURRENT_DATE - INTERVAL '18 years')::date
      RETURNING id, full_name, relationship, consent_status, access_scopes, updated_at`,
    [memberId, memberPhone, scopes]
  );
  if (!rows.length) throw httpError('A matching adult family profile requiring consent was not found', 404);
  return rows[0];
}

async function createDoctorAvailabilitySlot(doctorPhone, input) {
  const db = await getDb();
  if (!db) return null;
  const duration = Number(input?.durationMinutes ?? 30);
  // Fixed 30-minute blocks plus the unique doctor/start index prevent overlapping slots.
  if (duration !== 30) throw httpError('durationMinutes must be 30 for the current scheduling model', 422);
  const startsAt = new Date(input?.startsAt);
  const now = new Date();
  const maxDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  if (!input?.startsAt || Number.isNaN(startsAt.getTime()) || startsAt <= now || startsAt > maxDate ||
      startsAt.getUTCSeconds() !== 0 || startsAt.getUTCMilliseconds() !== 0 ||
      ![0, 30].includes(startsAt.getUTCMinutes())) {
    throw httpError('startsAt must be a future 30-minute-aligned time within the next 90 days', 422);
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO doctor_availability_slots (doctor_id, slot_start, duration_minutes, created_by_phone)
       SELECT id, $2, $3, phone FROM doctors WHERE phone = $1
       RETURNING id, doctor_id, slot_start, duration_minutes, created_at`,
      [doctorPhone, startsAt.toISOString(), duration]
    );
    if (!rows.length) throw httpError('Doctor identity is not provisioned', 404);
    return rows[0];
  } catch (error) {
    if (error.code === '23505') throw httpError('An availability slot already exists at this time', 409);
    throw error;
  }
}

async function listDoctorAvailabilitySlots(doctorPhone, from, to) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(
    `SELECT s.id, s.slot_start, s.duration_minutes,
            CASE WHEN a.id IS NULL THEN 'available' ELSE 'booked' END AS status,
            a.id AS appointment_id
       FROM doctor_availability_slots s
       JOIN doctors d ON d.id = s.doctor_id
       LEFT JOIN appointments a
         ON a.slot_id = s.id AND a.status <> 'cancelled'
      WHERE d.phone = $1 AND s.cancelled_at IS NULL
        AND ($2::timestamptz IS NULL OR s.slot_start >= $2)
        AND ($3::timestamptz IS NULL OR s.slot_start < $3)
      ORDER BY s.slot_start`,
    [doctorPhone, from || null, to || null]
  );
  return rows;
}

async function listPublicDoctorAvailability(doctorId, from, to) {
  const db = await getDb();
  if (!db) return null;
  const { rows } = await db.query(
    `SELECT s.id, s.slot_start, s.duration_minutes
       FROM doctor_availability_slots s
       LEFT JOIN appointments a
         ON a.slot_id = s.id AND a.status <> 'cancelled'
      WHERE s.doctor_id = $1 AND s.cancelled_at IS NULL
        AND s.slot_start > NOW()
        AND s.slot_start >= $2::timestamptz
        AND s.slot_start < $3::timestamptz
        AND a.id IS NULL
      ORDER BY s.slot_start`,
    [doctorId, from, to]
  );
  return rows;
}

async function cancelDoctorAvailabilitySlot(doctorPhone, slotId) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.query(
    `UPDATE doctor_availability_slots s
        SET cancelled_at = NOW()
       FROM doctors d
      WHERE s.doctor_id = d.id AND d.phone = $1
        AND s.id = $2 AND s.cancelled_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM appointments a
           WHERE a.slot_id = s.id AND a.status <> 'cancelled'
        )
      RETURNING s.id, s.cancelled_at`,
    [doctorPhone, slotId]
  );
  if (result.rowCount) return result.rows[0];
  const existing = await db.query(
    `SELECT s.id,
            EXISTS(SELECT 1 FROM appointments a WHERE a.slot_id=s.id AND a.status <> 'cancelled') AS booked
       FROM doctor_availability_slots s
       JOIN doctors d ON d.id=s.doctor_id
      WHERE d.phone=$1 AND s.id=$2 AND s.cancelled_at IS NULL`,
    [doctorPhone, slotId]
  );
  if (!existing.rowCount) throw httpError('Availability slot not found', 404);
  throw httpError('A booked slot cannot be cancelled; cancel the appointment first', 409);
}

async function createAppointment(data) {
  const db = await getDb();
  if (!db) return null;
  const doctorId = Number(data.doctorId);
  if (!Number.isSafeInteger(doctorId) || doctorId <= 0) {
    throw httpError('doctorId must be a valid positive integer', 422);
  }
  const mode = data.mode || 'Video';
  if (!['Video', 'In-clinic'].includes(mode)) {
    throw httpError('mode must be Video or In-clinic', 422);
  }
  if (typeof data.patientName !== 'string' || data.patientName.trim().length < 2 || data.patientName.trim().length > 120) {
    throw httpError('patientName must be between 2 and 120 characters', 422);
  }

  const familyMemberId = data.familyMemberId == null ? null : Number(data.familyMemberId);
  if (familyMemberId !== null && (!Number.isSafeInteger(familyMemberId) || familyMemberId <= 0)) {
    throw httpError('familyMemberId must be a valid positive integer', 422);
  }

  const requestedSlotId = data.slotId == null ? null : Number(data.slotId);
  if (requestedSlotId !== null && (!Number.isSafeInteger(requestedSlotId) || requestedSlotId <= 0)) {
    throw httpError('slotId must be a positive integer', 422);
  }
  let requestedStart = null;
  if (requestedSlotId === null && data.appointmentAt) {
    const parsed = new Date(data.appointmentAt);
    if (Number.isNaN(parsed.getTime())) throw httpError('appointmentAt must be a valid date', 422);
    requestedStart = parsed.toISOString();
  }
  if (requestedSlotId === null && requestedStart === null) {
    throw httpError('A doctor-published availability slot is required', 422);
  }

  let result;
  try {
    result = await db.query(
      `WITH family_guard AS MATERIALIZED (
         SELECT fm.id
           FROM family_members fm
           JOIN patients owner ON owner.id = fm.owner_patient_id
          WHERE $7::bigint IS NOT NULL
            AND fm.id = $7
            AND owner.phone = $2
            AND fm.revoked_at IS NULL
            AND fm.consent_status IN ('guardian_managed','member_verified')
            AND 'appointments' = ANY(fm.access_scopes)
          FOR UPDATE OF fm
       ),
       selected_slot AS MATERIALIZED (
         SELECT s.id, s.doctor_id, s.slot_start
           FROM doctor_availability_slots s
          WHERE s.doctor_id = $3
            AND s.cancelled_at IS NULL
            AND s.slot_start > NOW()
            AND (
              ($4::bigint IS NOT NULL AND s.id = $4)
              OR ($4::bigint IS NULL AND s.slot_start = $5::timestamptz)
            )
            AND NOT EXISTS (
              SELECT 1 FROM appointments existing
               WHERE existing.slot_id = s.id AND existing.status <> 'cancelled'
            )
          FOR UPDATE OF s
       ),
       patient AS (
         INSERT INTO patients (name, phone)
         SELECT $1, $2
           FROM selected_slot
          WHERE $7::bigint IS NULL OR EXISTS (SELECT 1 FROM family_guard)
         ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
         RETURNING id
       ),
       booked AS (
         INSERT INTO appointments
           (patient_id, doctor_id, appointment_at, mode, slot_id, family_member_id)
         SELECT patient.id, selected_slot.doctor_id, selected_slot.slot_start,
                $6, selected_slot.id, $7
           FROM patient CROSS JOIN selected_slot
         RETURNING id, patient_id, doctor_id, appointment_at, mode, status, slot_id, family_member_id
       ),
       status AS (
         SELECT
           ($7::bigint IS NULL OR EXISTS (SELECT 1 FROM family_guard)) AS family_allowed,
           EXISTS (SELECT 1 FROM selected_slot) AS slot_available
       )
       SELECT booked.*, status.family_allowed, status.slot_available
         FROM status
         LEFT JOIN booked ON TRUE`,
      [data.patientName.trim(), data.phone, doctorId, requestedSlotId, requestedStart, mode, familyMemberId]
    );
  } catch (error) {
    if (error.code === '23505') {
      throw httpError('Selected availability slot was booked by another patient', 409);
    }
    throw error;
  }

  const row = result.rows[0];
  if (!row.family_allowed) throw httpError('Family-member appointment permission is not granted', 403);
  if (!row.slot_available || !row.id) throw httpError('Selected availability slot is no longer available', 409);
  delete row.family_allowed;
  delete row.slot_available;
  return row;
}

module.exports = {
  listFamilyMembers,
  createFamilyMember,
  revokeFamilyMember,
  listFamilyConsentRequests,
  verifyAdultFamilyMemberConsent,
  createDoctorAvailabilitySlot,
  listDoctorAvailabilitySlots,
  listPublicDoctorAvailability,
  cancelDoctorAvailabilitySlot,
  createAppointment
};
