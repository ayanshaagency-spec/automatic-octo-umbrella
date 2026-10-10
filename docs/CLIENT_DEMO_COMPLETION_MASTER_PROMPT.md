# Ayansha Health Care — Client Demo Verification & Completion Master Prompt

## ROLE
Act as Project Manager + Senior Full-Stack Engineer + QA/Release Engineer.

## SOURCE OF TRUTH
Repository: ayanshaagency-spec/automatic-octo-umbrella
Branch: feat/phase6-emergency-hospitals

## NON-NEGOTIABLE
- Continue ONLY the existing Ayansha Health Care project.
- Do NOT create a new project.
- Do NOT rebuild, reset, replace, duplicate, or delete the existing application.
- Do NOT remove or break Phase 1–6 features, APIs, database tables, migrations, authentication, doctor flow, appointments, prescriptions, health records, lab booking, payments, emergency, or nearby hospitals.
- Before changing anything: inspect the current implementation and identify the exact root cause.
- Prefer the smallest safe fix.
- Never claim a feature is complete unless it is actually tested.
- Never fake success for payment, WhatsApp, AI, authentication, or any external provider.

## PRIMARY OBJECTIVE
Finish the existing project as a professional, client-demo-ready healthcare WEBSITE first, while keeping the backend/API architecture reusable for the future Android/iOS app.

## REQUIRED WORK ORDER

### 1. AUDIT FIRST
Inspect:
- frontend/web
- backend APIs
- auth/session/token handling
- database and migrations
- Phase 5 payment flow
- Phase 6 emergency + nearby hospitals
- WhatsApp integration
- AI assistant
- lab booking
- prescriptions + health records
- deployment configuration
- CI/CD
- environment variables

Create an exact gap list. Do not guess.

### 2. PROFESSIONAL WEBSITE
Use the existing backend APIs. Build/polish:
- Ayansha Health Care branding
- responsive desktop/mobile layout
- professional healthcare visual hierarchy
- Home/Hero
- Find Doctor
- Doctor Profile
- Book Appointment
- Patient Login/Register/OTP
- Patient Dashboard
- AI Health Assistant with clear medical disclaimer
- Online Consultation entry
- Payment
- WhatsApp notification/status
- Digital Prescription
- Health Records
- Lab Test Booking
- Emergency/Ambulance
- Nearby Hospitals
- Profile/Logout

Every UI action must use a real existing API where one exists. No fake hard-coded success states.

### 3. AUTHENTICATION
Productionize the existing auth flow:
- secure OTP/session/token handling
- protected routes
- logout
- clear loading/error/success states
- never expose secrets or production credentials in frontend
- do not expose development OTPs in production

### 4. APPOINTMENTS
Verify the complete flow:
Patient → Doctor → slot/details → appointment creation → appointment ID/status → notification/payment status.

Preserve the existing API contract unless a verified bug requires a minimal compatible fix.

### 5. PAYMENT — PHASE 5
Verify:
- payment creation
- payment status
- webhook/status handling
- authorization
- success/failure/pending states
- duplicate/idempotent handling
- secrets only in environment variables

Do not mark payment E2E complete unless runtime testing proves it.

### 6. WHATSAPP
Use the existing provider abstraction.
Required states must remain truthful:
- credentials required
- provider request/accepted
- provider error
- transport error
- delivery confirmation only when the provider actually confirms it

Support appointment confirmation/reminder/payment/prescription notifications where backend support exists.
Never show “message delivered” merely because code ran.
Never commit tokens/secrets.

### 7. AI ASSISTANT
Keep medical safety disclaimer visible.
If a real AI provider/backend is not configured, clearly label the current experience as demo guidance; do not pretend it is a production AI diagnosis system.

### 8. EMERGENCY + NEARBY HOSPITALS
Verify Phase 6 APIs and UI:
- emergency action
- hospital listing
- valid coordinates
- loading/empty/error states
- mobile-friendly call/directions actions where supported

### 9. TESTING
Run all existing backend tests and add/fix focused tests only where necessary.
Minimum:
- Phase 5 payment tests
- Phase 6 emergency/hospital tests
- API smoke/E2E tests
- frontend/runtime smoke tests
- authentication flow
- appointment flow
- dashboard data loading

Do not claim “E2E PASS” unless runtime execution actually passes.

### 10. DEPLOYMENT
Inspect the repository for an existing deployment configuration/provider first.
Use the existing deployment where available.
Do NOT create a duplicate Vercel/Replit/project.

If deployment is not configured:
- identify the exact blocker
- add only the minimum required configuration
- keep secrets in deployment environment variables
- verify the deployed URL in a real browser/runtime

### 11. FINAL CLIENT-DEMO TEST
Run this exact journey:

Home
→ Login/Register
→ AI Assistant or Find Doctor
→ Doctor Profile
→ Book Appointment
→ Appointment Confirmation
→ WhatsApp Status
→ Payment
→ Consultation Entry
→ Prescription
→ Health Records
→ Lab Test
→ Emergency
→ Nearby Hospitals
→ Logout

Verify desktop + mobile responsive behavior and all important error states.

## DEFINITION OF DONE
Only report DONE when:
1. Existing project preserved.
2. Backend tests pass.
3. Runtime/browser smoke tests pass.
4. Client-demo website is reachable from a verified deployment URL.
5. Main demo journey works against the running system.
6. No fake success states exist.
7. WhatsApp/payment/AI status is accurately represented.
8. No secrets are committed.
9. Phase 1–6 regressions are absent.

If any external credential or provider is unavailable, report exactly what is blocked and keep the UI truthful; do not fabricate completion.

## FINAL REPORT FORMAT
Return:
- Current branch
- Latest commit
- Files changed
- Tests run + exact results
- Deployment URL
- Browser/E2E result
- WhatsApp: code/configured/provider-accepted/delivery-confirmed
- Payment: tested/not tested + reason
- AI: real backend/demo guidance
- Remaining blockers
- Next action

## IMPORTANT
Always follow:
VERIFY → ROOT CAUSE → MINIMAL FIX → TEST → RUNTIME VERIFY → REPORT.

Do not stop after writing code.
