# Ayansha Health Care — Client Demo Guide (21 Nov 2026)

## Demo goal
Show the existing patient web journey and the doctor/admin panel concepts from the existing repository. This is a source walkthrough, not proof of a live production service.

## Recommended 8–10 minute walkthrough
1. **Patient home:** introduce the healthcare journey and service cards.
2. **Find a doctor:** demonstrate the existing doctor directory/search UI (only if it loads with the chosen demo environment).
3. **Appointment flow:** show the appointment form. Do not submit against production or shared live data; use an isolated demo environment only.
4. **Patient dashboard:** explain appointments, prescriptions, records, labs and payment sections; show only fictional/demo data.
5. **AI health guidance:** describe the guidance feature and clearly show the medical disclaimer; do not imply diagnosis.
6. **Emergency:** point out emergency guidance and India emergency number 112.
7. **Doctor panel:** show the existing doctor sign-in/queue/prescription/record UI; authentication and real workflow remain unverified unless tested in isolated staging.
8. **Admin panel:** show the existing admin login and appointment dashboard UI; no credential guesses or production login attempts.
9. **Close:** describe next validation steps (isolated staging, real OTP provider, DB-backed integration tests, and security checks).

## Existing source locations
- Patient web: `web/index.html`, `web/app.js`, `web/styles.css`
- Doctor panel: `doctor-panel/index.html` and its panel scripts/styles
- Admin panel: `admin-panel/index.html`
- Recovery branch: `recovery/backend-postgres-safe-fixes`

## Important verification limitations
- Railway staging was previously observed offline; no live demo URL/runtime is verified by this guide.
- Source-code panels do not equal a deployed app. Use a confirmed isolated demo URL or run locally with the documented safe setup.
- No production environment, production database, real patient information, secrets, or external integration claims should be used in this presentation.
- If OTP, AI, video, payments, labs or hospital integrations are not demonstrably connected in the demo environment, present them as UI/architecture or integration-pending items, not as live features.

## Client-facing wording
“Today we are presenting the existing patient, doctor and admin experiences and the connected workflow design. Live backend integrations and production readiness are being verified separately in a controlled staging environment.”

## Safety checklist
- [ ] Use isolated demo/staging environment only.
- [ ] Confirm demo data is fictional.
- [ ] Do not expose credentials, tokens, secrets or patient data.
- [ ] Do not test writes in production/shared environments.
- [ ] Clearly label unverified external integrations.
