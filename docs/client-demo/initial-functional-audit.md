# Client Demo Functional Audit — Initial Evidence

Audit target: existing recovery branch. This is a source-code review only; live backend/runtime behavior is not verified in this pass.

## Source-reviewed areas
- Patient web: web/app.js
- Doctor panel: doctor-panel/app.js and doctor-panel/health-record.js
- Admin panel: admin-panel/index.html
- Flutter: mobile-app/lib/main.dart, api_client.dart, book_appointment_screen.dart, labs_page.dart
- Backend test scripts: backend/package.json

## Evidence and findings
- Patient web appointment form calls POST /api/appointments and requires a token; source handles request failure.
- Web patient dashboard requests appointments, prescriptions, health records, lab orders, and payment data concurrently.
- Flutter main dashboard booking flow calls ApiClient.createAppointment and updates the local booking notifier after API response. Source-level implementation exists; runtime not verified.
- Flutter BookAppointmentScreen (standalone file) contains a placeholder Snackbar-only Confirm Booking and is not confirmed as the active route. Do not treat this as a live flow blocker until references/routes establish whether it is used.
- Flutter lab screen calls createLabOrder and loads existing orders, with error/loading UI. Source review only.
- Doctor panel fetches authenticated doctor appointments and provides status updates; prescription form is present in source. Runtime and role-ownership enforcement must be tested.
- Doctor health-record form submits to /api/health-records. Authorization behavior needs tests/live-safe verification.
- Admin panel authenticates through /api/admin/login, stores token in sessionStorage and retrieves /api/admin/appointments. Source review only.
- Backend package test script includes a broad set of auth, AI, payment, appointment, emergency/hospital, concurrency, real DB and authorization tests; CI status for current latest branch head remains to be checked.

## Verification status
- Code reviewed: listed source items only.
- Live runtime: NOT VERIFIED.
- Latest-head CI: NOT VERIFIED in this audit document.
- Real patient data: not accessed.
- Production: untouched.

## Next evidence-backed tasks
1. Check latest GitHub Actions status for branch HEAD.
2. Verify actual route references for standalone booking screen before fixing/removing any placeholder.
3. Test demo-safe login and appointment flows against a non-production environment only, if available.
4. Add/repair automated route/function smoke tests based on real endpoints and test harness.
5. Continue function-by-function verification and produce a final client-demo readiness report.
