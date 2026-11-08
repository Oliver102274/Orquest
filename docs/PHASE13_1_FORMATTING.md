# Phase 13.1 — offline structured-output fix

The Phase 13 response body and finish reason were not retained. Only HTTP 200, the selected free model, usage (100 completion tokens), $0 cost, and `invalid_response` are available. We cannot reconstruct the failed format or prove truncation. Inspection confirmed the old request specified JSON only in the prompt and omitted the API's structured-output parameter. Hitting the 100-token cap was an additional likely constraint, not a proven root cause.

## Changes

- OpenRouter now sends `response_format: {type: "json_schema", json_schema: {name, strict: true, schema}}`, derived directly from the existing Pydantic `Explanation` or `RoadmapSuggestions` model. Nested roadmap objects retain required fields and `additionalProperties: false`.
- `require_parameters: true` remains set, so requests require endpoints supporting the supplied structured-output parameter. `openrouter/free`, zero price ceilings, disabled provider fallbacks, no retry, no model fallback array, and no healing plugins remain unchanged. If no eligible free structured-output endpoint is available, fail safely; do not downgrade to paid or prompt-only routing.
- Local Pydantic validation and source/resource-ID checks still run. No field repair, invented content, or removal of source validation was introduced.
- Explicit `finish_reason: length` becomes `truncated_response`; malformed JSON-object/schema output becomes `invalid_structured_response`. Both stop AI attempts and return labelled local deterministic guidance through the coordinator/matching fallback. They are not added to the set of errors that advance to another AI provider.
- Refusal signals take precedence. Unstructured prose that might be a refusal remains blocked, as do ungrounded references and unexpected cost. This preserves conservative refusal handling while recovering locally from recognizable formatting errors.
- The next diagnostic proposal uses **512 output tokens**, 30-second timeout, one request, and no retries. General application output limits remain configurable (existing default 1024); no local credentials or global AI enablement were changed. The earlier 100-token approval is exhausted; the larger test needs new approval.

Official references: [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs) documents strict schema requests and compatible-provider selection; [free router](https://openrouter.ai/docs/guides/routing/routers/free-router) documents free feature-aware routing. Schema support varies by endpoint and strict mode is not a universal guarantee; live capacity/compliance has not been retested.

## Compatibility and validation

Public career-question and roadmap response schemas remain unchanged for Teammate 2. Formatting failures now return existing `metadata.status=deterministic`, `provider=deterministic`, and an explanatory reason. Invalid AI text is never returned as a real answer. This supersedes Phase 13's broad statement that all malformed output blocks local fallback; ambiguous refusals still block.

All **89 backend tests passed**, including six new mocked cases covering valid chat/roadmap schemas, malformed JSON, missing/extra fields, truncated output, refusal/cost priority, source rejection, and deterministic recovery without a second model request. The existing offline test's expected diagnostic limit was updated to 512.

No live API/database calls, frontend edits, commits, pushes, or merges were made. Existing local work was preserved. Ready to propose one new controlled OpenRouter free request at 512 tokens, expected $0 inference, subject to explicit approval. A fresh attempt may still be unavailable, truncated, or invalid; no automatic retry is authorized.
