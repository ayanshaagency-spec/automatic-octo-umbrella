# Ayansha Health Care — production deployment runbook

This runbook deploys the **existing** backend from this repository. It does not create a replacement application or publish the database to a static host.

## Current deployment shape

- Backend API: Node.js 20, Dockerfile at repository root, listens on `PORT` (default 3000).
- Health endpoint: `GET /health`.
- Database: PostgreSQL; `DATABASE_URL` must be supplied by the hosting platform as a secret.
- Browser client/demo: static frontend is separate from the API container. Configure its API base URL to the deployed HTTPS API URL; never put database credentials or private provider tokens in frontend code.
- GitHub Actions has separate backend test and Docker build checks. A successful image build is not proof that the app is live or connected to a production database.

## Required production environment

Configure these in the hosting provider's secret/environment settings. Never commit actual values to Git.

- `NODE_ENV=production`
- `PORT` (provided by the host; the app defaults to 3000)
- `DATABASE_URL` (managed PostgreSQL connection string)
- `JWT_SECRET` (random secret of at least 32 characters; do not reuse a sample value)
- `CORS_ALLOWED_ORIGINS` (comma-separated exact HTTPS origins for the real frontend; do not use `*`)
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` (unique, strong admin credentials)
- `OTP_PROVIDER_URL` and `OTP_PROVIDER_TOKEN` (real SMS/OTP provider; production login must not rely on development OTP)
- Payment provider secrets and webhook secret, only after a real provider account is configured and its webhook URL is registered.
- AI and WhatsApp provider credentials only if those features are enabled.

Use `backend/.env.example` as the variable-name reference. Do not copy its placeholder values into production.

## Safe rollout sequence

1. Choose a backend host that supports Docker and HTTPS, and a PostgreSQL instance with automated backups. Keep the database private to the service where possible.
2. Deploy the existing repository/branch only after reviewing the intended branch and the latest passing CI checks. Do not deploy the static GitHub Pages site as the API server.
3. Add secrets in the host dashboard. Do not paste them into GitHub files, issues, chat, or frontend settings.
4. Back up the target database before any schema change. Review `backend/db/schema.sql` and all `backend/db/migrations/*.sql`; apply schema/migrations once in a controlled step using the repository's `npm run db:migrate` command from `backend`. Do not blindly rerun migrations against a database containing important data.
5. Configure `CORS_ALLOWED_ORIGINS` with the exact deployed frontend origin(s), then set the frontend's API base URL to the API's HTTPS origin.
6. Verify `GET /health`, `GET /api/db/health`, `GET /api/doctors`, patient OTP delivery and verification, patient data ownership, appointment creation/readback, lab/prescription/health-record flows, and payment webhook signature handling.
7. Keep payments in test mode until provider credentials, webhook signature validation, duplicate-event behavior, refunds/cancellations, and reconciliation have been verified. Do not use real patient data for smoke tests.
8. Check logs, backups, rate limits, authentication/authorization, and incident recovery before announcing production readiness.

## Release gates

Do not call the system production-ready until all of these are verified against the deployed service:

- Backend tests and Docker build pass on the exact release commit.
- Database migrations and real PostgreSQL smoke tests pass.
- HTTPS API and database health checks pass.
- OTP reaches a test phone through the real provider; tokens are signed and expiring.
- Patient/doctor/admin authorization and cross-patient access denial are tested.
- CORS is restricted to the actual frontend origin.
- Payment test transaction and signed webhook are verified (or payments are disabled).
- No secrets are exposed in frontend assets, logs, repository history, or public demo.
- A rollback plan and database backup/restore path are documented.

## Important

The repository's Dockerfile builds the backend API container; it is not by itself a managed hosting account or a production database. Creating a public URL requires an authorized hosting provider, and real login/payments require their provider credentials. A demo URL or a successful container build must never be described as a live production service.
