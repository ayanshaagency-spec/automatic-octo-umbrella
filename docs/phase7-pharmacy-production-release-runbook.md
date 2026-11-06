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

## 4A. Full release-set dry-run findings — 2 November 2026

The Railway Production backend's current pre-deploy command runs `db/schema.sql` and then **every** `.sql` file under `db/migrations` in sorted filename order on a deployment. It does not select only migration 008. The PR #8 branch adds these four migration files relative to the current Phase 6 base:

- `004_phase8_health_insurance_documents.sql`: creates insurance policy/document metadata tables, foreign keys, constraints and indexes. It does not configure private object storage or malware scanning. Keep uploads disabled until those services are configured and verified.
- `008_phase7_pharmacy.sql`: adds four Pharmacy tables and indexes. The preceding source-level ID type review found Pharmacy foreign-key types compatible with Phase 6 patient, hospital and prescription integer IDs.
- `009_shared_patient_otp_store.sql`: adds shared OTP challenge and request-rate event tables storing HMAC-derived values, not raw phone numbers or OTP codes. Production provider account, approved DLT template and secure secret configuration remain pending.
- `010_family_profiles_doctor_availability.sql`: adds family-member and doctor-availability tables and indexes, and also alters the existing `appointments` table to add `slot_id` and `family_member_id` foreign-key columns plus indexes. This is beyond the Pharmacy-only schema. Its lock/validation impact must be reviewed and measured on a representative restored copy before Production.

**Release-gate consequence:** migration 008's earlier review is not a complete review of the Production release set. Review migrations 004, 009 and 010 independently, including FK target types, existing-table assumptions, repeat-application behaviour, lock duration and recovery if a later file fails after an earlier file commits. The staging pre-deploy log confirms the set ran successfully in Staging, but no Production migration has run and no Production database was inspected directly.

### Additional read-only release checks

- Production environment health on 2 November: backend and Postgres Online, one replica each, zero active warnings/criticals, zero recent failures in the 7-day query, and no staged/pending Railway work.
- Production `/health` and `/api/db/health` returned healthy/connected. Patient homepage and `/admin` loaded. `/doctor` returned HTTP 404 on the Phase 6 Production deployment; the Phase 6 server does not define that route, while the PR branch adds the Doctor page route and image asset. After an approved release, verify the route and complete an authenticated Doctor click-through.
- The Production Railway service config reports source branch `feat/phase6-emergency-hospitals` with `commitSha=de561ee377f460903e42e328a4a15586b62c436d`; the latest live deployment metadata and GitHub base-branch HEAD report `27704fc9085bc23c0352ac076e756a40f2ff18cb`. A GitHub compare confirms the configured SHA is an ancestor of the deployed SHA (7 commits ahead, 0 behind), so the two SHAs are not divergent. The live deployment is identified by deployment metadata as `27704fc`. Before the next release, confirm whether Railway's `source.commitSha` field represents a pin or an older resolved source reference; do not change it blindly.
- The GitHub Phase 6 base branch currently reports branch protection disabled and no required status checks. Require an explicit maintainer review and configure an agreed protected-branch/release gate before merging; no repository protection settings were changed.
- PR #8 currently changes 66 files (+7,983 / -94), across Pharmacy, Insurance, OTP, Family/Doctor availability, patient/admin/doctor UI, mobile app and CI. Review and approve this complete scope intentionally; do not treat it as a Pharmacy-only patch.
- Production Postgres has a 500 MB attached volume; the latest 24-hour disk metric was approximately 0.105 GB used. This is a point-in-time capacity signal, not a backup or restore test. Patient documents must remain in approved private object storage, not the database volume.


### Migration hardening applied on the feature branch — 2 November 2026

Read-only review found migrations 004 and 010 did not explicitly bracket their multi-statement DDL in a transaction. Migration 010 also dropped and recreated the same consent-status check already declared inline when creating `family_members`, causing unnecessary DDL/lock work on repeated deploys.

The following additive, feature-branch-only hardening was committed:
- `2a60ba5b996d4771d2d30d16d8e02efd4101c5ee`: migration 004 now explicitly uses `BEGIN` / `COMMIT`.
- `a84018595bf4b08f26dad05f7ac07672c8229517`: migration 010 now explicitly uses `BEGIN` / `COMMIT` and no longer drops/recreates the identical inline consent-status constraint. Its table/column/index creation remains guarded with `IF NOT EXISTS`.

