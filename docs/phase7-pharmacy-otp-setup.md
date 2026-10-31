# Phase 7 — Patient OTP provider and shared-store setup

This guide applies to the existing Ayansha Health Care project. It does not authorize merging the Pharmacy PR, changing Railway settings, or deploying to production.

## OTP integration contract

The backend reads these environment variables:

- `OTP_PROVIDER_URL`: absolute HTTPS URL for a provider endpoint that accepts the request contract below.
- `OTP_PROVIDER_TOKEN`: provider API token, supplied only through the deployment platform's secret-variable store.
- `DATABASE_URL`: required in staging/production for the shared OTP challenge and rolling request-limit tables.
- `JWT_SECRET`: used to HMAC phone identifiers and OTP values before storing them. It must be a strong secret of at least 32 characters and must be shared consistently by all backend replicas.

Only `NODE_ENV=development` or `NODE_ENV=test` uses the process-local OTP store and permits development OTP disclosure when provider credentials are absent. Do not use these modes for a publicly reachable environment.

In every other environment, including `staging` and `production`, OTP requests require the PostgreSQL store and the HTTPS provider. Missing database or provider configuration fails closed; no development OTP is returned.

The current generic adapter sends an HTTPS `POST` request with:

```http
Authorization: Bearer <OTP_PROVIDER_TOKEN>
Content-Type: application/json
```

```json
{
  "to": "+91XXXXXXXXXX",
  "message": "Your Ayansha Health Care verification code is 123456. It expires in 5 minutes."
}
```

The provider must explicitly support this generic JSON/Bearer contract. Do not assume a vendor's default SMS/OTP API is compatible. If the chosen provider requires a template ID, sender ID, DLT/template registration, a different payload or a different authentication scheme, implement and test a dedicated provider adapter before configuring staging/production.

## Shared OTP storage and throttling

Migration `backend/db/migrations/009_shared_patient_otp_store.sql` adds two additive tables:

- `patient_otp_challenges` stores one active challenge per HMAC-derived phone key, a challenge ID, an HMAC OTP hash, attempt count and expiry.
- `patient_otp_request_events` stores HMAC-derived phone keys and request timestamps for the rolling rate limit.

The shared store:
- Allows at most 3 OTP requests per phone in a rolling 15-minute window.
- Expires OTPs after 5 minutes and invalidates them after 5 failed verification attempts.
- Uses PostgreSQL advisory locks and row locks so concurrent requests/verification across replicas cannot bypass the per-phone limit or consume a code twice.
- Deletes expired request events during issuance, and deletes a challenge after successful use, expiry, lockout or provider-delivery failure.
- Does not persist raw phone numbers or OTP codes. HMAC uses the same strong `JWT_SECRET` that signs patient sessions.

The per-phone database limiter is not a complete perimeter: a trusted edge/IP rate limit is still required before multi-replica production traffic. Configure trusted-proxy handling explicitly before relying on forwarded client-IP headers. The application does not trust arbitrary forwarded-IP headers.

## Safe setup sequence

1. Approve the SMS/OTP provider account. Verify account ownership, India/phone-number support, sender/template prerequisites, rate/credit limits, data handling and delivery/error semantics.
2. Keep provider URL/token only in the deployment platform's secret-variable store. Never commit real values, add them to `.env` in Git, or paste them into issues/PR comments.
3. Deploy the shared-store migration only to the isolated Staging database after the existing Staging backend build is admitted. Verify that migration 009 can be applied twice without data loss.
4. Configure the provider's real provider-specific adapter and secrets in Staging. Use an authorised test phone and verify success, invalid/expired code, single-use behavior, five failed attempts, rolling throttling, concurrent requests, provider timeout/4xx/5xx and missing-secret behavior.
5. Verify no OTP, token, raw phone number, provider token or database URL appears in logs or build artifacts.
6. Only after staging sign-off, plan production configuration and request explicit release approval. Do not merge, deploy or apply the migration to production as part of this setup guide.

## Release prerequisites still external to this repository

- A provider account and provider-specific configuration are approved and available.
- SMS template/sender setup (and any applicable Indian carrier/regulatory registration) is complete.
- Trusted edge/IP rate limiting is configured for public traffic.
- Staging test evidence is recorded in [Launch Readiness issue #9](https://github.com/ayanshaagency-spec/automatic-octo-umbrella/issues/9).
- Pharmacy stores and products are independently verified and remain inactive until approval.
- Explicit release approval exists before merging, deploying or applying the Pharmacy migration.
