# Single MDC pathway demo — draft handoff

Phase 9.5 adds one optional resource overlay, not a career tree or generation system. Contracts remain drafts. No teammate datasets, frontend components, chat, or prompts are changed.

## Files and integration

- `data/demo/mdc_pathways.json`: one program resource linked to the inspected ID `career_cybersecurity_analyst`.
- `backend/models.py`: file-only `MDCPathwayLink` and `MDCPathwayCatalog` wrappers reuse the existing `Resource` schema.
- `backend/services/data.py`: validates and appends the optional overlay in memory. It never writes contributor data. Unknown career references and duplicate resource IDs return a clear dataset error rather than overwriting records. Existing MDC and external resources are retained.
- `backend/main.py` and `.env.example`: `ORQUESTRA_MDC_DEMO_ENABLED=false` by default; explicit `true` enables the bundled overlay.
- `tests/test_mdc_demo.py`: isolated backend regression cases.
- `tests/frontend_mdc_demo.test.jsx` and `tests/manual_frontend_integration.py`: actual React UI and API-client integration against a temporary local backend. The runner creates its own temporary test file exclusively in the detached frontend worktree and removes it afterward.

The root backend stays on `feature/orquestra-backend`. Fetch found no branch updates: main `e3672ff`, frontend `1c5ace1`, careers `2372979`, swipe data `eeaad53`. Teammate code remains in `.integration/frontend`, detached and unmerged. Existing local Phase 9 work is preserved.

## Record and evidence

The file envelope is `{"pathways": [{"career_id": "...", "mdc_resources": [Resource]}]}`. Public responses still use the original `CareerDetail` shape, including both `mdc_resources` and `external_resources`.

The stable resource ID is `resource_mdc_cybersecurity_as_demo`, organization is Miami Dade College, and type is `program`. Its official source is [MDC Cybersecurity Associate in Science](https://www.mdc.edu/cybersecurityas/).

Reviewed November 7, 2026: the official page confirms the degree, network defense/incident response focus, and Cybersecurity Analyst career relevance. The user supplied verified values of **60 credits** and **approximately two years**; the page's extracted text did not expose those dynamic numeric values. The verification timestamp records the review date at UTC midnight, not an exact retrieval time. No courses, prerequisites, tuition, salaries, or job statistics were added. Verification applies to this program resource, not the parent career's other sources.

Because `Resource` has no separate credit, duration, or description fields, these details are in the resource title. This preserves existing strict JSON validation and makes the details visible in the unchanged frontend. Dedicated structured fields require team agreement before adoption; do not parse the display title as a future data API.

## Run locally

The demo needs a base catalog containing the linked career ID. Until teammate contributions are approved and merged, use their isolated worktree data:

```powershell
$env:ORQUESTRA_DATA_DIR = (Resolve-Path '.integration/frontend/data').Path
$env:ORQUESTRA_MDC_DEMO_ENABLED = 'true'
$env:ORQUESTRA_AI_ENABLED = 'false'
$env:AI_MAX_REQUESTS_PER_PROVIDER = '0'
conda run -n orquestra uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In a separate terminal run `npm run dev` from `.integration/frontend/frontend`. Swipe, then double-click Cybersecurity Analyst to see the MDC resources section and official source link. `GET /api/careers/career_cybersecurity_analyst` includes the program; `/api/cards`, `/api/matches`, other career details, and `/api/health` retain their formats. Stop the server after the demo and set the demo flag back to `false`. The app does not automatically load `.env`.

Automated checks from the repository root:

```powershell
conda run -n orquestra python -m unittest discover -s tests
conda run -n orquestra python tests/manual_frontend_integration.py --mdc-demo
```

The integration runner checks real teammate data and uses loopback HTTP only. UI assertions use jsdom, not browser visual inspection. It stops its server automatically. No live AI, database, or paid requests are required.

Validation completed: all 62 backend tests passed (57 preserved plus five demo tests); all seven frontend tests passed (six preserved plus the live-backend MDC display test). The 12-card/3-career API-client check also passed, including CORS, errors, health, and both resource arrays. The React test completed swipes, opened Cybersecurity Analyst details, and found the program title and official source link. The temporary test server stopped and teammate files remained unchanged.

## Extend without changing architecture

For another local demonstration, add a resource to the appropriate career entry or a new entry with an existing career ID in the overlay. Keep one entry per career, stable distinct resource IDs, existing Resource fields, valid URLs, and timezone-aware verification timestamps. Unknown careers and collisions fail validation. Do not add synthetic career records to make a link work.

For the production handoff, Teammate 3 can put approved resources directly into each career's `mdc_resources` using the same schema. Disable the demo overlay before adopting its resource into production, avoiding duplicate IDs. A separate production pathway-file loader or richer credit/duration structure requires an agreed draft contract extension, not silent changes to teammate files.

Future Gemini outputs must be validated and grounded in curated, reviewed resources before they are attached to responses. Reference stable career/resource IDs; never mark generated text verified merely because it contains a URL. Keep deterministic matching independent of generated explanations. The backend lead owns the Gemini adapter/coordinator; no new prompt or generation logic is implemented here.

Teammate 3 still owns full program research, authoritative fact verification and freshness, pathway-generation prompts, broader mappings, and dynamic pathway content. Frontend owners retain display/chat work. Team approval remains necessary for richer pathway fields, tag mappings, production ingestion, and any live-provider testing under the $0 policy.
