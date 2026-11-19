# Ayansha Health Care — Complete GitHub Recovery Execution Prompt

**Repository:** ayanshaagency-spec/automatic-octo-umbrella  
**Recovery branch:** recovery/backend-postgres-safe-fixes  
**Execution channel:** GitHub repository + GitHub Actions only, unless an isolated editable workspace becomes available.  
**Goal:** Complete a careful, evidence-based backend recovery and verification on the existing project. Do not create a new repository or rebuild the app.

## Mandatory project protection
1. Work ONLY in the existing repository and recovery branch named above. Confirm the branch and current commit before changes.
2. Preserve all existing application code, features, schema, records, configuration, API contracts, and work. No resets, destructive rewrites, duplicates, or unrelated refactors.
3. Never connect to, inspect, mutate, migrate, or test against production databases or production services. Use only a clearly disposable CI PostgreSQL instance.
4. Do not publish/deploy to production, purchase resources, or expose credentials. Do not add secrets to files, commits, logs, artifacts, or output. Use only temporary CI credentials.
5. Make additive, focused, reviewable changes. Commit logically and include evidence. Do not claim tests passed unless the actual run output supports it.
6. If repository/branch state is uncertain, permissions are missing, tests cannot run, or isolation cannot be proved, STOP the affected operation safely and report the blocker.

## Phase A — Baseline audit
- Confirm repository, branch, HEAD, and recent commit history.
- Inspect backend package scripts, server/routes, auth and role checks, database access, all SQL migrations, migration runner, payment repository/gateway/webhook, appointment concurrency logic, prescription/lab/emergency hospital code, tests, README, and CI workflows.
- Review the existing checkpoint: backend/RECOVERY_SOURCE_AUDIT_CHECKPOINT.md.
- Build an inventory of routes/features, migration order and naming, test coverage, environment requirements, and risks.
- Avoid relying on stale CI evidence; inspect current runs for the recovery branch.

## Phase B — CI and disposable database
- Inspect .github/workflows/backend.yml and confirm it triggers on pushes and pull requests to recovery/backend-postgres-safe-fixes.
- Use GitHub Actions PostgreSQL service only, with CI-only credentials and test data.
- CI must checkout, set up supported Node (Node 20), install dependencies, run migrations against the disposable CI database, then run the backend test suite.
- Confirm test cleanup and ensure test fixtures cannot target production.
- Inspect workflow run results, jobs, logs, and failures. Do not treat an empty status as success.
- If workflow execution is unavailable, report the exact blocker and leave code in a safely reviewable state; do not claim verification.

## Phase C — Migration audit and verification
- Inspect EVERY migration file and verify ordering, schema compatibility, constraints, indexes, FK relationships, and transaction implications.
- Assess runner behavior, repeat execution/idempotence, and whether it may rerun migrations against an already-migrated database.
- In disposable CI DB only, test migration execution on a fresh schema and repeatability. If repeatability is not safe, propose and implement a migration-history/runner approach only after carefully preserving compatibility and making focused changes.
- Never experiment on production or a user's persistent DB.

## Phase D — Payment and webhook recovery
Verify the webhook processing flow end to end in the disposable CI database:
- valid signed event;
- invalid/missing signature and absent secret;
- malformed JSON, missing/invalid event payload, missing event ID;
- unsupported event;
- unknown provider order;
- provider/payment ID mismatch;
- amount/currency mismatch;
- invalid payment status transition;
- duplicate delivery, including concurrent duplicate delivery;
- transaction rollback and ledger/payment consistency;
- linkage validation, idempotency and row locking.
Review signature verification, raw body handling, HMAC and timing-safe comparison, event-ledger uniqueness, transaction boundaries, and status transition rules.
Write targeted tests for unverified cases. Fix only demonstrated defects, with focused commits.

## Phase E — API, auth, and integration tests
Run existing suite and targeted tests for:
- patient authentication/session/OTP paths;
- role-based admin/doctor/patient authorization and cross-patient isolation;
- appointments and concurrent slot booking;
- prescriptions and transaction integrity;
- lab orders and payment APIs;
- payment status authorization;
- emergency/hospital endpoint and coordinate validation;
- AI/WhatsApp status/configuration behavior (without external live sending);
- API smoke and real DB E2E tests.
Use CI fixture data only and ensure cleanup. Do not call live providers or send real messages/payments.

## Phase F — Security and reliability review
- Check CORS configuration and production-safe defaults.
- Check secrets/env handling and accidental secret exposure.
- Review auth/token handling, privilege boundaries, patient data isolation, validation, SQL parameterization, error responses, webhook authenticity and replay handling.
- Review health/status endpoints and error logging for sensitive information.
- Review dependency and runtime risks as practical within the repository's existing setup.
- Fix critical/high risks only when supported by evidence, with minimal scope; document unresolved findings.

## Phase G — Documentation and focused fixes
- Update backend docs with accurate local/CI setup, required env variables (names only, never values), migration/test commands, recovery findings and known limitations.
- Use focused commits with clear messages.
- Do not alter or delete unrelated files. Avoid broad formatting/restructuring.

## Phase H — Recovery report and gate
Create/update a recovery report in the recovery branch with:
- audit scope and commit/branch/HEAD;
- completed code changes and commit SHAs;
- migrations tested (fresh/repeat) and environment isolation;
- exact CI workflow run URL/ID and job outcomes;
- tests passed, failed, skipped, and not run;
- payment/webhook matrix results;
- security findings by severity and remediation;
- remaining blockers/risks and next steps.

Use these status labels accurately: **Verified**, **Failed**, **Not verified**, **Blocked**, **Pending**. Do not mark any section verified without inspectable evidence.

## Customer-demo gate
Do NOT begin customer demo changes, production publishing, or live integrations until recovery is genuinely verified and the report explicitly recommends proceeding. Preserve existing project and data. Ask for explicit approval before any production deployment or external side effects.

## Execution style
Proceed in small, auditable steps on the recovery branch. Source edits may be performed through GitHub where appropriate. Use GitHub Actions as the executable environment for isolated tests. After each step, inspect the resulting diff and run appropriate checks. Stop and report honestly whenever the available tools cannot perform or verify an operation.
