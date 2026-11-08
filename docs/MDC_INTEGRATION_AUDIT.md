# MDC integration audit — November 8, 2026

## Git and scope

`codex/phase10-integration` was clean and fast-forwarded from `20800c7` to
`6afd714`, merge PR #6, containing Teammate 3's `b7ce213`. The merge modifies
only `data/careers.json`: four MDC resources added, no dependency or career
deletions. All preexisting IDs, tags, descriptions, requirements and sources are
unchanged. The earlier sponsor branch remains at `c402e81`, and the separate
sponsor worktree remains clean at `9b2befd`. Root uncommitted work was untouched.

Corrections and audit tests were prepared on `codex/mdc-integration-audit-fix`,
based on `6afd714`, in `.integration/phase10`. Phase 21.1 authorizes committing
the validated fix and fast-forwarding/pushing the integration branch. Deployment
remains manual. No private configuration was read or changed.

## Exact coverage

| Career | MDC resources | Occupation mapping |
|---|---:|---|
| `career_software_developer` | 2 | `occupation_15_1252` |
| `career_data_analyst` | 2 | None approved |
| `career_cybersecurity_analyst` | 1, demo flag required | `occupation_15_1212` |

Four new source-backed records in `data/careers.json`, plus the preexisting
Cybersecurity record in `data/demo/mdc_pathways.json`: **five distinct program/
concentration records, three supported legacy careers, two supported occupations
out of 115**, with demo mode enabled. The two software resources are concentrations
within Computer Programming and Analysis; five records does not mean five distinct
degree families. Without demo mode: four records, two careers, one occupation.

All five are marked verified with official source URLs and timestamps. JSON and
Pydantic schema validation pass; resource IDs are globally unique across the loaded
MDC/external data. No orphan career/occupation mappings or resource IDs were found.
There are no `data/mdc_pathways.json` or `occupation_pathways.json` files in this
merge. The existing occupation overlay extension remains available for future work.
Data Analyst is intentionally not equated with Data Scientist. The other 113
occupations have no MDC mapping; do not present this as comprehensive catalog coverage.

## Source-content audit and link correction

Official sources support the names and educational topics. No salary or universal
employment requirement was added by this merge. Estimated durations are not guarantees.

- [Business Application Programming](https://www.mdc.edu/businessapplications/):
  official program and programming/database/systems topics; the
  [course guide](https://www.mdc.edu/academics/programs/csg/AS_ComputerProgramming%26AnalysisBusinessApplicationsProgramming_csg.pdf)
  supports the 60-credit total. MDC indexed program information states about two years.
- Mobile Applications Development: the original
  [program URL](https://www.mdc.edu/mobileappdeveloper/) returned a generic academic
  template through the web tool, without program details. This is a content problem,
  not an established HTTP 404. The official
  [course guide](https://www.mdc.edu/academics/programs/csg/AS_ComputerProgramming%26Analysis-MobileApplicationsDevelopment_csg.pdf)
  names the program, 60 credits, Android and iPhone study. Proposed fix changes only
  this resource's `source_url` and verification date. ID/title/mapping remain intact.
  Current admission/availability should still be confirmed with MDC; a published
  course guide is not a promise of current enrollment or delivery format.
- [Business Intelligence Specialist](https://www.mdc.edu/businessintelligence/):
  official A.S. and SQL/mining/reporting/visualization content; indexed official
  information supports 60 credits and approximately two years.
- [Data Analytics](https://www.mdc.edu/dataanalytics/): official B.S., statistics,
  programming, SQL, visualization and machine-learning topics; admissions apply.
- [Cybersecurity](https://www.mdc.edu/cybersecurityas/): existing official A.S.
  evidence supports network defense and incident response. Demo overlay unchanged.

Direct read-only HTTP GET checks used a 15-second timeout per request. All five
original URLs hit ConnectTimeout from this machine. Official pages and the replacement
PDF were retrievable through the web tool. **Direct reachability is inconclusive**:
neither a local timeout nor a reachable generic page proves program content verified.
Check links once from the public browser before submission. No backend request
fetches these sources at runtime, so source outages do not crash guidance.

## Actual data flow

DataRepository reads the merged career resources and external-resource file;
the demo overlay adds Cybersecurity when enabled. JobCatalogRepository transfers
resources only through the two explicit identity mappings. The coordinator filters
for verified status, timestamp and source URL before assembling Gemini context.

Tests exercise the real Gemini SDK serialization through MockTransport for all
three careers and both mapped occupations, for chat and roadmaps. Captured model
input contains the selected target's exact resource IDs, titles and URLs, without
cross-occupation contamination or unverified job requirements. Responses validate,
retain links, and report `ai_generated` / `gemini`. Real production input limits
accept these contexts. This proves request assembly, not live model behavior.

With AI disabled, catalog chat and deterministic roadmaps retain the MDC resources.
Unknown IDs return 404; unmapped occupations return empty MDC arrays and evidence
gaps. Stale/missing-link resources are excluded from AI evidence. Resource-server
unavailability does not trigger network retries or break the API. Existing grounding
tests reject invented reference IDs/URLs, but they cannot guarantee that a live model
never invents prose. No live AI/database calls were made.

Routes verified: GET careers for legacy and occupation IDs; GET occupation details;
POST career-questions, roadmaps and occupation-specific roadmap. GET occupation
details intentionally returns catalog metadata/linked career IDs, not MDC arrays;
consumers use GET `/api/careers/{occupation_id}` or the roadmap endpoint for resources.
No response-contract change is needed.

## Frontend and deployment

The checked-in React UI displays MDC resources and official links in career details
and roadmap/RPG views, shows AI/deterministic labels, and keeps the selected career
through chat/navigation/temporary missions. Local integration tests exercise the
new Software Developer and Data Analyst resources, plus existing Cybersecurity and
occupation selection/mission completion flows. No frontend implementation changed;
Teammate 2's external Base44 work is outside this checked-in audit.

Dockerfile copies the entire `data/` tree; `.dockerignore` does not exclude the new
records or demo file. Render Blueprint selects the integration branch and enables
the Cybersecurity demo. Docker is not installed here, so no container build was run.
The production Vite build, local production application, SPA refresh, health, API
and private-path protections pass. Preserve current manual Gemini settings: a
Blueprint sync can reset its checked-in default AI flags to disabled.

## Validation and release decision

- Original merged code: 142 backend tests passed.
- Proposed audit fix: **149 backend tests**, **39 frontend tests** (35 existing
  plus four local integration cases), and production build passed.
- The initial two new UI tests missed the bubble-summary click; the test interaction
  was corrected without changing UI code, and the complete suite then passed.
- Updated the old integration harness's stale comparison with the pre-MDC teammate
  career branch. Schema validation and before/after data hashes still enforce integrity.
- Credential-pattern scan of tracked/new files and built JS found no matches. This
  does not establish rotation of any historically exposed credentials.

The backend integration is functional. Phase 21.1 rechecked the official mobile
course guide: it identifies the A.S. program (26052), 60 credits, and Android/iPhone
courses. The link replacement is verified and approved for integration. Manually
deploy the validated integration version while preserving existing Gemini settings;
check public links after deployment. No automatic deployment is appropriate here.
Do not claim the new pathways cover all 115 occupations or that this audit exercised
the live deployed Gemini provider.
