# Phase 7 — Patient OTP provider and shared-store setup

This guide applies to the existing Ayansha Health Care project. It does not authorize merging the Pharmacy PR, changing Railway settings, or deploying to production.

## OTP integration contract — MSG91 Flow API

The selected provider is **MSG91 SMS Flow**. The application continues to generate, hash, store, expire, throttle and verify its own six-digit OTP; MSG91 only delivers the message. This preserves the existing PostgreSQL shared challenge store and single-use verification behavior.

Configure these values only in Railway's **Staging service secret-variable store** after the MSG91 account and template are ready:

- `OTP_PROVIDER=msg91`
- `MSG91_AUTH_KEY`: MSG91 account authentication key (secret).
- `MSG91_TEMPLATE_ID`: the approved SMS Template ID shown in the MSG91 SMS Templates panel.
- `MSG91_OTP_VARIABLE=otp`: optional; defaults to `otp`. It must exactly match the case-sensitive variable name created in the MSG91 template.

The adapter uses MSG91's current Flow API endpoint:

```http
POST https://control.msg91.com/api/v5/flow
authkey: <MSG91_AUTH_KEY>
accept: application/json
content-type: application/json
```

It sends one recipient with the locally generated OTP under the configured template variable:

```json
{
  "template_id": "<MSG91_TEMPLATE_ID>",
  "recipients": [
    {
      "mobiles": "919XXXXXXXXX",
      "otp": "123456"
    }
  ]
}
```

The phone number is sent in international digits-only format (for example, `+919XXXXXXXXX` becomes `919XXXXXXXXX`). The endpoint is fixed to MSG91's HTTPS hostname; it is not configurable through an arbitrary URL. The adapter has an 8-second timeout, never logs the auth key/OTP/phone/payload, and treats non-2xx or an explicit MSG91 `type: error` response as delivery failure. The application's OTP is not disclosed to the client in provider mode.

### MSG91 account and India DLT setup — manual prerequisite

1. Create/approve the MSG91 account and confirm SMS balance/credit, account ownership and allowed transactional route. Account creation, recharge and any paid plan require separate approval.
2. In MSG91, open **SMS → Templates → Create Template**. Choose a sender ID already mapped to the MSG91 account, enter the approved DLT Template ID for India, and use the exact message content approved in the DLT portal.
3. Include the variable placeholder `##otp##` in the MSG91 template and keep its variable name exactly `otp` (lowercase), or set `MSG91_OTP_VARIABLE` to the exact variable name used by the template.
4. Wait for MSG91/DLT approval and make the approved template version the default. MSG91 documents that Indian SMS templates need the mapped sender/header and the exact approved DLT template content; a template that is not DLT-verified may not deliver to Indian numbers.
5. Add `OTP_PROVIDER`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, and `MSG91_OTP_VARIABLE` to Railway Staging secrets. Do not put the auth key in GitHub, source code, issue comments, chat, or screenshots.

The recommended message text to submit for DLT approval (subject to the approved template wording) is:

```text
Your Ayansha Health Care verification code is ##otp##. It expires in 5 minutes. Do not share it with anyone.
```

Do not assume that the suggested text is already DLT-approved. The DLT portal's approved content, sender/header, entity/PE ID and template ID must match what is configured in MSG91.

### Backward compatibility

The pre-existing generic HTTPS/Bearer adapter remains available only when `OTP_PROVIDER=generic` (or `OTP_PROVIDER` is unset). It requires `OTP_PROVIDER_URL` and `OTP_PROVIDER_TOKEN`. For MSG91, use `OTP_PROVIDER=msg91`; do not populate the generic URL/token fields.

The application reads these core variables:

- `DATABASE_URL`: required in staging/production for the shared OTP challenge and rolling request-limit tables.
- `JWT_SECRET`: used to HMAC phone identifiers and OTP values before storing them. It must be a strong secret of at least 32 characters and must be shared consistently by all backend replicas.

Only `NODE_ENV=development` or `NODE_ENV=test` uses the process-local OTP store and permits development OTP disclosure when no provider is configured. Do not use these modes for a publicly reachable environment.

In every other environment, including `staging` and `production`, OTP requests require the PostgreSQL store and a fully configured provider. Missing MSG91 auth key/template ID fails closed; no development OTP is returned.


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

1. Approve the MSG91 account. Verify account ownership, India transactional SMS eligibility, sender/header and DLT template prerequisites, credit limits, data handling and delivery/error semantics.
2. Keep provider URL/token only in the deployment platform's secret-variable store. Never commit real values, add them to `.env` in Git, or paste them into issues/PR comments.
3. Deploy the shared-store migration only to the isolated Staging database after the existing Staging backend build is admitted. Verify that migration 009 can be applied twice without data loss.
4. Configure the MSG91 Flow adapter and Staging secrets. Use an authorised test phone and verify SMS delivery, invalid/expired code, single-use behavior, five failed attempts, rolling throttling, concurrent requests, provider timeout/4xx/5xx, DLT/template rejection and missing-secret behavior.
5. Verify no OTP, token, raw phone number, provider token or database URL appears in logs or build artifacts.
6. Only after staging sign-off, plan production configuration and request explicit release approval. Do not merge, deploy or apply the migration to production as part of this setup guide.

## Release prerequisites still external to this repository

- An approved MSG91 account, verified sender/header, DLT-approved active template, auth key and template ID are available.
- SMS template/sender setup (and any applicable Indian carrier/regulatory registration) is complete.
- Trusted edge/IP rate limiting is configured for public traffic.
- Staging test evidence is recorded in [Launch Readiness issue #9](https://github.com/ayanshaagency-spec/automatic-octo-umbrella/issues/9).
- Pharmacy stores and products are independently verified and remain inactive until approval.
- Explicit release approval exists before merging, deploying or applying the Pharmacy migration.
