# Ayansha Health Care Backend

Existing Node.js API service for the Ayansha Health Care project.

## Status
This recovery branch contains implemented API modules and tests for authentication/roles, doctor and appointment workflows, prescriptions, patient health records, lab orders, payment validation/webhooks, AI guidance and Phase 6 emergency/hospital features. Actual deployment and external integrations must be independently verified; source code and passing isolated CI do not prove a live service is operational.

## Runtime
- Node.js 18 or newer
- PostgreSQL (configured via environment variables; never commit credentials)
- Start: `npm start`
- Tests: `npm test`
- Database migration: `npm run db:migrate`

Run commands from the `backend/` directory. Provide environment settings through your local/staging secret manager or environment, not tracked files.

## Existing panel entry points
- Patient panel: `/` (served from the existing `web/` directory).
- Doctor panel: `/doctor-panel` (served from the existing `doctor-panel/` directory on the backend origin).
- Admin panel: `/admin` (existing admin entry point).
- API health check: `/health`; database health: `/api/db/health` (database health requires configured PostgreSQL).

## Safe client-demo guidance
- Use an isolated demo/staging database and fictional test records only.
- Do not run write workflows against production or a shared patient database.
- Verify the API base URL and database target before testing.
- Do not expose OTPs, access tokens, credentials, patient data, or provider secrets.
- OTP, payment, video, lab, and messaging integrations must be presented as connected only when independently verified in the demo environment.

## Recovery branch
The current work is on `recovery/backend-postgres-safe-fixes`. Review the recovery report and client-demo guide in `backend/` and `docs/` before attempting staging workflows.
