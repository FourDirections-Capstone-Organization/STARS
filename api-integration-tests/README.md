# STARS <-> Delivery System API Integration Tests

Standalone, dependency-free Node (18+) script. It is not part of either app's build and changes no
existing backend/frontend code. It only sends GET, OPTIONS and failed-login POSTs, so it is safe to run
against the deployed systems.

## Run

```powershell
node api-integration-tests/integration.mjs
```

Defaults point at the deployed Azure backends. Optional environment variables:

| Variable | Purpose |
|---|---|
| `STARS_API_URL`, `DMS_API_URL` | Override backend URLs (e.g. `http://localhost:5100`) |
| `STARS_FRONTEND_ORIGIN` | Default `https://stars-two-chi.vercel.app` |
| `DMS_FRONTEND_ORIGIN` | DMS Vercel URL, enables the CORS tests for it |
| `STARS_IDENTIFIER`, `STARS_PASSWORD` | Real STARS account, enables authenticated tests |
| `DMS_EMPLOYEE_ID`, `DMS_PASSWORD` | Real DMS account, enables authenticated tests |
| `DMS_WAYBILL` | Existing waybill, enables the "found" tracking test |

```powershell
$env:DMS_FRONTEND_ORIGIN="https://<dms-app>.vercel.app"
$env:DMS_WAYBILL="SPX-2026-0612"
node api-integration-tests/integration.mjs
```

Exit code is `0` if all pass, `1` if any fail. Azure cold starts may make the first call slow.

## Known finding

`Cors:AllowedOrigins` on the DMS API is empty in production, so browsers on the STARS Vercel site (or any
other origin) cannot call it. Fix with an Azure App Service setting, no code change:
`Cors__AllowedOrigins__0 = https://stars-two-chi.vercel.app` (and `__1` for the DMS frontend), then restart.
