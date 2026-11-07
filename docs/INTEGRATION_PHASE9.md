# Phase 9 integration review — draft

Integration decisions remain subject to team approval. No teammate source files or datasets were edited, and no commits, pushes, or merges were performed in this phase.

## Available branch snapshots

After fetching origin, main is `e3672ff`; the backend working branch remains `feature/orquestra-backend` at that commit. Its remote feature branch is `8cb0b2b`, so local Git reports one commit ahead (the existing main merge commit).

| Contribution | Remote commit | Status |
| --- | --- | --- |
| Frontend | `1c5ace1` | Available in detached `.integration/frontend` worktree |
| Career data | `2372979` | Three careers; matches frontend branch data |
| Swipe data | `eeaad53` | Twelve cards; matches frontend branch data |

These teammate contributions are not merged into main. Root data remains unchanged; integration tests explicitly load the worktree data. The pre-existing local `docs/AI_SETUP_PHASE8.md` is preserved.

## Compatibility and decisions

- The teammate JavaScript API client successfully loads cards, submits swipes, receives matches, and fetches career details from the current backend over loopback HTTP. Existing response envelopes and endpoint aliases are unchanged.
- `math` maps to canonical `statistics` **only during matching**, in `backend/services/tags.py`. This provisional vocabulary bridge requires team approval; it is not a claim that the subjects are identical. Original card and career JSON remains unchanged. Matching deduplicates aliases and cancels opposing signals. Returned matched tags use the canonical spelling.
- Other tags retain exact matching. Broader mappings require dataset-owner agreement; silently equating related interests would change scores without a shared contract.
- Scores remain deterministic interest alignment, not predictions or AI assessments.
- Career responses retain both `mdc_resources` and `external_resources`. All three supplied careers currently have empty resource arrays and unverified sources, so verified-resource content is still pending.
- The fetched frontend includes demo login and a question placeholder, but no functioning chat request in that component. Existing chat-related code is untouched. A separate teammate chat implementation must be supplied before its integration can be verified.
- Career-pathway prompts and research remain the teammate's responsibility. No career trees or AI pathways were fabricated.

## Validation

- 57 backend tests passed, including the original 49 and eight tag/database checks.
- Six existing frontend tests passed; the frontend production build succeeded.
- `tests/manual_frontend_integration.py` validated the real 12-card/3-career datasets, compared them with their owners' branch versions, and exercised the actual frontend API functions against FastAPI. It verified matches, career details, resource array formats, CORS, unknown-card/career errors, and health.
- The manual runner substitutes Vite's API-base setting in memory; it does not edit frontend source. This is API-client integration coverage, not a browser visual or full UI test.
- The test server stopped and checked source/data hashes remained unchanged. AI and database calls were not made. Database tests mock the driver.

Repeat backend and integration checks from the repository root:

```powershell
conda run -n orquestra python -m unittest discover -s tests -v
conda run -n orquestra python tests/manual_frontend_integration.py
```

For a later interactive demo, set `ORQUESTRA_DATA_DIR` to the absolute `.integration/frontend/data` directory in the backend process, keep `ORQUESTRA_AI_ENABLED=false` and `AI_MAX_REQUESTS_PER_PROVIDER=0`, and run `conda run -n orquestra uvicorn backend.main:app --host 127.0.0.1 --port 8000`. Run `npm run dev` from `.integration/frontend/frontend` with the default API base and localhost:5173 origin. Stop both processes afterward.

## Tiger Data preparation

JSON files remain the application data source. There is no database access on application startup and no schema, persistence layer, or migrations introduced.

`backend/database.py` provides an optional Psycopg 3 connection check. Its only SQL is `SELECT 1`, with a read-only session, five-second connection and statement timeouts, TLS required by default, and sanitized errors. Stronger supplied TLS verification modes are preserved; insecure modes are rejected. Requirements include `psycopg[binary]`; `environment.yml` continues referencing the same requirements file.

The offline command below prints presence/confirmation booleans only and never connects:

```powershell
conda run -n orquestra python -m backend.database
```

The current process reports no `DATABASE_URL` and no rotation confirmation. This does not establish whether a local `.env` contains a value: the helper deliberately does not load it. No credential values were inspected or printed.

Before a live check:

1. Obtain the newly rotated connection URL from the existing Tiger Data service. Never reuse the previously exposed password or activate a paid service.
2. Configure `DATABASE_URL` securely in the process environment, without placing it in a shell command, log, or source file. A local ignored `.env` may store it, but must be explicitly loaded securely before this helper runs. Set `DATABASE_CREDENTIALS_ROTATED=true` only after confirming replacement. This flag records operator confirmation; it cannot prove credential freshness.
3. Obtain explicit user approval for the connection check. Only then run `conda run -n orquestra python -m backend.database --connect`. Successful output contains `connected: true` and `read_only_check: true`.
4. Do not create tables or modify remote data without separate approval.

Reference documentation: [Tiger Data connection details](https://www.tigerdata.com/docs/integrate/find-connection-details), [Psycopg connection API](https://www.psycopg.org/psycopg3/docs/api/module.html), and [transaction handling](https://www.psycopg.org/psycopg3/docs/basic/transactions.html).

Next team decisions: approve the tag bridge, supply verified MDC/external resources and the intended chat implementation, and approve completed teammate contributions for eventual merging. Keep live AI requests disabled.
