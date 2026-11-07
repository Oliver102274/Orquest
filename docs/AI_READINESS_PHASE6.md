# Phase 6 — readiness and proposed live verification

**Superseded by [Phase 7's strict $0 policy](FREE_AI_PHASE7.md). Do not execute
the historical live-test/payment-dependent plan below. The helper now locks
all `--live` calls.**

Reviewed November 7, 2026. No provider API calls, model-list calls, credit checks,
or paid requests were made. Only public official documentation was consulted.
Existing adapters and career endpoint formats are unchanged; contracts remain drafts.

## Credential audit and secure setup

At inspection, all three keys and model variables were absent from the current
process and Windows user/machine environment, and no project `.env` existed.
An ignored `.env` was created with blank keys, the proposed models below, AI
disabled, and a zero request budget. Presence is not proof of credential validity;
no account balances or model entitlements have been authenticated.

1. Open `.env` in your local editor. Enter keys directly into the corresponding
   blank `GEMINI_API_KEY`, `SWARMS_API_KEY`, and `PRUNE_API_KEY` fields. Do not paste
   keys into chat, screenshots, shell commands/history, or `.env.example`.
2. Google: create a Gemini Developer API key in Google AI Studio on an eligible
   project. Confirm the free tier and the proposed model in your dashboard. Do
   not link paid billing just to complete this check.
3. Swarms: use the API Keys section in Swarms Cloud. Confirm existing credit and
   model access. Standard swarm completions do not need a paid subscription.
   Do not purchase credits or upgrade a plan for this phase.
4. Prune: use the SharkByte signup link from its hackathon docs. In Connect →
   Providers, vault an existing OpenAI provider key for this proposed `gpt-4o-mini`
   test; in Connect → API Keys create the Prune gateway key. The provider key stays
   in Prune's vault, not the project's `.env`. If you lack provider billing/credit,
   treat that as a blocker; do not activate paid service. A Gemini-backed Prune
   alternative would need its gateway model identifier and price reviewed first.
5. Keep `ORQUESTRA_AI_ENABLED=false` and `AI_MAX_REQUESTS_PER_PROVIDER=0` until
   live approval. Leave secrets blank for any unavailable provider.

`.env` is ignored and not tracked. The workspace is under OneDrive: Git ignore
does not prevent cloud synchronization. If credentials must stay strictly local,
put the file in a private, unsynced directory and pass its absolute path with
`--env-file`. Never print or share its contents. The helper accepts literal
single-line `KEY=value` or quoted values, with full-line comments; no interpolation,
inline comments, multiline values, or shell execution. Process variables take
precedence. The FastAPI app still does not automatically load `.env`.

## Proposed models, costs, and prerequisites

Estimates are USD, not spending guarantees. They assume 2,000 input tokens and
at most 512 output tokens per model call, no caching, tools, or search; the Swarms
estimate counts three agents. Actual counts, thinking, provider overhead, account
pricing, and unsuccessful calls may change charges. No free credits are assumed
to exist in your account.

| Provider | Proposed model | Minimal test and estimated charge | Success evidence |
| --- | --- | --- | --- |
| Gemini | `gemini-3.1-flash-lite` | One structured explanation; free on an eligible free tier, otherwise about $0.0013 | Valid explanation JSON, known/empty references, token usage |
| Swarms | `gemini/gemini-3.1-flash-lite` | One sequential Career/Education/Roadmap request, one loop each; about $0.035 including $0.03 agent fees | All three validated outputs, job ID, usage/cost breakdown |
| Prune | `gpt-4o-mini` | One gateway explanation; about $0.00061 provider cost while the gateway free allowance applies | Valid explanation, usage, `prune_metadata` with cost and receipt signature; dashboard request |

Google documents structured output support for the selected model. Its published
standard text rates are $0.25/M input and $1.50/M output including thinking, with
an eligible free tier. Quotas and availability are project-specific; free-tier
data may be used to improve products. This test sends only diagnostic content.
[Model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite?authuser=9),
[pricing](https://ai.google.dev/gemini-api/docs/pricing?frmapp=yes).

Swarms publishes this exact model identifier at $0.2875/M input and $1.725/M
output (15% service fee included), plus $0.01 per swarm agent. Its signup offer is
$5 credit; availability/balance in your account is unverified. The estimates do
not rely on night discounts. Older flat-rate pricing should not be used.
[Model rates](https://www.swarms.ai/blog/swarms-api-dynamic-model-pricing),
[plans and credits](https://cloud.swarms.world/pricing).

Prune's documented gateway example uses `gpt-4o-mini`, so the model name is not
inferred from Swarms. Its Free plan advertises 15K requests/month or 14 days from
the first Optimize receipt; this is gateway allowance, not free model tokens.
Provider costs still apply. An event Pro coupon is optional and not a promise of
provider credits; no coupon was redeemed. GPT-4o-mini rates used above are
$0.15/M input and $0.60/M output. No provider free-credit offer is assumed.
[Prune setup](https://www.withprune.com/docs/hackathon),
[Prune plans](https://www.withprune.com/#pricing),
[model price](https://developers.openai.com/api/docs/models/gpt-4o-mini).

## Prepared commands — dry runs are safe now

From the repository root:

```powershell
conda run -n orquestra python -m backend.integrations.verify gemini
conda run -n orquestra python -m backend.integrations.verify swarms
conda run -n orquestra python -m backend.integrations.verify prune
```

These report only readiness booleans and never call providers, even when keys
exist and AI is enabled. Models must match the reviewed choices for a live test.
Diagnostic input resides solely in `tests/fixtures/ai_diagnostic.json`; it has no
actual career facts or student information, and requests an insufficient-evidence
response with empty resource references. This verifies plumbing, not career quality.

## Only after explicit approval

1. Confirm balances/access and approve which of the three tests to run. The
   combined estimate is about $0.037; propose a $0.05 review threshold, not a
   technically enforced dollar cap. If access requires payment, stop.
2. Set `ORQUESTRA_AI_ENABLED=true`, `AI_MAX_REQUESTS_PER_PROVIDER=1`,
   `AI_MAX_OUTPUT_TOKENS=512`, `AI_TIMEOUT_SECONDS=60` locally for the approved run.
3. Run the matching command above with `--live`, one provider at a time. The
   helper makes one adapter call and cannot increase a zero budget. Swarms still
   executes three agents. Do not loop, batch, or automatically retry commands.
4. Inspect the safe success flags and provider dashboard; Prune should show a
   receipt. Missing usage/receipt metadata is an incomplete verification, not
   proof of zero charge. On timeout or invalid JSON, inspect billing before any
   retry: the original request may have been charged.
5. Restore `ORQUESTRA_AI_ENABLED=false` and `AI_MAX_REQUESTS_PER_PROVIDER=0`.

Each command starts a new process, so local quotas reset between invocations.
Repeated commands can incur repeated charges. Provider account caps remain
necessary for a durable budget. The helper prints no raw provider output, keys,
or receipt contents. No live command has been executed in Phase 6.

## Compatibility

`/api/health`, cards, matches, and career details do not import or invoke provider
adapters. Provider failure therefore cannot change deterministic matching results.
The existing 35 tests are retained, including all original endpoint tests; helper
tests additionally cover offline behavior and configuration gates. No frontend
or contributor files are modified, and no commit/push/merge is performed.
