# Ayansha Health Care

Ayansha Health Care is the existing full-stack healthcare application in this repository. This repository is the source of truth for its application code and recovery work.

## Existing application surfaces

- Patient web panel: `web/` (served at `/`)
- Doctor panel: `doctor-panel/` (served at `/doctor-panel`)
- Admin panel: `admin-panel/` (served at `/admin`)
- Node.js API: `backend/`
- API liveness: `GET /health`
- PostgreSQL readiness: `GET /api/db/health` (requires a configured database)

## Backend development

Requirements: Node.js 18+ and PostgreSQL for database-backed workflows.

From `backend/`:

```sh
npm install
npm start
```

Database migrations are run with `npm run db:migrate`. Configure connection strings and provider credentials through the local environment or a secret manager. Never commit secrets or real patient data.

## CI verification

The `Backend Tests` workflow runs on pushes and pull requests targeting `recovery/backend-postgres-safe-fixes`. It provisions a fresh, isolated PostgreSQL 16 service inside the GitHub Actions runner, loads the checked-in schema, applies migrations, and runs the backend test suite. The CI database is ephemeral and is not connected to Railway or any production database.

## Docker

The root `Dockerfile` packages the existing patient web assets, doctor panel, admin entry page and Node.js backend into one application image. Runtime secrets and `DATABASE_URL` must be supplied by the hosting environment. Do not bake secrets into the image.

## Safe client-demo guidance

Use an isolated demo/staging database and fictional test records only. Source code and passing CI do not prove a live service is operational. OTP, payment, video, lab, AI, hospital and messaging integrations should be described as connected only after independent verification in the target demo environment.

## Recovery and production boundary

Active recovery branch: `recovery/backend-postgres-safe-fixes`.

No production deployment, production infrastructure change, database reset or destructive data operation is part of this repository workflow. Railway staging and external provider availability must be verified separately before claiming live readiness.
