# Phase 8 — Health Insurance Documents setup and safety gates

This module is isolated in the existing repository on branch `feat/phase7-pharmacy-railway-aligned` with Production unchanged. It is not deployed. No production environment or database has been changed.

## Current capability

- Patient policy details are scoped to the authenticated patient account.
- The API retains only the last four characters of the policy number; it does not save the full policy number to PostgreSQL.
- Documents are uploaded using a five-minute size-limited presigned POST to a temporary private object key, then promoted to a different final private key on successful completion. The temporary URL cannot overwrite the final review document. Files are not stored in GitHub or public web folders.
- Supported file types: PDF, JPEG and PNG; maximum 10 MiB per file and 15 documents per policy.
- Before submission completes, the API checks object size, declared content type and file signature, then streams the file through a configured ClamAV daemon. Only a clean scan can enter the final `insurance-documents/` prefix.
- Infected files and files whose scan errors/time out are moved to a private `insurance-quarantine/` prefix, recorded as quarantined, and never downloadable through patient/admin APIs. Quarantine objects require an automatic short-retention cleanup rule.
- Patient downloads and staff review downloads use access checks and short-lived (60-second) signed URLs.
- Admin review statuses: submitted, under review, need more documents, verified and rejected, with controlled transitions and required notes for rejected/need-more-documents decisions.
- “Verified” means reviewed by Ayansha staff; it does not represent insurance company claim approval or coverage confirmation.

## Required private storage configuration

Create a dedicated private S3-compatible bucket and a least-privilege service access key. Enable the provider's public-access block and default at-rest encryption. Do not reuse public website asset storage.

Configure these environment variables in the approved staging environment's secret manager only. Do not enable real document submission in production as part of this PR:

- `INSURANCE_S3_BUCKET` — dedicated private bucket name.
- `INSURANCE_S3_REGION` — bucket region.
- `INSURANCE_S3_ACCESS_KEY_ID` — dedicated limited-permission access key.
- `INSURANCE_S3_SECRET_ACCESS_KEY` — its secret.
- `INSURANCE_S3_ENDPOINT` — optional HTTPS endpoint for an S3-compatible provider; use an actual HTTPS endpoint outside local tests.
- `INSURANCE_S3_FORCE_PATH_STYLE` — set to `true` only when the selected S3-compatible provider requires path-style addressing.

The access key needs only the operations required for upload, object head/range read, copy temporary objects to final or quarantine keys, delete temporary objects, and signed downloads on the required prefixes. Do not grant bucket administration or public ACL permissions. The application never returns object keys to the browser. Add lifecycle rules that delete `insurance-uploads/` objects and `insurance-quarantine/` objects after 1 day as cleanup controls. Final `insurance-documents/` objects need a separately approved retention/deletion plan.

- `INSURANCE_CLAMAV_HOST` — private DNS/service name for the ClamAV daemon; do not expose the daemon on a public network.
- `INSURANCE_CLAMAV_PORT` — usually `3310`.
- `INSURANCE_CLAMAV_TIMEOUT_MS` — timeout in milliseconds; default is 30000, permitted range 1000–120000.

