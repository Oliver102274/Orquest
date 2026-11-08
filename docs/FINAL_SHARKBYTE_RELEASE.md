# Final SharkByte release — November 8, 2026

## Contributions reviewed

| Branch / checkpoint | Release decision |
| --- | --- |
| `codex/phase10-integration` `06fe4b8` | Production baseline: Gemini, catalog guidance, 115 occupations, verified MDC resources, CORS and temporary XP already integrated. |
| `main` `83b52e2` | Older release; included in the integration ancestry. |
| `feature/frontend-experience` `3510c2b` | Integrated finished adaptive discovery, catalog explorer, chat, consented profile flow and RPG constellation. This is the latest pushed React frontend; no unseen Base44 workspace export is claimed. |
| `feature/mdc-verified-pathways` `38acf53` (PR #7) | Integrated 247-record official MDC catalog, SOC/keyword resource discovery, credentials and resource displays. Earlier PR #6 and corrected mobile-program source remain intact. |
| `feature/swipe-and-learning-data` `7972a9c` | Latest README/Devpost drafts included through frontend ancestry; original cards/catalog/external resources preserved. |
| `feature/sponsor-apis-phase20` `9b2befd` | Integrated guarded CLI adapters/tests, disabled by default and blocked from public Gemini routing. No public sponsor feature is claimed. |
| `feature/career-resources` `2372979` and older backend branches | Existing compatible research already represented; no blind merge of stale alternatives. |
| `feature/auth0-tigerdata-persistence` | Explicitly excluded. No Auth0, account migrations, new login or persistent-XP dependency. |

No unfinished work was overwritten. The final release was assembled in `.integration/final-release` to protect existing dirty worktrees, including local configuration-template edits. Private `.env` files were not copied. The original sponsor and account worktrees were not changed.

## Compatibility fixes

- Resolved frontend conflicts around the new design while retaining guest entry, existing API response schemas, source labels, export/import and backend-owned mission rewards.
- Both API helper modules default to same-origin production requests; no production browser requests to localhost.
- Ported the new MDC resource panel into the current RPG guidance component, avoiding duplicate source links already displayed by the roadmap.
- Updated stale UI test expectations and installed automatic component cleanup between tests. No response fixtures were substituted for the real-backend smoke flows.
- New discovery/catalog sessions can export/import supported career choices with an empty legacy swipe list. Existing card-based saves still restore matches. Discovery answers/matches and XP are not persisted in the export format.
- Original 12-card deterministic matching remains intact. The new frontend's eight-question matching is local, labeled bundled, and uses teammate-provided matching data; it does not call an invented discovery API.

## Validation

- **165 backend tests and 45 subtests passed.** Covers Gemini transport mocks, limits/refusals/fallback, sponsor defaults and errors, matching, catalogs, verified resources, every occupation's new resource lookup, progress authorization and duplicate XP.
- **91 frontend unit tests passed**, plus **4 real-FastAPI React flows** (95 combined): software, data analysis, cybersecurity, and specific-occupation selection through RPG.
- **Vite production build passed.** Production server serves same-origin API/assets, `/explore` and `/roadmap` refreshes, and rejects private paths. Real API smoke: 12 cards, three existing careers, all resource arrays, validation errors and health.
- Frontend bundled catalog exactly matches `data/orquest_job_catalog.json`: 20 families / 115 occupations.
- 247 unique MDC plan IDs; all catalog source URLs use `https://www.mdc.edu`. Availability of every external website was not rechecked; outages do not justify fabricated replacements.
- Tracked credential scan passed; private env files remain ignored. Production npm dependency audit: zero reported vulnerabilities. No new runtime dependency was introduced.
- Docker/Render configuration and Gemini adapter are unchanged from `06fe4b8`. Docker copies all `data/`, including MDC resources. Docker is not installed on this workstation, so no container-build result is claimed.
- No live AI/sponsor/database request, migration, Render change or deployment was performed.

## Known demo limitations

Mission completion is self-reported; the server calculates XP idempotently. Sessions are memory-only, expire, and reset on server restarts; browser refresh loses the session token. Save export does not persist rewards or chats. Catalog rows are contributor reference data, not independently verified occupational evidence. Additional MDC programs are candidates, not mandatory qualifications. AI can be unavailable or quota-limited; deterministic guidance remains available. Explicit safety refusals remain blocked.

The team reports earlier real Gemini, Swarms and Prune success, including a verified signed Prune report. This release only reran mocked provider tests. Sponsor tools remain developer-only and need separate controlled approval/credit verification before use.

## Manual release/deployment checklist

1. Use the final integration commit shown in the release PR/report. The integration PR should target `main` through normal repository protections; do not merge the abandoned account branch.
2. In existing Render **orquest-demo → Settings**, confirm the repository, actual linked branch, **Free** plan and existing Docker startup. The tracked `render.yaml` selects `codex/phase10-integration`, but dashboard state was not inspected. If it differs, do not use “Deploy latest commit” blindly.
3. Preserve existing working Gemini secrets and flags. **Do not synchronize the Blueprint**, replace environment settings, create services, activate billing, or run migrations. Optional sponsor providers remain off in public mode.
4. Select **Manual Deploy → Deploy a specific commit** and paste the validated integration SHA from the report. This commit is also included in the final main merge. The release commit messages include `[skip render]` to avoid accidental deployment on GitHub push.
5. After manual deployment, verify the displayed SHA, HTTPS root, `/api/health`, 12 cards, 20 families / 115 occupations, guest navigation, MDC sources and temporary missions. Refresh a production route and inspect browser Network requests for same-origin API calls. Do not trigger new AI requests without the user's approval.
6. If the build fails, keep the previous working deployment and inspect the sanitized build error; do not add paid resources. The live website is not considered updated until Render confirms the desired commit.

Official manual-deploy reference: [Deploying on Render](https://render.com/docs/deploys#manual-deploys). Public AI configuration details remain in [PUBLIC_GEMINI_DEMO.md](PUBLIC_GEMINI_DEMO.md).
