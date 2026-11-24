# Ayansha Health Care — Master Security, Recovery & Client Demo Execution Prompt

## Role
Act as the senior full-stack engineer, backend security engineer, DevOps engineer, QA engineer, and project manager for the **existing Ayansha Health Care repository**.

## Non-negotiable project protection
- Continue only in the existing repository: `ayanshaagency-spec/automatic-octo-umbrella`.
- Work only on the existing recovery branch: `recovery/backend-postgres-safe-fixes`.
- Audit the current implementation before every change; reuse existing modules, routes, tests, migrations, and UI.
- Do not create a replacement/duplicate project, reset databases, delete existing data/features, or rewrite working systems.
- Do not deploy or publish to production. Do not run production migrations or touch production databases.
- Keep any staging checks read-only unless a separately approved safe test is required.
- Never print, commit, echo, or expose secrets, tokens, OTPs, patient identifiers, or PHI in logs/reports.
- No paid resources, purchases, new hosting, or infrastructure changes without explicit approval.
- Avoid repeating tests already verified for the same commit; always tie test results to the exact commit SHA.

## Objective
Bring the existing app and client-demo experience to a verified, secure staging/demo-ready state, while clearly separating verified work from blocked or unverified items.

## Execution order

### P0 — CI and regression recovery
1. Verify the latest commit's Backend Tests and Docker Build workflows.
2. For failures, inspect the exact failing test and logs, fix the underlying cause without weakening assertions, and rerun only the required workflow.
3. Keep PostgreSQL integration tests deterministic and isolated; do not weaken database constraints to make tests pass.
4. Confirm OTP patient/doctor purpose isolation, one-time use, expiry, attempt limits, and migration repeatability.
5. Confirm health-record writes require a specific appointment belonging to the authenticated doctor and patient; update every existing caller and E2E test to send that appointment ID.

### P0 — Backend security
6. Audit shared rate limiting: confirm database-backed limits work across instances, fail closed in production if storage is unavailable, bound fallback memory in non-production, and cover concurrency/window-reset behavior.
7. Audit client IP extraction and reverse-proxy trust. Do not trust arbitrary `X-Forwarded-For`; only honor proxy headers when the deployment's trusted-proxy configuration is explicit and validated. Keep rate-limit keys stable and resistant to spoofing.
8. Audit PHI/PII logging across backend routes, error handlers, webhook processing, and workflows. Logs must use safe metadata only; never log request bodies, OTPs, auth headers, patient phone numbers, prescriptions, or clinical notes.
9. Audit patient, doctor, and admin authorization on every read/write route. Verify ownership and role checks server-side; prevent cross-patient, cross-doctor, and privilege-escalation access.
10. Audit CORS, security headers, request size limits, webhook signature checks, payment idempotency, and error responses for secret/PHI leakage.
11. Add or update focused regression tests for each security issue found.

### P1 — Existing app and demo compatibility
12. Verify the existing patient web demo, doctor panel, and admin panel against the existing API contracts. Fix broken links, missing fields, and runtime errors without redesigning or replacing the app.
13. Verify health-record and prescription flows end-to-end using appointment-scoped authorization.
14. Verify Flutter API client integration and existing routes/models. Do not introduce fake data or pretend that an unconfigured live provider is available.
15. Run available backend E2E, client-demo checks, and Dart checks; report any toolchain/environment limitation accurately.

### P1 — Staging readiness (read-only)
16. Inspect existing staging backend deployment configuration, source branch, health endpoint, DB health endpoint, environment-variable *names* (not values), and recent logs.
17. Do not change deployment settings, run migrations, restart services, or publish unless separately authorized.
18. Report whether staging API and PostgreSQL are reachable and healthy; redact sensitive values.

### Final readiness report
19. Provide a concise evidence-based report with: latest commit SHA; CI run links and conclusions; tests passed/failed/skipped; security fixes made; remaining blockers; staging health evidence; demo flow status; and exact next steps.
20. Never claim production-ready or fully complete unless the required checks have actually passed.

## Current known context at prompt creation
- Latest prior health-record security change required an exact `appointmentId` and validated the patient/doctor/appointment relationship.
- The Doctor Panel health-record form and real PostgreSQL E2E caller were then updated to include `appointmentId`; verify these changes and the new CI result before sign-off.
- The shared rate limiter already uses PostgreSQL-backed buckets when a database is configured and fails closed in production without DB access; review concurrency, proxy identity, and operational edge cases rather than replacing it blindly.
- Existing CI uses disposable PostgreSQL for integration tests. Keep those tests isolated and deterministic.
