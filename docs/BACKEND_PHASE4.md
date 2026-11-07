# Phase 4 backend — provisional integration decisions

This records Phase 4. [Phase 5](AI_INTEGRATIONS_PHASE5.md) adds callable provider
adapters without changing these routes or finalizing shared contracts.

These are implemented backend defaults for team review, not approved shared
contracts. Existing draft examples remain proposals. No datasets are supplied.

## Routes and compatibility

| Route | Behavior |
| --- | --- |
| `GET /api/health` | Liveness, independent of data or providers |
| `GET /api/cards` | `{ "cards": [...] }`, preserving the draft SwipeCard shape |
| `GET /api/swipe-cards` | Compatibility alias for the earlier draft; marked deprecated in OpenAPI, removal requires agreement |
| `POST /api/matches` | Draft `{ "responses": [{ "card_id": "...", "preference": "like" }] }` input; synchronous, stateless alignment |
| `GET /api/careers/{career_id}` | Draft CareerDetail, always including both resource arrays |

Matches return `{ "status": "ready", "matches": [], "score_description": "Interest
alignment only; not a scientific prediction or probability." }` for a valid request
with no positive alignment. Each match preserves `career_id`, `title`, `rationale`,
and `matched_interest_tags`, adding `interest_score` (0–100). No profile ID is
returned because no profile is persisted. Errors use the draft error envelope.
The earlier profile submission/retrieval routes are not implemented.

## Contributor file handoff — approval required

The loader reads UTF-8 JSON (also accepts a UTF-8 BOM) on each request:

- `cards.json`: `{ "cards": [...] }`, using draft SwipeCard objects.
- `careers.json`: `{ "careers": [...] }`, using draft CareerDetail objects plus
  a required `interest_tags` string array for matching. This metadata is excluded
  from the public career detail response.

By default these files belong under `data/`; `ORQUESTRA_DATA_DIR` can point at a
different directory. No files are created or modified by the loader. The backend
lead should assemble the agreed handoff catalog from contributor material after
schema approval; teammates need not edit a common file. Separate resource-file
merging is not yet implemented. Agree on an adapter if their chosen formats differ.

Both `mdc_resources` and `external_resources` are required arrays, including when
empty. They share the draft Resource shape. IDs must be nonempty strings of at
most 128 characters, unique within their entity collection; resource IDs must be
unique within each career. Resource references may recur across different careers.
Keep stable namespaced IDs as recommended in the draft, but UUID syntax is not
enforced while the team settles existing identifiers. Never derive IDs from labels.

Tags use lowercase snake_case. Matching uses sets so duplicate tags do not add
weight. The shared registry still needs to be supplied and approved; only tag
syntax is validated today, not registry membership. Resource `type` stays a
nonempty string rather than enforcing the unapproved taxonomy. Unknown object
fields are rejected to reveal integration mismatches instead of silently dropping
data. Verification timestamps require a timezone; prefer UTC. A `verified` source
requires a URL and timestamp. Structural validation does not verify factual truth.

Missing/unreadable files return 503 `data_unavailable`; malformed JSON, invalid
UTF-8, schema violations, or duplicate IDs return 503 `invalid_data`. Valid empty
catalogs return empty arrays. An unknown career in a valid catalog returns 404.
Missing data is never represented as an empty successful catalog. Errors omit
absolute paths, raw data, and validation inputs.

## Deterministic interest alignment

1. Collect unique tags from liked and disliked cards; skipped/unanswered cards
   do not contribute. Reject unknown cards and duplicate responses with 422.
2. Cancel tags that appear in both liked and disliked sets.
3. For each career, count overlapping positive tags minus overlapping negative
   tags. Divide by the number of unique career tags and multiply by 100.
4. Return only positive scores, rounded to two decimals. Empty career tag lists
   do not match. Sort by descending score, then stable career ID for ties.

The score describes tag overlap, not ability, employability, or a scientific
prediction. The weighting/denominator and stateless response need team approval.
Request bodies must contain 1–1000 distinct card responses. All-skip or all-dislike
requests are valid and can return no matches. No career facts or salary data are
generated; explanations describe only the matching rule.

## Configuration and verification

`FRONTEND_ORIGIN` defaults to `http://localhost:5173`; CORS permits GET/POST and
Content-Type for that exact origin. No cookie credentials are enabled because
there is no session implementation. Agree on session/authentication before
enabling credentials. Environment variables must be set in the shell; `.env`
files are not automatically loaded. No additional test dependencies are needed.

```powershell
conda run -n orquestra python -m unittest discover -s tests -v
conda run --no-capture-output -n orquestra python -m uvicorn backend.main:app --reload
```

Tests create synthetic fixtures only inside temporary directories under `tests/`
and remove them afterward. They exercise FastAPI through ASGI, including middleware,
validation, and response serialization. Pydantic is now declared directly in
requirements because the backend imports it; it was already installed via FastAPI.

## Future specialist boundaries

`backend/agents/interfaces.py` defines an asynchronous SpecialistAgent protocol,
AgentRequest, a provenance-only AgentResult base, explicit role names, and the
OrquestraCoordinator dispatch protocol. These are interfaces, not runnable agents.

| Component | Future responsibility |
| --- | --- |
| Orquestra Coordinator | Select specialists, combine validated outputs, manage failures and budgets, route provider work through approved Gemini/Swarms/Prune adapters |
| Career Agent | Explain career options from validated career records and interests |
| MDC Education Agent | Retrieve verified MDC pathways with source attribution |
| External Resources Agent | Retrieve sourced learning opportunities outside MDC |
| Jobs Agent | Retrieve verifiable current opportunities; no fabricated listings or salary claims |
| Roadmap Agent | Propose sourced missions and prerequisites; server owns XP and completion state |

Concrete specialist payload schemas must extend the result base when implemented.
No runtime agent implementation, provider adapter, fake response, credential access,
AI SDK, or paid call exists. The deterministic matching service is independent of
this future architecture.

Approval checklist: route names/alias lifetime, stateless match response and score,
file handoff/wrappers and career tags, tag registry, resource taxonomy, session/CORS
policy, provenance rules, and eventual agent result schemas. Real contributor
datasets and these agreements remain the integration blockers.
