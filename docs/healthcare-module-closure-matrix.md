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
| Backend API | Implemented for delivered MVP modules | Commit `be31ad41a954151501165b34d5a5974df2c443a8` is deployed successfully to Railway Staging. Backend Tests, Docker Build and Runtime E2E pass on this commit. |
| Appointments | Core booking flow implemented | Protected patient/doctor flows, doctor-published availability slots, family-member consent scopes, race-safe slot booking and doctor queue scoping pass isolated PostgreSQL Runtime E2E. Human acceptance with verified clinicians remains pending. |
| Prescriptions | Implemented | Protected doctor/patient routes; covered by automated tests. No patient/test prescription data was left in the persistent Staging database. |
| Health records | Implemented | Protected patient and doctor APIs. Anonymous access is rejected. |
| Lab orders | Implemented | Protected patient API and status workflow. Anonymous access is rejected. |
| Payments | Lab billing + Razorpay Checkout and webhook code deployed to Staging; live provider acceptance pending | Admin-only Lab Billing tab sets saved lab-order prices; patient-supplied amounts are ignored. Patient Dashboard shows Pay Now only for priced lab orders. Checkout callback HMAC is verified server-side, payment status is fetched from Razorpay, and only captured payments become paid. Signed webhook handling checks raw-body signature and order/amount/currency, with duplicate/out-of-order protection. Backend Tests, Docker Build and Runtime E2E pass. Staging Razorpay keys/webhook secret are absent; live Test Mode checkout remains blocked. |
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
- Health-insurance document vault with private object storage, least-privilege access, malware scanning/quarantine and retention/deletion controls. Tracked separately in GitHub Issue #10.

## Environment safety

- Staging backend: https://health-care-backend-staging-staging.up.railway.app
- Latest Staging deployment `1e1f5b50-5eaf-4e11-b32e-2d0fabb5dc7c` is `SUCCESS` for commit `b405602bfbbf035e6b515edd2c730a793ceccb76`; Railway logs confirm schema/migrations applied, API started, and `/health` healthcheck succeeded.
- This deployment includes protected payment readiness, Razorpay Checkout callback verification, official signed webhook processing, Admin Lab Billing and Patient Pay Now for admin-priced lab orders. Public human login/payment acceptance is not confirmed because provider credentials are not configured.
- Staging directories for Pharmacy stores and delivery hospitals currently return empty arrays.
- Production Backend and Postgres remain `SUCCESS`; no Production service, branch, database, migration or secret was changed during this MVP work.
- Floot Operations Dashboard typecheck is clean and all five tests pass. Its proxy is pinned to the Staging backend; dedicated Staging admin sign-in is disabled until the environment has its own admin credentials. The preview is ready but unpublished.
- No fake patient, doctor, prescription, pharmacy, store, hospital or product records were inserted into the persistent Staging database.
- PR #8 remains Draft and unmerged. No Phase 7 changes have been merged into Production.

## Release decision

Automated code tests do not replace provider configuration, clinician identity checks, pharmacy licence/catalogue verification or human acceptance. Keep Staging as the only test target until those prerequisites are complete. Production release still requires explicit approval.
