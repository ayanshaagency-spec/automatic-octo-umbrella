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

- [x] Confirm the deployed commit is the intended Pharmacy branch commit and the environment is explicitly marked as staging. Verified 2 November 2026: Railway Staging deployment `ba4a55cc-e8c8-4255-8c2e-b352e7a3e57c` is running the pinned commit `24d4e4b9b54b5ec36322069a8d3586b208aa312a` from `feat/phase7-pharmacy-railway-aligned`.
- [ ] Confirm `NODE_ENV=staging`; configure the approved SMS provider using its real provider-specific adapter and secret store. Never expose development OTPs in a publicly reachable environment.
- [ ] Request an OTP to an authorised test phone and confirm SMS delivery, expiry, one-time use, throttling, and generic failure behavior.
- [ ] Sign in through the real patient page; search stores; open a product catalogue; place a synthetic COD order; confirm the order appears in patient history.
- [ ] Sign in through the existing `/admin` page; confirm the order is in the admin fulfilment queue; filter by status/store; accept the order; confirm patient history reflects the new status.
- [x] Confirm anonymous access is denied. Read-only Staging GET checks on 2 November returned HTTP 401 for family members/consent, doctor availability/appointments, admin doctors/appointments, patient appointments, prescriptions, health records, lab orders, payments, pharmacy admin stores/orders, patient pharmacy orders, and patient/admin insurance policy collections.
- [ ] Verify invalid prescription matching and invalid status transitions fail without changing stock using authenticated test accounts in Staging.
- [ ] Record pass/fail, date, tested commit, and non-sensitive evidence in [Launch Readiness issue #9](https://github.com/ayanshaagency-spec/automatic-octo-umbrella/issues/9). Do not attach OTPs, tokens, secrets, identity documents, or patient information.
- [ ] Obtain explicit release approval before merge, production deployment, or any production database migration.

## Current limitation / release gate

A real provider account/template and a hosted staging environment with the provider configured are external prerequisites. Automated OTP works only in local/CI `development` or `test` mode; these modes must not be used in a publicly reachable environment. In `staging` and `production`, missing OTP provider configuration fails closed.

## Staging deployment and smoke-test evidence — 2 November 2026

- Railway Staging backend deployment `ba4a55cc-e8c8-4255-8c2e-b352e7a3e57c` completed with status `SUCCESS` on commit `24d4e4b9b54b5ec36322069a8d3586b208aa312a`. The Staging backend and its separate PostgreSQL service both reported Online; no Staging environment issues were reported.
- Docker build completed. The build output reported 0 npm vulnerabilities.
- The existing pre-deploy runner executed `db/schema.sql` and the sorted SQL migration set present at this commit: `002_production_schema_alignment.sql`, `003_doctor_identity.sql`, `004_phase8_health_insurance_documents.sql`, `008_phase7_pharmacy.sql`, `009_shared_patient_otp_store.sql`, and `010_family_profiles_doctor_availability.sql`. The deployment log reported `schema and migrations applied`. This is Staging-only evidence; no Production migration was run.
- `/health` returned `{"ok":true,"service":"Ayansha Health Care"}`; `/api/db/health` returned `{"ok":true,"database":"connected"}`.
- Existing patient homepage, `/admin`, `/doctor`, patient JavaScript/CSS and doctor JavaScript/CSS assets all returned successfully.
- Public pharmacy stores and delivery-hospital endpoints returned empty arrays. No synthetic, unverified store, hospital, product, patient or prescription rows were inserted into persistent Staging.
- `/api/insurance/status` reports `storageConfigured=false`, `scannerConfigured=false`, and `uploadsEnabled=false`. This is fail-closed behavior; real insurance document upload is unavailable on this Staging environment until private storage and malware scanning are configured.
- Anonymous read-only requests to patient/doctor/admin data APIs returned HTTP 401. No unauthenticated data access was observed in this sweep.

### Database migration state

- The Staging deployment runner reported successful execution of the schema and sorted migration set listed above, including Pharmacy, shared OTP store and Family/Doctor Availability migrations. Existing migration scripts may be idempotently re-applied by the runner; the deployment log does not distinguish newly created objects from already-present objects.
- Production remains on the existing Phase 6 branch, commit `27704fc9085bc23c0352ac076e756a40f2ff18cb`, and its last known backend and PostgreSQL deployments remain `SUCCESS`. Production had no staged changes; no source change, variable change, deployment, schema migration or data mutation was performed there.

### Live staging acceptance still open

- A human patient/admin/doctor sign-in and Pharmacy order/fulfilment click-through is still pending because the Staging SMS provider is not configured.
- Staging does not contain `OTP_PROVIDER`, `MSG91_AUTH_KEY`, or `MSG91_TEMPLATE_ID`. No secret values were read, changed, or added. No actual MSG91 SMS delivery or authenticated OTP login was claimed.
- Insurance document upload is disabled until private storage and malware scanning are configured.
- Real pharmacy stores, licences and product catalogues still require independent verification and onboarding. Keep every unverified store/product inactive.
- Pharmacy release remains gated on full authenticated staging acceptance, verified store data and explicit release approval. PR #8 remains Draft and unmerged.


### Migration 008 — Phase 6 Production schema compatibility review (read-only, 2 November 2026)

Reviewed `backend/db/migrations/008_phase7_pharmacy.sql` at commit `24d4e4b` against the Phase 6 Production schema line at commit `27704fc9085bc23c0352ac076e756a40f2ff18cb`.

- The Phase 6 migration `002_production_schema_alignment.sql` creates `hospitals.id SERIAL PRIMARY KEY` (PostgreSQL integer). The Pharmacy migration uses `INTEGER` for `pharmacy_stores.hospital_id`, `pharmacy_orders.delivery_hospital_id`, `pharmacy_orders.patient_id`, and `pharmacy_orders.prescription_id`, matching the existing `hospitals.id`, `patients.id`, and `prescriptions.id` integer identifiers.
- Pharmacy-owned identifiers use `BIGSERIAL/BIGINT` consistently for stores, products, orders and order items and their corresponding foreign keys.
- The migration creates only the four new Pharmacy tables and their indexes. It does not ALTER existing Phase 6 tables, update/delete existing rows, or seed sample stores/products.
- Foreign-key delete behavior is explicit: hospital/patient/prescription references on stores/orders use RESTRICT; store-to-product and order-to-item ownership use CASCADE; historical order-item product references use RESTRICT.
- DDL is wrapped in a transaction and table/index creation uses `IF NOT EXISTS`. This supports re-running the migration when the existing objects retain the expected shape; `IF NOT EXISTS` alone does not validate a conflicting pre-existing table/index definition.
- The Staging pre-deploy runner applied the migration set successfully. This source-level compatibility review found no ID-type mismatch against the Phase 6 schema.

**Still open before any Production release:** take and verify a restorable backup/snapshot; document and rehearse restore/rollback; measure execution/lock impact with a representative copy; and obtain explicit release approval. The rollback for this additive schema should prefer restoring a verified pre-release backup if new Pharmacy data has been written; do not blindly DROP tables after launch because they may contain order/audit data.

This review is documentation-only. It did not connect to, change or migrate the Production database.
