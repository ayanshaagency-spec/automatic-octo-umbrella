# Recovery Branch Security Hardening Plan

Scope: `recovery/backend-postgres-safe-fixes` only. This document is an audit/work plan, not a production configuration change.

## Verified current risks

- OTP and request/IP limits use process-local Maps; they do not coordinate across backend replicas.
- Client IP keying uses `req.socket.remoteAddress`; forwarded headers are not trusted (safe default), but deployments behind a proxy need a documented, narrowly configured trust boundary.
- Branch metadata was reported as `protected:false`; ruleset listing returned no rulesets. Detailed branch-protection reads were unavailable to this integration.
- PHI logging review was limited to scanned source areas and is not a comprehensive guarantee.
- Workflow permissions should remain least-privilege; `contents: read` is explicitly set on reviewed Docker and Flutter workflows.

## Proposed remediation sequence

1. **Shared limiter design and tests (code change pending):** use atomic PostgreSQL-backed counters for OTP phone/request limits and IP verification limits, with window expiry and concurrency-safe upsert semantics. Fail closed if shared limiter storage is unavailable for security-critical endpoints. Avoid storing OTP plaintext in the database; keep OTP secrets hashed and expiry/attempt state bounded. Do not implement until test coverage for concurrent requests, expiry, cleanup, and fail-closed behavior is ready.
2. **Proxy IP handling (code change pending):** default to socket peer address. Add an explicit trusted-proxy configuration only for a known proxy CIDR/chain; never accept arbitrary `X-Forwarded-For` from clients. Add spoofing tests.
3. **Branch protection (repository admin action pending):** require CI checks and PR review on the recovery branch, block force pushes/deletion, and verify the settings using an authorized GitHub admin connection. This integration cannot confirm/change settings.
4. **PHI logging review (audit pending):** scan all backend, frontend, panel, migration, and error-handler paths; add tests to assert sensitive fields are redacted.
5. **Workflow audit (follow-up):** review action pinning and deprecated runtime warnings; preserve `contents: read` and avoid elevated permissions.

## Safety boundaries

- GitHub recovery branch only; no Railway, deployment, merge to main, production access, or production database operations.
- Preserve existing application data and features.
- No secrets or patient information belong in this document.
