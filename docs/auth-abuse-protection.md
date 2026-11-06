# Authentication abuse protection

**Status as of 5 November 2026:** Implemented on `feat/auth-abuse-protection`, covered by passing CI, and included in the deployed Staging integration branch `staging/auth-abuse-protection-with-role-portal` (commit `c7b9983ed5be2e1c884889abdcac1ae8268808c9`; Railway deployment `da669bc6-38cd-483e-9b50-54b8b5bc67e4`, SUCCESS). This is Staging verification only. It does not authorize a merge or Production deployment, SMS-provider activation, or secret changes.

## Controls

| Flow | Shared control | Current threshold |
|---|---|---:|
| Patient + Doctor OTP request | Client IP | 10 requests / 15 minutes |
| Patient + Doctor OTP request | Phone number | 3 requests / 15 minutes (existing shared OTP-event limiter) |
| Patient + Doctor OTP verification | Client IP | 30 attempts / 15 minutes |
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

## Validation evidence

### CI

The Staging integration head passed all four reported GitHub Actions workflows:
- [Runtime E2E Verification — run 41835937847](https://github.com/ayanshaagency-spec/automatic-octo-umbrella/actions/runs/41835937847)
- [Backend Tests — run 41835937402](https://github.com/ayanshaagency-spec/automatic-octo-umbrella/actions/runs/41835937402)
- [Backend Tests — run 41835937338](https://github.com/ayanshaagency-spec/automatic-octo-umbrella/actions/runs/41835937338)
- [Docker Build Check — run 41835937415](https://github.com/ayanshaagency-spec/automatic-octo-umbrella/actions/runs/41835937415)

The isolated disposable-PostgreSQL runtime E2E verifies persistent OTP challenges, single-use/concurrent OTP consumption, phone throttling, shared IP limiting across independent connections, HMAC-only storage, concurrency and expiry. Unit tests verify the client-IP parser prefers valid `X-Real-IP` and does not trust `X-Forwarded-For`. These CI tests do not exercise Railway's public HTTP edge.

### Staging

- The integrated code is deployed only to the Railway Staging backend. The Staging backend and PostgreSQL are Online; the current health check reports no active warnings/critical issues, no recent failed deployments and no pending work.
- `/health` and `/api/db/health` return HTTP 200. The three-role `/portal`, existing `/doctor` and `/admin` pages, and portal assets return HTTP 200.
- Anonymous requests to protected Admin, Doctor and Pharmacy API routes return HTTP 401; no protected data was returned to anonymous callers.
- The latest 24-hour Railway HTTP aggregate recorded 147 requests: 103 2xx, 44 4xx and zero 5xx. This is service-wide aggregate traffic, not an authentication acceptance test.

### Still outstanding on Staging

- **Public-ingress 429 test:** The actual Railway public `POST` path has not been driven to the OTP/IP threshold. The unit tests establish header parsing, and Staging route checks confirm the service is reachable, but neither proves edge-to-app client-IP behavior under throttling. Do not run a burst from a shared public IP: it could temporarily block other Staging users. Use an isolated test source/IP or dedicated Staging test service before attempting this test.
- **Admin sign-in:** `ADMIN_EMAIL` and `ADMIN_PASSWORD` are not configured in the Staging backend. Add a separate Staging-only identity/password directly in Railway's Staging secret settings before human Admin login testing. Never copy Production credentials or send credentials through chat/GitHub.
- **Patient/Doctor OTP sign-in:** No OTP provider is configured in Staging. Real OTP delivery and authenticated Patient/Doctor sign-in remain untested. Per the project owner's instruction, MSG91/account/DLT/SMS activation is deliberately deferred to the final implementation step. Do not enable development OTP disclosure or a bypass in Staging/Production.

## Release gate

- Review migration `011_auth_rate_limit_buckets.sql` in the full Production migration order alongside `004`, `008`, `009` and `010`.
- Production backup/restore rehearsal, migration-lock assessment, complete release review and explicit approval remain mandatory before any Production migration or deployment.
- Keep this work Draft/unmerged until separately reviewed. The Staging integration is not Production approval.
- Do not activate MSG91 until the final provider-setup step. Keep all Staging identities and secrets isolated from Production.
