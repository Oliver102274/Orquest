# API contract — draft for team review

Phase 4 implementation notes and proposed deviations are in
[BACKEND_PHASE4.md](BACKEND_PHASE4.md). The historical route proposals below
remain drafts; consult that document for the currently implemented routes.

**Proposed only. Review with the frontend lead before adoption.** These interfaces
establish communication boundaries; they do not prescribe UI, datasets, agent
design, or progression rules. Only `GET /api/health` exists in Phase 1.

## Conventions to review

- Base path: `/api`; JSON requests and responses; opaque string IDs.
- Collection responses use a named array. Empty collections use `[]`.
- Timestamps, when present, use ISO 8601 UTC. Unknown optional facts use `null`.
- Illustrative field names below are schema proposals, not real career data.
- Draft error envelope: `{"error":{"code":"...","message":"..."}}`.
  Feature error handling is not implemented; FastAPI defaults currently apply.
- Identity, authentication, authorization, pagination, and versioning remain
  undecided. A student ID alone must not authorize access to private data.

## Implemented health endpoint

`GET /api/health` → `200 {"status":"ok"}`.
Liveness only; no external calls or dependency readiness checks.

## Proposed feature endpoints (not implemented)

| Action | Method and path | Proposed request | Proposed success response |
| --- | --- | --- | --- |
| Get swipe cards | `GET /api/swipe-cards` | None | `200 {cards: SwipeCard[]}` |
| Submit interests | `POST /api/interests` | `{responses: [{card_id, preference}]}` | `201 {interest_profile_id}` |
| Retrieve matches | `GET /api/interest-profiles/{interest_profile_id}/matches` | None | `200 {interest_profile_id, matches: CareerMatch[]}` |
| Get career details and resources | `GET /api/careers/{career_id}` | None | `200 CareerDetail` |
| Retrieve roadmap missions | `GET /api/interest-profiles/{interest_profile_id}/careers/{career_id}/roadmap` | None | `200 {roadmap_id, career_id, missions: Mission[], total_xp}` |
| Complete a mission and update XP | `PUT /api/roadmaps/{roadmap_id}/missions/{mission_id}/completion` | `{completed: true}` | `200 {mission_id, completed, xp_awarded, total_xp}` |

The interest profile is a proposed journey identifier, not an authentication
mechanism. Whether it belongs to an account or an anonymous session is open.
Preference values are provisionally `like`, `dislike`, and `skip`; the frontend
and content owners should agree on these and on duplicate/missing responses.

## Proposed response shapes

These are field sketches, not executable models or finalized JSON schemas.

```text
SwipeCard
  id: string
  activity: string
  interest_tags: string[]

CareerMatch
  career_id: string
  title: string
  rationale: string
  matched_interest_tags: string[]

Source
  title: string
  url: string | null
  verified_at: string | null
  verification_status: string  # unverified | verified | stale

Resource
  id: string
  title: string
  organization: string
  type: string                 # taxonomy to agree with data owners
  source_url: string | null
  verified_at: string | null
  verification_status: string  # unverified | verified | stale

CareerDetail
  career_id: string
  title: string
  summary: string
  requirements: string[]
  sources: Source[]
  mdc_resources: Resource[]
  external_resources: Resource[]

Mission
  id: string
  title: string
  description: string
  skill_tags: string[]
  prerequisite_mission_ids: string[]
  xp_reward: integer
  completed: boolean
  resources: Resource[]
```

Every career detail response must include both `mdc_resources` and
`external_resources`, even if empty. Supply source URLs when available; missing
URLs and verification dates must not imply that a resource was verified.
Career claims must be traceable to supporting sources. Do not generate fictional
programs, job listings, or salary figures. Salary fields are deliberately deferred
until the team agrees on source, geography, currency, and reporting period.

## Progress and error semantics to agree on

- The server computes XP; clients never submit an XP total or reward amount.
- Mission completion should be idempotent: repeating the same completion request
  must not award XP twice. `xp_awarded` is the increment for that request;
  `total_xp` is the authoritative total. Atomic persistence is deferred.
- Mission prerequisites, reward values, undo/reset behavior, and whether XP is
  per roadmap or per student need review before implementation.
- Unknown IDs should return 404; invalid input 422; unmet prerequisites 409.
  Authentication and authorization errors depend on the chosen identity model.
- Decide whether matching/roadmap generation is synchronous or returns a job
  with polling, and how loading, empty, provider-failure, and retry states work.
- Agree on card pagination, stable IDs, tagging, source verification rules,
  CORS origins, data retention, persistence, and contract versioning together.

No feature endpoints, scoring, missions, datasets, or AI calls are implemented
by this document.

## Phase 3 JSON proposals — still drafts