Both edits preserve the declared schema shape and do not modify existing patient/appointment rows. CI and Staging application deployment must be verified against the final feature-branch head before considering these changes validated. Staging is deliberately still pinned to the previously tested application commit, so these edits have not yet been applied to Staging or Production.

**Dry-run result:** Production is healthy and has no active Railway deployment work, but the release is **NOT READY**. The expanded migration review, source-pin reconciliation, authenticated staging acceptance, provider/storage setup as applicable, verified store onboarding, branch/reviewer gate, and backup/restore rehearsal remain open. No Production change was made.

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


## Release-readiness refresh — 5 November 2026

This section supersedes older deployment identifiers above where they differ. It is an audit update only and is not approval to change Production.

### Current environment evidence

- Production Railway service is still on branch `feat/phase6-emergency-hospitals`. Service configuration reports source commit `de561ee377f460903e42e328a4a15586b62c436d`; latest successful backend deployment is `34586c86-9dbe-4b32-a75e-47cf0f5a74d1`, with deployment metadata commit `27704fc9085bc23c0352ac076e756a40f2ff18cb`.
- GitHub compare confirms the configured source SHA `de561ee` is an ancestor of the deployment metadata SHA `27704fc` (7 commits ahead, 0 behind). This is not a divergent source line. Do not change the Railway source pin based on this difference alone.
- Production backend and PostgreSQL are Online, one replica each, zero active warnings/criticals, zero recent failures and no pending Railway changes.
- Staging deployment `da669bc6-38cd-483e-9b50-54b8b5bc67e4` is SUCCESS on branch `staging/auth-abuse-protection-with-role-portal`, commit `c7b9983ed5be2e1c884889abdcac1ae8268808c9`. Its pre-deploy log reports `schema and migrations applied`; the Railway `/health` check succeeded. This is Staging-only.
- All four Draft PRs (#8, #12, #13, #14) remain open/unmerged and mergeable. Their available CI suites on current heads are green (PR #8 6/6; PR #12 4/4; PR #13 4/4; PR #14 4/4). CI is not a substitute for live authenticated acceptance.

### Static review of migration set 004 / 008 / 009 / 010 / 011

- **004 — Insurance metadata:** creates policy/document metadata tables and indexes; file bytes are stored in private object storage, not PostgreSQL. It is transaction-wrapped.
- **008 — Pharmacy:** creates the four Pharmacy tables and indexes; foreign-key ID types were reviewed against the Phase 6 integer patient/hospital/prescription identifiers. It is transaction-wrapped.
- **009 — Shared OTP storage:** creates HMAC-hash-only OTP challenge and request-event tables and expiry/time indexes; raw phone and OTP values are not stored. It is transaction-wrapped.
- **010 — Family Profiles / Doctor Availability:** creates family-member and availability-slot tables, adds nullable `slot_id` and `family_member_id` foreign-key columns to the existing appointments table, and adds partial unique/supporting indexes. It is transaction-wrapped and additive; existing appointment rows are not rewritten by the migration source.
- **011 — Authentication abuse protection:** creates the HMAC bucket table and expiry index; raw IP/email identifiers are not stored. It is transaction-wrapped.

**Lock-impact limitation:** Migration 010 modifies the existing `appointments` table and creates an index on it. The source uses ordinary `CREATE INDEX` (not `CREATE INDEX CONCURRENTLY`), within a transaction. This can hold locks while the table is scanned/indexed and must be measured on a representative restored copy with production-like row counts and concurrent read/write load. No lock-duration measurement has been performed against Production or a representative clone during this audit. Review execution time and lock behavior before any release. The other migration files are primarily new-table/index creation, but their full ordered execution must also be rehearsed.

### Remaining Production gates

- No Production backup, restore rehearsal or migration has been performed in this session. The runbook commands are preparation only.
- Complete a secure backup archive check and repeated restore to a fresh isolated PostgreSQL target; record duration and operator sign-off.
- Measure ordered migrations against a representative copy, especially the appointments-table DDL/index work in 010.
- Complete Admin/Patient/Doctor authenticated Staging acceptance, real verified store onboarding, SMS provider acceptance (MSG91 at the final step), and live Insurance provider acceptance if Insurance is included in release scope.
- Review all 66 changed files in PR #8 intentionally; it is broader than Pharmacy alone. Confirm dependency order across #8 → #12/#13 → #14 and required maintainers/status gates before any merge.
- Obtain explicit written approval for the exact Production commit, migration and deployment window before any Production action.

**Decision remains NOT READY FOR PRODUCTION.** Phase 6 Production remains healthy and unchanged. No Production branch, variable, deployment, schema, data, backup or restore action was performed.
