# Ayansha Health Care — Flutter mobile app

This app uses the existing Ayansha Health Care backend. It does not contain a separate database or backend.

## Local setup

1. Start the existing backend from `backend/` after configuring its environment variables and database.
2. From this directory, run:

   ```sh
   flutter pub get
   flutter analyze
   flutter run --dart-define=AYANSHA_API_URL=http://10.0.2.2:3000
   ```

   `10.0.2.2` is the Android emulator's host-machine loopback alias. For an iOS simulator, use `http://127.0.0.1:3000`. For a physical phone, use the development computer's reachable LAN address. Do not use an emulator-only address on a physical device.

## Authentication and connected modules

- Patient sign-in requests and verifies a one-time code through `/api/auth/request-otp` and `/api/auth/verify-otp`.
- The verified bearer token is kept in memory for the current app session and is attached to protected patient API calls.
- Doctor directory, appointments, prescriptions, health records, lab orders, emergency contacts, nearby hospitals, and AI symptom guidance use the existing API.
- The development OTP may be returned by the backend only outside production. Production OTP delivery requires `OTP_PROVIDER_URL` and `OTP_PROVIDER_TOKEN` on the backend.
- AI guidance requires `AI_PROVIDER_URL` and `AI_PROVIDER_TOKEN`. It is informational and is not a diagnosis.
- Nearby-hospital search needs hospital data in the existing database and currently accepts latitude/longitude input.
- Video consultation is not live until a video-room provider and secure join-link flow are integrated.
- Payment history/order APIs exist on the backend, but a native payment checkout still needs the payment provider's mobile checkout flow and configured credentials.

## Security notes

- Do not put database credentials, OTP tokens, AI tokens, or payment secrets in Flutter source code or `--dart-define` values.
- Configure provider secrets only in the backend's deployment environment.
- Use HTTPS for deployed API traffic. The local HTTP URLs above are for development only.
- The session token is not persisted to disk; the patient signs in again after a full app restart.
