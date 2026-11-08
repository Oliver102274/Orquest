# Sponsor integrations — offline validated, live verification pending

Phase 20 changes are isolated on `codex/sponsor-api-integrations`. No production
settings, frontend, MDC research, database, or Render configuration were changed.
No sponsor request was made during development. Mocked success is not live evidence.

## Existing architecture and what changed

- Swarms uses the actual `/v1/swarm/completions` API: Career explains evidence and
  interest alignment; Education selects supplied resources; Roadmap proposes skill
  practice and project missions. One SequentialWorkflow, three agents, one loop.
  Each now requests its existing Pydantic JSON schema via `llm_args.response_format`.
  All three outputs must validate and cite only supplied resource IDs/URLs. No XP
  is awarded, no browsing tools are attached, and no fallback models are supplied.
- Prune uses its actual OpenAI-compatible gateway, retaining `usage` and
  `prune_metadata` including the receipt signature when returned. Shield rejection
  headers become allowlisted safe error categories; refusals and truncation fail
  closed. Missing receipts/costs remain unknown, never fabricated as zero.
- OpenRouter already enforces zero prompt/completion/request pricing, structured
  parameters, no provider fallbacks, no plugins, and no retries (including 429).
  The existing documented free-only router remains compatible; the new controlled
  demonstration requires a pinned `vendor/model:free` entry instead.
- `SWARMS_ENABLED=false` and `PRUNE_ENABLED=false` add independent opt-ins. Even
  explicit flags cannot enable sponsors in public demo mode. Sponsor adapters are
  not added to the production coordinator or public routes. Gemini and local
  catalog fallback are unchanged. Existing general AI opt-in and quotas still apply.

## ONE controlled request per provider — only after explicit approval

Run from the integration worktree on this feature branch, in Conda `orquestra`.
Use a local ignored `.env`; never paste keys in commands, docs, screenshots or chat.
Keep `ORQUESTRA_PUBLIC_DEMO=false` locally. Do not change Render settings.

Configure only the chosen provider's private `SWARMS_API_KEY`, `PRUNE_API_KEY`, or
`OPENROUTER_API_KEY`, and its corresponding `*_MODEL`. Do not copy production keys
to output. Ordinary sponsor calls additionally require their `*_ENABLED=true` flag,
`ORQUESTRA_AI_ENABLED=true`, and a positive `AI_MAX_REQUESTS_PER_PROVIDER`.
The manual command explicitly scopes those settings in memory for one provider.

Dry-run (no network; substitute swarms, prune, or openrouter):

```powershell
python -m backend.integrations.sponsor_check swarms
```

Only after the exact model, account restrictions and costs below are checked and
the user approves, append BOTH flags to that same command:

```powershell
python -m backend.integrations.sponsor_check swarms --live --confirm-zero-out-of-pocket
python -m backend.integrations.sponsor_check prune --live --confirm-zero-out-of-pocket
python -m backend.integrations.sponsor_check openrouter --live --confirm-zero-out-of-pocket
```

These are three separate approval scopes; do not run them as a batch. Each command
makes one HTTP attempt with a 60-second timeout, at most 16,000 serialized input
characters and 512 output tokens per agent (Swarms: three agents, up to 1,536 output
tokens). It reuses the verified Cybersecurity MDC demo context, stripping unverified
occupation requirements and unrelated catalog records. There is no polling, retry,
provider fallback or background task. A timeout may still consume provider credits;
never rerun automatically. Process quotas reset on restart and do not enforce account billing.

Success means schema-valid, grounded outputs, not merely HTTP 200. The command
prints numeric usage/cost fields and receipt presence only. Its Python `execute()`
result retains full provider metadata for local inspection; use the provider's
dashboard for a redacted judging screenshot. Receipt presence is not cryptographic
verification; use Prune's receipt verifier. No raw provider body is logged.

### Swarms prerequisites and cost

Confirm the reported $55 is **API-spendable** credit, not `free_credit`; confirm
no recharge/payment exposure. Pick an available schema-compatible model and obtain
its current price. `gpt-4.1-mini` is documented as supporting structured outputs,
but availability and price must be checked for this account before approving it.
The existing template model is not assumed free merely because Gemini has a free
tier directly. One three-agent run costs $0.03 plus token costs with the published
15% service fee; no precise total is known until the model is pinned. Documented
OpenRouter free models through Swarms waive token/agent fees, but still require a
$1 spendable balance. Confirm gateway retry behavior before approval: our client
does not retry, but an HTTP attempt can contain several agent generations.

Sources: [API and response format](https://docs.swarms.ai/docs/documentation/multi-agent/swarm_completions),
[structured outputs](https://docs.swarms.ai/docs/documentation/capabilities/swarms_api_tools),
[pricing and credit types](https://docs.swarms.ai/docs/documentation/resources/pricing).

### Prune prerequisites and cost

Confirm event attribution, remaining gateway allowance, and no subscription or
recharge exposure. Vault a provider credential in Prune; the local key is Prune's
key, never the upstream secret. **Gateway credits do not cover upstream usage.**
For $0, confirm a genuinely free upstream route (for example the existing unbilled
Gemini project) AND Prune's exact supported model ID with the sponsor; do not assume
the template `gpt-4o-mini` is free. Keep this test blocked until that is confirmed.
Configure Shield model allowlist, daily spend/token caps and rate limits in its
dashboard, and disable optional routing, retries, cache/embedding/judge features
that could add upstream calls. A zero cap may block every call; do not weaken a cap
merely to obtain a receipt. Expected out-of-pocket cost is $0 only after BOTH layers
are confirmed; otherwise unknown, so do not run. Inspect the Requests dashboard and
signed receipt after one successful call. Never retry a Shield rejection.

Sources: [hackathon setup and upstream billing](https://www.withprune.com/docs/hackathon),
[Shield controls](https://www.withprune.com/docs/security),
[safe rejection codes](https://www.withprune.com/docs/errors).

### OpenRouter prerequisites and cost

Pin `OPENROUTER_MODEL` to a currently listed `:free` variant with structured-output
support. Confirm account/key spend controls are $0, no recharge, and free quota
remaining. No particular currently available model was authenticated or tested in
this phase. Expected model charge: $0; unsupported parameters, unavailable models
or 429 stop immediately. Never remove the zero-price or require-parameters guards.

Source: [official free-model routing rules](https://openrouter.ai/docs/guides/routing/model-variants/free).

## Honest judging claims

After a successful Swarms request with validated outputs and recorded usage, we
can demonstrate genuine three-agent orchestration. After a successful Prune call
and verified receipt, we can demonstrate gateway/Shield/receipt integration (not
claim measured savings without evidence). After a valid OpenRouter response, we
can demonstrate free-model structured guidance. None proves the others were used.
Prune's event documentation requests a real call and receipt screenshot. Exact
Swarms/OpenRouter prize eligibility was not established from official event rules;
confirm with organizers before selecting challenge categories. Current status for
all new demonstrations: **not live verified**.
