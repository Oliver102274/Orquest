# Orquest public demo — Render Free

Prepared for the November 8, 2026, 10:00 AM EST deadline. **No service has been created or deployed. Obtain approval before creating the service.**

## Architecture and files

One Free Docker Web Service serves the React/Vite build and FastAPI `/api` routes from the same Render HTTPS origin. No second service, database, disk, worker, cron job, custom domain, or paid integration is needed. `Dockerfile` builds with Node 22 and runs Python 3.11 as a non-root user; `render.yaml` selects the integration branch and disables automatic deployment. `.dockerignore` excludes local environment files, keys, caches, Git metadata, and nested worktrees. Never pass credentials as Docker build arguments or Vite variables.

The local `.integration/phase10` folder is a Git worktree. **On GitHub its contents are the repository root. Do not enter `.integration/phase10` as Render's root directory.**

## Exact setup after approval

In Render, create a **Web Service** from `https://github.com/Oliver102274/Orquest`, using these values (or review the equivalent `render.yaml` Blueprint before applying):

| Setting | Value |
| --- | --- |
| Branch | `codex/phase10-integration` |
| Root Directory | Leave blank (repository root) |
| Language/runtime | Docker |
| Dockerfile Path | `./Dockerfile` |
| Docker Build Context | `.` |
| Instance Type | **Free** |
| Region | Virginia |
| Health Check Path | `/api/health` |
| Auto-Deploy | Off |
| Docker Command | Leave blank; use Dockerfile CMD below |

Docker builds have no separate editable Render Build Command. The exact local equivalent is `docker build -t orquest-demo .`. Inside the Dockerfile the build runs `npm ci`, `npm run build`, and `pip install --no-cache-dir -r backend/requirements.txt`. No migrations run.

