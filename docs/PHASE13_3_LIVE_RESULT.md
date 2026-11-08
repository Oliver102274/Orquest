# Phase 13.3 live validation

Fetched origin without merging. No newer branch tips were found. Work stays on `codex/phase10-integration`; all existing catalog, structured-output fixes, and uncommitted files were preserved.

The integration `.env` contains the OpenRouter key; no credential values were displayed. One read-only authentication/budget check (`GET /api/v1/key`) returned HTTP 200, limit $0, remaining limit $0, usage $0, and free-tier status. This metadata check is separate from generation and performs no inference.

Exactly **one generation POST** was sent to the existing OpenRouter chat endpoint. Requested model: `openrouter/free`. The free router supports feature-aware structured-output selection according to [official documentation](https://openrouter.ai/docs/guides/routing/routers/free-router). The request included strict `Explanation` JSON schema, `require_parameters=true`, zero price ceilings, `allow_fallbacks=false`, a 512-token cap, and an HTTP transport with zero retries and a guard prohibiting a second request.

The question asked for the supplied MDC option for the Cybersecurity Analyst target, with a source and no mandatory-degree or employment guarantee. Context included only the existing reviewed MDC demo; unverified catalog requirements/salary claims were not treated as evidence.

## Result

- HTTP **429**; adapter classified it as `rate_limited`.
- No responding model, generated content, finish reason, usage, or cost was reported.
- Pydantic answer/envelope validation could not run because there was no completion. This was an availability/rate-limit failure, not an observed JSON-format failure.
- The response does not establish whether the limit was account-level, shared free capacity, or provider-specific. No diagnostic or inference retry was made.
- Reported generation cost is **unavailable**, not an asserted numeric zero. The key and request were constrained to $0/free-only usage.

A sanitized response summary (no headers or credentials) is retained locally in ignored `.integration/phase13_3_response.json`. No API response text was invented or shown as a real answer. No Gemini, Swarms, Prune, database, paid model, or automatic fallback request occurred.

## Next UI steps

Teammate 2 can connect the existing Career Conversation UI to `POST /api/career-questions` and render `metadata.status`/`provider` explicitly. Render `deterministic` as catalog guidance rather than an AI answer, and show loading/error/unavailable states without automatic retries. Existing verified resources and deterministic matching remain available. Specific-job roadmaps use `POST /api/occupations/{occupation_id}/roadmap`; contracts are documented in the Phase 11 and 13.2 handoffs.

A successful live structured answer remains unverified. A later controlled request requires fresh approval after free-tier availability is checked. No commits, pushes, merges, or teammate frontend edits were performed.

Offline verification completed: **99 backend tests and 16 frontend tests passed**, including deterministic/provider-failure fallback and the real local client/API compatibility smoke test (12 cards, three matches, career details/resources, CORS/errors/health, and navigation). The temporary local server stopped. No additional generation was used for testing.
