# AyanSha Health Care

Modern digital healthcare platform covering the connected journey:

Patient → AI / Doctor → Appointment → Consultation → Prescription → Payment → Health Records

## Current verified scope

- Phase 1–6 preserved and signed off
- Patient, doctor and admin experiences
- Appointments and consultation flow
- Digital prescriptions and health records
- Lab-test booking architecture
- Secure payment lifecycle and webhook verification
- Emergency response and nearby hospital APIs
- Flutter Android/iOS-ready patient experience
- Client-demo dashboard with live database API wiring
- GitHub CI, smoke, verification and runtime E2E checks passing
- Runtime E2E verified against a real PostgreSQL service in GitHub Actions

## Client demo

The `web-demo/` experience provides a professional patient, doctor and admin presentation with a verification center and live-data dashboard.

## Production configuration

Live deployment still requires the target hosting environment, PostgreSQL connection, domain/SSL, payment provider credentials, WhatsApp Cloud API credentials where required, and final production secrets to be configured outside the repository.

## Project status

**Development + automated runtime verification: complete.**

**Production deployment: configuration/deployment stage.**
