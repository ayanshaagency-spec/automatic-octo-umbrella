# Recovery Security & Staging Checkpoint

Date: 2026-11-20
Branch: `recovery/backend-postgres-safe-fixes`

## Verified
- Backend test workflow and Docker workflow previously passed on this recovery branch (runs 44725992787 and 44725992812).
- OTP issuance and verification currently use process-local Maps in `backend/src/auth.js`; OTP expires after 5 minutes, max 5 failed attempts, request limit 5/hour and cooldown 60 seconds.
- OTP verification is synchronous and called from patient and doctor routes. Moving OTP to PostgreSQL requires async route changes and coordinated updates to test fixtures.
- `getDb()` lazily creates a PostgreSQL pool from `DATABASE_URL`.
- Webhook processor locks payment row, validates linkage, provider, amount/currency and transition, and inserts event ledger row with conflict deduplication inside a transaction.
- Current webhook processor tests are unit tests for amount conversion only; database-backed duplicate/replay tests are not present in the inspected test file.
- Deployment runbook documents host configuration and release gates; actual Railway settings/logs were not accessible in this audit.

## Pending changes (must be verified before implementation)
1. Add an additive OTP persistence migration (hash OTP at rest; expiry; attempt counter; request-window/cooldown; transactional issuance/verification; one-use semantics).
2. Convert patient/doctor OTP request and verification routes to async persistence with safe error handling.
3. Add disposable PostgreSQL integration tests for OTP expiry, one-use, attempt limits, cooldown, concurrent verification and migration repeatability.
4. Add webhook integration tests using the disposable CI PostgreSQL DB for duplicate event replay, valid transitions, invalid amount/currency/provider/payment linkage, and rollback behavior.
5. Audit PHI logging and redact patient phone/identifiers and provider payloads from logs and responses.
6. Verify repository branch protection/rulesets and CI required status checks.
7. Verify Railway staging settings and logs through authorized access; perform staging health/regression only after target environment and database scope are confirmed.

## Safety
No staging or production migration, deployment, database write, secret exposure, merge, or destructive action was performed during this checkpoint.
