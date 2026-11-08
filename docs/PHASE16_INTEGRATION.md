# Phase 16 integration

Teammate 2's completed frontend commit `4a828b1` was merged into `origin/main` by PR #4, merge `dbd9ef2`. Integrated that completed work into `codex/phase10-integration`, preserving Phase 15's backend. No teammate branches or research datasets were changed.

## Connected flow

- Existing 12 swipes and three career matches still drive the Bubble Explorer.
- Browse Job Catalog loads 20 families and 115 occupations inside the existing explorer. Filter by family and select a specific job to open the existing detail dialog, set an RPG goal, or ask a question.
- `/api/careers/{id}`, `/api/career-questions`, and `/api/roadmaps` now accept catalog occupation IDs as well as legacy career IDs. They reuse the existing selected-occupation context adapter; no new AI integration. Old schemas and IDs are unchanged.
- Verified MDC Cybersecurity demo and external resources are retained for mapped occupations. Other occupations can have no MDC pathway; the UI says so. Reference catalog content remains explicitly unverified; national salary scope remains visible. No research data was edited.
- Teammate 2's explicit Send and Request Roadmap actions, consent handling, fallback labels, target selection, save import/export, and design are preserved.
- Start Temporary Missions explicitly calls `POST /api/progress` with the selected target and consented profile. It generates a roadmap using the existing coordinator. A preview is optional; the app never automatically requests both preview and progress generation.
- Completion uses `PUT /api/progress/{id}/missions/{mission_id}/completion`, a session Bearer token, and only `{"completed":true}`. XP is returned by the server, never awarded optimistically. Failure leaves XP unchanged and requires an explicit user action to retry.
- Session tokens remain only in React memory and are not included in exports. Navigation retains progress; reload, expiry, or server restart can lose it. Exports still save choices and consented questionnaire answers, not mission progress or XP. Use one backend worker. Completion is self-reported practice, not a qualification.

## Validation and limits

105 backend tests, 37 frontend tests (including two full local API integration flows), and production build passed. Local integration uses rendered React components in jsdom with real loopback FastAPI requests, not a graphical browser visual audit. Coverage includes swipes, matches, verified MDC and external resources, catalog counts/selection, occupation chat, deterministic roadmap, missions, failure without XP, explicit completion, and navigation retaining XP. Existing tests cover malformed AI responses, provider failures, and fallback. Test server stopped after validation.

Live AI and database requests were disabled throughout. Gemini, OpenRouter, Swarms, Prune, and research data are unchanged. No deployment occurred.

Before public deployment: rotate previously exposed provider/database credentials; replace or clearly scope the existing demo-only login (it is not real account authentication); configure HTTPS and exact frontend origin; keep AI disabled until approved free-tier verification and enforce budget/abuse limits before enabling public requests. Memory-only XP is suitable for a single-process demo, not durable accounts. The occupation catalog still needs research verification. Enable `ORQUESTRA_MDC_DEMO_ENABLED=true` to show the isolated Cybersecurity demo.
