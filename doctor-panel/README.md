# Ayansha Health Care — Doctor Panel

The Doctor Panel is served by the existing backend at `/doctor`. It shares the existing database and API; it is not a separate application or data store.

## Doctor onboarding
- An administrator signs in at `/admin` and registers a verified doctor in the **Doctors** section with the doctor's name, specialty and registered phone.
- The admin directory is protected by the existing admin session. Duplicate phone numbers are rejected.
- The doctor then signs in at `/doctor` by requesting and verifying an OTP on that registered phone.
- Register only after verifying identity and credentials offline. Do not add sample doctors or unverified clinician records.

## Included workflow
- OTP sign-in restricted to a doctor phone number provisioned by an administrator.
- Doctor-scoped appointment queue and appointment status updates.
- Prescription creation with medicine details.
- Patient health-record entry using the authenticated doctor's session.

## Local setup
1. Start the existing backend and configure its required database and authentication environment variables.
2. Open `http://localhost:3000/doctor`.
3. Sign in using a provisioned doctor phone and the configured OTP delivery provider.

## Security and external dependencies
- Doctor APIs require a doctor role token and scope appointment operations to the signed-in doctor.
- Production/staging OTP requires the approved SMS provider. No development OTP is disclosed on a public deployment.
- Video consultation is an entry point only; a live video-room provider and secure meeting-link workflow are not yet integrated.
- Doctor scheduling/availability slots are not implemented yet. The patient app must not invent or display bookable slots.


## Family Profiles and Doctor Scheduling

- Doctors sign in using their registered phone and OTP, then publish future 30-minute slots in the Doctor Panel. They can review availability and cancel only unbooked slots.
- Patients see only future published slots that are not already booked. A database unique index prevents duplicate active bookings.
- Family profiles belong to the signed-in patient account. Children are guardian-managed with appointment scope. Adult family members must sign in on their own phone and explicitly allow appointment access; a decline or later revocation removes access.
- Existing appointments and medical records remain owned by the patient account. A dependent is linked separately on the appointment; revoking family access does not delete historic clinical data.
- Migration 010 and these endpoints are currently on the Staging feature branch. Do not claim them live until the approved Staging deployment succeeds.
