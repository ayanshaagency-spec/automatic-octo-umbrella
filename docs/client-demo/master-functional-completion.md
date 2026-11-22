# Ayansha Health Care — Master Client Demo Completion & Functional Verification

## Objective
Complete the existing Ayansha Health Care client demo across patient web, Flutter app, doctor workspace and admin panel. Prioritize genuine end-to-end functionality and verified flows, not decorative UI alone.

## Protection rules
- Continue ONLY in this repository and recovery branch: `recovery/backend-postgres-safe-fixes`.
- Audit before changing each flow; preserve existing features, APIs, schemas, data and code.
- No rebuild, duplication, reset, deletion, migrations against production, or production deployment.
- GitHub-only workflow. Never use Railway.
- No production credentials/data. Use fictional demo data only.
- Never expose or commit secrets, tokens, patient data or credentials.
- Make minimal, reversible, evidence-backed fixes. Avoid repeating already passed tests.
- Do not declare a function verified unless its real API/backend behavior is tested or supported by CI evidence. Clearly distinguish code review, CI, and live-runtime verification.

## Workstreams
1. **Patient Web**: review login/session, doctor listing/search/profile, booking validation and API submission, appointments dashboard, prescriptions, records, lab requests, payments/status, AI assistant, emergency/hospital discovery and navigation. Check loading/empty/error states and mobile responsiveness.
2. **Flutter app**: review auth flow, API base URL/session handling, patient home, doctor listing/profile, appointment booking, consultation, prescriptions/records, labs, AI assistant, emergency and nearby hospitals. Fix placeholder-only actions and disconnected flows where existing APIs support them.
3. **Doctor panel**: verify login, authenticated appointment retrieval, status transitions, prescription submission, patient health-record creation and error handling. Ensure patient data access is scoped and authorization is tested.
4. **Admin panel**: verify login, session/logout, appointment operations, status/management actions available in existing code, and safe error states. Never expose admin secrets client-side.
5. **Backend/API**: verify routes, auth/role/ownership checks, validation, appointment concurrency/slot handling, prescriptions, records, lab orders, payments/webhooks, AI, emergency/hospital routes and health checks. Preserve DB/schema.
6. **QA/CI**: run or inspect relevant GitHub Actions and tests, Flutter analyze/build, frontend route/smoke tests. Fix failures safely; no speculative CI edits. Verify latest commit SHA and its status.
7. **Client demo**: produce a concise walkthrough and a readiness checklist separating Verified, CI-verified, Code-reviewed, Not verified, and Blocked.

## Execution order
P0: login/session and patient appointment booking; doctor appointment workspace and prescription; patient dashboard retrieval; admin login/operations.
P1: health records, lab requests, AI, emergency/hospital, consultation/video flow, payment flow.
P2: UI polish, responsive/mobile presentation, walkthrough, regression verification.

## Evidence/reporting
For every completed item report: commit, files changed, verification method/result, and remaining limitations. Do not claim real video-provider integration, payment settlement, provider-confirmed lab availability, emergency dispatch, or live runtime unless explicitly verified.
