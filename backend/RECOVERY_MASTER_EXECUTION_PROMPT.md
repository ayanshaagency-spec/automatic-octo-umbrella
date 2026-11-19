# AYANSHA HEALTH CARE — BACKEND RECOVERY MASTER EXECUTION PROMPT

You are acting as senior backend engineer, security engineer, QA engineer, release engineer, and project manager. Execute—not merely describe—the remaining recovery work in the EXISTING repository and recovery branch.

Repository: ayanshaagency-spec/automatic-octo-umbrella
Target branch: recovery/backend-postgres-safe-fixes

## NON-NEGOTIABLE SAFETY
- Work only on the existing repository and branch above. First verify branch and current HEAD.
- Preserve all existing features, data, configuration, routes, and project structure. No rebuild, duplicate project, reset, deletion, force push, or broad refactor.
- Do not deploy, publish, merge to production, or access/change production DB/data.
- Use isolated/disposable PostgreSQL test DB and test-only credentials. Never expose secrets in logs, commits, output, or reports.
- Stop and report if environment or DB cannot be positively confirmed as isolated.
- Commit only focused, reviewed changes to the recovery branch. No production operations.

## STEP 1 — AUDIT CURRENT STATE
Inspect HEAD, working tree, branch, relevant files, dependencies, scripts, migration runner, migration files and their actual ordering, webhook routes, processor, schema, CI workflows, tests, and recovery notes. Verify existing work rather than trusting prior summaries. Check numbered migration filename collisions and runner behavior; avoid risky renaming/resequencing unless required and safely justified.

## STEP 2 — PAYMENT WEBHOOK SECURITY AND CORRECTNESS
Audit and verify:
- raw-body HMAC signature validation and secret handling;
- event normalization and required fields;
- durable event ledger, event-ID uniqueness and deduplication;
- valid provider/payment/order linkage;
- row locking and safe concurrent processing;
- amount and currency exact match;
- allowed payment state transitions and idempotency;
- transaction atomicity and rollback behavior;
- appropriate response codes, safe error messages and logs.
Fix only demonstrable issues with focused changes.

## STEP 3 — TEST MATRIX
Use isolated fixtures/disposable PostgreSQL. Add or improve tests for:
1. valid signature and valid normalized event;
2. malformed payload and missing event ID;
3. invalid signature;
4. unknown order/payment;
5. provider/payment/order linkage mismatch;
6. wrong amount and currency;
7. invalid/duplicate status transitions;
8. duplicate event delivery;
9. concurrent duplicate delivery (where test infrastructure permits);
10. rollback on failure and ledger consistency.
Include regression coverage for existing behavior. Avoid tests that write to production or shared DB.

## STEP 4 — MIGRATION AND CI
- Verify migration runner ordering and idempotency/safety behavior.
- Confirm migration 003 event-ledger schema is compatible with existing schema.
- Test migrations against fresh disposable PostgreSQL and, if feasible, a representative disposable pre-existing schema.
- Ensure CI uses PostgreSQL service, test credentials, migration execution, tests, and build checks.
- Do not modify production migration state or credentials.

## STEP 5 — DOCUMENTATION
Update backend/RECOVERY_PAYMENT_WEBHOOK_NOTES.md with accurate, evidence-based status, setup, safe test instructions, migration order, coverage, CI links/results, known limitations and remaining work. Remove outdated statements only when replaced by verified facts.

## STEP 6 — QUALITY GATES
Run all applicable test scripts, migration checks, lint/build checks and CI. If tests fail, diagnose and fix focused defects, rerun. Do not claim a test passed unless output/evidence confirms it. If a test cannot run, state why and what evidence is missing.

## STEP 7 — COMMITS AND REPORT
Make focused commits on the specified branch. Never force-push. Summarize:
- branch and HEAD before/after;
- files changed and reason;
- tests run and their actual results;
- CI run links/status;
- unresolved risks/blockers;
- confirmation that production deployment/DB/data were not touched.
Do not start the customer demo phase until recovery is closed and verified.

## STOP CONDITIONS
Stop safely if branch identity is uncertain, repository permissions are insufficient, isolated DB cannot be established, a change risks existing data, or required external credentials are unavailable. In that case provide a precise blocker and safe next step, not a fabricated completion.
