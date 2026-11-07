# Ayansha Health Care — Built-in Module Closure Matrix

Updated: 6 November 2026
Scope: existing repository and Railway Staging. Production remains on the Phase 6 branch.

This matrix distinguishes implementation and automated evidence from live provider/data readiness. A screen or endpoint is not treated as complete unless its workflow is verified.

## Existing software

| Module | Current state | Evidence / open gate |
|---|---|---|
| Patient web portal | Implemented | Served by the existing backend; Staging backend and database health checks pass. The live directory has no verified doctor records yet. |
| Admin operations panel | Implemented | Existing appointment and Pharmacy operations; protected doctor registration/list added. Docker smoke verifies the admin entry point. |
| Doctor Panel | Implemented and deployed to Staging | Served at `/doctor`; admin provisioning and doctor OTP sign-in flow pass isolated PostgreSQL Runtime E2E. Actual SMS delivery remains gated by approved MSG91 credentials/template. |
| Flutter patient app | Implemented; safety corrections added | Fake doctors, fake slots and default Delhi coordinates removed. Flutter analyze, safety tests and Debug APK build pass; APK artifact uploaded by CI and retained until 8 November 2026. |
| Backend API | Implemented for delivered MVP modules | Commit `5d01ff79b5573b5e940ab903d89f6e267928568c` is deployed successfully to Railway Staging. Backend Tests, Docker Build and Runtime E2E pass on this commit. |
| Appointments | Core booking flow implemented | Protected patient/doctor flows, doctor-published availability slots, family-member consent scopes, race-safe slot booking and doctor queue scoping pass isolated PostgreSQL Runtime E2E. Human acceptance with verified clinicians remains pending. |
| Prescriptions | Implemented | Protected doctor/patient routes; covered by automated tests. No patient/test prescription data was left in the persistent Staging database. |
| Health records | Implemented | Protected patient and doctor APIs. Anonymous access is rejected. |
| Lab orders | Implemented | Protected patient API and status workflow. Anonymous access is rejected. |
| Payments | Lab billing + Razorpay Checkout and webhook code deployed to Staging; live provider acceptance pending | Admin-only Lab Billing tab sets saved lab-order prices; patient-supplied amounts are ignored. Patient Dashboard shows Pay Now only for priced lab orders. Checkout callback HMAC is verified server-side, payment status is fetched from Razorpay, and only captured payments become paid. Signed webhook handling checks raw-body signature and order/amount/currency, with duplicate/out-of-order protection. Backend Tests, Docker Build and Runtime E2E pass. Staging Razorpay keys/webhook secret are absent; live Test Mode checkout remains blocked. |
| Health insurance documents | Metadata/review workflow and private upload/scanning pipeline implemented; uploads deliberately disabled in Staging | Patient/Admin API responses now use a strict allow-list and never return S3 object keys, temporary upload keys or signed URLs. Upload intent/completion requires both private storage and ClamAV; downloads require `submitted + clean`. Added tests for serialization, missing scanner/storage and fail-closed upload gates. Staging S3 and ClamAV are not configured; synthetic clean/infected end-to-end acceptance, bucket ACL/encryption/lifecycle verification and real private download test remain pending. |
| Emergency information | Implemented | Emergency information endpoint responds. It is not an ambulance dispatch or booking service. |
| Nearby hospitals | Implemented | Coordinate-based directory API exists; Staging hospital directory currently returns an empty array. |
| Pharmacy integration | Implemented in the existing Staging code line; release review open | Isolated PostgreSQL Runtime E2E covers hospital/partner stores, catalogue, COD home/hospital orders, stock reservation, prescription matching, patient history, admin queue and fulfilment. Staging has no verified store/product/hospital onboarding data. Migration scripts are applied by the successful Staging pre-deploy step. PR #8 remains Draft and unmerged; no Production release is authorised. |
| Floot Operations Dashboard | Existing project retained | Latest read-only preview remains available. Typecheck and tests must be rerun after Floot's daily build-action limit reset. |

## Provider / configuration gates

