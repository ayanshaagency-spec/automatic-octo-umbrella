# Authentication abuse protection

**Status:** Implemented on `feat/auth-abuse-protection`; CI verification pending. This document does not authorize a Staging or Production deployment, SMS-provider activation, or secret changes.

## Controls

| Flow | Shared control | Current threshold |
|---|---|---:|
| Patient + Doctor OTP request | Client IP | 10 requests / 15 minutes |
| Patient + Doctor OTP request | Phone number | 3 requests / 15 minutes (existing shared OTP-event limiter) |
| Admin login | Client IP | 30 attempts / 15 minutes |
| Admin login | Normalized email | 8 attempts / 15 minutes |

The new `auth_rate_limit_buckets` table stores only an HMAC-SHA-256 bucket key, count and time window. It does not store the raw IP address, email address, phone number or OTP. The application uses the existing strong `JWT_SECRET` as the HMAC key; if it is missing or weak, the limiter fails closed.

On Railway public HTTP ingress, the application uses a syntactically valid `X-Real-IP` value. Railway's public networking specifications describe `X-Real-IP` as the client's remote IP and do not prescribe a fixed `X-Forwarded-For` hop count. The application deliberately does not use `X-Forwarded-For`. If `X-Real-IP` is missing or invalid, it falls back to the socket peer address, which may combine callers behind the same proxy but does not allow a caller to bypass limits by choosing an arbitrary forwarding header.

**Trust boundary:** Railway documents that public HTTP edge headers are overwritten, while `*.railway.internal` traffic bypasses that edge cleanup. Other services in the same Railway environment can therefore supply their own forwarding headers on private-network requests. Do not expose the backend listener to untrusted private-network callers and do not treat `X-Real-IP` as authenticated on private-network paths. The public service domain is the intended client path. Review the platform specification when networking topology changes:
- https://docs.railway.com/networking/public-networking/specs-and-limits
- https://station.railway.com/questions/supported-client-ip-trust-boundary-for-f-0e4c52d9

## Failure behavior

- If PostgreSQL rate-limit storage is unavailable in Staging/Production, OTP request and Admin login return HTTP 503. They do not fall back to per-process memory.
- In local development and isolated unit tests without a database, an in-memory limiter is used only to support local testing. This is not a production mode.
- A blocked request returns HTTP 429 with a retry-after duration in the response body.
- OTP's existing per-phone event throttle, challenge hashing, five-minute expiry and single-use verification remain unchanged.
- The counters use atomic PostgreSQL upserts so multiple application replicas share one limit. Expired buckets are cleaned in bounded batches.

## Validation still required

- CI runtime E2E must prove concurrent requests across multiple connections cannot exceed the shared quota and that only hashed keys are stored.
- Review the final migration in order with the existing `004`, `008`, `009`, and `010` migration set.
- Deploy to Staging only after PR review; test the actual Railway public `X-Real-IP` ingress path there.
- Do not activate MSG91 until the final provider-setup step. Keep Admin credentials Staging-only and never copy Production credentials.
- This feature must not be merged or deployed to Production without a separate release review, backup/restore rehearsal, migration-lock assessment and explicit approval.
