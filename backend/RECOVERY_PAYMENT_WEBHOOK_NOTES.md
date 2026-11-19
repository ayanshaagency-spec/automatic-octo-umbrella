# Webhook integration recovery notes

Razorpay payment webhook route verifies the raw-body signature before normalizing events. Processing links by provider order ID, validates provider/payment linkage, exact minor-unit amount and currency, locks the payment row, and records provider event IDs in a durable ledger within the same transaction as the status update.

Migration: `backend/db/migrations/003_payment_webhook_event_ledger.sql`.

This migration has not been executed against any database. Tests and CI verification are pending. Do not use production credentials or data.
