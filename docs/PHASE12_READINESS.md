# Phase 12 readiness and approval proposal

No live AI or database request was made. No billing, purchases, migrations, writes, commits, pushes, or merges were performed. Work remains on `codex/phase10-integration` based on `ba704e3`. Fetch found no newer integration/main/frontend commits; the latest swipe branch remains the previously reviewed documentation update. Teammate files are unchanged.

## Configuration observed (values never printed)

| Location | Gemini | OpenRouter | Swarms | Prune | DATABASE_URL |
| --- | --- | --- | --- | --- | --- |
| Original backend `.env` (`../../.env` from integration root) | Present | Missing | Present | Present | Present |
| Integration worktree `.env` | File absent | File absent | File absent | File absent | File absent |
| Current process | Missing | Missing | Missing | Missing | Missing |

The original local settings leave AI disabled with a zero request limit. Gemini's reviewed model is configured, but `GEMINI_FREE_TIER_CONFIRMED` is false. `DATABASE_CREDENTIALS_ROTATED` is not confirmed. Presence does not establish validity, account credit balance, free eligibility, or credential freshness. The database URL was never used, copied, or printed.

The application does not automatically load `.env`. The existing literal environment loader is reused by the new diagnostic helper and excludes database variables. No secret file was edited. To configure locally, use an editor to place the missing OpenRouter key into the ignored original `.env` or a deliberately selected integration `.env`; never paste keys into chat, command arguments, frontend variables, or Git. Keep global AI disabled until a separately approved activation plan. After actual credential rotation, replace the old database URL securely and confirm rotation; do not simply relabel the old value.

## Providers and budget

