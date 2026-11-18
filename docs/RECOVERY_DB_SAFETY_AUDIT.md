# Ayansha Health Care Database Safety Audit

Branch: recovery/backend-postgres-safe-fixes
Scope: Read-only code review; no production changes.

## Confirmed risks

1. PostgreSQL access is a single shared `pg.Client` in `backend/src/db.js`. It has no reconnect strategy.
2. `createPrescription` uses BEGIN/COMMIT/ROLLBACK on that shared client. Concurrent requests may interfere with transaction boundaries.
3. `createAppointment` checks for an existing slot, then inserts separately. This is susceptible to a race condition.
4. The SQL appointments schema currently has no unique slot constraint.
5. `backend/scripts/migrate.js` applies every SQL file in `backend/db/migrations` in order, but does not record migration history. Do not run it against production without backup, schema/data audit, and migration plan.
6. A separate Mongoose appointment route/model exists (`backend/routes/appointmentRoutes.js`, `backend/models/Appointment.js`). The recovery server currently references the SQL repository route in `backend/src/server.js`; do not assume both paths are active in production.

## Safe remediation sequence

- Keep this branch isolated from production.
- Add test coverage for simultaneous booking attempts for the same doctor/time slot; expected outcome: exactly one booking succeeds and the other returns conflict.
- Inspect production schema and existing appointment duplicates before designing a unique index.
- Implement database-enforced slot uniqueness only after duplicates are checked and a rollback strategy is documented.
- Change prescription transaction handling to use a dedicated connection/client per transaction; test concurrent prescriptions and rollback.
- Add migration-history/guard behavior only after reviewing legacy migration compatibility.
- Re-run isolated CI.
- Production recovery remains blocked until a verified backup/snapshot and live data integrity check are available.

## Status

No production database, Railway service, live deployment, or data has been modified by this audit.


## Recovery-branch remediation status (2026-11-18)

- Added test-first coverage for concurrent slot booking and dedicated-client prescription transactions. The test-first commit intentionally exposed the existing booking conflict mapping and transaction-client problems in isolated CI.
- Replaced the single PostgreSQL client with a pg.Pool so transaction code can acquire dedicated clients while existing non-transactional queries still use pool.query.
- Appointment inserts now translate PostgreSQL unique-constraint violations (23505) into HTTP 409 conflicts.
- Added backend/db/migrations/004_appointment_slot_uniqueness.sql. It performs a duplicate-active-slot preflight and raises an exception if existing active duplicates are found, then creates a partial unique index excluding cancelled bookings.
- Added isolated PostgreSQL integration test for simultaneous inserts and rebooking a cancelled slot.
- Production duplicates are NOT scanned: live Railway access remains prohibited. The migration guard is therefore the safety check that will stop the migration if active duplicates exist.
- CI runs against its own PostgreSQL service only; CI success does not establish production DB health.
