# Job-first guidance — Phase 11 draft contract

Journey: Swipe → Match with Jobs → Investigate Job → Select Target Job → Request Educational Roadmap → future RPG progression. A career ID identifies a target **occupation**, not a live vacancy or guaranteed job offer. No specific degree is assumed mandatory.

Work continues in the preserved `.integration/phase10` worktree on `codex/phase10-integration`, including its uncommitted Phase 10 merge candidate. No merges, commits, or pushes were performed during Phase 11. Main and frontend branch tips are unchanged. The new swipe branch `7972a9c` only adds README/Devpost drafts; those were inspected and left unmerged. No teammate frontend, datasets, or prompts were changed in this phase.

## Backend implementation

- `backend/agents/job_coordinator.py`: `JobFirstCoordinator.answer(career, request)` and `.roadmap(career, request)` resolve job-first context, filter evidence, invoke existing adapters, and return labelled fallback results.
- `backend/job_models.py`: bounded student input and additive response schemas.
- `backend/integrations/grounding.py`: `JobContext` extends the existing context with student starting point, education, preferences, goals, and optional question.
- Existing Gemini and OpenRouter adapters gain question and job-roadmap operations. Their transport, request budgets, timeouts, no-retry behavior, and reference validation are reused. No SDK or provider connection was added.
- `backend/main.py`: two additive POST routes; all existing routes and responses remain unchanged.
- `tests/test_job_guidance.py`: mock provider and endpoint regression cases.

The former generic coordinator Protocol remains compatible for future specialists; the new concrete coordinator implements these two narrow operations. Swarms and Prune are preserved, but are never automatically routed ordinary chat/roadmap traffic.

## Teammate 2: exact HTTP integration

Use the existing configured API base (local default `http://localhost:8000`), JSON content type, and `career_id` from the selected match/detail. Do not send an independently typed job title: the backend resolves the canonical occupation title from its ID. Do not send provider keys or model choices.

### Question

`POST /api/career-questions`

```json
{
  "career_id": "career_cybersecurity_analyst",
  "question": "How can I investigate educational options for this job?",
  "interest_tags": ["security", "investigation"],
  "education_level": "High school",
  "starting_point": "New to cybersecurity",
  "preferences": ["Explore local options"],
  "goals": ["Understand the skills I need"]
}
```

Only `career_id` and `question` are required. Text is trimmed and must be 1–1000 characters; optional scalar text may be null. Lists default to empty: at most 40 snake_case interest tags and 10 preferences/goals each. Unknown fields are rejected. No conversation history is stored or accepted; send each question explicitly. Student text is untrusted context, not system instructions.

Response shape (illustrative deterministic fallback with no available resources):

```json
{
  "target_occupation": {"career_id": "career_example", "title": "Selected occupation"},
  "answer": "AI is unavailable. This is a catalog-based fallback, not an AI answer to your question. No verified educational resources are currently available for this target occupation.",
  "source_urls": [],
  "resource_ids": [],
  "metadata": {
    "status": "deterministic",
    "provider": "deterministic",
    "reason": "insufficient_evidence",
    "review_required": true
  }
}
```

Actual IDs/titles come from the dataset. With verified resources, fallback includes their IDs/URLs and invites investigation; it does not pretend to answer an arbitrary question. With an eligible successful provider, `answer` contains the validated explanation, `status` is `ai_generated`, `provider` is `gemini` or `openrouter`, and `reason` is null. Sources are supplied only when present in the verified input context.

### Roadmap

`POST /api/roadmaps`

Use the same request as above **without `question`**. Only `career_id` is required. Optional profile fields allow AI personalization; omission never implies a particular education level or existing skills.

The exact response fields are:

| Field | Type / meaning |
| --- | --- |
| `target_occupation` | `{career_id, title}` from the catalog |
| `relevant_skills_and_qualifications` | String array of supplied requirements only when the occupation has verified sources; otherwise empty |
| `mdc_pathways` | Existing `Resource[]`: verified candidate MDC options, not mandatory degrees or admissions guarantees |
| `alternative_resources` | Existing `Resource[]`: verified non-MDC options (including other universities when the data owner supplies them) |
| `career_milestones` | Ordered draft `{id, title, instruction, resource_ids}` objects |
| `suggested_missions` | Same ordered steps projected for the future RPG UI |
| `source_urls` | Array of supporting URLs allowed by the supplied verified context |
| `evidence_gaps` | Missing verified requirements/resources or missing student starting information |
| `metadata` | Same status/provider/reason/review contract as chat |

Mission IDs like `draft_step_1` are **response-local display identifiers**, not persistent completion keys. Do not store completion or award XP against them. No XP, completion flags, prerequisite graphs, stored roadmap ID, or database state is returned. Generation is bounded to eight steps. AI-generated ordering works backward from known target-job requirements; deterministic fallback is an investigation checklist, not an AI-personalized plan.