- **Gemini:** The official pricing page lists `gemini-3.1-flash-lite` text input/output as free on the free tier. The key's project must be checked in AI Studio's API-key/project page and shown as Free, without paid billing. Public documentation and a local flag cannot verify your account. Do not activate billing or use Cloud trial credits as evidence of Gemini free eligibility. See [pricing](https://ai.google.dev/gemini-api/docs/pricing?authuser=1) and [billing](https://ai.google.dev/gemini-api/docs/billing?authuser=1&hl=en).
- **OpenRouter:** Key missing. Use `openrouter/free` with existing zero-price provider limits, no fallback providers or retries. The public free allowance is 50 requests/day and 20/minute for accounts without qualifying purchases; never buy credits to increase it. Verify availability in the account UI. See [official free-model information](https://openrouter.ai/collections/free-models).
- **Swarms:** Existing key and three-agent adapter remain available. The user reports $55 sponsor credits; remaining balance, expiration, model and endpoint entitlement were not verified by an account/API request. Public pricing is model token price +15% and $0.01 per agent, so a three-agent workflow starts at $0.03 credits plus tokens, not a zero-credit call. Keep it separate from normal fallback; no live Swarms test is proposed yet. Confirm sponsor-funded access and no auto-top-up in the dashboard before a separate bounded proposal. [Official pricing](https://www.swarms.ai/pricing).
- **Prune:** Existing key, gateway adapter, and receipt capture are preserved. The user reports 15,000 free gateway requests, but this does not establish free upstream inference. The configured `gpt-4o-mini` route remains blocked from demo use until a sponsor-funded or genuinely free upstream is established. Prune explicitly says the upstream provider is still charged separately. Do not run the documentation's example blindly. [Official hackathon setup](https://www.withprune.com/docs/hackathon).

The job-first coordinator already uses Gemini → free OpenRouter → clearly labelled deterministic guidance. Swarms and Prune remain opt-in sponsor adapters; no duplicate connections or automatic sponsor routing were added. Missing credentials, provider failures, refusals, paid-model rejection, and source-reference validation remain covered by mocked tests. Free availability does not guarantee capacity or valid structured output on a particular attempt.

## Exact AI tests proposed for approval

New helper: `backend/integrations/live_check.py`. It reuses the existing provider adapters and `QuestionResponse` contract. Default is dry-run; `--live` is an explicit approval action, not something run during this phase. The old `verify.py --live` remains locked.

Each test uses one existing Cybersecurity career ID and only the reviewed MDC demo resource. No student personal information, external research lookup, search tool, database query, or full conversation is sent.

Exact question:

> Name the supplied MDC educational option for this target job. Explain briefly that it is an option, not a guaranteed job or mandatory degree. Cite its source.

For **each provider separately**: one request, no retry or cross-provider fallback, maximum serialized input 6,000 characters, maximum output 128 tokens, timeout 15 seconds. Context is assembled from the existing catalog and demo; the helper refuses missing demo evidence. If the response is truncated, invalid, or unavailable, stop and report it rather than spending another request.

| Test | Model | Expected consumption | Expected result |
| --- | --- | --- | --- |
| OpenRouter question | `openrouter/free` | One free-quota request; $0 inference; no Swarms/Prune credits | Valid `QuestionResponse`, `metadata.provider=openrouter`, `status=ai_generated`, answer and references restricted to supplied MDC evidence |
| Gemini question, conditional on project confirmation | `gemini-3.1-flash-lite` | One free-tier request, up to 128 output tokens; $0 only on confirmed eligible free project | Same contract with `provider=gemini`; no invented source/program/degree requirement |

Dry-run commands (already executed safely):

```powershell
conda run -n orquestra python -m backend.integrations.live_check openrouter --env-file ../../.env
conda run -n orquestra python -m backend.integrations.live_check gemini --env-file ../../.env
```

**Only after explicit approval of the corresponding row**, run that command with `--live`. First supply the OpenRouter key; for Gemini first confirm the exact key's project and then set `GEMINI_FREE_TIER_CONFIRMED=true` locally. The helper enables only its isolated settings object with a fresh one-request budget; it does not enable server-wide AI or persist configuration. It prints validated contract data, never keys. Running the command again would be another request and requires a new budget decision. Roadmap live generation is not included in these approvals; roadmap structure is verified through existing mocks.

## Tiger Data readiness

`backend/database.py` already implements the required connection check. It requires explicit approval plus rotation confirmation, uses TLS (default `require`, preserving stronger verification modes), a five-second connection timeout, read-only session and five-second statement timeout, then executes only `SELECT 1`. It never runs at backend startup, and it exposes no migration or general SQL interface. Errors are sanitized.

Do not load the old local `DATABASE_URL` for testing. After the user confirms a newly rotated password has replaced it, securely populate `DATABASE_URL` and `DATABASE_CREDENTIALS_ROTATED=true` in a dedicated process environment. Do not include connection strings in shell history. The current helper deliberately does not load `.env` automatically.

Offline presence check: `conda run -n orquestra python -m backend.database`.

After separate explicit approval: `conda run -n orquestra python -m backend.database --connect`. Expected result: `{"connected":true,"read_only_check":true}`. This consumes one connection and one trivial SELECT against the existing service; exact trial-credit effects depend on the service's running compute policy and cannot be quoted from query size. Confirm remaining trial credits, expiry, and no paid continuation in the existing dashboard. No new service, tables, or writes are authorized.

### Proposed minimal schema — design only, no migration files or execution

| Table | Minimal fields and constraints |
| --- | --- |
| `student_sessions` | UUID `id` PK, unique hashed opaque session token, `created_at`, `expires_at`; no raw password or API key |
| `selected_target_jobs` | UUID `id` PK, `session_id` FK, stable catalog `career_id`, `selected_at`, `active`; at most one active target per session |
| `missions` | UUID `id` PK, `target_job_id` FK, immutable roadmap/version reference, order, title, instruction, resource-ID list, server-approved nonnegative `xp_reward`, nullable `completed_at`; unique target/version/order |
| `xp_events` | UUID `id` PK, session FK, mission FK, nonnegative `amount`, timestamp; unique mission reward event, with amount assigned by server, never client |

Completion and one reward event must be one transaction, checking session ownership and approved prerequisites, locking the mission, and enforcing the unique reward event. Derive XP totals from events, not client-supplied totals. Session identity/authentication, retention/deletion, roadmap versioning, prerequisite rules, rewards, undo semantics, and migration approval remain open. Current `draft_step_1` IDs are response-local and must not become persistent mission IDs. These tables are a proposal, not implemented progression behavior.

JSON files remain authoritative for career data. Guidance, matching, cards, health, MDC resources, and external resources work with no database available. Future persistence failures must not disable catalog exploration; never claim a completion was saved when persistence fails.

## Frontend handoff and status

The existing Career Conversation UI still disables Send and makes no question API call. Teammate 2 must connect it to `POST /api/career-questions`, and add an explicit roadmap request to `POST /api/roadmaps`, using `JOB_FIRST_PHASE11_HANDOFF.md`. Quiz answers remain local; only attach them with the appropriate consent and supported fields. RPG navigation works, but mission completion and XP persistence are intentionally not connected. No teammate frontend was modified.

The deterministic question and roadmap endpoints were tested with the actual catalog, MDC demo enabled, AI disabled, and a database connection function that fails if called. Existing Swipe → Match → Career Details and frontend navigation were exercised through a local server. No live AI or remote database request occurred.

Final results: **82 backend tests passed** (78 preserved plus four offline readiness tests), **16 frontend tests passed**, and **production build passed**. Local test servers stopped. Only the new readiness helper, tests, and this document are uncommitted; application features and teammate files remain unchanged.
