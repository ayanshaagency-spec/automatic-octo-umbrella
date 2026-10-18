# Ayansha Health Care — Pharmacy Integration Plan

**Status:** Design only; not yet implemented or deployed  
**Scope:** Extend the existing Ayansha Health Care repository and PostgreSQL database. Do not rebuild the app, reset data, or change production infrastructure.

## 1. User experience

The patient can open a valid prescription, choose **Order medicines**, and select a fulfillment location:

- **Hospital pharmacy:** the hospital attached to the consultation, or another approved hospital pharmacy when allowed.
- **Partner medical store:** a verified external pharmacy with current stock and a registered pharmacist.

At checkout, the patient chooses the order destination:
- **Hospital:** collect from the selected hospital pharmacy / approved hospital pickup point. If “deliver to hospital” means ward/room delivery rather than pickup, capture ward/room and require hospital operational approval before enabling it.
- **Patient home:** enter/select a delivery address and phone. Show delivery fee and estimated window only when the store can actually serve that address.

Display store verification, stock confirmation, itemized prices, order status, refund/cancellation rules, and support contact before final confirmation. A store can reject an unavailable item; the app must not silently substitute a different medicine.

## 2. Store onboarding and roles

Each pharmacy has a type: **hospital_pharmacy** or **partner_store**. Record the legal business identity, drug licence details, registered pharmacist information, contact details, address/geolocation, service radius, opening hours, and supported fulfillment modes. Admin review must set a pharmacy to verified/active before it can receive live orders.

Roles:
- **Patient:** browse verified pharmacies, place/view own orders, see own order status.
- **Pharmacy staff:** manage only their own catalog, stock, and orders; accept/reject orders; record pharmacist verification and fulfillment status.
- **Admin:** approve/suspend pharmacies, review audit trails and handle disputes; not use a shared public store account.

Never expose patient prescriptions or health details to other partner stores. Only the store selected for an order may see the minimum prescription details needed to check and dispense that order.

## 3. Proposed PostgreSQL model (migration to be designed and tested first)

Additive migration only; preserve every existing table and row.

- **pharmacies:** type, name, hospital link if applicable, licence/verification state, registered pharmacist details, address, coordinates, service radius, active flag, created/updated timestamps.
- **pharmacy_products:** normalized product identity (generic/brand name, strength, dosage form, pack size, SKU), whether a valid prescription is required, active state.
- **pharmacy_stock_batches:** pharmacy/product, batch number, expiry date, available quantity, sale price, timestamps. Never offer expired or unavailable stock.
- **pharmacy_orders:** patient, prescription, selected pharmacy, fulfillment mode (hospital or home), approved destination/address snapshot, status, amounts, existing payment linkage, idempotency key, timestamps.
- **pharmacy_order_items:** immutable item name/strength/pack/quantity/price snapshots and the matching prescribed item where applicable.
- **pharmacy_order_events:** append-only status/audit history with actor role, pharmacy scope, timestamp, and reason.

Use foreign keys, CHECK constraints, indexes, transactions, and unique idempotency keys. Store prices as fixed-precision numeric values; do not use floating-point for money. Keep order and item snapshots so later catalog price changes do not rewrite a historical order.

The current backend/db/schema.sql is not a complete representation of all later migrations; follow the established migration sequence and inspect the actual deployed schema before preparing migration 008. Do not run it against production as part of planning.

## 4. API shape (proposed; no routes are enabled yet)

- GET /api/pharmacies: verified/active pharmacy search, filters for type, location, and supported delivery.
- GET /api/pharmacies/:id/products: only available products; filter prescription-only products against the order/prescription context.
- POST /api/pharmacy/orders: create an order from a patient's own valid prescription and selected pharmacy/destination.
- GET /api/pharmacy/orders and GET /api/pharmacy/orders/:id: patient-scoped order history/details.
- GET /api/pharmacy/staff/orders: orders belonging only to the authenticated pharmacy.
- PATCH /api/pharmacy/staff/orders/:id/status: pharmacist/staff-scoped status changes with transition validation and an audit event.
- Admin-only pharmacy verification/suspension endpoints.

Keep routes consistent with the existing Node.js server and repository modules. Put database logic in a pharmacy repository module and business/status rules in a small validation module; do not put raw SQL directly into UI code.

