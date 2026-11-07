# Phase 7 — strict $0 fallback (draft internal interface)

No requests were sent, no billing was enabled, and no payment method, subscription,
or credits were added. This supersedes Phase 6's proposed paid verification plan.
The manual verification helper now refuses `--live` for every provider.

## Callable service and compatibility

`CareerFallbackService.recommend(context, request, cards, careers)` is an internal
backend service for a selected career. The caller supplies validated CareerContext,
MatchRequest, and loaded card/career records. It tries:

1. Gemini only with explicit `GEMINI_FREE_TIER_CONFIRMED=true` and the reviewed
   free-tier model `gemini-3.1-flash-lite`.
2. OpenRouter using `openrouter/free` or a literal `vendor/model:free` identifier.
3. Existing deterministic tag matching, with unchanged scores and match objects.
4. Existing static MDC/external resources whose verification status is `verified`
   and which have source URLs and verification timestamps. No matching/resources
   means empty collections, not invented recommendations.

AI remains disabled by default and the request budget stays zero. Missing keys,
disabled providers, exhausted quotas, timeouts, and known operational errors
advance to the next eligible tier, once each. No request is retried. Static
verification labels come from the contributor catalog; the service does not
revalidate factual content or visit source URLs.

The existing HTTP endpoints deliberately remain deterministic and keep their
exact schemas. The fallback service returns a separate internal `FallbackResult`
with `tier`, optional `ai`/`matches`, and both resource arrays. No new HTTP response
contract is assumed approved. Wiring AI explanations into a frontend-facing
endpoint remains a team contract decision. Swarms and Prune are not imported or
called anywhere in this chain; their explicit sponsor adapters remain separate.

## $0 enforcement and Gemini limitation

OpenRouter requests set all three provider price ceilings to zero (`prompt`,
`completion`, and `request`), disable provider fallbacks, and require parameter
support. There is no paid model list, auto router, plugin, search tool, or BYOK
configuration in the request. Invalid/paid model names are rejected before I/O.
If no compatible free endpoint exists, fall back locally. Do not add credits to
raise free limits. Reported nonzero cost is a terminal error, not a retry trigger.

Gemini has no request-level free-only switch: the same model can be billed on a
paid project. Therefore Gemini is skipped unless an operator has explicitly
confirmed the key belongs to a project with **no billing activation**, eligible
for its free tier. `GEMINI_FREE_TIER_CONFIRMED` is an operator attestation, not a
technical billing check or guarantee. Keep it false while that cannot be verified;
the strict-$0 safe path is OpenRouter's zero-price routing followed by local data.
This confirmation is currently absent; no Gemini account was queried. Never
enable this flag for a billed project or as a way to bypass quota exhaustion.

All original provider SDKs remain explicitly callable by backend code, but normal
requests and this automatic chain cannot reach sponsor adapters. Existing manual
live-test commands are locked. Account-level changes outside this application
cannot be detected by a local flag. No code-level claim of guaranteed free Gemini
usage is made.

## Refusals and failures

Gemini prompt blocks and safety-related finish reasons are detected. OpenRouter
refusal fields, content-filter finish reasons, and 400/403 failures are terminal.
Permission denials, unknown errors, ungrounded output, and invalid/empty output
also stop the chain conservatively, rather than potentially retrying an
unstructured refusal on another model. Terminal errors raise sanitized
`AIServiceError`; no automatic local answer is supplied for that same operation.
An unrelated deterministic API request continues to function normally.

Transport timeouts and quotas are covered by mocked tests. HTTP clients do not
follow redirects or retry. Gemini's SDK remains limited to one attempt. Request
budgets are shared per process, not persistent across restarts or workers.

## Settings and offline check

Add to your ignored local configuration only when ready (do not send keys in chat):

```dotenv
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
GEMINI_FREE_TIER_CONFIRMED=false
ORQUESTRA_AI_ENABLED=false
AI_MAX_REQUESTS_PER_PROVIDER=0
```

`conda run -n orquestra python -m backend.integrations.verify openrouter` is an
offline presence check only. The helper loads `.env`; the running FastAPI app
continues to read process variables only. No dependencies were added.

## Official references

- [Free router](https://openrouter.ai/docs/guides/routing/routers/free-router):
  `openrouter/free` selects available free models.
- [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection):
  zero price ceilings and disabled provider fallbacks are explicitly requested.
- [Guardrails](https://openrouter.ai/docs/guides/features/guardrails/overview):
  blocked requests can return 403; these are never sent to another provider.

Remaining blockers: keys/live approval; confirmation of a truly unbilled Gemini
project before enabling its slot; contributor datasets and approved AI-facing
response contracts. The backend and local fallbacks work without AI credentials.
