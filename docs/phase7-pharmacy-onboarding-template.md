# Phase 7 — Pharmacy onboarding and catalogue template

Use this worksheet to collect information for the existing Ayansha Health Care Pharmacy module. It is a collection template only; entering details here does **not** approve a store or publish it.

## A. Pharmacy/store registration

Complete one record per location.

| Field | What to collect |
|---|---|
| Store type | \`hospital\` or \`partner\` |
| Registered/legal name | Name as shown on the current registration documents |
| Public store name | Customer-facing name |
| Address, city, state, PIN | Full physical location and six-digit PIN code |
| Public business phone | Number intended for customer support |
| Hospital link | Required for hospital pharmacy; record the existing active hospital ID/name |
| Delivery capability | Home delivery, hospital delivery, or both |
| Service coverage | Delivery locations/limits, delivery hours, and operational contact |
| Pharmacy license/registration | Issuing authority, license/registration number, validity/expiry, and verification outcome |
| Authorized representative | Name/role and proof that they may register the store |
| Verification record | Reviewer, review date, evidence reference in approved private storage, decision, and notes |

**Document handling:** Do not upload license scans, identity documents, personal phone numbers, credentials, or patient information into this public GitHub repository or PR comments. Keep evidence in the organization's approved private storage with access limited to the reviewers who need it. Put only a non-sensitive evidence reference and verification outcome in the onboarding tracker.

## B. Verification and activation checklist

- [ ] Confirm store identity and the current applicable license/registration with the issuing source.
- [ ] Confirm the authorized representative and publicly listed business contact.
- [ ] Confirm address, location, and delivery capabilities with the store.
- [ ] For hospital pharmacies, verify the linked hospital is correct and active.
- [ ] Confirm operational capacity for receiving orders, accepting/rejecting orders, stock updates and cancellations.
- [ ] Have a qualified pharmacist/authorized reviewer validate medicine details and whether a prescription is required.
- [ ] Confirm pricing and stock with the store before importing the catalogue.
- [ ] Record reviewer/date and a reference to restricted evidence storage.
- [ ] Keep the store inactive until all required checks are signed off by the authorized admin.

The application intentionally creates new stores and products inactive by default. A store must be approved before activation; do not bypass that gate to populate a demo.

## C. Product catalogue import columns

Use these columns when the store provides a catalogue. One row per product/SKU at a particular store.

\`\`\`csv
store_reference,sku,name,brand,strength,pack_size,price_inr,opening_stock,requires_prescription,verification_status,reviewer,reviewed_at
\`\`\`

Rules:
- Prices must be numeric INR values, non-negative, and confirmed by the store.
- Stock must be a non-negative whole number confirmed at the time of import.
- Set \`requires_prescription\` only after review by an appropriately qualified pharmacist/authorized reviewer; do not infer it from product name alone.
- Do not include patient data, prescriptions, patient phone numbers, or private supplier credentials in the catalogue.
- Keep unreviewed rows out of the active catalogue. Products should remain inactive until catalogue/stock verification is complete.

## D. Order acceptance rehearsal

Before real orders are enabled, rehearse the workflow using only synthetic staging data:

- [ ] Patient login with a test account and a test-only OTP provider.
- [ ] Order a non-production test item from an approved staging store.
- [ ] Verify stock reservation, total price, COD/pending payment wording, and order history ownership.
- [ ] Reject invalid/out-of-stock and prescription-mismatch orders.
- [ ] Verify a hospital pharmacy can deliver only to its linked hospital.
- [ ] Test cancellation and stock restoration; ensure terminal order states cannot be changed.
- [ ] Confirm the admin can see the order and valid state transitions only.

## E. Approval record

| Item | Value |
|---|---|
| Store reference | |
| Verification outcome | Pending / Approved / Rejected |
| Reviewer | |
| Review date | |
| Evidence reference (private storage, not public URL) | |
| Product catalogue checked by | |
| Activation approval by | |
| Notes / restrictions | |

Do not use this template to certify regulatory compliance. Applicable licensing, prescription, and operational requirements must be validated by authorized personnel before activation.
