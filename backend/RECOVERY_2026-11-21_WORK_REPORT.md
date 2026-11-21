# Recovery Work Report — 2026-11-21

Branch: `recovery/backend-postgres-safe-fixes`
Verified HEAD before this report: `cb6ba04506255c480209dd332db3a23da2647275`

## Verification performed
- Branch head and the safe E2E database-target guard fetched from GitHub.
- Guard permits only localhost/loopback and allowlisted database names, and refuses production NODE_ENV.
- Backend workflow provisions disposable PostgreSQL 16 and runs migrations twice before tests.
- Docker workflow builds and smoke-tests health, app/admin routes, DB-health fail-closed, and rejects .env/source-path exposure.
- Workflow trigger audit: backend.yml includes recovery branch push/PR; backend-tests.yml excludes recovery but manual dispatch is enabled; docker-build.yml triggers on pushes and PRs.
- Latest recorded CI runs (run IDs 44804662177 and 44804662129) are successful; job steps were fetched.
- OTP storage and request counters remain process-local. OTP value is stored as plaintext in memory. Route IP limits also remain process-local.
- Webhook replay integration against real PostgreSQL remains unverified.
- Branch API reports protected=false; repository rulesets query returned no rulesets.
- Railway staging remains offline; live PHI log verification cannot be performed.

## Release blockers / follow-up
1. Implement and test persistent OTP storage plus shared rate limits, using only disposable CI PostgreSQL and a reversible migration.
2. Add PostgreSQL integration coverage for webhook duplicate/replay, concurrency, rollback and validation mismatch.
3. Reduce PHI exposure in URLs and verify redaction at the staging infrastructure layer.
4. Configure repository branch protection/required checks (requires repository administration permission).
5. Bring up isolated staging only after explicit safe staging credentials/configuration are available; verify CORS and PHI logging.

No production database, production deployment, merge to main, or production environment was accessed or changed during this work.
