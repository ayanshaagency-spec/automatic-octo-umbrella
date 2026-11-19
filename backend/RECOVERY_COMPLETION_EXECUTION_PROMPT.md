# Recovery Branch Completion Execution Prompt — Ayansha Health Care

Repository: ayanshaagency-spec/automatic-octo-umbrella
Branch: recovery/backend-postgres-safe-fixes
Priority: finish this recovery branch before Customer Demo Mode or app packaging.

## Non-negotiable protection
- Work ONLY in the existing repository and named recovery branch.
- Do not create a replacement app/repository, reset, force-push, delete, or duplicate existing features/data.
- Do not deploy to production, touch production databases, or use real patient data or secrets.
- Never print secrets. Use isolated test fixtures and a disposable PostgreSQL test database only.
- Audit before editing. Make focused, additive changes and preserve working flows.

## Execution plan
1. Re-check branch/head and current CI results; verify the recent commit eab5b0275722bc1da595980fbabe7757e21b6747 and preceding recovery commits. Do not assume notes or old logs are current.
2. Audit the webhook route, signature verifier/normalizer, processor, migration runner, schema/migrations, payment repository/status validation, tests, CI config, and recovery notes.
3. Inspect migration ordering/naming collisions. Establish actual lexicographic execution order and whether migrations are safe/idempotent for the test setup. Do not rename/resequence applied migrations without evidence and a safe compatibility plan. If collision is only cosmetic, document rather than make risky changes.
4. Test webhook behavior using isolated PostgreSQL and test secrets:
   - malformed JSON/payload, missing event ID, unsupported event
   - bad/missing signature, raw-body signature behavior
   - unknown order, provider/payment linkage mismatch, wrong amount/currency
   - invalid status transition and failed/captured mapping
   - duplicate delivery, retry behavior, concurrent deliveries/locking
   - rollback behavior if ledger insert or payment update fails
   - verify no unintended payment status mutation
5. Review amount precision/minor units, SQL transaction boundaries, event ledger uniqueness, error responses, and authorization/security boundaries. Add only necessary regression tests/fixes.
6. Run the complete backend test suite, isolated PostgreSQL schema + migration checks, and Docker build/CI checks. Capture exact outcomes; do not mark tests as passing unless run results prove it.
7. Update RECOVERY_PAYMENT_WEBHOOK_NOTES.md and this completion record with verified status, migration/test caveats, commit SHA(s), and explicit production-not-touched statement.
8. Commit focused changes on this branch only. Verify resulting CI runs and report PASS/FAIL/PENDING with links and evidence.

## Exit criteria
- Recovery webhook implementation and regression checks reviewed and tested.
- CI passes, or blockers are clearly documented with no false claim of completion.
- No production deployment/database operation.
- Provide a short recovery report and then hand off to the separate Customer Demo Mode/app-build phase. Do not start that phase until recovery is finished.
