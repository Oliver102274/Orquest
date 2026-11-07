# Phase 10 integration candidate

All changes live in `.integration/phase10`, branch `codex/phase10-integration`. The original backend worktree remains clean on `feature/orquestra-backend` at `9475c48`. No commits or pushes were made, and main was not modified.

## Sources and merge state

The candidate starts with backend `9475c48`, fast-forwards to `origin/main` `8519b99` (which includes backend Phase 9.5 and swipe branch `a07c3a9`), then combines frontend `a682f60` using `--no-commit --no-ff`. Career data matches `origin/feature/career-resources` `2372979`. The alternate `origin/data/external_resources.json` branch at `6ef5cc8` predates main; the resource file actually comes from main `8519b99`.

The only conflict was `data/cards.json`: frontend contained an older version of the same 12 IDs. Resolution retains the exact Teammate 4 version on main, with richer interest tags. No research content was rewritten. The worktree intentionally remains in a resolved, uncommitted merge state; do not start another merge there. Integration fixes are unstaged for review.

## Connected behavior

- The existing API loads all 12 cards and matches against three actual careers. `math`/`statistics` canonicalization remains in matching only; other tags retain exact matching.
- The isolated frontend now presents all cards instead of truncating to eight. Its corresponding test expectations were updated. No original teammate branch was edited.
- The bubble explorer retrieves career details; the Cybersecurity demo adds its existing verified MDC resource when explicitly enabled.
- The new optional `external_resources.json` adapter validates the contributor's `{careers: [{career_id, external_resources}]}` envelope and appends resources in memory. Seven external resources join by exact career ID. Missing files preserve existing resource lists; bad schemas, unknown career IDs, duplicate links, and resource-ID collisions produce sanitized dataset errors.
- Both resource arrays retain the existing transport schema. MDC and external links display in the unchanged details component.
- Login (demo credentials), swipe, match, explore, chat overlay, optional quiz, journey screen, RPG shell, and return navigation are exercised. Use **Back to summary** to retain the selected career before entering RPG; closing the career view deliberately clears selection in the teammate implementation.

## Genuine limits

Chat is a local unsent-draft UI, explicitly labelled disconnected, with Send disabled. No chat HTTP request/response contract or conversation coordinator implementation was supplied. The existing coordinator is a Protocol; adapters accept grounded `CareerContext` for explanations/roadmap suggestions, not arbitrary conversational messages. Inventing a chat endpoint would not safely bridge those contracts. Chat consent and draft behavior remain intact.

Gemini explanation/roadmap, Swarms coordination, Prune gateway, and OpenRouter explanation adapters are preserved. The existing fallback service tries eligible Gemini then free OpenRouter, followed by deterministic matching and verified resources. Swarms/Prune remain separate opt-in sponsor services. No duplicate AI connection, prompt work, or live requests were added. Current HTTP endpoints do not invoke these adapters.

RPG is a shell: selected career and navigation work, but quest progress/rewards are explicitly inactive. There is no approved mission retrieval, completion, XP ledger, persistence, or quiz-personalization endpoint. No fabricated quests, XP, completion, or database writes were introduced. This is a working exploration demo, not a complete live-AI or progression product.

Teammate 3 still owns career/pathway research and generation prompts. Future approved pathway resources can populate the existing `mdc_resources` schema without frontend changes; disable the demo overlay when its resource moves into production data to avoid duplicate IDs. Richer pathway/mission contracts still need agreement.

## Source URL review

Public pages were reviewed without enrolling or paying: [Odin](https://theodinproject.com/), [TryHackMe](https://tryhackme.com/path/outline/presecurity), [Harvard Cybersecurity](https://www.harvardonline.harvard.edu/course/cs50s-introduction-cybersecurity), [Google/Coursera](https://www.coursera.org/professional-certificates/google-data-analytics), and [Microsoft Learn](https://learn.microsoft.com/training/paths/data-analytics-microsoft) resolved to the expected resources. freeCodeCamp's page returned no readable content through the web tool; Harvard's `/node/79` URL was inaccessible through that tool. These two links need further manual confirmation, not an unsupported claim that they are broken. Contributor source URLs and verification metadata were preserved.

A follow-up HTTP check confirmed freeCodeCamp returns 200. Harvard's `/node/79` link remains unconfirmed; ask the resource owner to verify or replace it with an official canonical link. No dataset link was silently rewritten.

A source link being reachable does not imply its entire course/certificate is free. No enrollment or provider spending is needed for this demo; do not start paid trials. Parent career sources remain contributor-labelled unverified. Phase 9.5's handoff records provenance for the MDC demo's user-supplied duration/credit values.

## Run the integrated candidate

In the **integration worktree root**, use this backend terminal:

```powershell
$env:ORQUESTRA_DATA_DIR = (Resolve-Path './data').Path
$env:ORQUESTRA_MDC_DEMO_ENABLED = 'true'
$env:ORQUESTRA_AI_ENABLED = 'false'
$env:AI_MAX_REQUESTS_PER_PROVIDER = '0'
conda run -n orquestra uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In its `frontend` directory: `npm run dev -- --host localhost`. Open localhost:5173. The frontend's default API base is localhost:8000. Demo login is `student@mdc.edu` / `MDC2026` (public prototype credentials, not account authentication). Keep database and live AI disabled. Stop both servers after review.

Validation commands from the integration root:

```powershell
conda run -n orquestra python -m unittest discover -s tests
conda run -n orquestra python tests/manual_frontend_integration.py --worktree . --mdc-demo
```

From `frontend`: `npm test` and `npm run build`. The manual runner also runs the entire frontend suite plus a full-flow React/jsdom smoke test against a temporary real FastAPI HTTP server, then stops it. This is DOM/client/API coverage, not a browser visual-layout audit. Existing six dozen backend cases include mocked provider/database checks and do not make live calls.

Final results: **66 backend tests passed**, **16 frontend tests passed** (15 teammate tests plus the full-flow live-backend DOM smoke test), and the **production build passed**. The real client/API check validated all 12 cards and three matches, resource arrays, CORS, error responses, and health. All test servers stopped; data hashes remained unchanged. The original backend worktree remains clean and there are no unresolved merge conflicts.

Before approval: review candidate diffs, confirm the remaining Harvard resource link, agree on chat and mission/XP contracts, and review this local demo. Commit/push/main integration require user approval. No new phase is started here.
