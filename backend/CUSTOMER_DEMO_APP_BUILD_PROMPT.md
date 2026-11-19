# Ayansha Health Care — Customer Demo / App Build Prompt (NEXT PHASE; DO NOT START UNTIL RECOVERY IS CLOSED)

Continue in the existing Ayansha Health Care repository only. Audit existing frontend, backend, routes, database schema, admin panel, patient dashboard, doctor flow, appointment flow, prescription, lab orders, payment, emergency/hospital features and current deployment setup before editing.

## Safety and preservation
- No new/duplicate project; preserve existing code, records, routes, components, configuration and working features.
- Do not reset or migrate production DB; do not deploy/publish without explicit approval.
- Demo must use fictional, clearly labeled sample data; never expose actual patient data.
- Clearly label integrations as demo/configuration-dependent if not truly live (e.g. video provider, payment gateway, WhatsApp, AI).

## Customer demo experience
Improve the existing app's demo journey, using the existing stack and components:
1. Landing / overview that explains Ayansha Health Care in simple customer language.
2. Guided patient journey: sign-in/demo entry (only if safe), dashboard, browse doctors, book appointment, consultation status, prescription, lab booking, payments/status and records.
3. Doctor journey: doctor dashboard, appointment review, status updates and prescription/record workflow where already supported.
4. Admin journey: safe admin demo overview of appointments and service monitoring, without exposing secrets or personal data.
5. Emergency information and nearby hospital feature walkthrough, with clear emergency disclaimers and no false claims.
6. Demo banners, step hints and sample data; make it easy for a customer to understand each feature.
7. Responsive/mobile layout, accessibility, loading/error/empty states and clear navigation.
8. Optional customer walkthrough script, demo guide and screenshot/video storyboard.

## Engineering execution
- Audit first, then implement a scoped plan; avoid feature rewrites.
- Use existing APIs and data models; don't add fabricated integrations.
- Verify route/API behavior with isolated test data, build and lint/test commands where available.
- Make no production writes and don't use live patient records.
- Commit focused changes on a feature branch and run CI.
- Report exact changed files, verification, blockers and deployment prerequisites. Do not claim the app is deployed/live unless verified.
