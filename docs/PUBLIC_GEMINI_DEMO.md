# Phase 19 — controlled public Gemini demo

No Render settings were changed and no live provider request was made during development. `render.yaml` still defaults to AI disabled. Do not enable it until the **deployed secret's exact Google project** is independently confirmed to be an unbilled Free Tier project; a successful local response does not establish that fact for Render.

## Verified application path

The unchanged frontend sends an explicit `POST /api/career-questions`, accepts `metadata.provider=gemini`, and displays the existing AI-generated draft label. The production coordinator now skips OpenRouter entirely, preserving the original Gemini error reason and going directly to useful catalog guidance for quota/network/provider/configuration errors. Explicit safety blocks, ungrounded responses, and unsafe/invalid outputs remain blocked. There are no automatic retries or paid fallbacks. Swarms/Prune/OpenRouter keys are suppressed by public settings; local integrations are unchanged.

Existing global limits are retained: 20 guidance requests/minute, two concurrent requests, 16 KiB JSON bodies, a maximum configured Gemini budget of five attempts **per server process lifetime**, 6,000 input characters, 512 output tokens, and 20-second timeout. Start with a budget of **one**. Chat, roadmaps, and mission generation share the same atomic Gemini budget; failures count. After exhaustion the app still offers catalog guidance, deterministic roadmaps, and temporary missions/XP. Rate/concurrency overflow returns 429 with no automatic client retry. Restarts, Render cold starts, and deployments reset in-memory counters. These limits control usage, not billing; the unbilled Google project is essential to the $0 requirement.

Production route tests exercise the real Gemini SDK through a mock HTTP transport: AI success, shared quota exhaustion, 429, free-tier precondition failure, missing opt-in, and safety blocks. No real provider or database connection is needed.

## Exact manual Render steps

1. Keep the existing service on **Free**, branch `codex/phase10-integration`, auto-deploy **Off**, and the current Dockerfile/start command (`backend.production:create_public_app`, one worker). Do not change the UI, root directory, database, or other services. No paid upgrade or billing activation.
2. While AI remains disabled, use **Manual Deploy → Deploy latest commit** to deploy this checkpoint. Check `/api/health`. Do not accidentally select `main`.
3. In Google AI Studio, identify the project belonging to the rotated key you will place in Render. Confirm **Free Tier** and confirm **no linked billing account** in that project's Cloud Billing settings. If unknown, paid, region-ineligible, or a card is requested, stop and keep AI disabled. Do not paste the key in chat, screenshots, Git, logs, or frontend variables.
4. Only after that confirmation, put `GEMINI_API_KEY` in Render's backend Environment secret editor. Verify/set these exact values:

```dotenv
ORQUESTRA_PUBLIC_DEMO=true
ORQUESTRA_MDC_DEMO_ENABLED=true
ORQUESTRA_AI_ENABLED=true
PUBLIC_AI_ENABLED=true
GEMINI_FREE_TIER_CONFIRMED=true
GEMINI_UNBILLED_PROJECT_CONFIRMED=true
GEMINI_MODEL=gemini-3.1-flash-lite
AI_MAX_REQUESTS_PER_PROVIDER=1
AI_MAX_INPUT_CHARS=6000
AI_MAX_OUTPUT_TOKENS=512
AI_TIMEOUT_SECONDS=20
```

Leave `OPENROUTER_API_KEY`, `SWARMS_API_KEY`, `PRUNE_API_KEY`, `DATABASE_URL`, and all `VITE_*` secrets unset. Do not upload the local `.env`. The four true AI flags above are operator attestations; the application cannot query/guarantee billing status offline.

5. Save the environment changes and redeploy/restart using Render's controls. Configuration is only effective in the newly started process. This does not itself send a Gemini request.
6. For a separately approved public test, choose Cybersecurity, explicitly Send one question about the supplied MDC option, and confirm the existing AI-generated draft label and verified MDC link. This consumes the single shared attempt; subsequent questions should show catalog guidance. Do not generate a roadmap first if the intent is to reserve that attempt for chat. Do not test quota behavior by making extra live calls during development.
7. To return to the safe unattended default, set `ORQUESTRA_AI_ENABLED=false`, `PUBLIC_AI_ENABLED=false`, and `AI_MAX_REQUESTS_PER_PROVIDER=0`, then save/redeploy. Confirmations may also be reset false. Do not repeatedly restart to bypass quotas. Keep Google and Render billing disabled; never solve a quota error by upgrading.

## Enablement decision

Code is ready for a small supervised demo, but the Render key/project billing status was not verified in this task. **Keep public Gemini disabled until the operator completes step 3.** In-memory limits, local test success, and configuration flags alone do not guarantee $0 usage. The existing public deterministic deployment remains functional and is the safe fallback if verification cannot be completed before submission.
