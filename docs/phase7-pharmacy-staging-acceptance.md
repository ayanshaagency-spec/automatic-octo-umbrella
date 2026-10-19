# Phase 7 Pharmacy — staging acceptance checklist

This checklist applies to the existing Ayansha Health Care project and Pharmacy PR #8. It is not approval to merge, deploy, apply the migration, or create production data.

## Automated acceptance currently exercised in GitHub Actions

The Runtime E2E workflow starts the existing API against a fresh, disposable local PostgreSQL database, applies the real Phase 7 migration to that disposable database, and uses synthetic CI-only pharmacy/product/patient records. It refuses to run unless the GitHub Actions and CI-only environment markers are present and the database hostname/name match the disposable local test database.

The runtime acceptance script verifies:

- Patient homepage, pharmacy client JavaScript, and existing `/admin` entry point are served and expose the expected pharmacy workflow controls.
- Patient OTP request/verification in automated test mode results in a patient session.
- Admin sign-in creates an admin role token; anonymous admin APIs and anonymous patient order access are rejected.
- A patient cannot read or create orders for a different phone number.
- Hospital pharmacy and external partner medical store can be registered, approved/activated, and stocked.
- Approved stores are discoverable; patient can place COD home-delivery and hospital-delivery orders using matching prescription items.
- Delivery to an unrelated hospital and medicine/prescription mismatches are rejected.
- Stock is reserved on successful checkout and remains unchanged after a rejected prescription mismatch.
- Patient history and the admin fulfilment queue contain the orders; admin status filtering works; an authorized admin can accept an order; patient history reflects that status change.
- Invalid order-status transitions are rejected.

These automated checks test the API plus key served-UI contracts. They do not replace a human click-through of a separately hosted staging environment.

## Human staging acceptance — must be completed after a provider-enabled staging environment is available

Use a dedicated non-production backend and disposable staging database only. Do not use real patient records, real prescriptions, real licence scans, or live medicines/orders for rehearsals.

- [ ] Confirm the deployed commit is the intended Pharmacy branch commit and the environment is explicitly marked as staging.
- [ ] Confirm `NODE_ENV=staging`; configure the approved SMS provider using its real provider-specific adapter and secret store. Never expose development OTPs in a publicly reachable environment.
- [ ] Request an OTP to an authorised test phone and confirm SMS delivery, expiry, one-time use, throttling, and generic failure behavior.
- [ ] Sign in through the real patient page; search stores; open a product catalogue; place a synthetic COD order; confirm the order appears in patient history.
- [ ] Sign in through the existing `/admin` page; confirm the order is in the admin fulfilment queue; filter by status/store; accept the order; confirm patient history reflects the new status.
- [ ] Confirm anonymous and cross-patient requests are denied; verify invalid prescription matching and invalid status transitions fail without changing stock.
- [ ] Record pass/fail, date, tested commit, and non-sensitive evidence in [Launch Readiness issue #9](https://github.com/ayanshaagency-spec/automatic-octo-umbrella/issues/9). Do not attach OTPs, tokens, secrets, identity documents, or patient information.
- [ ] Obtain explicit release approval before merge, production deployment, or any production database migration.

## Current limitation / release gate

A real provider account/template and a hosted staging environment with the provider configured are external prerequisites. Automated OTP works only in local/CI `development` or `test` mode; these modes must not be used for a publicly reachable environment. In `staging` and `production`, missing OTP provider configuration fails closed.

The pharmacy migration `backend/db/migrations/008_phase7_pharmacy.sql` has only been applied by the isolated Runtime E2E workflow to its disposable PostgreSQL database. No production migration or deployment was performed as part of this acceptance work.
