# Orquest 🦈

**Find the job. Explore your path. Turn the next step into a quest.**

Built for **SharkByte Hackathon 2026** at Miami Dade College.

[GitHub](https://github.com/Oliver102274/Orquest) · [Release checklist](docs/FINAL_SHARKBYTE_RELEASE.md) · [Public Gemini setup](docs/PUBLIC_GEMINI_DEMO.md)

> **Guest demo:** no account, password, database, or API key is required to explore. Career guidance supports decisions; it does not promise admission, employment, salary, or a particular qualification.

## From interests to action

**Discover → Match → Explore → Choose a job → Plan → Level up**

Students are often asked to pick a major before they understand the jobs it could lead to. Orquest starts with the job and helps students investigate different routes toward it.

| Experience | What works |
| --- | --- |
| Discover interests | Eight adaptive main questions with swipe interactions and optional follow-ups. Matching runs locally against the teammate's bundled interest data and is labeled accordingly. The original 12-card API and deterministic matching rules remain available and support existing saves. |
| Explore careers | The Bubble Explorer groups **20 job families and 115 occupations** into visual fields. Search, compare, investigate, and explicitly choose a target. A labeled bundled catalog snapshot is available if the API is unavailable. |
| Ask career questions | The existing Gemini integration answers with structured, source-grounded responses when safely configured. Otherwise, catalog guidance answers salary, education, skills, outlook, and learning questions with availability and verification disclosures. |
| Investigate education | Verified career-linked MDC resources, the **60-credit Cybersecurity Associate in Science demo**, external resources, and **247 MDC catalog program records**. SOC matches and keyword candidates are clearly distinguished from verified recommendations. |
| Build a roadmap | Job-first guidance uses the selected occupation and relevant context, optional consented profile answers, educational alternatives, source links, and suggested missions. AI output is labeled **AI-GENERATED DRAFT / REVIEW REQUIRED**. |
| Complete a quest | A mission constellation shows backend-issued activities. Self-reported completion awards server-calculated XP once per mission. Returning between screens preserves the active in-memory session. |
| Save supported choices | Export/import selected career paths and consented questionnaire context. Old card-based saves still work. New discovery sessions do not invent old card answers. |

**Progress is temporary.** Mission sessions and XP are held in memory, not an account or database. Refreshing the browser, restarting the server, or session expiry can lose access. Save files do not persist XP, provider keys, session tokens, or chat history; the new discovery answers/matches are not exported.

## Grounding and safety

- Career/occupation IDs and existing API responses are preserved. Catalog salary figures are **national U.S. reference data, not Florida or Miami salaries**. Contributor rows retain their unverified status and source metadata.
- A program appearing in the MDC catalog does not establish that it is required for a job. Exact SOC matches, keyword suggestions, and training directories retain candidate labels. The separately verified career resources remain intact.
- AI-generated links must come from supplied verified evidence. Missing evidence is disclosed. Safety refusals remain blocked; unavailable providers and exhausted usage budgets return deterministic guidance.
- Public Gemini requires an explicitly confirmed **unbilled Free Tier project**, opt-in flags, and bounded shared request limits. In-memory limits alone do not guarantee no billing. The public route does not fall back to paid providers and does not retry automatically.
- Swarms and Prune sponsor adapters/receipt tools are integrated as **optional, default-off developer tools**, not public UI features. OpenRouter requires a pinned `vendor/model:free` ID and zero-price routing. Public mode suppresses all three. See [sponsor documentation](docs/SPONSOR_INTEGRATIONS.md).
- The abandoned Auth0/account experiment is excluded. Tiger Data is not required or contacted by the demo.

## Architecture

```text
React + Vite guest UI
    │ same-origin JSON in production
    ▼
FastAPI + Pydantic ─── contributor JSON / verified resources
    │
    ├── job-first coordinator → Gemini (explicitly enabled, bounded)
    │                          → deterministic catalog guidance
    └── temporary mission sessions → server-owned XP
```

Python 3.11 · FastAPI · Pydantic · Google Gen AI SDK · React · Vite · Vitest · pytest

Key endpoints: `/api/cards`, `/api/matches`, `/api/careers/{id}`, `/api/job-families`, `/api/occupations`, `/api/occupation-mappings`, `/api/occupations/{id}/resources`, `/api/career-questions`, `/api/roadmaps`, `/api/occupations/{id}/roadmap`, and `/api/progress`. Local interactive docs: `http://localhost:8000/docs`.

## Run locally

Use the release on `codex/phase10-integration` (or the final merged `main`). Use Conda for Python and Node.js 22 for the frontend.

```powershell
# First setup only; skip environment creation if orquestra already exists.
conda env create -f environment.yml
conda run -n orquestra python -m pip install -r backend/requirements.txt
npm --prefix frontend ci
```

In one terminal, from the repository root:

```powershell
$env:ORQUESTRA_AI_ENABLED="false"
$env:PUBLIC_AI_ENABLED="false"
$env:ORQUESTRA_MDC_DEMO_ENABLED="true"
conda run --no-capture-output -n orquestra python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
npm --prefix frontend run dev -- --port 5174
```

Open `http://localhost:5174`. Development API requests default to `http://localhost:8000`; the trusted 5173/5174 origins are supported. Production uses the same HTTPS origin unless an explicit `VITE_API_BASE_URL` build setting overrides it. Never put provider credentials in `VITE_*` variables. The normal app reads process environment variables; it does not silently load private `.env` files.

## Validate

```powershell
conda run -n orquestra python -m pip install pytest
conda run -n orquestra python -m pytest tests -q
npm --prefix frontend test
npm --prefix frontend run build
conda run --no-capture-output -n orquestra python tests/manual_frontend_integration.py --worktree . --mdc-demo --production
```

The integration runner starts and stops its own loopback server, disables providers before application creation, tests production SPA refresh behavior, and exercises real API calls from React. It never contacts a database or AI provider. Final release checks: **165 backend tests + 45 subtests; 91 frontend unit tests + 4 real-backend UI flows**.

## Docker and Render Free

The existing multi-stage `Dockerfile` builds the frontend and serves it through FastAPI, on one origin. It copies all `data/` files, including MDC catalogs and demo pathways. The server runs as a non-root user with one worker; `.dockerignore` excludes secrets and local worktrees.

```powershell
docker build -t orquest .
docker run --rm -p 10000:10000 -e ORQUESTRA_MDC_DEMO_ENABLED=true orquest
```

No credentials are needed for this local deterministic demo. Docker was not available on the release workstation; the equivalent production application and built assets were smoke-tested locally.

For the existing `orquest-demo` Render service, keep the **Free** plan, root directory unset, Docker context `.`, Dockerfile `./Dockerfile`, and existing start command. The tracked Blueprint selects `codex/phase10-integration` and auto-deploy off. **Do not resynchronize the Blueprint or overwrite working dashboard Gemini settings.** Deploy only the verified release SHA using **Manual Deploy → Deploy a specific commit**. Check the actual linked branch in Render first; its dashboard state was not changed or independently inspected during this release. See [deployment instructions](docs/RENDER_FREE_DEPLOYMENT.md) and the [final release checklist](docs/FINAL_SHARKBYTE_RELEASE.md).

The public service already exists; obtain its exact HTTPS URL from the Render dashboard. This release does not claim the live site has been updated merely because code was pushed.

## Team

| Contributor | Contribution |
| --- | --- |
| Oliver Hernandez | Project lead, backend, AI orchestration, safety, final integration |
| Gzapple | React UI/UX, adaptive discovery, Bubble Explorer, chat and RPG experience |
| Daniel Espinosa | Career research, MDC pathways, official-source catalog and resource discovery |
| henryadepeko-hub | Swipe content, occupation catalog, external learning resources and documentation |

The teammates' README and Devpost drafts remain preserved alongside this README. [Team workflow](docs/TEAM_WORKFLOW.md) and [API contract draft](docs/API_CONTRACT_DRAFT.md) document collaboration. Draft contracts remain drafts until approved by the team.
