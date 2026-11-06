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
| Payments | MVP adapter and readiness monitoring implemented | Razorpay order adapter, webhook signature verification, validation tests and authenticated `/api/admin/payment/status` are present. Admin System Health now reports provider credentials/webhook readiness without exposing secrets. Staging Razorpay keys and webhook secret are absent; payment E2E/live checkout is still blocked. |
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
| Razorpay payment | Adapter and webhook security tests exist; provider credentials not configured | Add test-mode `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `PAYMENT_WEBHOOK_SECRET` to Railway Staging secret variables; then test order creation, callback/signature verification and payment lifecycle end-to-end. |

## Not implemented in the current code line

- Live video-room/session creation and secure meeting-link workflow.
- Ambulance booking/dispatch and provider integration; emergency information alone does not dispatch an ambulance.
- Health-insurance document vault with private object storage, least-privilege access, malware scanning/quarantine and retention/deletion controls. Tracked separately in GitHub Issue #10.

## Environment safety

- Staging backend: https://health-care-backend-staging-staging.up.railway.app
- Latest Staging deployment `2d980d6c-f0fb-4c3f-b54f-be18511eabdf` is `SUCCESS` for commit `be31ad41a954151501165b34d5a5974df2c443a8`; the pre-deploy log confirms schema and all migration scripts applied successfully.
- This deployment includes the protected payment-readiness route and Admin System Health card. Public endpoint reachability was not independently verified from the current execution environment.
- Staging directories for Pharmacy stores and delivery hospitals currently return empty arrays.
- Production Backend and Postgres remain `SUCCESS`; no Production service, branch, database, migration or secret was changed during this MVP work.
- Floot Operations Dashboard typecheck is clean and all five tests pass. Its proxy is pinned to the Staging backend; dedicated Staging admin sign-in is disabled until the environment has its own admin credentials. The preview is ready but unpublished.
- No fake patient, doctor, prescription, pharmacy, store, hospital or product records were inserted into the persistent Staging database.
- PR #8 remains Draft and unmerged. No Phase 7 changes have been merged into Production.

## Release decision

Automated code tests do not replace provider configuration, clinician identity checks, pharmacy licence/catalogue verification or human acceptance. Keep Staging as the only test target until those prerequisites are complete. Production release still requires explicit approval.
