# Payment webhook recovery notes

## Verified helper scope
The recovery branch now has an isolated Razorpay event normalization helper for the documented payment event shapes `payment.captured` and `payment.failed`. It extracts event ID, payment ID, provider order ID, amount in minor units, currency, and normalized status. Unit tests cover supported events and malformed/unsupported inputs.

## Important limitation
Normalization is not webhook processing. Before integration can safely update a payment row, the route must:
- verify signature against the original raw request body;
- load the linked payment by provider order ID and/or other trusted linkage;
- compare provider payment/order IDs, amount in minor units and currency with the stored payment;
- deduplicate event IDs durably;
- apply an allowed, concurrency-safe transition;
- respond idempotently to duplicate deliveries.

The current route remains on its existing generic webhook contract. The helper is intentionally not wired into the payment status route yet. No database migrations or production operations were performed.
