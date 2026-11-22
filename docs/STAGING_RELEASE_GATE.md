# Ayansha Health Care — Staging Release Gate (Recovery Branch)

Branch: `recovery/backend-postgres-safe-fixes`

This gate is for an isolated staging deployment only. Do not run against production or shared patient data.

## Verified repository gates
- Backend tests and migrations run on a disposable PostgreSQL CI service.
- Migration runner is executed twice to test repeatability.
- Docker build and container smoke checks cover home, app assets, admin and doctor panel routes.
- Latest recorded recovery CI SHA: `a09f38dd427f24f97fe4d6515bacda1c2808c464` (Backend Tests and Docker Build Check passed).

## Stage 1 — Configure secrets in the staging host's secret manager
Set and review variable names only; never paste secret values into issues, logs or this document:
- `NODE_ENV=production`
- `PORT` (host-provided port)
- `DATABASE_URL` (staging PostgreSQL only, TLS required)
- `JWT_SECRET` (unique, high entropy, >=32 chars)
- `OTP_HASH_SECRET` (unique high entropy value)
- `CORS_ALLOWED_ORIGINS` (exact HTTPS frontend origin(s), comma-separated; no wildcard)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (unique credentials)
- `OTP_PROVIDER_URL`, `OTP_PROVIDER_TOKEN`
- Payment, webhook and optional messaging/AI variables only if those integrations are being staged.

Do not use production secrets or patient data in staging.

## Stage 2 — Before deployment
1. Confirm host, service, repository, branch and deployment commit SHA.
2. Confirm staging DB hostname/database identity and access scope. Do not run destructive cleanup.
3. Back up staging DB before migration; confirm backup restore procedure.
4. Review TLS, CORS origin, JWT secret, admin credentials and provider secrets.
5. Deploy only to staging, not production.

## Stage 3 — Runtime checks
Run from a trusted machine, replacing the staging origin:
- `GET /health` — expect 200 and `ok:true`.
- `GET /api/db/health` — expect 200 and `database:connected`.
- `GET /api/doctors` — verify response shape and no private fields.
- `GET /api/ai/status` — confirm truthful configured status.
- `GET /api/notifications/whatsapp/status` — confirm truthful configured status.
- Confirm patient web root, `/doctor-panel` and `/admin` load over HTTPS.
- Confirm HTTP is redirected/disabled as expected by the hosting provider.

Example (keep response bodies/logs containing sensitive data private):
```sh
STAGING_ORIGIN=https://your-staging-host.example
curl -fsS "$STAGING_ORIGIN/health"
curl -fsS "$STAGING_ORIGIN/api/db/health"
curl -fsS "$STAGING_ORIGIN/api/doctors"
curl -fsS "$STAGING_ORIGIN/api/ai/status"
curl -fsS "$STAGING_ORIGIN/api/notifications/whatsapp/status"
```

## Stage 4 — Controlled journey (fictional data only)
Use a test phone number provisioned by the OTP provider and a staging-only doctor:
1. OTP request and provider delivery; verify expiry, cooldown, attempts and single-use behavior.
2. Patient session creation, logout/re-auth behavior and unauthorized access checks.
3. Appointment booking; verify persisted appointment and doctor isolation.
4. Doctor OTP, appointment access and status update; verify cross-doctor access denied.
5. Prescription and health-record creation/access controls.
6. Lab booking and status handling.
7. Payment gateway test-mode order and webhook signature/idempotency checks only.
8. Emergency and nearby-hospital endpoint behavior.
9. WhatsApp provider-accepted state only; do not claim delivered without provider confirmation.
10. Check error logs for leaked secrets/OTP/token/patient details.

## Stage 5 — Release evidence
Record privately:
- staging origin and deployment ID/commit SHA
- database migration version
- result of each endpoint and journey test (pass/fail)
- provider verification evidence with secrets and patient data redacted
- backup/restore test result
- rollback plan and person approving release

## Blocking dependencies
This repository cannot independently provision the user's hosting, PostgreSQL, OTP, payment, AI or WhatsApp accounts. Live staging verification requires access to the existing staging host and provider configuration. Production release requires a separate explicit approval.
