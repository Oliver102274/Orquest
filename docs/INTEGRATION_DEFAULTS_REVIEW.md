# Phase 2 integration defaults — recommendations only

Review these proposals with the frontend lead and affected data owners before
adopting `API_CONTRACT_DRAFT.md`. No feature behavior is implemented here.
The earlier Phase 2 plan was not available in this chat; this review addresses
the open decisions in the current draft.

| Decision | Recommended initial default |
| --- | --- |
| API conventions | Keep `/api`, snake_case JSON fields, opaque string IDs, named collection arrays, and UTC timestamps. Keep IDs stable across data refreshes. |
| Student identity | Anonymous server-managed session for the demo, with an HttpOnly cookie and server-side ownership checks. A profile ID is not a credential. Defer accounts and personal information collection. Agree on session lifetime and deletion before persistence. |
| Interests | Keep `like`, `dislike`, and `skip`. Reject unknown card IDs and duplicate card IDs within one submission with 422. Omitted cards are unanswered. Treat each submitted profile as an immutable snapshot for repeatable matching. Data owners define tags. |
| Swipe card retrieval | Return the small curated deck as one ordered collection initially. Agree on a maximum deck size; introduce pagination only when needed. The frontend owns presentation and interaction. |
| Matching and roadmaps | Begin with bounded synchronous generation only if measured demo latency is acceptable. Generate on an explicit POST action and store results; GET should retrieve stored results without starting paid work. Agree on the missing generation action before implementation. Move to 202/job polling if latency requires it. |
| Retry and UI states | Distinguish not-yet-generated, ready-with-no-results, and failed states. Define provider timeout/unavailable errors (504/503) and retry behavior. Avoid automatic repeated generation that could duplicate paid calls. |
| Persistence | Use PostgreSQL when the persistence phase begins; do not add a database SDK now. Store profiles, generated results, and completions on the server. Agree on migrations and the data import format with owners first. |
| Mission completion | Keep idempotent PUT completion. Use a unique roadmap/mission completion record and one transaction for completion plus any XP update. Repeated completion returns `xp_awarded: 0`. Enforce ownership and prerequisites server-side. |
| XP | Start with per-roadmap totals computed from completed missions and server-defined rewards. Defer global totals, undo/reset, and reward balancing to review with feature owners. |
| Resources | Always return both resource arrays. Use verified source URLs for published factual claims; keep unsupported facts absent or null. Add a proposed verification status (`unverified`, `verified`, `stale`) so a URL alone does not imply verification. Data owners approve verification and freshness rules. |
| Errors | Adopt the draft error envelope consistently, including validation errors, when feature handlers are implemented. Keep 404/422/409 semantics; do not expose provider secrets or stack traces. |
| Local integration | Standardize on `http://localhost:5173` for Vite and `http://localhost:8000` for FastAPI. Allow the exact frontend origin in CORS; enable credentials if the session-cookie proposal is adopted. Configure deployed origins separately. |
| Compatibility | Keep the draft label until both leads approve. Coordinate breaking changes explicitly. Freeze tested dependency versions before deployment; current ranges are not a lockfile. |

Two gaps deserve agreement before feature work: the draft has retrieval routes
but no explicit generation action, and it cannot distinguish absent results
from an intentionally empty result. Resolve those semantics together rather
than letting each side infer them independently.

Phase 3 adds draft JSON examples and proposed status/ID/tag conventions to
`API_CONTRACT_DRAFT.md`. The proposals address the response-shape gap but still
require team approval; generation actions remain undecided. No contracts have
been finalized and no feature routes have been added.

Technical references supporting the CORS and persistence recommendations:

- [FastAPI CORS documentation](https://fastapi.tiangolo.com/tutorial/cors/):
  origins include scheme, host, and port; credentialed requests need explicit
  origin configuration.
- [PostgreSQL INSERT documentation](https://www.postgresql.org/docs/18/sql-insert.html):
  conflict handling supports unique-record enforcement. A separate XP update
  still needs to participate in the same transaction.
