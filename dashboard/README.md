# Samuhia KPI dashboard

Read-only React + Firebase dashboard for the KPI project. It calls `kpiGetValues` and reads `kpi_definitions` / `kpi_runs`.

1. `cd dashboard && npm install`
2. `cp .env.example .env` and fill `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (Firebase console → Project settings → Web app). `VITE_FUNCTIONS_REGION` defaults to `us-central1`.
3. Firebase console → Authentication → Sign-in method: enable **Google** and **Email/Password**.
4. Sign in once (the "Access not granted" screen shows your UID), then grant a role (needs Application Default Credentials for the KPI project):
   `node scripts/set-role.mjs <uid> <admin|analyst|finance>` — then press "Check again" or sign in again.
5. Develop: `npm run dev`. Checks: `npm run typecheck`, `npm test`.
6. Deploy (from the repo root, hosting uses `dashboard/dist`): `npm --prefix dashboard run build && firebase deploy --only hosting`

Notes: all dates are Africa/Nairobi days; routes use a hash (`#/money?grain=weekly&from=…&to=…`) so views are shareable.
