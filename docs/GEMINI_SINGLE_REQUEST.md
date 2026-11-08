# Gemini single-request readiness — November 7, 2026

Use the existing `backend.integrations.live_check` diagnostic and `GeminiService`, not the web app. No new provider integration is needed. Google lists stable `gemini-3.1-flash-lite` with free input/output on the Gemini Developer API Free Tier:

- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/billing

## Required checks before any live command

Use a rotated Gemini key in this integration worktree's ignored `.env`, never a previously exposed key. In Google AI Studio, verify **that exact key's project** shows Free Tier. In its Google Cloud Billing settings, verify it has no linked billing account. Do not activate billing, add a payment method, or rely on budget alerts/spend caps as a zero-cost guarantee. Availability is region/project/quota dependent. If eligibility is unclear, stop.

The code cannot independently verify billing status offline. `GEMINI_FREE_TIER_CONFIRMED=true` and `--confirm-unbilled-project` are operator attestations, not Google confirmations. The API key inherits project billing; there is no free-only request switch. A mistaken attestation on a paid project can incur charges even with this model. Do not run until these checks and the user's approval are complete. Free-tier inputs may be used to improve Google's products; the fixed test contains only public MDC context, no student personal information.

Local `.env` settings (credential value omitted):

```dotenv
GEMINI_API_KEY=<rotated key stored locally only>
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_FREE_TIER_CONFIRMED=true
ORQUESTRA_AI_ENABLED=false
AI_MAX_REQUESTS_PER_PROVIDER=0
```

Set the confirmation only after the manual checks. The diagnostic pins its model and enables one request in its own process; it does not enable web-app/background AI. Existing shell variables take precedence over `.env`; make sure they do not select an old key. Do not print keys while checking.

From `.integration/phase10`, first run this **offline** preview:

```powershell
conda run -n orquestra python -m backend.integrations.live_check gemini
```

Only after approval, the exact **live** command is:

```powershell
conda run -n orquestra python -m backend.integrations.live_check gemini --live --confirm-unbilled-project
```

It asks Gemini to name the supplied MDC Cybersecurity educational option, describe it as an option rather than a mandatory degree/job guarantee, and cite the official source. It sends only that fixed verified demo resource, not the occupation catalog or private profile data.

Limits: one `generate_content` call, one candidate, 512 maximum output tokens, 30-second timeout, SDK `attempts=1` (zero retries), no coordinator/provider fallback, tools, search, caching request, database, streaming, or background job. Other provider keys are removed from the diagnostic settings. Re-running the command is a new attempt; never retry automatically.

Input is capped locally at **4,000 serialized characters** including system instruction and response schema (roughly 1,000 English tokens, not an exact tokenizer guarantee). Gemini has no per-request `max_input_tokens` setting here. A remote `count_tokens` call is deliberately avoided to keep exactly one API request; no exact input-token bound is claimed. Oversized input fails before creating the SDK client.

Expected result: a JSON `QuestionResponse` with the existing target occupation, nonempty answer, supplied source/resource references only, and `metadata.status=ai_generated`, `provider=gemini`. Pydantic and reference checks must pass. Errors return safe codes; failed validation, quota, timeouts, or refusals end the command without another request. Normal app chat continues to use the existing Gemini → free OpenRouter → deterministic chain and safety-refusal behavior; the diagnostic intentionally tests Gemini alone.

Expected charge is $0 **only for a confirmed unbilled Free Tier project**. This diagnostic does not prove billing status or report a provider-verified cost. No live test has been performed in this phase.

## Diagnosing the subsequently reported `safety_refusal`

The old adapter used that label for (1) any Google prompt block reason, (2) safety/blocklist/prohibited-content/SPII/recitation/image-safety candidate finish reasons, and (3) **every HTTP 400 SDK error**. The third case was a local classification bug: 400 can mean invalid request/schema parameters or unmet free-tier prerequisites. The original output discarded its status, so the actual cause cannot be recovered from that error alone. The fixed prompt is a short question about the supplied public MDC option. JSON/Pydantic failures are `invalid_response`; invented references are `ungrounded_response`, neither was labelled `safety_refusal` by parsing.

