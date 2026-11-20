# Recovery Audit Follow-up — Webhook and OTP Verification

Date: 2026-11-20
Branch: recovery/backend-postgres-safe-fixes
Reviewed commit: 5414d091e54f73b3b553a1fccae227a3e338a38b

## Verified by source inspection
- Patient and doctor OTP verification endpoints have process-local IP limits (10 attempts/minute per route key).
- Payment webhook signature verification uses HMAC SHA-256 and timing-safe comparison.
- Normalization restricts webhook events to supported Razorpay payment captured/failed events and validates payment entity fields.
- The processor locks the linked payment row, checks provider/payment ID, amount/currency and status transition, inserts event IDs with conflict deduplication, then updates payment state in a transaction.

## Remaining verification / risk
- Payment processor tests currently cover amount conversion only; database-backed duplicate/replay, rollback, concurrency, and mismatch integration tests are not evidenced by the current test file.
- Webhook deduplication and IP limit buckets depend on the application process and database respectively; IP rate-limit buckets are process-local and therefore not shared between multiple app instances.
- Latest Actions status for reviewed commit was not verified in this audit. The available commit-run wrapper returned no runs (it filters to PR-triggered runs).
- OTP persistence/shared-store hardening remains a separate design/change; do not implement without confirming schema and CI test harness compatibility.

## Safe next verification
1. Retrieve all Actions runs for the recovery branch using an endpoint/tool that includes push-triggered runs.
2. Implement database-backed webhook integration tests using only disposable CI PostgreSQL.
3. Exercise duplicate event replay, amount/currency/payment-ID mismatch, invalid transition, rollback and concurrent duplicate handling.
4. Keep Railway staging and production untouched until explicit, safe staging access is verified.
