# Phase 5 — callable AI adapters (draft interfaces)

Existing API routes, deterministic matching, and response schemas are unchanged.
Nothing in `backend/main.py` invokes these adapters. There are no new public AI
endpoints, automatic provider fallbacks, saved profiles, or generated datasets.
The shared API contracts remain drafts pending team approval.

## Provider calls

| Service | Callable methods | Actual destination |
| --- | --- | --- |
| `GeminiService` | `explain_career(context)`, `suggest_roadmap(context)` | Official `google-genai` client, Gemini Developer API |
| `SwarmsService` | `coordinate(context)` | `POST https://api.swarms.world/v1/swarm/completions` |
| `PruneService` | `explain_career(context)` | `POST https://api.withprune.com/v1/chat/completions` |

All methods are synchronous backend service calls. If later called from async
handlers, run them in a worker thread. Keep one shared request budget across
instances; production defaults already share `PROCESS_BUDGET`.

Gemini sends a JSON response schema and output-token bound via the SDK. It returns
validated explanation or roadmap suggestions plus reported token usage. It does
not invent a dollar cost when the provider does not supply one.

Swarms receives a three-agent `SequentialWorkflow`: Career → Education → Roadmap,
with one swarm loop and one loop per agent. Education considers both supplied MDC
and external resources. Each agent receives original context to avoid losing it
between sequential steps. Outputs must contain JSON for all three named agents;
partial, non-JSON, duplicate, or ungrounded outputs fail validation. This is a
real remote swarm request, not three simulated local agents.

Prune uses its gateway bearer key and a model available through the account's
vaulted provider. `usage` and the entire returned `prune_metadata` (including
cost/optimization/receipt fields when supplied) are retained without estimating
missing values. No metadata means unknown, not zero cost. Receipt signatures are
captured but not cryptographically verified by this implementation.

Each `ProviderResult` records its actual provider, model, structured output,
usage, metadata, and `review_required: true`. Swarms usage includes its returned
billing breakdown; it is not attributed to Gemini or Prune. A Prune result records
Prune traffic, not proof of a separate direct Gemini call. No adapter calls a
second provider automatically.

## Context and provenance

`CareerContext` contains an existing `CareerDetail` and interest tags. Both
`mdc_resources` and `external_resources` are passed intact. No adapter creates
resources, job listings, salary fields, XP, or completion records. Structured
outputs may reference only resource IDs and source URLs already in that context;
unknown references and invented HTTP links in prose are rejected.

Model-generated prose and suggested learning steps still require factual review:
schema and reference checks cannot prove every natural-language claim. Outputs
are drafts and are never merged into contributor data or served by current API
routes. Supply verified context and review before publishing. Prompt instructions
explicitly forbid invented career facts and treat contributor text as data.

## Setup and limits

The environment reads process variables, not `.env` files automatically.
`.env.example` contains placeholders only. Install updated requirements into
`orquestra`; `environment.yml` already references the same file. Only `google-genai`
and `httpx` are newly declared direct dependencies; no Swarms, OpenAI, or Prune SDK
is needed for their documented HTTP APIs. Tested SDK: google-genai 1.75.0.

- Direct Gemini: `GEMINI_API_KEY` and an approved `GEMINI_MODEL`.
- Swarms: `SWARMS_API_KEY`, account credits/access, and `SWARMS_MODEL`.
- Prune: `PRUNE_API_KEY`, `PRUNE_MODEL`, and a matching provider key stored in the
  Prune vault. Use the event signup flow for hackathon attribution.
- `ORQUESTRA_AI_ENABLED=false` and `AI_MAX_REQUESTS_PER_PROVIDER=0` block calls by
  default, even if keys exist. After live approval, explicitly enable and choose
  a small nonzero request budget. No model is silently selected for you.
- `AI_MAX_INPUT_CHARS=12000` bounds serialized prompt/config content (including
  repeated Swarms agent context). `AI_MAX_OUTPUT_TOKENS=1024` bounds each model
  response; a Swarms call has three agents and can consume three such allocations.
- `AI_TIMEOUT_SECONDS=30` bounds transport waits. A timeout does not guarantee
  cancellation or prevent provider billing. No automatic client retries or
  fallbacks are performed; Gemini uses one SDK attempt.

Request counters are thread-safe, process-local, per provider, and shared across
normal service instances. Failed attempts count. Restarting a process resets the
counter; multiple workers have separate counters. These controls are not a durable
dollar-spend cap or a limit on provider-side retries. Configure account-level
budgets before any live use and use a single worker for the initial approved test.

Errors raise `AIServiceError` with a safe `code` and `provider`: disabled,
missing key/model, configuration error, input/request limit, authentication,
billing limit, rate limit, timeout, network failure, provider failure, invalid
response, or ungrounded response. Raw exception bodies/credentials are not exposed.
An invalid output can still incur cost. Usage is returned with successful results;
consult provider dashboards for failed or timed-out calls.

## Invocation after live approval only

```python
from backend.integrations.common import AIServiceError
from backend.integrations.gemini import GeminiService
from backend.integrations.grounding import CareerContext
from backend.integrations.prune import PruneService
from backend.integrations.swarms import SwarmsService
from backend.models import CareerDetail
from backend.services.data import DataRepository
from pathlib import Path

# Contributor data must exist and be reviewed first. Choose a real career ID.
records = DataRepository(Path("data")).careers()
record = next(item for item in records if item.career_id == selected_career_id)
career = CareerDetail.model_validate(record.model_dump(exclude={"interest_tags"}))
context = CareerContext(career=career, interest_tags=selected_interest_tags)

# Each line below is a separate potentially billable call. Invoke only the
# service/method covered by approval; these are alternatives, not a pipeline.
# result = GeminiService().explain_career(context)
# result = GeminiService().suggest_roadmap(context)
# result = SwarmsService().coordinate(context)
# result = PruneService().explain_career(context)
```

## Verification and remaining approvals

Run `conda run -n orquestra python -m unittest discover -s tests -v`.
Tests use synthetic context and fake keys, block socket connections, mock HTTP
responses, and exercise actual Gemini SDK serialization through a mock transport.
All 18 Phase 4 tests remain in the suite. No paid request has been sent.

Before live validation: obtain the three accounts/keys, select accessible models,
set account spending limits, provide grounded contributor data, and approve the
specific test calls. Before frontend integration: approve AI response schemas,
authentication/authorization, persistent budgets, error-to-HTTP mapping, and which
draft results may be published. These are not additions to the shared API contract.

## Official references checked for Phase 5

- [Google Gen AI SDK](https://googleapis.github.io/python-genai/)
- [Swarms Cloud](https://cloud.swarms.world/) and
  [swarm-completions reference](https://docs.swarms.ai/docs/documentation/multi-agent/swarm_completions)
- [Prune hackathon setup](https://www.withprune.com/docs/hackathon)