Exact start command (the Dockerfile executes it with a shell so Render's `PORT` expands):

```sh
exec uvicorn backend.production:create_public_app --factory --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --no-access-log
```

Do not substitute `backend.main:app`: the production factory adds static serving, private-path protection, same-origin configuration, public safety mode, and request limits. One worker is required for the temporary progress store and process-level limits.

## Environment variables

The Blueprint supplies these nonsecret defaults:

```dotenv
ORQUESTRA_PUBLIC_DEMO=true
ORQUESTRA_MDC_DEMO_ENABLED=true
ORQUESTRA_AI_ENABLED=false
PUBLIC_AI_ENABLED=false
GEMINI_UNBILLED_PROJECT_CONFIRMED=false
GEMINI_FREE_TIER_CONFIRMED=false
GEMINI_MODEL=gemini-3.1-flash-lite
AI_MAX_REQUESTS_PER_PROVIDER=0
AI_MAX_INPUT_CHARS=6000
AI_MAX_OUTPUT_TOKENS=512
AI_TIMEOUT_SECONDS=20
```

Render supplies `PORT`; do not set a frontend API URL. The production frontend uses relative `/api/...` requests. Leave `VITE_API_BASE_URL`, `DATABASE_URL`, all provider keys, and sponsor model settings **unset** for the initial deterministic demo. Local `.env` is neither copied into the image nor loaded by the production entrypoint. Development origins on ports 5173/5174 remain available through the development entrypoint; production does not allow cross-origin access.

If live Gemini is separately approved later, first verify the rotated key belongs to an unbilled Free Tier project. Add only `GEMINI_API_KEY` as a backend runtime secret and set all four opt-ins (`ORQUESTRA_AI_ENABLED`, `PUBLIC_AI_ENABLED`, `GEMINI_FREE_TIER_CONFIRMED`, `GEMINI_UNBILLED_PROJECT_CONFIRMED`) true, with `AI_MAX_REQUESTS_PER_PROVIDER=1` initially. Public mode rejects activation for budgets outside 1–5 or a different Gemini model, and clamps input/output/timeout to the values above. Missing keys and exhausted budgets retain deterministic guidance. A confirmation flag is an operator attestation, not a Google billing check. Do not enable billing to work around a provider error.

In public mode, OpenRouter/Swarms/Prune keys are removed from runtime adapter settings, so public requests cannot automatically reach those services. Their integrations remain intact for approved local use. No Tiger Data connection is needed or initiated by this deployment.

## Public demo limits and disclosure

- Entry is guest access; no email/password is requested or authenticated. Keep sensitive student information out of chat and optional questionnaire fields. Those fields are not an account system.
- Guidance/roadmap/session-creation POST requests share a global 20-per-minute rolling limit and at most two concurrent requests. Limits do not trust spoofable client/IP headers. Other JSON writes have a 16 KiB body cap. Responses use the existing error envelope; 429 includes `Retry-After` and is never automatically retried.
- Gemini additionally has an existing atomic per-process attempt budget, including failed attempts. Public mode caps that configured budget at five. Counters reset on restart; these are demo limits, not durable account quotas or complete DDoS protection. Keep live AI off for an unattended public link unless that reset behavior is acceptable and the project is confirmed unbilled.
- XP is server-calculated, self-reported practice. It exists in one server process, expires after 24 hours, and is lost on restart/spin-down. Reloading the browser loses its in-memory session token. Exported saves include supported choices/consents, not tokens, missions, or XP. The UI discloses this.
- Unknown `/api` routes return JSON 404, missing assets return 404, and private/dot/traversal paths are not served. Only the built frontend directory is exposed. Navigation URLs return the SPA shell; refresh starts a fresh client session rather than restoring an account.

## Strict $0 checklist

Use a Free compute instance and a workspace with **no payment method**. Render documents supplementary charges for excess bandwidth/build minutes when payment details exist; without a payment method, it suspends free services or builds instead. If a card, upgrade, or paid verification is required, stop rather than proceeding. Review existing workspace usage before approval. Do not create Postgres, Key Value, persistent disks, paid scaling, or paid support resources.

Render Free has 750 instance-hours per workspace/month, sleeps after 15 idle minutes, can take about a minute to wake, and can restart at any time. It is appropriate for this hackathon demo, not a reliable production service. Open the site manually before presenting; do not create artificial keep-alive traffic. Free quota exhaustion can make the site unavailable before the deadline.

Official references checked November 7, 2026:

- https://render.com/docs/free
- https://render.com/docs/docker
- https://render.com/docs/blueprint-spec
- https://render.com/schema/render.yaml.json

## Verification after an approved deployment

1. Confirm Render shows the integration branch, expected commit, **Free** instance, and no extra resources.
2. Open the assigned `https://<service>.onrender.com/`. Verify the demo label and guest entry without credentials. A cold-start loading page is normal.
3. Request `/api/health` and confirm `{"status":"ok"}`. Confirm `/api/cards` returns 12 cards. Browser network requests must use the same HTTPS host, never localhost, and must not contain provider keys.
4. Complete Swipe → Matches → Browse Job Catalog (20 families/115 occupations) → Cybersecurity details. Verify the MDC program/source and external resources.
5. Ask a salary/education question, confirm catalog-guidance and unverified-data labels, then request a roadmap and start temporary missions. Complete one mission, verify 10 XP, and return through navigation. This check uses deterministic guidance with AI disabled.
6. Refresh `/explore` or `/roadmap`: the page must load, with temporary-client-session loss expected. Check `/.env`, `/backend/main.py`, `/assets/missing.js`, and `/api/missing` return 404, not source content.
7. Verify provider billing/usage dashboards show no new live requests. Never use a public page to test enabled AI without approval.

## Local validation and remaining blockers

137 backend tests, 37 frontend tests (including full React flows against the production loopback server), and the frontend production build passed. Tests cover refresh/asset/API routing, excluded private paths, CORS isolation, body/rate/concurrency limits, public AI gates, request-budget exhaustion, fallback, and mission XP. `render.yaml` passes Render's published JSON Schema using existing local validation tools, with one Free service and no database/disk. No production dependencies were added.

Docker is not installed on the current Windows machine, so a Linux container image build has **not** been executed locally. The same production factory and generated frontend were exercised locally; Render's first approved image build remains a validation step. Approval, available Free quota/no-card eligibility, and the first HTTPS smoke check are still required. Catalog research verification and durable accounts/progress remain intentionally out of scope. No service has been created or deployed.
