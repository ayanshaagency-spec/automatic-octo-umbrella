# Ayansha Health Care — GitHub Pages Static Client Demo

## Scope

This workflow publishes only the existing static client demonstration:
- `client-demo/index.html` as the site landing page
- `web/` patient-facing UI
- `doctor-panel/` doctor UI
- `admin-panel/` admin UI

It does **not** publish the backend, database, migrations, environment files, secrets, patient records, or production configuration.

## Important limitations

GitHub Pages is static hosting. It cannot run the Node.js backend or PostgreSQL. Therefore:
- OTP delivery and authentication are not available on this preview.
- Appointment, prescription, health-record, lab, payment, AI, WhatsApp, and admin API actions require a separately configured authorized non-production backend.
- Do not enter real patient information, personal health information, or real credentials into this public preview.
- The static preview is for UI/client demonstration only; it is not a production healthcare service.

## Deployment

The workflow runs only from `recovery/backend-postgres-safe-fixes` when relevant demo files change, or when manually dispatched. It packages the existing panels and deploys the static artifact to the repository's GitHub Pages environment.

The Pages URL is emitted by the completed GitHub Actions deployment. If GitHub Pages is not enabled for the repository or the linked GitHub account lacks Pages permissions, the workflow will report that configuration/permission blocker. No paid hosting or production deployment is part of this workflow.

## Safety

- No backend or database files are copied into the Pages artifact.
- No secrets are added to the repository.
- No production environment, Railway service, PostgreSQL volume, or database is changed.
