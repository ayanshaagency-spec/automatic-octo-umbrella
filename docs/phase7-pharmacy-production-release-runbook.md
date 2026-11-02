# Phase 7 Pharmacy — Production release and recovery runbook

**Status:** Preparation only. This document is not approval to merge, deploy, migrate, back up, restore, or change Production.

**Current release line:** Production Phase 6 commit `27704fc9085bc23c0352ac076e756a40f2ff18cb`. Pharmacy code is in Draft PR #8 on `feat/phase7-pharmacy-railway-aligned`. The live Staging Pharmacy/MSG91-adapter deployment is pinned to `24d4e4b9b54b5ec36322069a8d3586b208aa312a`.

## 1. Preconditions — all required before a Production change

- [ ] Explicit written approval for the exact Production deployment and migration.
- [ ] PR #8 reviewed, approved by a maintainer, and intentionally moved out of Draft.
- [ ] Patient OTP provider account, approved sender/header, DLT-approved template, and secret variables are configured and verified in Staging. Never place Auth Keys, OTPs or tokens in GitHub, chat, or this document.
- [ ] Authenticated patient, doctor and admin Staging acceptance completed on an authorised non-production test account.
- [ ] Real pharmacy onboarding and catalogue verified independently. Unverified stores/products remain inactive.
- [ ] Insurance/private document storage is not assumed ready merely because CI simulator tests pass; Staging storage and malware scanner must be independently configured and tested if that feature is in scope.
- [ ] Production schema/migration review, backup/restore rehearsal, change window, operator, rollback owner and patient-impact notice are agreed.
- [ ] Exact release commit, previous Production deployment and rollback target are recorded.

## 2. Production backup — preparation steps, do not run without approval

Use the approved operator workstation or secure operations environment. Retrieve the Production database connection securely from Railway; do not paste it into chat, GitHub, tickets, shell transcripts, or screenshots. Never print the connection string.

Example using PostgreSQL client tools, with `DATABASE_URL` already supplied securely by the operator's environment:

```sh
umask 077
BACKUP_FILE="ayansha-health-care-pre-phase7-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file "$BACKUP_FILE"
pg_restore --list "$BACKUP_FILE" >/dev/null
sha256sum "$BACKUP_FILE"
```

Acceptance:
- [ ] `pg_dump` exits successfully and produces a non-empty archive.
- [ ] `pg_restore --list` can read the archive.
- [ ] Archive checksum and timestamp are recorded in the restricted operations log, not in the public repository.
- [ ] Backup is stored encrypted in the approved private backup location, with access limited to authorised operators.
- [ ] Backup retention and expiry follow the organisation's health-data retention policy.

A successful dump/list is only an archive-integrity check. It is **not** proof that restoration works.

## 3. Restore rehearsal — isolated target only

Restore to a separate disposable PostgreSQL database/service. Do not restore over Production, Staging, or any database containing live users. Set `RESTORE_DATABASE_URL` securely for that isolated target:

```sh
pg_restore --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" "$BACKUP_FILE"
```

Then verify, using authorised database access:
- PostgreSQL version/extensions and expected schemas are present.
- Core tables exist: patients, doctors, appointments, prescriptions, hospitals, lab orders and payments.
- Table row counts are plausible and match the source backup evidence (do not put patient-level rows or identifiers in the report).
- Primary keys, foreign keys, indexes and sequences are healthy.
- Application health and read-only Phase 6 smoke tests work against a separately configured test copy.
- The restore can be repeated from the retained archive into a fresh disposable target.

Record duration, errors, version/tool compatibility and the operator sign-off. Destroy the disposable restored database securely after the rehearsal.

## 4. Migration 008 review summary

Read-only source review on 2 November 2026 compared `backend/db/migrations/008_phase7_pharmacy.sql` on the Pharmacy branch with the Phase 6 Production schema line:
- Existing Phase 6 `hospitals.id`, `patients.id` and `prescriptions.id` are integer/SERIAL identifiers; the corresponding Pharmacy foreign-key columns use `INTEGER`.
- Pharmacy table identifiers use `BIGSERIAL/BIGINT` consistently.
- Migration 008 creates four new Pharmacy tables and indexes; it does not ALTER Phase 6 tables or mutate existing rows.
- The script wraps DDL in a transaction and uses `IF NOT EXISTS` for tables/indexes. This supports repeat application when objects match the expected shape; it does not compare or repair a conflicting same-named object.
- The staging deployment pre-deploy runner reported `schema and migrations applied`. No Production migration has been executed.

This source review does not replace a Production backup, isolated restore rehearsal, or execution-time observation against a representative copy.

## 5. Controlled release sequence — only after all gates are signed off

1. Record the final approved Git commit and confirm the target Railway service/environment is Production.
2. Verify the backup archive and successful isolated restore rehearsal from sections 2–3.
3. Confirm Production's currently deployed Phase 6 commit and exact rollback deployment.
4. Apply only the reviewed release commit during the approved change window. Do not run an unreviewed `latest` branch or change the Production branch implicitly.
5. Observe each pre-deploy migration log and the deployment status. Stop on the first migration/build/health error; do not blindly retry.
6. Run smoke checks: `/health`, `/api/db/health`, patient homepage, admin and doctor pages, and read-only Phase 6 journeys.
7. Confirm production OTP provider delivery, protected endpoint guards, and logs with an authorised test account and approved test phone. Never use a real patient's data for test acceptance.
8. Record non-sensitive test outcomes, commit, migration completion, deployment ID, operator and approval in the restricted release record.

## 6. Rollback and recovery

### Application rollback, while preserving schema/data

- If the new application fails after a successful additive migration, stop further rollout and redeploy the recorded prior Phase 6 application deployment/commit through the approved Railway rollback process.
- Migration 008 creates separate Pharmacy tables; the Phase 6 application does not need to use them. Prefer rolling back application code while retaining the new schema rather than dropping tables.
- Do not delete Pharmacy tables if any Pharmacy store/order/product data has been written. This would destroy order and fulfilment history.
- Re-check Phase 6 health and read-only journeys after application rollback.

### Migration failure or data recovery

- Migration 008 is transaction-wrapped; if that individual migration fails before COMMIT, its DDL should roll back as a unit. Verify the database state rather than assuming.
- The runner applies separate migration files sequentially. If a later migration fails after 008 has committed, do not assume the whole migration set rolled back.
- Stop the deployment, preserve logs, record the last completed migration, and have a PostgreSQL operator inspect the state.
- For data corruption or a failed restore, restore the verified archive into a **new isolated database** first. Validate it, then plan a separately approved controlled cutover. Never overwrite the original Production database as an improvised first response.
- No automatic DROP-table rollback is provided. Do not invent or run destructive down-migrations without a reviewed data-retention plan and explicit approval.

## 7. Non-negotiable safety

- Production database URLs, passwords, Auth Keys, patient identifiers, OTPs, prescriptions, medical records and backup archives must never be committed to this repository or pasted into chat.
- No Production command in this document has been run.
- Do not merge PR #8, deploy, run a Production migration, change Production variables, or restore a Production backup without explicit approval for that exact action.
