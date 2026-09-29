# Ayansha Health Care Admin Panel

Authenticated operational dashboard foundation.

## Current capabilities
- Server-side admin credential verification.
- Short-lived role-scoped admin JWT stored only in the browser session.
- Authenticated appointment operations view.
- No ADMIN_API_TOKEN or other server secret is exposed to browser code.

## Configuration
Set ADMIN_EMAIL, ADMIN_PASSWORD, and a secure JWT_SECRET on the server. Never commit real values.

## Remaining operational modules
Doctor management, lab/payment operations, reports, notifications and audit logs require their respective secured APIs and production data validation before being exposed here.
