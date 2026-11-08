# Phase 15 — backend prepared; active frontend work preserved

The user confirmed Teammate 2 is actively connecting chat, catalog selection, and roadmap/RPG UI. No frontend edits were applied, and no duplicate UI was created. Fetch found no newer frontend commit than `a682f60`; the integrated branch started clean at `a4d5c53`. No unfinished teammate branches were merged. This document is the coordination handoff, not a message sent to another person.

## What still needs connecting

The current pushed UI already supports login, 12 swipes, three career matches, Bubble Explorer, career details/resources, the Cybersecurity MDC demo, optional quiz, journey screen, and return navigation. It does not yet send career questions, browse the 20-family/115-occupation catalog, request roadmaps, or complete missions. Teammate 2 should finish these connections in the existing components, then supply the branch/commit for integration. The new full browser journey cannot be claimed complete until that code is available and tested.

Existing backend contracts:

| UI action | Endpoint |
| --- | --- |
| Explicit Career Conversation Send | `POST /api/career-questions` with `{career_id, question}` and optional supported profile fields |
| Browse catalog | `GET /api/job-families`, `GET /api/occupations?family_id=...`, `GET /api/occupations/{id}` |
| Map existing recommendation to specific job | `GET /api/occupation-mappings` (Data Analyst has no assumed Data Scientist mapping) |
| Stateless occupation roadmap preview | `POST /api/occupations/{id}/roadmap` with optional student profile |
| Stateless legacy-career roadmap preview | `POST /api/roadmaps` with `{career_id, ...profile}` |

Render `metadata.status=deterministic` as **Catalog guidance — not an AI-generated answer**; `ai_generated` as a draft requiring review; `blocked` as unavailable. Do not automatically retry 429, malformed output, or refusals. Keep the catalog's unverified national-wage notice and evidence gaps visible. Only send quiz/goals with appropriate student consent. Provider keys must never enter frontend configuration or source.

## Minimal demo RPG contract — implemented, no database

`POST /api/progress` generates a roadmap through the **existing** occupation/career coordinator and creates temporary missions. It does not create a second AI integration or save account data. Use this once when the student explicitly starts their roadmap; do not first generate a separate preview and then automatically generate it again.

```json
{
  "target_id": "occupation_15_1212",
  "education_level": "High school",
  "starting_point": "Beginner",
  "goals": ["Investigate cybersecurity"]
}
```

Only `target_id` is required. It accepts either a catalog occupation ID or a legacy career ID. Optional profile fields retain existing bounds. Unknown fields (including XP or submitted mission content) are rejected. A blocked/empty roadmap returns 409 instead of fabricated missions. Disabled/unavailable AI can supply the existing labelled deterministic investigation checklist.

Success is **201**:

```text
{
  access_token: opaque secret string,
  progress: {
    id: UUID,
    roadmap: existing RoadmapResponse,
    missions: [{id: UUID, title, instruction, resource_ids, completed: false, xp_reward: 10}],
    total_xp: 0,
    storage: "temporary_memory",
    notice: string
  }
}
```

Keep `access_token` only in the current in-memory UI session, not a URL, analytics event, log, committed fixture, or public/shared store. Send it as `Authorization: Bearer <access_token>` for both operations below. Unlike provider secrets, this capability is intended for the requesting client, but it grants access to that one temporary progress record.

- `GET /api/progress/{progress_id}` returns `ProgressResponse` without returning the token again.
- `PUT /api/progress/{progress_id}/missions/{mission_id}/completion` accepts exactly `{"completed": true}` and returns the updated `ProgressResponse`. No undo or client-supplied XP is supported.
- Each unique mission awards **10 server-defined demo XP** once. Repeat and concurrent completion requests are idempotent. The server recomputes total XP from completed missions under a lock. XP is practice encouragement, not occupational suitability, qualification, or evidence of mastery.
- Only mission UUIDs returned in `progress.missions` may be completed. The nested roadmap's `draft_step_*` identifiers remain display-only and are not completion keys.
- Invalid access is 401, unknown/expired progress or foreign mission ID is 404, invalid request is 422, and full demo capacity is 503. Errors retain the existing envelope. Show errors without pretending a completion was saved.

The store is bounded to 256 sessions per process, expires records after 24 hours, and loses all progress on server restart. There is no user account, persistent session, database, or remote write. Completion is self-reported. Display these limits plainly. CORS now permits PUT and Authorization for the already-configured exact frontend origin.

Use **one backend process/worker** for this prototype. Multiple workers/instances would have different stores; do not claim durable progress. Public deployment still requires authentication/abuse controls, a session lifecycle/retention decision, and an approved persistence design if progress must survive restarts. The store does not remove the existing need for globally enforced AI budget limits before public AI enablement.

## Security actions

The credential names previously exposed in `.env.example` were `GEMINI_API_KEY`, `SWARMS_API_KEY`, `PRUNE_API_KEY`, `OPENROUTER_API_KEY`, and `DATABASE_URL` (embedded database password). All require revocation/rotation before further live use or deployment. Values are never repeated here. Rotation has **not** been verified or performed. The templates now have blank credential placeholders; model names and local origins are public configuration. Do not reuse the previously exposed Tiger Data password.

No new provider, database, or paid request occurred in Phase 15. The app can operate with AI disabled and without credentials. Keep `ORQUESTRA_AI_ENABLED=false` and `AI_MAX_REQUESTS_PER_PROVIDER=0` during this integration. No secrets were copied into frontend files; frontend files are unchanged.

## Scope and release gate

Validation: 104 backend tests and 16 frontend tests passed; frontend production build passed. Local frontend/backend compatibility checks passed for 12 cards, three matches, career details, MDC/external resource arrays, CORS, errors, and health. The test server was stopped and frontend files remained unchanged. These checks do not establish completion of Teammate 2's pending UI connections.

Backend additions are `backend/services/progress.py`, request/response models in `backend/job_models.py`, routes/CORS in `backend/main.py`, and `tests/test_progress.py`. The new backend journey test covers cards → match → occupation mapping/details → generated roadmap/progress → idempotent completion → XP retrieval with AI disabled. Existing frontend compatibility checks cover the currently available UI only.

Before deployment: obtain Teammate 2's completed connections and test the full browser flow; rotate exposed credentials; verify free hosting allowances; configure HTTPS frontend/API origins and single-worker backend; retain unverified-source labels; keep live AI disabled until a separately approved successful test. Main and teammate branches remain unchanged. No commit or push is authorized for this phase.
