# Phase 7 — Patient OTP provider setup

This guide is for the **existing** Ayansha Health Care project. It does not authorize merging the Pharmacy PR, changing Railway settings, or deploying to production.

## Current OTP integration contract

The backend already reads these environment variables:

- \`OTP_PROVIDER_URL\`: absolute HTTPS URL for a provider endpoint that accepts the request contract below.
- \`OTP_PROVIDER_TOKEN\`: provider API token, supplied only through the deployment platform's secret-variable store.
- \`NODE_ENV=production\`: disables development OTP disclosure. With missing provider URL/token, OTP requests fail closed.

The current adapter sends an HTTPS \`POST\` request with:

\`\`\`http
Authorization: Bearer <OTP_PROVIDER_TOKEN>
Content-Type: application/json
\`\`\`

\`\`\`json
{
  "to": "+91XXXXXXXXXX",
  "message": "Your Ayansha Health Care verification code is 123456. It expires in 5 minutes."
}
\`\`\`

The provider must explicitly support this generic JSON/Bearer contract. Do not assume a vendor's default SMS/OTP API is compatible. If the chosen provider requires a template ID, sender ID, DLT/template registration, a different payload or a different authentication scheme, implement and test a dedicated provider adapter before configuring production.

## Safe setup sequence

1. Pick and approve the SMS/OTP provider account. Verify account ownership, service region, sender/template prerequisites, rate/credit limits, data handling, and delivery/error semantics.
2. In a **non-production** environment, store the provider URL and token in the platform's secret-variable settings. Never commit real values, add them to \`.env\` in Git, or paste them into issues/PR comments.
3. Use a test phone and verify success, invalid/expired code, one-time use, five failed verification attempts, provider timeout/4xx/5xx, and missing-secret behavior.
4. Verify the caller gets a generic error on provider failure and no token/code/phone secrets are logged.
5. Only after staging sign-off, configure the production secrets and request explicit release approval. Do not deploy or merge the Pharmacy PR as part of this setup guide.

## OTP throttling currently in code

The Pharmacy feature branch adds these process-local controls:

- Maximum 3 OTP requests per phone number in a rolling 15-minute window.
- OTP lifetime of 5 minutes.
- OTP becomes invalid after 5 failed verification attempts; successful codes remain single-use.
- Expired challenge/request-rate entries are pruned, and the in-memory maps are size-bounded.

**Production scaling caveat:** these maps are local to one Node.js process and reset on restarts. They are not a distributed abuse-control system. Before running multiple backend replicas or treating throttling as a production perimeter, use a shared store (for example, Redis or a database-backed limiter) and a trusted edge/IP rate limit. Ensure trusted-proxy handling is explicitly configured before relying on forwarded client-IP headers. This branch does not add any new production database migration for OTP.

## Release prerequisites still external to this repository

- A provider account and provider-specific configuration are approved and available.
- SMS template/sender setup (and any applicable local carrier/regulatory registration) is complete.
- Staging test evidence is recorded in [Launch Readiness issue #9](https://github.com/ayanshaagency-spec/automatic-octo-umbrella/issues/9).
- Pharmacy stores and products are independently verified and remain inactive until approval.
- Explicit release approval exists before merging, deploying, or applying the Pharmacy migration.
