# CI Migration Recovery — Execution Report

## Root cause (source audit)
The migration runner in `backend/scripts/migrate.js` originally executed only SQL files from `backend/db/migrations`. The repository has two migration locations and a baseline schema:
- `backend/db/schema.sql` — initial tables including `prescriptions`
- `backend/migrations/` — phase migrations including `003_phase3_prescriptions_health_records.sql`
- `backend/db/migrations/` — later alignment/hardening SQL

The runner skipped both the baseline schema and the Phase migration directory. Its first alignment migration (`backend/db/migrations/002_production_schema_alignment.sql`) performs `ALTER TABLE prescriptions ...`, so a fresh CI database could fail with `relation "prescriptions" does not exist`.

## Fix committed
- `backend/scripts/migrate.js`: now applies the base `backend/db/schema.sql`, then sorted `backend/migrations/*.sql`, then sorted `backend/db/migrations/*.sql`, within its existing single transaction.

## Safety
- No table drops or data deletion were introduced.
- No production DB was accessed.
- No deployment or merge to main was performed.
- CI is intended to use the disposable PostgreSQL service configured in GitHub Actions.

## Verification status
- Source audit and change review: performed via repository file access.
- CI migration/test execution: **not yet verified by this report**. The push should trigger the branch workflow; inspect the resulting run.
- Test categories (prescription transaction, appointment concurrency, payment webhook, Phase 6, E2E): pending CI results.

## Commit
- `ef4d6b69cab8116acb4678c39d783af3dc6e1809` — `fix(ci): apply base schema before additive migrations`

Branch: `recovery/backend-postgres-safe-fixes`
