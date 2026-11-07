# Phase 8 — setup and live-test preparation (no live requests)

## Verified local/Git state

- Branch: `feature/orquestra-backend`.
- Local HEAD and the live GitHub feature-branch ref both equal
  `8cb0b2bb58406b36a552b001e934c6a4cfdda197`. Phase 7 is pushed.
- The working tree was clean before this preparation document was added.
- Remote `main` is now `e3672ff6acb1c78318a37c90962c2cfa3ca02550`; it was not
  fetched, merged, or substituted for the backend branch.
- All 49 tests passed again in `orquestra`. No provider request was made.
- `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `SWARMS_API_KEY`, and `PRUNE_API_KEY`
  are absent from the inspected process and local `.env` configuration. Values
  were never displayed. `.env` is ignored and untracked. AI is disabled and Gemini
  free-tier confirmation is false.

## Account eligibility: public offers are not account confirmation

| Provider | Published option | What must be confirmed before approval |
| --- | --- | --- |
| Gemini | `gemini-3.1-flash-lite` has a free API tier | Key belongs to an eligible project with no billing activation, quota remains, and the model is accessible |
| OpenRouter | `openrouter/free` / `:free` models; free variants need no credit purchase | Free account/key works without a payment method or top-up; free quota remains |
| Swarms | $5 signup credit advertised; standard swarm endpoint on Free | Actual remaining promotional balance covers the full test, no chargeable overage or automatic recharge |
| Prune | SharkByte signup flow and optional event plan coupon; provider keys are vaulted separately | Gateway allowance AND a documented free/subsidized underlying provider route; a Pro coupon alone does not cover model inference |

Official references checked for this phase:
[Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing?frmapp=yes),
[OpenRouter free models](https://openrouter.ai/collections/free-models),
[Swarms plans/credit](https://cloud.swarms.world/pricing),
[Prune SharkByte setup](https://www.withprune.com/docs/hackathon).

No private dashboard or balance was authenticated. The published OpenRouter free
variant quota is 20 requests/minute and 50/day without purchases; do not top up
to raise it. No specific hackathon credit for Gemini or OpenRouter was verified.
Swarms' general signup offer is not proof of a separate hackathon grant. Prune's
existing `gpt-4o-mini` example is not proven free and must remain blocked under
the $0 policy. Ask the sponsor about a funded provider route, without buying one.

## Exact secure setup steps

1. In Google AI Studio, use API Keys to create a key for an eligible **unbilled**
   project. Do not click billing activation or provide payment information.
2. In OpenRouter, create a key under Settings → API Keys on the free account;
   use `openrouter/free`. Do not buy credits, enable paid routing, or add BYOK.
3. In Swarms Cloud, open API Keys and create a key; check promotional credit in
   the dashboard. If it requires payment or has no credit, leave this test blocked.
4. Open Prune via the SharkByte link in its official hackathon guide. Create a
   key under Connect → API Keys. Do not vault a paid provider merely to complete
   setup. Confirm a zero-out-of-pocket provider route with the sponsor before
   configuring Connect → Providers. No coupon is assumed to supply model tokens.
5. Edit the ignored `.env` directly in your local editor. Fill only the keys you
   obtained. Do not paste keys into chat, command arguments, logs, or screenshots.
   Retain the following configuration until eligibility and approval are confirmed:

```dotenv
GEMINI_API_KEY=
OPENROUTER_API_KEY=
SWARMS_API_KEY=
PRUNE_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
OPENROUTER_MODEL=openrouter/free
SWARMS_MODEL=gemini/gemini-3.1-flash-lite
# Leave unset until the sponsor confirms a genuinely free provider route:
PRUNE_MODEL=
ORQUESTRA_AI_ENABLED=false
GEMINI_FREE_TIER_CONFIRMED=false
AI_MAX_REQUESTS_PER_PROVIDER=0
```

Update existing lines instead of adding duplicates. This workspace is under
OneDrive: `.gitignore` does not prevent cloud sync. For strictly local storage,
use a private unsynced env file with the helper's `--env-file` argument. The helper
loads that file; the running FastAPI application still reads process variables.

Offline checks, safe before approval:

```powershell
conda run -n orquestra python -m backend.integrations.verify gemini
conda run -n orquestra python -m backend.integrations.verify openrouter
conda run -n orquestra python -m backend.integrations.verify swarms
conda run -n orquestra python -m backend.integrations.verify prune
```

These only report booleans, not validity or account eligibility. `--live` remains
locked. Do not enable AI or remove that lock during this preparation phase.

## Minimal live tests prepared for approval

Use only `tests/fixtures/ai_diagnostic.json`, never student data or fabricated
career facts. Each approved provider gets one explicit service call, no retries,
512 output tokens per model, a 60-second transport timeout, and a one-request
budget. A timeout does not guarantee server cancellation; inspect account usage
before considering another request. Request counters reset between processes.

| Provider | Prepared call | Required success evidence | $0 condition |
| --- | --- | --- | --- |
| Gemini | `GeminiService.suggest_roadmap(context)` | Valid `steps`/`source_urls` JSON; diagnostic has no evidence, so expect empty steps and URLs; usage reported | Eligible unbilled free tier |
| OpenRouter | `OpenRouterService.explain_career(context)` | Valid insufficient-evidence explanation, empty references, returned usage/cost checked | Free route and zero prompt/completion/request price ceilings retained |
| Swarms | `SwarmsService.coordinate(context)` | Career, Education, Roadmap outputs; job ID and usage/billing breakdown | Existing free grant covers one three-agent run, including agent fees; no personal charge |
| Prune | `PruneService.explain_career(context)` | Valid explanation, gateway usage, cost metadata and signed receipt, dashboard request | Both gateway and upstream costs covered by confirmed free access/grant; currently blocked |

Swarms/Prune remain explicit sponsor tests, never automatic fallback targets.
Reported missing usage is not proof of zero cost. Approval must identify the
provider and confirmed eligibility; the next work would prepare an individually
gated execution path after that approval, not unlock all tests together.

## Fallback and pathway integration boundary

The existing internal chain is Gemini → OpenRouter free → deterministic matching
→ verified static resources. Gemini is skipped without free-tier confirmation.
Known operational failures advance once; safety refusals stop the operation.
Existing `/api/matches` remains deterministic and is not yet wired to this chain.

For career pathways, propose a separately reviewed generation endpoint/service:

1. Load a selected stable career ID, student interest tags, and verified MDC and
   external resources through the existing data layer. Keep current endpoints
   and response formats unchanged.
2. Teammate 3 supplies the researched pathway-generation prompt and its version.
   Agree on required variables and output schema together. We own the Gemini
   adapter, coordinator, validation, timeouts, and budget enforcement; we do not
   author their domain prompt or a hardcoded career tree.
3. Extend the coordinator to pass the approved versioned prompt into Gemini's
   structured roadmap call. Current generic diagnostic instructions are not a
   substitute for Teammate 3's prompt.
4. Extend OpenRouter with the same roadmap schema before claiming pathway-level
   AI fallback: today its adapter and the fallback chain generate explanations.
5. Validate every resource reference against supplied records and preserve both
   resource categories. Return source attribution and draft/review status. If AI
   is unavailable, return existing matches/resources with an explicit pathway-
   unavailable state, not a fabricated tree. Safety refusals remain terminal.

Endpoint names, prompt handoff, result schema, persistence, and frontend display
need team approval. This phase only identifies that connection; it implements no
new endpoint, prompt, tree, or collaborator dataset.