The adapter now distinguishes `invalid_request` and `failed_precondition` from Google content blocks. All remain terminal for the coordinator (no automatic provider fallback); filters, prompt, schema, retry count, and safety-block handling are unchanged. The manual CLI includes sanitized `diagnostics` on adapter failures: category, numeric HTTP status when the SDK provides it, allowlisted Google API status, prompt block reason, and candidate finish reasons. Unknown enums become `UNKNOWN`. Successful SDK generation objects do not expose HTTP status in the installed version, so that field is null rather than guessed. No error message, prompt, headers, raw response, API key, or free-text block explanation is logged.

129 backend tests pass, including mocked HTTP 400/precondition, prompt/candidate safety blocks, truncated JSON, invalid references, no fallback, and redaction. No further live request was made. Reference: https://ai.google.dev/gemini-api/docs/generate-content/api-errors and https://ai.google.dev/api/generate-content.

## Phase 17.2 — GenerateContent schema compatibility

Captured the installed google-genai 1.75.0 SDK's actual HTTP serialization using a fixture API key and `httpx.MockTransport`; no Google request was sent. The request was POST `/v1beta/models/gemini-3.1-flash-lite:generateContent` on `generativelanguage.googleapis.com`, with `contents`, `systemInstruction`, and `generationConfig`. Candidate count 1, output cap 512, and JSON MIME type were correct. The incompatible field was `generationConfig.responseSchema.additional_properties=false`, emitted from our Pydantic `extra="forbid"` configuration. The documented legacy `Schema` message does not include that field.

Changed only the schema transport to `response_json_schema=schema.model_json_schema()` and explicitly pinned the already-used `v1beta` version. The real SDK now sends `generationConfig.responseJsonSchema.additionalProperties=false`, using the documented JSON Schema route. Full Pydantic validation, including nonempty text and forbidden extra fields, plus reference and safety checks still run locally. Unsupported schema constraints are not assumed to be enforced by Google. Model, limits, prompts, safety settings, and zero-retry behavior are unchanged.

Sanitized diagnostics now include field paths from Google `BadRequest.fieldViolations` and known unknown-field names. Only allowlisted schema/request field names and bounded numeric indices can be emitted; unknown paths become `UNKNOWN_FIELD`. Descriptions, values, error text, headers, and private content are never printed. The concrete wire incompatibility is fixed; without Google's original field-level detail or another approved live response, it cannot be proved to be the only cause of that particular 400. One additional controlled test is reasonable only after approval and the same unbilled-project checks.

References: https://ai.google.dev/api/generate-content (GenerationConfig / Schema) and https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite. No dependency upgrade, paid model, frontend edit, or dataset change was needed.

## Phase 17.3 checkpoint

The user reports that the subsequent real Gemini smoke test succeeded, returning structured AI-generated Cybersecurity Analyst guidance with the verified MDC resource reference. No additional live request was made for this checkpoint. Private `.env` contents and the successful model/schema configuration were preserved.

Frontend Send calls `POST /api/career-questions`; the route uses `JobFirstCoordinator.answer`, which selects `GeminiService` when AI is enabled, free-tier eligibility is confirmed, the model is allowlisted, and the process request budget and key are configured. Frontend validation accepts `provider=gemini` and displays the AI-generated draft label. Existing mocked tests cover this routing and response contract. The single-request diagnostic enables AI only within its own process; success there does not automatically enable the web backend. Use `python -m backend.run_local` to load this worktree's ignored `.env`, or supply environment variables explicitly to the deployed server. Do not enable live requests without the required free-tier and budget checks.

Remaining deployment limitations: demo-only login, process-memory XP (single worker; no durability), unverified occupation salary/reference data, HTTPS/origin/hosting configuration, and verified credential rotation plus public AI abuse/budget controls. This checkpoint does not add account authentication, database persistence, or deploy anything.
