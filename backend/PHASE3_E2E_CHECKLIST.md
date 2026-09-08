# Phase 3 — Prescription & Health Records E2E Checklist

This checklist is the verification gate before Phase 3 is marked complete.

## Database

1. Apply migrations in order, including `backend/migrations/003_phase3_prescriptions_health_records.sql`.
2. Confirm these tables exist:
   - `prescriptions`
   - `prescription_items`
   - `health_records`
3. Confirm foreign keys connect prescriptions/records to existing patients, doctors, and appointments.

## API contract

- `GET /api/prescriptions?phone=<patient-phone>` returns the patient's prescriptions and medicine items.
- `POST /api/prescriptions` creates a prescription only for a valid appointment and at least one medicine.
- `GET /api/health-records?phone=<patient-phone>` returns the patient's records.
- `POST /api/health-records` creates a record only for an existing patient.
- `PATCH /api/appointments/:id/status` updates appointment status.

## Patient flow

1. Start backend with `npm start` from `backend/`.
2. Start the Flutter app with the API URL pointing at the backend.
3. Open **Health Records**.
4. Verify loading, empty, error, and refresh states.
5. After a doctor creates a prescription, verify the prescription appears with diagnosis, doctor, date, and medicine details.
6. After a doctor creates a health record, verify it appears with type, title, date, and description.

## Doctor flow

1. Open the Doctor Panel.
2. Verify the appointment queue loads from the shared API.
3. Change an appointment status and verify the API response succeeds.
4. Create a prescription with one or more medicines.
5. Add a health record for an existing patient.
6. Refresh the patient app and verify both records are visible.

## Release gate

Phase 3 should only be marked **DONE** after the database migration and the full doctor → database → patient verification above have been executed successfully. Source-code implementation alone is not considered production verification.