### UI behavior and errors

1. Preserve the current chat component. On an explicit Send action, call the question route with the selected ID and render loading/error state. Do not send unsent drafts automatically, and do not attach unrelated quiz/chat text without the appropriate consent.
2. Display `ai_generated` as an AI draft requiring review; `deterministic` as catalog guidance; `blocked` as unavailable. A blocked result is HTTP 200 with `provider: none`, no generated missions or answer content, and a safe reason such as `safety_refusal` or `invalid_response`. Never retry a blocked result with another provider.
3. On explicit target-job selection/roadmap request, call `/api/roadmaps` and render options, milestones, and evidence gaps. Do not label candidate programs as required degrees or treat suggested missions as completed.
4. Use the unchanged error envelope `{"error":{"code":"...","message":"..."}}`: 422 invalid input, 404 unknown career, 503 missing/invalid dataset or invalid AI configuration. Operational provider failures normally produce HTTP 200 deterministic fallback. Existing matching continues independently.
5. Do not auto-retry guidance requests. Provider quotas are process-local attempt limits shared with other existing adapter calls; failures count. This local demo has no production authentication/rate-limit service. Keep it local until those policies are agreed.

OpenAPI at `/openapi.json` or interactive `/docs` exposes the complete executable schemas. The proposal remains draft until team review; no existing frontend response contract was replaced.

## Grounding and $0 operation

All live AI remains disabled for this phase. Defaults remain `ORQUESTRA_AI_ENABLED=false` and `AI_MAX_REQUESTS_PER_PROVIDER=0`. No credentials are needed for catalog guidance. Live calls require separate approval and verified free eligibility; no paid billing is enabled.

Provider order is existing eligible Gemini → OpenRouter free-only → deterministic guidance. Gemini requires the existing free-tier confirmation and allowed-model policy; OpenRouter retains zero-price provider constraints. Safety refusals, malformed output, and invented reference IDs/URLs stop fallback instead of bypassing refusal. No verified evidence means no model request at all. Never route through Swarms or Prune automatically.

Only verified resources and sources with URLs/timestamps enter the new AI context. Unverified career descriptions and requirements are withheld. Existing public career detail responses remain unchanged. Source-level verification is not a claim-by-claim evidence graph; the content owner must ensure the source actually supports each requirement. Reference validation blocks invented URLs/IDs, but cannot prove every sentence generated by a model is factually entailed. All AI outputs remain drafts requiring review; no live factual accuracy was claimed or tested.

Current three careers have unverified occupational sources, so skills/qualification arrays are empty with an explicit evidence gap. The Cybersecurity MDC demo and supplied verified external resources are available when configured. Programs are options, not required degrees. No salaries, job listings, courses, prerequisites, or university programs were invented. Missing evidence stays missing.

## Teammate 3 handoff

Keep stable career/resource IDs and the existing `Resource` envelope. Continue supplying researched occupation requirements, verified sources, MDC pathways, and alternatives through the current data loader. Richer claim-to-source mappings remain a team contract decision. Disable the MDC demo overlay if adopting its ID into production data.

No Teammate 3 prompts were copied or overwritten. The new adapter task strings are minimal interface instructions for the existing structured output, not a parallel research or dynamic pathway-generation system. The `plan_job_roadmap(context)` boundary can accept Teammate 3's approved generator later while retaining `RoadmapSuggestions` and reference validation. Extend its output contract with the team if prerequisite/skill mappings are required. Do not infer that every job requires a specific degree.

## Local verification

Use the Phase 10 integrated worktree and run the backend with its `data` directory, optional `ORQUESTRA_MDC_DEMO_ENABLED=true`, and AI disabled. Existing Phase 10 startup instructions still apply. Tests use synthetic data/mocked providers; the frontend smoke test uses only loopback HTTP and stops its server.

```powershell
conda run -n orquestra python -m unittest discover -s tests
conda run -n orquestra python tests/manual_frontend_integration.py --worktree . --mdc-demo
```

Remaining work: Teammate 2 wires the existing UI to these additive endpoints; Teammate 3 supplies verified occupation requirements and approved pathway prompts; live free-tier verification requires approval. Persistent missions/XP and database changes are deliberately deferred.

Final verification: **78 backend tests passed**, including all 66 existing cases and 12 new job-guidance cases. **16 frontend tests passed**, including the actual-client/live-local-backend flow through all 12 cards, career details/resources, chat overlay, and RPG navigation. No frontend source changes were made in Phase 11. No live provider or database requests were made. The temporary server stopped and dataset/client hashes remained unchanged. The production build was already verified in Phase 10 and no frontend source or dependencies changed afterward.
