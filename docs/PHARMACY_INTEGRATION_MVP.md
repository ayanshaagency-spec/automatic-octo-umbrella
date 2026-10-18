# Ayansha Health Care — Pharmacy Integration MVP (Phase 7)

## Scope

This feature adds an internal Pharmacy workspace to the existing Ayansha Health Care app. It supports two pharmacy types:

- **Hospital pharmacy** — attached to a record in the existing hospital directory.
- **Partner medical store** — registered and verified by the platform administrator.

A patient order selects one verified store and one destination:

- **Hospital counter pickup** — the order is marked ready for collection at the hospital pharmacy counter.
- **Hospital ward/room delivery** — the order is fulfilled to a selected hospital; ward, room, OPD or delivery instructions are recorded.
- **Home delivery** — delivered to a full address and named recipient.

The module is additive. It does not replace or reset existing patient, prescription, hospital, appointment, lab, or payment tables.

## API surface

### Public directory
- `GET /api/pharmacies?storeType=hospital|partner_store&city=<city>`
- `GET /api/pharmacies/:id/inventory`

Only verified, active pharmacies are listed. Stock display excludes expired batches and stock that is already reserved.

### Existing platform administrator session
- `POST /api/admin/pharmacies` — register a store; it is inactive and unverified by default.
- `PATCH /api/admin/pharmacies/:id/verification` — verify/suspend a store. Activation is refused for an expired licence when an expiry date was recorded.
- `POST /api/admin/medicine-catalog` — add a medicine master record.
- `POST /api/admin/pharmacies/:id/staff` — create store-scoped staff credentials.

All these endpoints use the existing admin bearer-token mechanism. Store activation must follow an actual licence and identity check; software validation does not replace that review.

### Pharmacy staff
- `POST /api/pharmacy/staff/login`
- `GET /api/pharmacy/staff/orders`
- `PATCH /api/pharmacy/staff/orders/:id/status`
- `POST /api/pharmacy/staff/inventory` — manager role only.

Staff tokens are signed using the existing `JWT_SECRET`, expire after six hours, and carry a single pharmacy ID. An order cannot be changed using another store's token. Passwords are scrypt-hashed and are never returned by the API.

Order lifecycle:
`requested → accepted → packed → out_for_delivery → delivered` for home delivery, `requested → accepted → packed → ready_for_pickup → delivered` for hospital counter pickup, or `requested → accepted → packed → ready_at_hospital → delivered` for ward/room delivery. The order persists `hospital_fulfillment_method` as `counter_pickup` or `ward_room_delivery` for hospital orders; home-delivery orders leave it null. Rejected/cancelled requests release reserved stock. Delivered orders consume reserved stock.

Prescription-required medicines need a prescription belonging to the patient, a matching catalogue name, and pharmacist-role acceptance. This name match is a safety gate, not a substitute for pharmacist review of product, strength, dose, quantity, interactions, or applicable law.

### Patient orders
- `POST /api/pharmacy/orders`
- `GET /api/pharmacy/orders`
- `POST /api/pharmacy/orders/:id/cancel`

Production endpoints rely on the existing patient authentication/session middleware. The static demo does not bypass authentication. Until the production SMS OTP provider is configured, a production patient cannot obtain the required session through the existing OTP flow.

The order-creation request should include a stable `idempotencyKey` for retries. Stock reservation and order lines are saved within a PostgreSQL transaction; cancellation/rejection releases reservations and delivery consumes stock.

## Database migration

Migration file: `backend/migrations/008_pharmacy_integration.sql`.

It adds `pharmacies`, `pharmacy_staff`, `medicine_catalog`, `pharmacy_inventory`, `pharmacy_orders`, `pharmacy_order_items` and `pharmacy_order_events`, with indexes, foreign keys and constraints.

**Do not run this migration on production as part of this draft.** Before release, back up the production DB, confirm Phase 6 hospital and Phase 3 prescription tables are present, review the migration against the real schema, schedule the migration, and get explicit deployment approval. The CI E2E workflow applies migrations only to an ephemeral PostgreSQL service.

## Payment and external service integrations still needed

- Pharmacy order subtotal is calculated and stored, but it is **not yet linked to the existing payment record/gateway flow**. Razorpay checkout, confirmed payment webhook, refunds, and pharmacy payment reconciliation are not part of this MVP.
- There is no external medical-store POS/ERP API integration yet. Partner stores use the new Ayansha pharmacy portal and maintain inventory there.
- Courier/last-mile tracking integration is not included; staff manually updates fulfilment states.
- Real partner stores, drug licences, stock, delivery zones and service commitments must be onboarded/verified. CI uses synthetic test records only.
- Patient production login requires the existing SMS OTP provider to be configured before patient order placement can be enabled.

## CI verification

The runtime workflow uses an isolated PostgreSQL service and synthetic records to exercise:
- migration application and table availability;
- verified pharmacy directory and non-expired inventory;
- order stock reservation and idempotent retry;
- patient cancellation releasing reserved stock;
- store-scoped staff authentication and cross-store access denial;
- home delivery, hospital ward/room delivery and hospital counter-pickup status transitions;
- final stock quantities after delivery.

## Release gate

PR: https://github.com/ayanshaagency-spec/automatic-octo-umbrella/pull/6

This PR is intentionally draft. Do not merge or deploy until the application owner approves the still-pending production patient authentication, pharmacy/payment integration decisions, licence/onboarding process, frontend origin/CORS, and controlled production migration plan.
