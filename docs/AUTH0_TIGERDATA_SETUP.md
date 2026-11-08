# Auth0 login and Tiger Data account progress

Feature branch: `feature/auth0-tigerdata-persistence`, based on integration `06fe4b8`.
Default behavior stays guest-only. Nothing here creates a cloud service, applies a migration at startup, changes Gemini settings, or enables sponsor APIs.

## Manual Auth0 setup

1. In Auth0 Dashboard, use a **Free** tenant. Verify the actual account plan before enabling it. Do not add a payment method, custom domain, paid add-ons, or an upgrade. [Official pricing](https://auth0.com/pricing) currently lists a $0 Free plan; a trial is not permission to use paid-only features.
2. Applications > Applications > open the existing **Orquest**, type **Single Page Application**, React. Use Universal Login and Authorization Code + PKCE (the official React SDK handles this). No client secret belongs in this application. Copy this SPA's Client ID, not the automatically created API test/machine-to-machine client's ID. The SDK uses `VITE_AUTH0_CLIENT_ID`; its dashboard application type cannot be verified offline.
3. Applications > APIs > open the existing **Orquest API**, Identifier **`https://api.orquest.app`**, signing algorithm **RS256**. This is the user's actual API audience, not a web page. Both frontend and backend reject a different configured audience. If your tenant shows application access policies, allow user access for the Orquest SPA. Do not create another API or use machine-to-machine credentials.
4. In the Orquest SPA settings, add the following exact origins to **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins**. Replace the HTTPS placeholder with the existing service's actual origin; do not add wildcard URLs:

   ```text
   http://localhost:5173
   http://127.0.0.1:5173
   http://localhost:5174
   http://127.0.0.1:5174
   https://<existing-render-service>.onrender.com
   ```

   Vite defaults to 5173 and may choose 5174 when occupied. Use one of these ports explicitly. Redirect URI and logout return URI are `window.location.origin`.
5. Save settings. Use the Domain (hostname only, no `https://` or slash) and public SPA Client ID below. Never use the SPA ID as the API audience. The backend accepts API access tokens, not ID tokens.

## Configuration

### Missing local login controls

Run Vite from this feature worktree's `frontend` directory. It reads `frontend/.env.local`, not the root `.env`, `.env.example`, or another worktree's settings. Copy the public `frontend/.env.example` template only if `.env.local` does not already exist, fill in the Orquest SPA values, and set `VITE_AUTH0_ENABLED=true`. Restart Vite and reload the page. Do not copy an entire backend environment file into the frontend.

With valid enabled configuration, the initial retro card offers **Log In / Sign Up**, **Continue as Guest**, and **Import Saved Progress**. Login does not require entering guest mode first. Incomplete enabled configuration shows a disabled login button and a safe configuration message. When disabled, the original guest-only screen remains. After login the account bar shows identity/logout, and the landing button becomes **Continue to Orquest**. Memory mode is explicitly temporary; importing a save does not import missions, XP, or guest access tokens into an account.

Backend startup is separate: `backend.run_local` reads this worktree's ignored root `.env`. For this local login check set `AUTH0_ENABLED=true`, the same tenant domain and exact API audience, `PERSISTENCE_BACKEND=memory`, `ORQUESTRA_AI_ENABLED=false`, and `AI_MAX_REQUESTS_PER_PROVIDER=0`. No database URL is needed. Stop the existing local servers with Ctrl+C in their own terminals before restarting:

```powershell
cd "C:\Users\olive\OneDrive\Desktop\Hackathon Projects\SharkByte Hackathon\.integration\auth0-tigerdata"
$env:PERSISTENCE_BACKEND='memory'
conda run --no-capture-output -n orquestra python -m backend.run_local
```

In a second terminal:

```powershell
cd "C:\Users\olive\OneDrive\Desktop\Hackathon Projects\SharkByte Hackathon\.integration\auth0-tigerdata\frontend"
npm run dev -- --port 5174 --strictPort
```

Use `http://localhost:5174` and register that exact origin for Auth0 callback/logout/web origins. The development API defaults to `http://localhost:8000`; the backend binds loopback port 8000. A request without a token to `/api/me` should return 401 once account configuration is loaded; 503 means login/storage configuration is unavailable. Do not log JWTs or use ID tokens for that endpoint. The local Client ID must be checked against the Orquest **SPA** in Auth0 Dashboard; the SDK cannot determine application type from a client ID offline.

Public frontend variables are read **at build time**. For local Vite, put these in an ignored `frontend/.env.local`, using your own public values:

```dotenv
VITE_AUTH0_ENABLED=true
VITE_AUTH0_DOMAIN=YOUR_TENANT.auth0.com
VITE_AUTH0_CLIENT_ID=YOUR_PUBLIC_SPA_CLIENT_ID
VITE_AUTH0_AUDIENCE=https://api.orquest.app
```

Backend runtime variables (set in the process environment or your private local launcher configuration):

```dotenv
AUTH0_ENABLED=true
AUTH0_DOMAIN=YOUR_TENANT.auth0.com
AUTH0_AUDIENCE=https://api.orquest.app
PERSISTENCE_BACKEND=memory
```

`AUTH0_ENABLED` and `VITE_AUTH0_ENABLED` default to `false`; `PERSISTENCE_BACKEND` defaults to `memory`. Auth0 + memory supports temporary account progress, expiring after 24 hours or server restart. It never promises permanent storage. The backend does not automatically load a private `.env` when started directly with Uvicorn.

On Render, after review/merge and separate deployment approval, set these same public/build and backend/runtime variables on the **existing** service. The Dockerfile declares only the four public `VITE_AUTH0_*` build arguments. Render translates matching environment variables into build arguments; a **rebuild and deploy** is required for frontend changes. [Render Docker environment handling](https://render.com/docs/docker-secrets). Leave `VITE_API_BASE_URL` unset for same-origin HTTPS `/api/`. Do not change existing Gemini variables, Blueprint production AI settings, service plan, branch, or service count during configuration review. `render.yaml` is unchanged; future Blueprint edits must not overwrite dashboard values. Do not set any `VITE_*` password, database URL, private key, or client secret.

## Tiger Data: current service db-52657

The user confirms **db-52657**, **Free**, **$0/hour**, shared compute, **750 MiB** storage, and a reset password. This supersedes the earlier uncertainty based on generic pricing. These are user-confirmed service details, not a live dashboard verification. **db-46018 is a different service; never reuse its credentials or connection settings.** Obtain only db-52657's current dashboard connection information; do not infer its hostname from earlier messages. Do not add billing, upgrade, or create another service. Stay within its Free plan/storage allowance; if that plan becomes unavailable, stop database operations and return to memory mode. No live connection is authorized by these configuration confirmations alone.

Before any live connection:

1. Password reset is confirmed by the user. Use the newly reset credential for db-52657 only. Treat previously shared connection strings as compromised; do not copy them or reset again unnecessarily.
2. Obtain the **new db-52657** private PostgreSQL connection string, including that service's own hostname, port, database, username, and reset password. Use the dashboard URI encoding for special password characters. Put it only in backend secret configuration. Do not paste it into chat, shell command arguments, source files, frontend variables, screenshots, or build arguments.
3. Set private `DATABASE_URL` through a secret manager or private process environment. Set `DATABASE_CREDENTIALS_ROTATED=true` and `DATABASE_ZERO_COST_CONFIRMED=true` **only after** confirming both conditions. These acknowledgements are gates, not billing enforcement.
4. The application forces `sslmode=verify-full`, a 5-second connection timeout, and bounded query/lock timeouts. `DATABASE_SSLROOTCERT` defaults to `system`; if required, use Tiger Data's official CA certificate file path. Never disable TLS verification. The bundled psycopg/libpq must support `sslrootcert=system`.
5. Review `backend/migrations/001_account_progress.sql`. With explicit approval for schema writes, use the existing `orquestra` environment from this worktree:

   ```powershell
   conda run -n orquestra python -m backend.account_migrate --apply --confirm-zero-cost-and-rotated-credentials
   ```

   The command requires the private environment variables above. Without both command flags, it makes no connection. It creates only `orquest_users`, `orquest_progress`, and `orquest_completions`; it never drops tables or runs automatically. Use a schema-capable role for this one-time operation, then a restricted application role with SELECT/INSERT/UPDATE access to these tables. `CREATE TABLE IF NOT EXISTS` does not repair incompatible pre-existing tables; inspect them instead of deleting data.
6. Set `PERSISTENCE_BACKEND=postgres` only after the migration succeeds. Backend failures return 503 and never silently report a failed write as saved. A connection loss during commit can have an uncertain outcome: reload before retrying. The same mission remains idempotent.
7. After explicit approval, verify two test accounts: select a career, start missions, complete one, reload/login again, and confirm XP is restored. Sign out and sign in as another account: no prior account progress should appear. Repeat completion and confirm XP does not increase. This task performed mocked connections only, not a live migration or persistence test.

## Contracts and implementation

Existing `/api/progress` guest session tokens and response formats are unchanged. They cannot authorize account routes. Auth0 tokens do not authorize guest progress.

All following routes require `Authorization: Bearer <Auth0 API access token>`:

| Route | Behavior |
| --- | --- |
| `GET /api/me` | Validated `sub` and `storage`; creates/loads the minimal identity record. |
| `GET /api/account/progress` | `{selected_target, progress: [...]}` for the authenticated subject only. |
| `PUT /api/account/selection` | `{target_id}`; validates the existing career/occupation ID and saves selection. |
| `POST /api/account/progress` | Existing progress input `{target_id, ...consented profile fields}`; restores or generates/saves one roadmap per account/target. |
| `GET /api/account/progress/{id}` | Owned progress only; 404 for another user's ID. |
| `PUT /api/account/progress/{id}/missions/{mission_id}/completion` | `{completed:true}` only. Unknown fields, including XP/user IDs, are rejected. |

Account progress has the existing `id`, `roadmap`, `missions`, `total_xp`, `notice` shape, with `storage` either `temporary_memory` or `persistent_postgres`. No guest `access_token` is returned. Identity is solely validated JWT `sub`; no email or profile name is stored by FastAPI.

PostgreSQL uses parameterized statements, a transaction and owned-row `FOR UPDATE` lock for completion, a unique `(subject,target_id)` constraint, and a primary key `(progress_id,mission_id)` for completion records. XP is recomputed on the server from stored completed missions at 10 XP each. Snapshot and completion updates commit together. PostgreSQL concurrency is exercised with a locking transactional connection double; real-server behavior remains a required approved staging check.

The frontend uses the official Auth0 SDK's in-memory cache, requests the API audience, and attaches access tokens only to `/api/me` and `/api/account/*`. It retains only navigation (screen/target) in the SDK redirect appState, not guest tokens, quiz answers, or chat history. Guest missions are not transferred into an account. Logout and identity changes remount game state. Blocking third-party cookies may require explicit login again after reload; saved PostgreSQL progress remains available after authentication. Save-file exports still do not contain missions, XP, or access tokens. Starting Fresh/importing a save changes local state, not previously saved account records.

## Teammate 2 / Base44 handoff

Expected overlap: `frontend/src/App.jsx`, `main.jsx`, `services/api.js`, `components/LoginScreen.jsx`, and `components/RpgGame.jsx`, plus package files. Preserve the `AccountProvider` wrapper, identity-keyed game state, on-demand account token handling, account progress restore, and the existing guest path when applying Base44 changes. Do not overwrite the teammate's design or copy an entire frontend tree over it. `backend/main.py`, `production.py`, requirements, and Dockerfile have small additive wiring changes; catalog/MDC data, Gemini adapters, sponsor integrations, and existing API models are untouched.

Review the feature branch separately, then reconcile Base44 changes and run all tests before merging. Deployment/real account verification is **not** completed by this branch. Keep the live guest demo unchanged until manual configuration, billing verification, and explicit deployment approval are complete.

## Offline validation

```powershell
$env:ORQUESTRA_AI_ENABLED='false'
$env:AI_MAX_REQUESTS_PER_PROVIDER='0'
conda run -n orquestra python -m unittest discover -s tests
npm --prefix frontend test
npm --prefix frontend run build
conda run -n orquestra python tests/manual_frontend_integration.py --worktree . --mdc-demo --production
```

JWT tests use real locally generated RSA signatures with mocked JWKS retrieval. Tests cover expiration, issuer/audience/signature errors, missing/guest tokens, disabled flags, two-user isolation, restore, duplicate/concurrent completion, database outage and TLS/budget gates. Frontend mocks cover login configuration, redirect intent, expiry, same-origin token routing, saved mission requests, restoration, logout/user switching, and storage failures. No live Auth0, Tiger Data, or AI requests are part of validation.

Initial feature validation: 163 backend tests and 49 frontend tests including loopback integration, plus the production build. Configuration reconciliation passed 165 backend tests and 50 frontend tests including loopback integration, plus the production build and credential-pattern scan. It also fixes opt-in loading of account variables from the local root .env; AI verification tools keep their previous variable allowlist by default. Docker CLI was unavailable, so Docker configuration was reviewed but an image was not built locally. Vite reports a non-blocking 500 kB bundle-size warning after adding the official SDK. Live Auth0 and Tiger Data validation remain approval-gated.

## Controlled local activation checklist (separate live-test approval required)

1. Create ignored `frontend/.env.local` with the four Vite values above, and ignored worktree-root `.env` with the backend Auth0 values. Use the same tenant hostname and exact `https://api.orquest.app` audience on both sides. Templates keep login off and storage in memory; explicitly turn on login only for the approved test. Set `ORQUESTRA_AI_ENABLED=false` and `AI_MAX_REQUESTS_PER_PROVIDER=0` in this test environment so no AI request is needed.
2. Add only db-52657's new private `DATABASE_URL` to root `.env`. Set `DATABASE_CREDENTIALS_ROTATED=true`, `DATABASE_ZERO_COST_CONFIRMED=true`, and `DATABASE_SSLROOTCERT=system`. Leave `PERSISTENCE_BACKEND=memory` until migration approval. Do not copy another worktree's `.env` or production Gemini configuration.
3. After explicit schema-write approval, use the existing `orquestra` environment from this worktree. The following documented command loads the ignored root `.env` without printing it before invoking the guarded migration; the migration alone does not load `.env`:

   ```powershell
   conda run -n orquestra python -c "from backend.integrations.verify import ROOT, load_local_env; load_local_env(ROOT / '.env', include_accounts=True); from backend.account_migrate import main; raise SystemExit(main())" --apply --confirm-zero-cost-and-rotated-credentials
   ```

   Process environment values override `.env`; ensure no stale DATABASE_URL is already set in that shell, without printing its value. The migration is additive and transactional, with no startup migration, DROP, or data deletion. Stop on errors; do not weaken TLS or delete an incompatible existing table.
4. After approval for one login/persistence session, set root `.env` `PERSISTENCE_BACKEND=postgres`. Start `conda run -n orquestra python -m backend.run_local`, and in a second terminal `npm --prefix frontend run dev -- --port 5174 --strictPort`. Visit `http://localhost:5174`. Sign in using the Orquest SPA, select one existing occupation, start missions, complete one, and confirm server XP increases by 10. Reload/re-authenticate and confirm the target/roadmap/completion/XP return. Repeating the same completion must not add another award. This session writes account/progress rows and needs explicit approval; it is not a read-only SELECT 1 check.
5. Sign out and confirm cached account data disappears. Before activation, approve a second test identity to validate isolation live (already covered by mocks). Keep Auth0 and persistence disabled on the production deployment throughout local testing. Reconcile the Base44 overlap listed above, rerun tests, and review the feature branch before any separately approved merge/deploy. Rebuild frontend assets whenever Vite values change.
