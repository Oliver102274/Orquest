# Job catalog and dynamic pathways — draft handoff

Work remains in `.integration/phase10` on `codex/phase10-integration`. Fetch found no new remote catalog commit. The supplied local file is **`data/orquest_job_catalog.json`**, not `data/job_catalog.json`; its name and all information were preserved. Both filenames are supported by the loader, but supplying both is rejected as ambiguous. All pre-existing uncommitted work, including structured OpenRouter fixes, remains intact. No merges, commits, pushes, live AI, database actions, or frontend edits occurred.

## Data and verification

All **20 families and 115 occupations** validate and are accessible. Validation checks strict field shapes, unique IDs/SOC codes, SOC-derived IDs, O*NET code consistency, family membership, source-reference integrity, and wage-percentile ordering. It is schema/relational validation, not verification of research claims.

Every supplied occupation has `verified_per_row: false`. The file itself says rows were not independently checked. No salaries, dates, employment projections, education, descriptions, or BLS/O*NET references were corrected, deleted, or promoted to verified. Responses preserve the contributor metadata and add an explicit **United States national figures as reported; not Florida/Miami salaries** notice. Family wages are group figures, not individual job salaries. Typical entry-level education is descriptive and must not be presented as universal qualification/licensing requirements. The reported 2025/2035 dates and amounts still need source review.

`sources` are research references, not a guarantee that the referenced table supports every row. UI must retain the unverified label and not call them verified claims. A row marked verified later must also supply `verified_at` as a timezone-aware timestamp; the content owner must verify the linked sources and factual support before marking it verified. No automatic internet scraping, paid research, or bulk verification was introduced.

## New API contracts

| Route | Response |
| --- | --- |
| `GET /api/job-families` | `{families: JobFamily[], metadata: CatalogNotice}` |
| `GET /api/occupations` | `{occupations: Occupation[], metadata: CatalogNotice}` |
| `GET /api/occupations?family_id=family_01_computer_information_technology` | Same envelope, filtered to the chosen family |
| `GET /api/occupations/{occupation_id}` | `{occupation: Occupation, linked_career_ids: string[], metadata: CatalogNotice}` |
| `GET /api/occupation-mappings` | `{career_to_occupation: object, unmapped_career_ids: string[]}` |
| `POST /api/occupations/{occupation_id}/roadmap` | Existing `RoadmapResponse` shape |

Catalog reads are read-only. Unknown occupation/family is 404, invalid student input 422, missing/malformed catalog 503 with the existing error envelope. Catalog absence does not disable health or existing career endpoints. `/docs` and `/openapi.json` expose complete schemas. The full list is small enough for the current UI; no pagination is required for 115 entries.

Roadmap request example:

```json
{
  "interest_tags": ["security", "investigation"],
  "education_level": "High school",
  "starting_point": "Beginner",
  "preferences": ["Explore local options"],
  "goals": ["Investigate cybersecurity work"]
}
```

Send to `/api/occupations/occupation_15_1212/roadmap`. All body fields are optional, so `{}` is valid. The path selects the canonical occupation; do not send `career_id`, a model choice, or arbitrary resource URLs in this body. Existing `/api/roadmaps` and `/api/career-questions` continue accepting the original career IDs unchanged.

The new roadmap's `target_occupation.career_id` contains the selected **occupation ID**, preserving the response's field name. Treat this as an opaque target ID; use `/api/occupations/{id}` to retrieve it, not `/api/careers/{id}`. No existing career ID was renamed.

## Identity mappings and UI flow

- `career_software_developer` → `occupation_15_1252`.
- `career_cybersecurity_analyst` → `occupation_15_1212`.
- `career_data_analyst` remains unmapped: Data Scientist (`occupation_15_2051`) is not automatically equivalent. The original Data Analyst endpoint and matching still work.

Teammate 2 can keep Swipe → Match → Bubble Explorer → Career Details. Use mappings to offer a specific occupation where identity is clear; otherwise offer explicit family/occupation browsing and selection. After selection, submit the profile to the new occupation-roadmap route and render its existing milestones/missions/resources fields. Families are navigation groups, not targets to send to AI. New occupations do not automatically become scored swipe matches; adding an interest-tag taxonomy for 115 jobs requires research-owner agreement.

The current frontend has not been modified to browse the catalog or call the new route. Existing quiz, navigation, chat draft, and RPG shell behavior is preserved. XP and persistence remain deferred.

## Selected-context dynamic generation

`JobCatalogRepository.guidance_career` adapts exactly one selected occupation to the existing `CareerDetail` context. `JobFirstCoordinator` and existing Gemini/free OpenRouter adapters produce the same structured roadmap; there is no new integration or set of 115 hardcoded roadmaps. Salaries and the other 114 occupations are never sent as roadmap context.

Verified requirements (once supplied) are available as job-first context; unverified descriptions/requirements are withheld by the existing evidence filter. The two mapped occupations inherit relevant existing resources. Cybersecurity keeps its MDC demo when `ORQUESTRA_MDC_DEMO_ENABLED=true`; existing external-resource support is retained. Unmapped occupations get empty resource arrays and explicit evidence gaps, not invented programs or institutions. With no verified evidence, the coordinator skips AI entirely and returns a deterministic investigation checklist.

AI learning suggestions and project practice can be represented as draft missions under the existing schema. They are not claimed to be a course or certification. A mission without `resource_ids` now has an explicit **Suggested activity, not a verified educational resource** prefix. Resource-linked missions reference validated IDs; render links from verified resource arrays, never by constructing URLs from titles or parsing AI prose. Refusals, invented IDs/URLs, paid-model rejection, and local-only formatting fallback remain enforced.

Verified-resource status relies on the content owner's review and timestamps, not a link check on every request. The earlier unresolved Harvard CS50 `/node/79` reference remains a research follow-up; no new assertion of its availability is made. Do not present unverified research references as checked learning links. Research owners must confirm working URLs before publishing verified resources.

## Teammate 3 extension boundary

No MDC research or pathway-generation prompts were overwritten. Besides existing career resources, optional future files can link directly to occupation IDs using existing resource wrappers:

- `data/occupation_pathways.json`: `{"pathways":[{"career_id":"occupation_29_1141","mdc_resources":[Resource]}]}`.
- `data/occupation_external_resources.json`: `{"careers":[{"career_id":"occupation_29_1141","external_resources":[Resource]}]}`.

These files were not generated. Unknown occupation IDs, duplicate mapping entries, and collisions with inherited resource IDs are rejected. Supply stable resource IDs, actual source URLs, verification status, and timestamp. Unverified resources are excluded from AI/roadmap links. Do not duplicate the demo resource when adding production records. Existing prompt hooks and response validation remain available for Teammate 3's approved generator.

## Files and validation

New backend modules: `backend/catalog_models.py`, `backend/services/job_catalog.py`. Updated: `backend/main.py`, `backend/job_models.py` (reusable profile fields, old request contract preserved), and the coordinator's unlinked-suggestion label. New tests: `tests/test_job_catalog.py`. The original catalog remains unmodified.

Tests cover all counts and context preparation for every occupation, identity mappings, lookups, malformed/missing data, mocked selected-only AI, unverified resources, missing MDC mappings, and preservation of the Cybersecurity demo. Remaining blockers are row-level research verification, mapping approval beyond clear identities, broader verified pathways/resources, and frontend wiring. No live AI generation is claimed.

Final validation: **99 backend tests passed**, **16 frontend tests passed**, production build passed, and the existing real local frontend-client/API flow passed. The test server stopped. No frontend file changed. Existing Phase 13.1 safeguards and prior uncommitted files were preserved.