The following valid JSON examples describe transport shapes only. All `*_example`
IDs and bracketed text are synthetic placeholders, not a career dataset or factual
recommendations. Rewards illustrate integer types, not approved game balancing.

### Swipe cards and interest submission

```json
{"cards":[{"id":"card_example","activity":"[Activity text supplied by content owner]","interest_tags":["problem_solving"]}]}
```

```json
{"responses":[{"card_id":"card_example","preference":"like"}]}
```

```json
{"interest_profile_id":"profile_example"}
```

### Matches

```json
{"interest_profile_id":"profile_example","status":"ready","matches":[{"career_id":"career_example","title":"[Career title]","rationale":"[Explanation grounded in submitted interests]","matched_interest_tags":["problem_solving"]}]}
```

Propose `status: not_generated | ready | failed`; non-ready results have an empty
`matches` array. `ready` with `matches: []` means generation finished without
matches. A failed result may include the shared `error` object. Unknown profiles
return 404. GET retrieves stored results and never starts paid generation.
Explicit generation POST routes, timeout behavior, retry deduplication, and any
future `pending` state still need agreement before implementation.

### Career details and resources

```json
{
  "career_id": "career_example",
  "title": "[Career title]",
  "summary": "[Source-supported summary]",
  "requirements": ["[Source-supported requirement]"],
  "sources": [{"title": "[Source title]", "url": null, "verified_at": null, "verification_status": "unverified"}],
  "mdc_resources": [{"id": "resource_mdc_example", "title": "[MDC resource title]", "organization": "Miami Dade College", "type": "program", "source_url": null, "verified_at": null, "verification_status": "unverified"}],
  "external_resources": [{"id": "resource_external_example", "title": "[External resource title]", "organization": "[Provider name]", "type": "course", "source_url": null, "verified_at": null, "verification_status": "unverified"}]
}
```

Both resource lists use the same Resource shape, also used by missions. Proposed
resource types: `program`, `course`, `certification`, `internship`, `job`, `guide`.
These types need data-owner approval. `verified` requires a supporting URL and
verification timestamp; a missing source must never be presented as verified.
The null URLs above intentionally make no claims about real programs or listings.

### Roadmap and completion

```json
{"roadmap_id":"roadmap_example","career_id":"career_example","status":"ready","missions":[{"id":"mission_example","title":"[Mission title]","description":"[Mission instructions]","skill_tags":["problem_solving"],"prerequisite_mission_ids":[],"xp_reward":10,"completed":false,"resources":[]}],"total_xp":0}
```

Use the same generation statuses as matches. Before generation, `roadmap_id`
is null, `missions` is empty, and `total_xp` is zero. Unknown profile/career IDs
return 404. A ready roadmap has a non-null ID. Mission prerequisites reference
IDs within that roadmap and must not contain cycles.

```json
{"completed":true}
```

```json
{"mission_id":"mission_example","completed":true,"xp_awarded":10,"total_xp":10}
```

On repeat completion, `xp_awarded` is zero and the total is unchanged. Totals are
proposed as per-roadmap, non-negative integers computed by the server. Clients
must use the returned total rather than incrementing locally. Undo is deferred.

### Stable IDs and shared tags

- Recommend immutable, namespaced IDs: `card_<uuid>`, `career_<uuid>`,
  `resource_<uuid>`, `mission_<uuid>`, `profile_<uuid>`, and `roadmap_<uuid>`.
  Assign content IDs once and store them with source records. Generate profile
  and roadmap IDs on the backend. Do not derive IDs from titles or array indices.
- Treat IDs as opaque strings in the frontend. A renamed item keeps its ID;
  recreated content must not silently reuse an unrelated item's ID. Mission IDs
  stay stable across reads of a roadmap. Decide repeat-generation reuse rules.
- Use one agreed tag registry across `interest_tags`, `matched_interest_tags`,
  and `skill_tags`, with allowed usage recorded for each tag. Some tags may be
  interest-only or skill-only; sharing a registry does not equate the concepts.
- Recommend lowercase snake_case tag keys and separate human-readable labels.
  `problem_solving` above is only a proposed example. Members 3 and 4 define
  vocabulary together with the frontend/backend leads; no registry is created
  here. Never introduce ad hoc tags in generated responses.
- Reject unknown IDs/tags at data validation boundaries, reject duplicate card
  IDs in a submission, and deduplicate tags within arrays. Omitted cards remain
  unanswered. Keep empty arrays as `[]`, unknown scalar facts as `null`, and
  all verification times as ISO 8601 UTC strings.

Approval is still needed for these field names, tag governance, source-to-claim
mapping, resource types, identity/session ownership, generation actions/statuses,
and XP semantics. These examples refine the draft; they do not finalize it.
