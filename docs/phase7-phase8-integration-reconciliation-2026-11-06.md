# Phase 7 / Phase 8 Integration Reconciliation

**Audit date:** 6 November 2026  
**Scope:** Read-only source/CI/environment review plus this documentation update.  
**Safety:** This document is not approval to merge a PR, deploy to Production, change secrets, run a migration, or modify live patient data.

## 1. Current PR and branch state

| PR | Purpose | Base | Head commit | Changed files | Current state |
|---|---|---|---|---:|---|
| #8 | Phase 7 Pharmacy + wider healthcare integration, including Insurance/OTP/Family/Doctor/UI/mobile | `feat/phase6-emergency-hospitals` | `45b531ce87143cac513adb4aa351014891178363` | 66 | Open, Draft, unmerged |
| #10 | Health Insurance document submission | `feat/phase6-emergency-hospitals` | `acb425397060b2f0d84c1365a3095d131d5cc067` | 20 | Open, Draft, unmerged |
| #12 | Unified role portal | `feat/phase7-pharmacy-railway-aligned` | `3ec703760cecf29870ed72f7bd290300170583c4` | 5 | Open, Draft, unmerged |
| #13 | Authentication abuse protection | `feat/phase7-pharmacy-railway-aligned` | `716d8ba2911f7592974984a6c048ab892facd926` | 11 | Open, Draft, unmerged |
| #14 | Staging integration of role portal + auth protection | `feat/phase7-pharmacy-railway-aligned` | `c7b9983ed5be2e1c884889abdcac1ae8268808c9` | 14 | Open, Draft, unmerged |

No PR was merged or closed during this review. PR #8 is broader than Pharmacy-only: it changes 66 files across multiple modules and must be reviewed as a whole.

## 2. PR #8 and PR #10 overlap — do not merge independently

GitHub's compare result for `feat/phase7-pharmacy-railway-aligned` against `feat/phase8-health-insurance-documents` is **diverged**. The two PRs change the same 20 paths. Every overlapping path was checked by comparing its Git blob SHA on both branch heads.

### Paths with different file contents

| Shared path | PR #8 blob | PR #10 blob |
|---|---|---|
| `backend/db/migrations/004_phase8_health_insurance_documents.sql` | `110ca94009918b835c18d2daa01485a7919ae6ea` | `1dffdf95e9da735a1bfb2d3580c71dd4016240ef` |
| `backend/package.json` | `9cf5faabf14215fcee17243d6025fea6087c7f18` | `08d8abc2a217716032d5b7fc6a93ff8b77bc2098` |
| `backend/src/insurance_routes.js` | `3c0c099f01b8babe1c67a5b1578a15b0e7526748` | `4d42120cfc1c64bcdfa161b649cb76611d603084` |
| `backend/src/insurance_api.test.js` | `0a0b30ff06b3c0ebbe319327f780b95603e865e7` | `ef6a63051a7f2336afa8d1b02aaab40048cef468` |
| `backend/src/server.js` | `19815addbb28e581e0c22192f156aa56e29be277` | `7db8be9f66232c24927e0a89af07e0b9e31e7c25` |
| `web/insurance.js` | `3928d51d6ebcedbc7881b9e8ad767bf784540a24` | `b7d5bcbd141826e36815933d17db6cc05e411cb1` |
| `web/index.html` | `4b0466bf8971567ab831db0b9c33fdff27a8bf42` | `e3a0295e8b4c961a13dc8fc0f2231175c8d946e3` |
| `web/styles.css` | `6ece3273dab11af3d2ef26f05f38b49a7cab6177` | `eb597d106598bec7029126bd123c19aa2ad3af1e` |
| `admin-panel/index.html` | `b22d153736f612c289b04c7671cc532c5b4a0de1` | `efe1bd4ee56c59a252314c7950797590c17fc0eb` |
| `.github/workflows/insurance-storage-e2e.yml` | `965e90d2a2ee6983268a7e03a3201269c8c2d633` | `48568ef594f13a47dc0b0aeee945b941c87398ed` |
| `.github/workflows/docker-build.yml` | `268303fcc31cdee120f580753c73075662cf4b5a` | `0bbf9f7c99920e64300b1898c551288597b4b103` |
| `docs/phase8-health-insurance-documents-setup.md` | `48131b3fdb10ed01f7705ea8d722d81f96cdcc04` | `cf4ef3cc82c8b3b5f6414c4af78b2589d6bddbc7` |

### Paths whose contents currently match

- `backend/src/insurance_repository.js` — `3cac1733a7dbe0971b9c4887fb0e5e370a725cbc`
- `backend/src/insurance_storage.js` — `b5c9dbb90256b591d59b89c9a3c35806fa40df4d`
- `backend/src/insurance_scanner.js` — `51535c09eb147bde5bda601c3a44932a3a2d3dbe`
- `backend/src/insurance_validation.js` — `df4cd340a1b050dc8cf52fc18b202175ef345305`
- `backend/src/insurance_pipeline_e2e.test.js` — `479af232fffed9290fb9a210e1521db70d45d5a3`
- `backend/src/insurance_scanner.test.js` — `40b4ae9b5e6481bc60870a32aefff1e7c90eedd7`
- `backend/src/insurance_storage.test.js` — `558871d3509d3ef5bbe9bf4d0ea750211953f8e9`
- `backend/src/insurance_validation.test.js` — `1d14c36aed7e53be6035a98346c7a936e17341a2`