The application streams the temporary object to ClamAV using the daemon's INSTREAM protocol. Configure a maintained ClamAV service on the same private network as the API; firewall its port so only the API/staging network can reach it. Scanner unavailability, timeout, or unexpected responses fail closed and prevent submission. ClamAV's raw TCP protocol is unencrypted, so do not expose port 3310 to the public internet; the [official ClamAV Docker guide](https://docs.clamav.net/manual/Installing/Docker.html) specifically warns about unencrypted TCP.

### Bucket CORS

Allow `POST` from the exact hosted Ayansha Health Care app origin used for staging. The browser sends the `Content-Type` as a signed multipart form field; the bucket must return an appropriate CORS response so the browser can read upload success/failure. Avoid wildcard origins for a production bucket. Test pre-signed upload and download from the real HTTPS site before allowing patient documents.

## Mandatory safety gate before real patient documents

**ClamAV integration is implemented, but no ClamAV endpoint or private storage bucket has been configured for this project.** Real upload attempts fail closed until both are configured. Do not use this release to receive real patient or claim documents until the storage provider, scanner, private networking, access, retention/deletion, consent and incident-response procedures have been configured and accepted.

Configure the storage provider only in a dedicated staging environment first. Use synthetic test people/documents. Verify patient ownership isolation, expired upload/download links, invalid file signatures, oversized files, provider errors, admin review transitions, retention/deletion, and backup/access controls. Never paste policy files, policy numbers, patient documents, secrets or signed URLs into GitHub issues, pull requests, CI logs or chat.

## Database / deployment gate

Migration `backend/db/migrations/004_phase8_health_insurance_documents.sql` stores policy metadata and file metadata/object keys, not file bytes. Policy number values are reduced to their last four characters before persistence.

The existing Railway service runs a pre-deploy command that applies all SQL migration files. Therefore, do not merge or deploy this branch without reviewing the migration sequence and getting explicit release approval. There is no new database migration applied to production from this work.

## Staging acceptance

1. Create the private bucket, least-privilege access key, bucket CORS, default encryption and lifecycle rules for temporary/quarantine prefixes in staging; store credentials only in the secret manager.
2. Deploy a maintained ClamAV daemon privately alongside an isolated staging API. Set `INSURANCE_CLAMAV_HOST`, `INSURANCE_CLAMAV_PORT` and (optionally) `INSURANCE_CLAMAV_TIMEOUT_MS`; do not expose ClamAV publicly.
3. Deploy only to an approved non-production environment with an isolated database, then run the migration there after review.
4. Test clean, infected (EICAR test signature), scanner-offline, timeout, oversized and file-type-mismatch uploads. Confirm only clean files can become submitted and quarantined files cannot be downloaded.
5. Test a patient policy, upload each accepted format, patient document history/download, admin queue and review notes/status.
6. Test that a second patient cannot list/download the first patient's policy/documents; confirm non-admin staff cannot access the admin queue.
7. Record non-sensitive results and the tested commit on the launch-readiness issue. Only after acceptance and explicit approval should a separate production release be planned.


## Staging security acceptance checklist — 6 November 2026

The code remains fail-closed while either private storage or the malware scanner is absent. The following infrastructure controls must be confirmed by the storage/security owner before any real patient document is accepted:

1. **Private bucket:** block all public access and public ACLs; do not enable website hosting or anonymous reads. Only the backend service identity may read, write, copy, and delete the required insurance prefixes.
2. **Encryption at rest:** enable provider-side encryption for the bucket (SSE-S3 or the provider's managed/KMS-backed equivalent). Keep encryption keys in the provider's key-management service; never place them in GitHub or application output.
3. **Transport:** allow only TLS/HTTPS to the object-storage endpoint. Do not use an HTTP S3 endpoint outside local automated tests.
4. **Temporary upload retention:** configure a lifecycle rule on `insurance-uploads/` to remove abandoned or uncompleted uploads after a short retention window (recommended: 1 day). Keep quarantined objects under a separate restricted prefix with a documented security-review retention policy.
5. **Malware scanner:** run ClamAV on a private network reachable only from the backend; use a maintained signature database, resource limits, health monitoring and an update cadence. A configured hostname alone is not a successful scan test.
6. **CORS:** permit browser POST uploads only from the approved Staging/Production patient portal origins; do not wildcard origins. Limit allowed methods and required form fields to the presigned upload flow.
7. **Operational privacy:** do not log policy numbers, file bytes, signed URLs, S3 object keys, access credentials or full patient document metadata. Download URLs remain short-lived and are issued only after patient/admin authorization and a `submitted + clean` scan state.
8. **Acceptance gate:** run synthetic clean and infected test documents against disposable Staging infrastructure; verify clean files promote, infected/error files quarantine, and only clean submitted files can be downloaded. Do not use real patient files for this test.

Current Staging does not have S3 storage or ClamAV configured. This is an operational checklist, not a claim that bucket ACLs, encryption, lifecycle or real scanner connectivity have already been verified.
