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
