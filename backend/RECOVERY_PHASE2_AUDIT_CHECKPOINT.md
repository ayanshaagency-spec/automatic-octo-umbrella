# Phase 2 Safe Backend Verification — Audit Checkpoint

Branch: `recovery/backend-postgres-safe-fixes`
Scope: source review only; no production access, deployment, merge, or live-data changes.

## Verified from source

- Backend is Node.js with PostgreSQL (`pg`); package test script includes syntax check and node tests.
- API server routes patient, doctor, admin, appointment, prescription, health-record, lab-order, payment, emergency/hospital and webhook flows.
- Patient JWT validation checks signature, expiry and subject; role tokens check role, subject, expiry and HMAC signature.
- Patient API ownership checks are present on appointments, prescriptions, health records, lab orders and payments GET/POST paths reviewed.
- Doctor appointment listing/status updates use doctor role and appointment-to-doctor ownership in repository SQL.
- Payment webhook signature validation and duplicate event handling are implemented in the reviewed flow.
- Migration runner executes baseline schema, sorted phase migrations, then sorted alignment migrations, within a transaction.
- SQL migrations reviewed use IF NOT EXISTS guards for many objects; Phase 3 also backfills missing ownership fields. The runner re-executes SQL rather than maintaining a migration ledger, so full rerun safety still requires isolated database testing.
- The prior migration CI GREEN result is acknowledged; this audit checkpoint does not independently rerun that workflow.

## Risks / items requiring follow-up

1. Request body parser buffers request bodies without an explicit byte limit. Add bounded parsing and predictable 413 responses.
2. OTP issuance has no observed per-phone/IP rate limiting or attempt throttling in the reviewed auth module. Add abuse controls before production.
3. CORS permits wildcard if configured and reflects the request origin when allowed; ensure production configuration is explicit and never wildcard for sensitive deployment.
4. PostgreSQL production SSL uses `rejectUnauthorized: false`, which disables certificate verification. Confirm host/provider TLS requirements and replace with verified certificate handling where supported.
5. OTP is held in an in-memory Map: it is not shared across instances and resets on restart. A production OTP delivery/verification design needs durable/shared state or documented single-instance constraints.
6. OTP verification is single-use and expiry-checked, but brute-force attempt limits per OTP/phone are not present in the reviewed module.
7. Migration rerun and legacy-schema compatibility need execution against an isolated disposable PostgreSQL instance; no production database was contacted.

## Safety status

- No production database connection or data mutation performed.
- No deployment performed.
- No merge to main performed.
- No destructive code or database operation performed.

## Next verification

Address high-priority request-body limits and OTP throttling in isolated tests, then run the complete backend test suite and migration twice on a disposable PostgreSQL database, recording actual results. Review production CORS and TLS configuration separately before any staging/production release.
