# Phase 8 — Health Insurance Documents setup and safety gates

This module is isolated in the existing repository on branch `feat/phase8-health-insurance-documents`. It is not deployed. No production environment or database has been changed.

## Current capability

- Patient policy details are scoped to the authenticated patient account.
- The API retains only the last four characters of the policy number; it does not save the full policy number to PostgreSQL.
- Documents are uploaded using a five-minute size-limited presigned POST to a temporary private object key, then promoted to a different final private key on successful completion. The temporary URL cannot overwrite the final review document. Files are not stored in GitHub or public web folders.
- Supported file types: PDF, JPEG and PNG; maximum 10 MiB per file and 15 documents per policy.
- Before submission completes, the API checks object size, declared content type and a file signature for PDF/JPEG/PNG.
- Patient downloads and staff review downloads use access checks and short-lived (60-second) signed URLs.
- Admin review statuses: submitted, under review, need more documents, verified and rejected, with controlled transitions and required notes for rejected/need-more-documents decisions.
- “Verified” means reviewed by Ayansha staff; it does not represent insurance company claim approval or coverage confirmation.

## Required private storage configuration

Create a dedicated private S3-compatible bucket and a least-privilege service access key. Enable the provider's public-access block and default at-rest encryption. Do not reuse public website asset storage.

Configure these environment variables in the staging/production platform's secret manager only:

- `INSURANCE_S3_BUCKET` — dedicated private bucket name.
- `INSURANCE_S3_REGION` — bucket region.
- `INSURANCE_S3_ACCESS_KEY_ID` — dedicated limited-permission access key.
- `INSURANCE_S3_SECRET_ACCESS_KEY` — its secret.
- `INSURANCE_S3_ENDPOINT` — optional HTTPS endpoint for an S3-compatible provider; use an actual HTTPS endpoint outside local tests.
- `INSURANCE_S3_FORCE_PATH_STYLE` — set to `true` only when the selected S3-compatible provider requires path-style addressing.

The access key needs only the operations required for upload, object head/range read, copy temporary objects to final keys, delete temporary objects, and signed downloads on the required prefixes. Do not grant bucket administration or public ACL permissions. The application never returns object keys to the browser. Add a lifecycle rule that deletes incomplete `insurance-uploads/` objects after 1 day as a cleanup fallback; never lifecycle-delete `insurance-documents/` without an approved retention plan.

### Bucket CORS

Allow `POST` from the exact hosted Ayansha Health Care app origin used for staging. The browser sends the `Content-Type` as a signed multipart form field; the bucket must return an appropriate CORS response so the browser can read upload success/failure. Avoid wildcard origins for a production bucket. Test pre-signed upload and download from the real HTTPS site before allowing patient documents.

## Mandatory safety gate before real patient documents

**Malware scanning / quarantine is not yet integrated.** File-signature checks help reject obvious file-type mismatches but are not a malware scanner. Do not use this release to receive real patient or claim documents until a malware scanning/quarantine step is integrated and tested before staff downloads, and the organisation has approved access, retention, deletion, consent and incident-response procedures.

Configure the storage provider only in a dedicated staging environment first. Use synthetic test people/documents. Verify patient ownership isolation, expired upload/download links, invalid file signatures, oversized files, provider errors, admin review transitions, retention/deletion, and backup/access controls. Never paste policy files, policy numbers, patient documents, secrets or signed URLs into GitHub issues, pull requests, CI logs or chat.

## Database / deployment gate

Migration `backend/db/migrations/004_phase8_health_insurance_documents.sql` stores policy metadata and file metadata/object keys, not file bytes. Policy number values are reduced to their last four characters before persistence.

The existing Railway service runs a pre-deploy command that applies all SQL migration files. Therefore, do not merge or deploy this branch without reviewing the migration sequence and getting explicit release approval. There is no new database migration applied to production from this work.

## Staging acceptance

1. Configure the private bucket, restricted access key, bucket CORS and default encryption in staging secret/configuration settings.
2. Configure/verify malware scanning and quarantine before enabling real document downloads.
3. Deploy only to an approved non-production environment with an isolated database, then run the migration there.
4. Test a patient policy, upload each accepted format, verify signature/size enforcement, patient document history/download, admin queue and review notes/status.
5. Test that a second patient cannot list/download the first patient's policy/documents; confirm non-admin staff cannot access the admin queue.
6. Record non-sensitive test results and the tested commit on the launch-readiness issue. Only after acceptance and approval should a separate production release be planned.
