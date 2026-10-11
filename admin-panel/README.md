# Ayansha Health Care Admin Panel

Authenticated operational dashboard foundation.

## Access and security
- The existing page is served at `/admin` from a fixed server-side file path. It is not authorization by itself; appointment APIs require a valid short-lived admin role token.
- Admin credentials and `JWT_SECRET` are configured only on the server. Never commit real values.
- The page stores the short-lived role token in `sessionStorage`, not an HttpOnly cookie. This reduces persistence beyond the tab session but remains accessible to same-origin JavaScript and is not equivalent to HttpOnly cookie protection. Log out removes the token from the current tab session.
- Appointment data is inserted using text nodes, not interpolated HTML, to avoid HTML injection from database fields.

## Configuration
Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and a secure `JWT_SECRET` on the server. Admin login is not operational until both admin credentials are configured in the host environment and the running service has received them.

## Current capabilities
- Server-side admin credential verification.
- Short-lived role-scoped admin JWT stored only in the browser session.
- Authenticated appointment operations view.
- No `ADMIN_API_TOKEN` or other server secret is exposed in browser code.

## Remaining operational modules
Doctor management, lab/payment operations, reports, notifications and audit logs require their respective secured APIs and production data validation before being exposed here.