**Decision:** Do not merge PR #8 and PR #10 independently. Reconcile the differing migration, route, server, frontend, package/test and workflow content into one reviewed integration line. Keep the shared identical components only once. Re-run all required workflows on the reconciled head and review the final diff before changing either PR's Draft state. No file-level merge or cherry-pick was performed during this audit.

## 3. CI status on current PR heads

All reported PR-triggered workflows for the heads listed above completed with `success`:

- PR #8, 6/6: Backend Tests (runs 41970984627 and 41970984751), Runtime E2E (41970984663), Docker Build (41970984848), Insurance Private Storage + Malware E2E (41970984719), Flutter Mobile App (41970984659).
- PR #10, 4/4: Backend Tests (39231862475 and 39231862369), Docker Build (39231862597), Insurance Private Storage + Malware E2E (39231862490).
- PR #12, 4/4: Backend Tests (41781816784 and 41781816930), Docker Build (41781816821), Runtime E2E (41781816919).
- PR #13, 4/4: Backend Tests (41968954003 and 41968954113), Docker Build (41968954000), Runtime E2E (41968954009).
- PR #14, 4/4: Runtime E2E (41835937847), Backend Tests (41835937402 and 41835937338), Docker Build (41835937415).

CI success proves the reported workflow jobs passed on those specific commits. It does not prove authenticated human acceptance, live SMS delivery, live insurance storage/scanning, or Production migration safety.

## 4. Railway environment refresh — 6 November 2026

### Staging

- Backend and PostgreSQL are Online, one replica each.
- Zero recent deployment failures, zero active Railway warnings/criticals, and no pending staged/applying work.
- Latest successful backend deployment remains `da669bc6-38cd-483e-9b50-54b8b5bc67e4`, branch `staging/auth-abuse-protection-with-role-portal`, commit `c7b9983ed5be2e1c884889abdcac1ae8268808c9`.
- The Staging variable inventory returned names only; all values remained redacted. `ADMIN_EMAIL` and `ADMIN_PASSWORD` are absent. OTP provider variables are also absent. No variables were read or changed.
- The 24-hour HTTP error-rate query returned zero recorded requests for its selected window; it is not used as evidence of authenticated user acceptance.

### Production

- Backend and PostgreSQL are Online, one replica each.
- Zero recent deployment failures, zero active warnings/criticals, and no pending staged/applying work.
- Production source, variables, deployment, database, schema and data were not changed or inspected for patient-level records.

## 5. Remaining acceptance gates

| Work | Current state | What is needed |
|---|---|---|
| Admin sign-in | Blocked on Staging | Add separate `ADMIN_EMAIL` and `ADMIN_PASSWORD` directly in Railway Staging; never send credentials through chat/GitHub |
| Patient/Doctor OTP | Provider not configured | Final-stage MSG91 account, approved DLT sender/template, Staging-only secret setup and authorised test phone |
| Pharmacy live order/fulfilment | Not human-accepted | Authenticated Staging sessions plus independently verified real stores, licences, hospitals, products and stock; no synthetic live records |
| Public ingress HTTP 429 | Pending | Isolated source IP or dedicated test service; do not burst from a shared public IP |
| Insurance upload | Disabled by design until configured | Private S3-compatible storage, least-privilege credentials, malware scanner and isolated Staging acceptance |
| Production migration readiness | Not ready | Full ordered migration rehearsal; especially measure migration 010's ordinary index build/appointment-table lock impact on representative restored data |
| Production recovery readiness | Not demonstrated | Secure backup archive verification and repeated restore into a fresh isolated PostgreSQL target |
| Production release | Not approved | Full PR reconciliation/review, authorised acceptance, release owner/rollback plan and explicit approval for the exact commit |

## 6. Safe next sequence

1. Reconcile PR #8 and #10 Insurance differences into a single integration candidate; do not merge either independently.
2. Re-check PR #12/#13 dependencies against the reconciled integration line before staging any combined change.
3. Run the complete backend, Runtime E2E, Insurance-storage/malware, Docker and Flutter workflows on the final candidate commit.
4. Deploy only to isolated Staging after a separate explicit staging-deployment instruction; perform human acceptance only with authorised non-production test identities and verified partner data.
5. Complete provider and storage setup after the corresponding account/operational prerequisites are supplied.
6. Perform backup/restore and migration-lock rehearsal against a representative isolated database.
7. Keep Production on Phase 6 until all gates are signed off and explicit approval is given for the exact Production change.

No PR was merged, no Railway deployment was triggered, no secret was created/read/changed, no migration was run, and no live database row was inserted or modified by this audit.