| Integration | Current state | Required before live acceptance |
|---|---|---|
| Patient/doctor SMS OTP | Shared PostgreSQL OTP store and MSG91 Flow adapter implemented | Provider adapter, HMAC challenge storage, 5-minute expiry, single-use verification, five-attempt lockout, per-phone throttling and automated tests exist. Staging lacks `OTP_PROVIDER`, `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID`; DLT/sender/template approval and an authorised-phone delivery test remain pending. |
| AI assistant | Code exists; live status reports `configured:false` | Approved AI credentials, medical-safety configuration and clinical acceptance. |
| WhatsApp notifications | Code exists; live status reports `configured:false` | WhatsApp Business account, approved template and secret configuration. |
| Video consultation | No live room/session integration | Select provider or approve a secure WebRTC/signalling/TURN architecture; implement and test patient/doctor room lifecycle. |
| Razorpay payment | Checkout signature verification, provider status lookup and webhook security covered by disposable CI Runtime E2E | Lab order price must first be set by Admin. Add Test Mode `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `PAYMENT_WEBHOOK_SECRET` to Railway Staging secret variables; configure webhook endpoint `/api/payments/webhook` for `payment.captured` and `payment.failed`; then complete a real authorised test checkout/webhook delivery. |

## Not implemented in the current code line

- Live video-room/session creation and secure meeting-link workflow.
- Ambulance booking/dispatch and provider integration; emergency information alone does not dispatch an ambulance.
- Live insurance document acceptance remains blocked until private object storage and ClamAV are provisioned, access controls/encryption/lifecycle are verified, and synthetic clean/infected upload/download acceptance passes. Tracked separately in GitHub Issue #10.

## Environment safety

- Staging backend: https://health-care-backend-staging-staging.up.railway.app
- Latest Staging deployment `efe6aeda-aef3-42f4-8b9d-8f3f1d4f5208` is `SUCCESS` for commit `5d01ff79b5573b5e940ab903d89f6e267928568c`; Railway logs confirm schema/migrations applied and API started.
- This deployment adds strict insurance response allow-listing and fail-closed upload acceptance checks. It also retains Admin Lab Billing, Patient Pay Now, Razorpay callback/webhook verification and protected integration readiness. Public human provider acceptance is still pending because provider credentials are not configured.
- Staging directories for Pharmacy stores and delivery hospitals currently return empty arrays.
- Production Backend and Postgres remain `SUCCESS`; no Production service, branch, database, migration or secret was changed during this MVP work.
- Floot Operations Dashboard typecheck is clean and all five tests pass. Its proxy is pinned to the Staging backend; dedicated Staging admin sign-in is disabled until the environment has its own admin credentials. The preview is ready but unpublished.
- No fake patient, doctor, prescription, pharmacy, store, hospital or product records were inserted into the persistent Staging database.
- PR #8 remains Draft and unmerged. No Phase 7 changes have been merged into Production.

## Release decision

Automated code tests do not replace provider configuration, clinician identity checks, pharmacy licence/catalogue verification or human acceptance. Keep Staging as the only test target until those prerequisites are complete. Production release still requires explicit approval.


## Current verified status refresh — 5 November 2026

This section supersedes older deployment and readiness statements above where dates or commit identifiers differ. It records verified evidence, not a release approval.

### Repository and CI

All four PRs remain Draft, open and unmerged:

| PR | Scope | Current head | CI evidence |
|---|---|---|---|
| #8 | Phase 7 Pharmacy and Insurance, OTP, Family/Doctor availability, Flutter and related modules | `193e7acee49dbf5820a1d9d62e2a4c3df90896cd` | 6/6 workflows SUCCESS: Backend Tests (runs 41618093936 and 41618093904), Runtime E2E (41618094045), Docker Build (41618093922), Insurance private-storage/malware E2E (41618093955), Flutter (41618093920). |
| #12 | Unified role portal | `3ec703760cecf29870ed72f7bd290300170583c4` | 4/4 workflows SUCCESS: Backend Tests (41781816930, 41781816784), Runtime E2E (41781816919), Docker Build (41781816821). |
| #13 | Authentication abuse protection | `716d8ba2911f7592974984a6c048ab892facd926` | 4/4 workflows SUCCESS: Backend Tests (41968954003, 41968954113), Runtime E2E (41968954009), Docker Build (41968954000). |
| #14 | Staging-only integration of #12 and #13 | `c7b9983ed5be2e1c884889abdcac1ae8268808c9` | 4/4 workflows SUCCESS: Backend Tests (41835937402, 41835937338), Runtime E2E (41835937847), Docker Build (41835937415). |

CI Runtime E2E and Insurance E2E use isolated disposable infrastructure; their synthetic records and test credentials are not live Staging data or production acceptance.

### Railway Staging — verified 5 November 2026

- Backend deployment `da669bc6-38cd-483e-9b50-54b8b5bc67e4` is SUCCESS on branch `staging/auth-abuse-protection-with-role-portal`, commit `c7b9983ed5be2e1c884889abdcac1ae8268808c9`. Its pre-deploy log explicitly reports `schema and migrations applied`; the Railway health check succeeded. This deployment includes migration 011 in the sorted migration set.
- Staging backend and PostgreSQL are Online, one replica each, zero active warnings/criticals, zero recent failures and no pending work.
- Live `/health` and `/api/db/health` return HTTP 200. `/portal`, `/doctor`, `/admin`, `/web/portal.css` and `/web/pharmacy.js` load successfully.
- Latest observed 24-hour HTTP aggregate: 147 requests, 103 2xx, 44 4xx and zero 5xx. This is service-wide traffic, not proof of authenticated business workflows.
- Anonymous requests to `/api/pharmacy/admin/stores`, `/api/pharmacy/admin/orders`, `/api/pharmacy/orders`, `/api/doctor/appointments`, `/api/admin/appointments`, `/api/insurance/policies` and `/api/admin/insurance/policies` return HTTP 401.
- Live directories are empty: `/api/doctors` returns `[]`; `/api/pharmacy/stores` returns `[]`; `/api/pharmacy/hospitals` returns `[]`. No fake or unverified persistent data was added.

### Module status — distinguish software from provider/data acceptance

| Module | Current classification | Evidence / remaining gate |
|---|---|---|
| Patient / Doctor / Admin entry portal | STAGING VERIFIED (page serving only) | Three-role `/portal` and destination pages load. Patient/Doctor OTP and Admin login have not received human authenticated acceptance. |
| Admin operations and Pharmacy console | CI VERIFIED; live login BLOCKED | Existing Admin page exposes doctor, store, stock, order and insurance review controls. Staging does not have `ADMIN_EMAIL` or `ADMIN_PASSWORD`; configure a separate Staging-only admin identity in Railway before login testing. |
| Patient/Doctor OTP | CI VERIFIED; provider BLOCKED | OTP persistence, expiry/single-use and throttling are covered in isolated CI. Staging has no OTP provider configured. MSG91 remains deliberately deferred to the final step. |
| Pharmacy | CI VERIFIED; live business flow BLOCKED | Disposable PostgreSQL E2E covers store approval, products/stock, prescription matching, COD home/hospital checkout, history, Admin queue, status transitions and stock reservation. Live stores/hospitals are empty; partner identity/licences/catalogue must be verified and onboarded first. |
| Insurance | CI VERIFIED; live uploads BLOCKED | CI workflow 41618093955 uses disposable PostgreSQL, S3-compatible simulator and private ClamAV test service; clean upload, malicious test fixture quarantine and blocked quarantine downloads pass. Live status is `storageConfigured=false`, `scannerConfigured=false`, `uploadsEnabled=false`. |
| AI guidance | IMPLEMENTED; provider BLOCKED | Live `/api/ai/status` reports `configured=false` and `productionReady=false`. No provider activation or clinical acceptance. |
| WhatsApp notifications | IMPLEMENTED; provider BLOCKED | Live `/api/notifications/whatsapp/status` reports `configured=false`; delivery remains unverified. |
| Payments | MVP CODE PRESENT; provider E2E BLOCKED | Existing Razorpay adapter/tests are documented; no live Staging test credentials/webhook acceptance was evidenced in this audit. |
| Doctor directory / hospital directory | STAGING DATA BLOCKED | Live doctor list and Pharmacy hospital list are empty. Register only verified clinicians and real hospitals through the approved workflow. |
| Appointments / family / availability | CI VERIFIED; live user journey BLOCKED | Isolated Runtime E2E covers Doctor/Admin onboarding, Family Profiles and Doctor Availability. No real doctor rows or approved human sign-in flow is present in Staging. |
| Emergency information | STAGING VERIFIED (information only) | `/api/emergency` returns national emergency contact 112. This is not ambulance booking, dispatch or tracking. |
| Video consultation | NOT IMPLEMENTED as a live session workflow | No configured room/session provider or secure meeting-link lifecycle was evidenced. |
| Flutter patient app | CI VERIFIED | Flutter analysis/test/build workflow passed on PR #8; the artifact is a debug APK, not a production Play Store release. |

### Remaining acceptance gates

- P0: Add dedicated Staging `ADMIN_EMAIL` and `ADMIN_PASSWORD` directly in Railway. Values were not read or changed; do not share them in chat.
- P1: Obtain legitimate pharmacy partner, licence, product/stock and hospital data; then complete authenticated Staging order and fulfilment click-through.
- P2: Verify Railway public `X-Real-IP` and HTTP 429 behavior only with an isolated test IP/service. Do not burst from a shared public IP.
- P3: Activate MSG91 only as the final provider step with approved DLT sender/template, secure Staging secrets and an authorised test phone.
- P4: Configure private encrypted S3-compatible storage, restrictive bucket CORS/lifecycle and private ClamAV service in Staging; test clean/infected/offline/timeout cases and ownership isolation before real documents.
- P5: Configure providers only after approval; complete clinician onboarding and human Patient → Doctor → Appointment → Prescription → Payment/Pharmacy journeys.
- Production: keep Phase 6 running. Production backend and Postgres are Online, no pending work or active alerts. No Production source, variables, schema, data or deployment were changed.

This refresh does not authorise merging any Draft PR, changing Production, onboarding synthetic live data, activating a paid service or sending real SMS.
