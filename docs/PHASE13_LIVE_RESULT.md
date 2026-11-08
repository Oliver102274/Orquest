# Phase 13: single approved OpenRouter test

Executed exactly one live request on November 7, 2026. No retry, fallback-provider call, Gemini/Swarms/Prune request, or database request was made.

The integration worktree's `.env` exists, is ignored, and contains an OpenRouter key. Its `OPENROUTER_MODEL` was set to `openrouter/free`; other values were preserved. No secret values were displayed or added to tracked files. Pre-existing work, including the user's `.env.example` edit, was preserved.

The existing OpenRouter adapter enforced zero maximum prompt/completion/request prices, disabled provider fallbacks, used no redirects, and used an HTTP transport with retries set to zero. An additional one-request transport guard prevented any second attempt. The existing reviewed MDC question/context was used, with a 100-token output cap and 30-second timeout.

| Result | Observed value |
| --- | --- |
| HTTP response | 200; authentication succeeded |
| Requested model | `openrouter/free` |
| Responding model | `cohere/north-mini-code:free` |
| Prompt tokens | 398 |
| Completion tokens | 100 |
| Total tokens | 498 |
| Provider-reported cost | 0 USD |
| Structured contract | Rejected: `invalid_response` |

The response reached the output cap but its finish reason/raw content was not retained. Truncation is possible, not proven. Do not present this as a successful career answer. The adapter rejected the output safely; it was not passed to the UI. Per current refusal policy, an invalid response stops automatic provider fallback rather than being retried elsewhere. Deterministic guidance remains independently available with AI disabled; an invalid AI response is not relabelled a deterministic answer.

`backend/run_local.py` supplies explicit application startup with this worktree's allowlisted `.env` loader (process variables retain precedence):

```powershell
conda run -n orquestra python -m backend.run_local
```

The launcher does not enable AI by itself, import database settings from `.env`, start a migration, or make a request on startup. Live test limits were process-local and did not enable server-wide AI. Continue using `ORQUESTRA_AI_ENABLED=false` / zero budget for ordinary offline demos until further live usage is approved. Direct `uvicorn backend.main:app` retains its process-environment-only behavior.

Any second live test needs separate approval. A later proposal could allow enough output tokens for structured JSON or pin an independently verified free model; no such request was made here. No commits, pushes, or merges were performed.