## 5. Prescription, safety, and privacy controls

- Derive the patient identity from the verified access token, not a client-supplied phone number. A patient's order must reference that patient's prescription.
- Prescription-only medicines must be matched to a valid prescription and verified by the dispensing pharmacy's qualified pharmacist before fulfillment. The patient cannot freely edit medicine, strength, or prescribed dosage during checkout.
- Block expired prescriptions where applicable, expired batches, stock overselling, unapproved substitutions, unverified stores, and illegal status transitions. Schedule-specific or otherwise restricted medicines require a separate compliance decision; do not enable them by default.
- Keep pharmacist verification and every order-state change auditable. Log identifiers/statuses, not full medical notes or secrets.
- Validate destination data, limit request sizes, rate-limit order/auth actions, and avoid disclosing whether another patient's prescription/order exists.
- Obtain operational and legal review of Indian pharmacy/drug-licensing, prescription, record-retention, invoicing, and home-delivery obligations before production use. The software must not represent that a store is licensed until its documents have been verified.
- Do not use demo medicines/credentials as real fulfillment data.

## 6. Order state flow

pending_pharmacy_review → accepted → pharmacist_verified → packed → ready_for_pickup

For home delivery, the accepted order can move to out_for_delivery → delivered. Store or pharmacist rejection moves to rejected; allowed cancellation/refund cases move to cancelled / refund_pending / refunded. Each transition must be role-authorized, checked against the current state, timestamped, and recorded in pharmacy_order_events. Payment status must be driven by the existing payment workflow/webhook, not by a user-editable order field.

## 7. Integration with existing features

- Link to existing prescriptions and prescription_items; do not create a second prescription system.
- Reuse the existing payment gateway and webhook infrastructure only after adding a safe, explicit relation between a payment and a pharmacy order. Do not assume current payment records already have this relation.
- Reuse existing patient authentication and dashboard patterns; pharmacy staff need their own scoped authentication/authorization, not patient or admin credentials.
- Notifications can use the existing WhatsApp service only after opt-in, template, privacy, and delivery-failure handling are verified. Do not put diagnosis or detailed medicine data in WhatsApp messages.

## 8. Delivery plan and acceptance checks

1. **Finish current blockers:** CI verification is green for backend tests, Runtime E2E, Flutter verification, and client-demo validation at the latest checked commit. GitHub Pages deploy is separately blocked by the repository's github-pages environment deployment-branch protection; configure the intended branch in GitHub Settings rather than bypassing protection in workflow code.
2. **Confirm requirements:** decide whether “delivery to hospital” means pharmacy pickup or delivery to a ward/room; confirm partner-store onboarding owner, delivery radius/fees, refund policy, and who validates pharmacy licences.
3. **Build on a feature branch:** prepare additive migration 008, repository + validation modules, staff authorization, and unit/API tests; inspect schema and use a disposable/test database first.
4. **Demo integration:** add patient prescription-to-order flow and a separate pharmacy/staff order queue using clearly marked demo data; do not send demo orders to real stores.
5. **Verify end to end:** patient cannot order another patient's prescription; unverified store cannot accept orders; store A cannot read/update store B's orders; home and hospital destinations persist; expired/out-of-stock batches are rejected; double-submit is idempotent; status/payment audit works; no secrets are included in static demo artifacts.
6. **Production readiness gate:** verify production SMS OTP provider and patient login, store licence verification, pharmacist workflow, legal/operations review, payment/refund handling, delivery operations, backups, and monitoring. Production migration/deployment requires explicit approval.

## 9. Current non-pharmacy blockers to keep visible

- GitHub Pages public demo remains unpublished until the environment protection rule allows the approved branch.
- Production patient SMS OTP is intentionally fail-closed until a real provider is configured; do not bypass it or return OTPs through the API.
- The live /api/doctors endpoint was last observed returning an empty array, so production data readiness still needs review.
- Admin credentials and CORS origin must be verified by the owner in the deployment settings; do not expose environment values in chat.

**Approval boundary:** This document is planning only. No production deployment, production environment variable change, database migration, PR merge, or live medicine-order integration is authorized by this plan.
