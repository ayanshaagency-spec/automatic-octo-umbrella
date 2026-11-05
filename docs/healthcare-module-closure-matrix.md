# Ayansha Health Care — Built-in Module Closure Matrix

Updated: 1 November 2026
Scope: existing repository and Railway Staging. Production remains on the Phase 6 branch.

This matrix distinguishes implementation and automated evidence from live provider/data readiness. A screen or endpoint is not treated as complete unless its workflow is verified.

## Existing software

| Module | Current state | Evidence / open gate |
|---|---|---|
| Patient web portal | Implemented | Served by the existing backend; Staging backend and database health checks pass. The live directory has no verified doctor records yet. |
| Admin operations panel | Implemented | Existing appointment and Pharmacy operations; protected doctor registration/list added. Docker smoke verifies the admin entry point. |
| Doctor Panel | Implemented in the Staging feature branch | Served at `/doctor`; fixed asset allowlist; admin provisioning and doctor OTP sign-in flow pass isolated PostgreSQL Runtime E2E. It is not live on Staging until the queued Railway deployment completes. |
| Flutter patient app | Implemented; safety corrections added | Fake doctors, fake slots and default Delhi coordinates removed. Flutter analyze, safety tests and Debug APK build pass; APK artifact uploaded by CI and retained until 8 November 2026. |
| Backend API | Implemented for delivered MVP modules | Latest Backend Tests, Docker Build and Runtime E2E checks pass on the Staging branch. Latest branch is not yet deployed to Staging because Railway deployment 5d28e528 remains QUEUED with no build/deploy logs. |
| Appointments | Basic flow implemented | Protected patient/doctor flows and status updates. Real doctor availability calendar, slot publication and race-safe reservation are not implemented. |
| Prescriptions | Implemented | Protected doctor/patient routes; covered by automated tests. No patient/test prescription data was left in the persistent Staging database. |
| Health records | Implemented | Protected patient and doctor APIs. Anonymous access is rejected. |
| Lab orders | Implemented | Protected patient API and status workflow. Anonymous access is rejected. |
| Payments | MVP adapter implemented | Razorpay code and validation tests exist. Staging test credentials/webhook are absent, so live provider E2E is not complete. |
| Emergency information | Implemented | Emergency information endpoint responds. It is not an ambulance dispatch or booking service. |
| Nearby hospitals | Implemented | Coordinate-based directory API exists; Staging hospital directory currently returns an empty array. |
| Pharmacy integration | Implemented in Phase 7 branch | Isolated PostgreSQL E2E covers hospital/partner stores, catalogue, COD home/hospital orders, stock reservation, prescription mismatch, patient history, admin queue and fulfilment. Persistent Staging has no verified store/product/hospital data. Migration 008 is applied on Staging; migration 009 is still waiting for the queued deployment. |
| Floot Operations Dashboard | Existing project retained | Latest read-only preview remains available. Typecheck and tests must be rerun after Floot's daily build-action limit reset. |

## Provider / configuration gates

| Integration | Current state | Required before live acceptance |
|---|---|---|
| Patient/doctor SMS OTP | Shared PostgreSQL OTP code and isolated CI E2E pass | Approve SMS vendor, provider-specific adapter/template/sender, configure Staging secrets and use an authorised test phone. Public Staging must not disclose development OTPs. |
| AI assistant | Code exists; live status reports `configured:false` | Approved AI credentials, medical-safety configuration and clinical acceptance. |
| WhatsApp notifications | Code exists; live status reports `configured:false` | WhatsApp Business account, approved template and secret configuration. |
| Video consultation | No live room/session integration | Select provider or approve a secure WebRTC/signalling/TURN architecture; implement and test patient/doctor room lifecycle. |
| Razorpay payment | Adapter code exists; provider credentials not configured | Test-mode key/secret, webhook secret, callback verification and payment end-to-end test. |

## Not implemented in the current code line

- Doctor availability calendar, published time slots and atomic slot reservation.
- Family Profiles with dependent ownership, consent, and explicit access scopes.
- Live video-room/session creation and secure meeting-link workflow.
- Ambulance booking/dispatch and provider integration; emergency information alone does not dispatch an ambulance.
- Health-insurance document vault with private object storage, least-privilege access, malware scanning/quarantine and retention/deletion controls. Tracked separately in GitHub Issue #10.

## Environment safety

- Staging backend: https://health-care-backend-staging-staging.up.railway.app
- Staging `/health` and `/api/db/health` were verified successfully on the currently deployed version.
- Deployment `5d28e528-040c-49fc-a2a8-58175a24caf5` containing migration 009 is still `QUEUED` with no build/deploy logs; migration 009 is not confirmed live on Staging.
- Staging directories for Pharmacy stores and delivery hospitals currently return empty arrays.
- Production branch remains `feat/phase6-emergency-hospitals`; Production Backend and Postgres are Online with 0 warnings/criticals. Public `/health` and `/api/db/health` both pass. No Production service, branch, database, migration or secret was changed.
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
