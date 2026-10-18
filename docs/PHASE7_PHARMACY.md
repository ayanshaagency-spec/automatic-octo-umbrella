# Phase 7 — Pharmacy Integration MVP

This phase adds a pharmacy directory and order workflow to the existing Ayansha Health Care backend. It is developed on `feat/phase7-pharmacy-integration`; it does not replace earlier phases.

## Store and fulfillment model

- `hospital` stores are linked to an existing hospital record.
- `partner` stores are external medical stores.
- Only stores with `is_active = TRUE` and `approved_at IS NOT NULL` appear in the patient-facing directory.
- Each approved store separately declares hospital and home delivery support.
- A hospital pharmacy may fulfill hospital delivery only for its linked hospital.
- No fictional pharmacies or products are seeded. Real store onboarding, verification, catalogue and inventory entry are required before this directory returns stores.

## API endpoints

- `GET /api/pharmacy/admin/stores` and `POST /api/pharmacy/admin/stores` to register real stores (new registrations are inactive).
- `PATCH /api/pharmacy/admin/stores/:id/approval` to approve/activate or deactivate a store.
- `GET/POST /api/pharmacy/admin/stores/:id/products` to review or add catalogue entries; `PATCH /api/pharmacy/admin/products/:id` to change stock, price, prescription flag or product activation.
- `GET /api/pharmacy/admin/orders?status=...` to review the queue; allowed order-state changes use `PATCH /api/pharmacy/orders/:id/status`.
- `GET /api/pharmacy/stores?storeType=hospital|partner&deliveryMethod=hospital|home&city=...`
- `GET /api/pharmacy/hospitals?city=...`
- `GET /api/pharmacy/products?storeId=...`
- `POST /api/pharmacy/orders`
- `GET /api/pharmacy/orders?phone=...`
- `PATCH /api/pharmacy/orders/:id/status` (admin-protected in production)

For a hospital delivery order, send `deliveryHospitalId`. For home delivery, send `deliveryAddress` with `line1`, `city`, `state`, and a six-digit Indian `pincode`. Each order is tied to one selected store. Product price is read from the database; clients cannot choose the price.

## Prescription and safety controls

- Prescription-required products default to `requires_prescription = TRUE`.
- The order must provide a prescription owned by the same patient.
- Each prescription-required product name must match a medicine name in that prescription. A mismatch is rejected; pharmacist review remains required before dispensing.
- Orders reserve inventory transactionally and reject insufficient stock.
- Order status follows a restricted state machine. Cancelling before fulfillment restocks the reserved items.
- No clinical advice or medicine choice is provided by this module.
- Payment is deliberately marked pending and the MVP accepts cash on delivery only. Online pharmacy payment is not enabled or simulated.

## Explicit setup steps

1. Review `backend/migrations/phase7_pharmacy.sql` with the database owner.
2. After explicit approval, apply it to the intended database using the command in the migration header. This migration is idempotent and does not seed data, but is still a database change and must be reviewed.
3. Register hospital pharmacies and external partner stores, verify their licenses and service details, and keep them inactive until approved.
4. Enter catalogues, prices, stock counts, prescription flags and delivery capabilities. Confirm expiry/batch/recall tracking requirements before handling real prescriptions.
5. Configure a patient authentication/OTP provider before enabling production patient ordering. The current production SMS OTP adapter is not configured. Store onboarding, approval, inventory editing and the order queue are admin-only; partner self-service sign-in is not included in this MVP.
6. Link pharmacy payments/webhooks and real dispatch/WhatsApp notifications in a separate approved integration.
7. Run CI and staging end-to-end checks before approving any release.

## Scope intentionally not changed

- No production deploy was triggered.
- No Railway variables, credentials, database contents, database volumes or existing tables were changed.
- No database migration was run automatically.
- No real pharmacy partner data has been invented or seeded.
