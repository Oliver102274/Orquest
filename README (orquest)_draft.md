# Orquest 🦈

**Swipe → Match → Explore → Level Up.** Orquest helps students find a career they actually want and plan a real path to it, starting at Miami Dade College (MDC) and reaching beyond it.

Built for **SharkByte Hackathon 2026**.

> **Draft for team review.** Lines marked `[UPDATE]` must be checked against what actually works on `main` before submission.

---

## The problem

Students are asked to choose a major long before they know what careers exist or what they would enjoy. Career catalogs are long, generic, and easy to give up on. MDC students also need to see how their first steps at MDC connect to real jobs, and what resources exist outside the college.

## What Orquest does

1. **Swipe.** Students swipe right or left on short, everyday activity cards ("Taking care of someone who is sick or hurt", "Spotting patterns hidden in numbers"). Each card carries interest tags.
2. **Match.** Orquest compares the tags a student liked and disliked with each career's interest tags and returns ranked matches with a plain-language reason. Scores measure interest alignment only; they are not a scientific prediction.
3. **Explore.** Matches appear in the **Bubble Explorer**, an interactive map where students open a career to see a summary, requirements, official sources, MDC resources, and external learning resources.
4. **Level Up.** `[UPDATE]` Roadmap missions and XP are planned; describe them here only if they ship.

**Trust rules we built in:** every career fact and resource links to a source; resources are only marked "verified" when they have both a URL and a verification date; the AI layer may only use careers and links that already exist in the data, and responses containing invented links are rejected.

## Architecture

```
React + Vite frontend  ──JSON──▶  FastAPI backend  ──▶  data/*.json
 (login, swipe, Bubble Explorer)    /api/cards             cards.json (swipe deck)
                                    /api/matches           careers.json (careers, sources, MDC resources)
                                    /api/careers/{id}      external_resources.json (learning resources)
                                         │
                                         └─▶ AI adapters (disabled by default): Gemini, OpenRouter (free tier),
                                             Swarms, Prune — grounded to the data above   [UPDATE when wired to an endpoint]
```

| Endpoint | What it does |
| --- | --- |
| `GET /api/health` | Liveness check |
| `GET /api/cards` | Returns the swipe deck |
| `POST /api/matches` | Takes `{responses: [{card_id, preference}]}` (`like`/`dislike`/`skip`) and returns ranked career matches |
| `GET /api/careers/{career_id}` | Career summary, requirements, sources, `mdc_resources`, `external_resources` |

Interactive API docs: <http://127.0.0.1:8000/docs> once the backend is running.

## Run it locally

### Backend (Python 3.11, Conda)

From the repository root:

```powershell
conda env create -f environment.yml
conda run --no-capture-output -n orquestra python -m uvicorn backend.main:app --reload
```

If the `orquestra` environment already exists, skip the first line. Check it is running at <http://127.0.0.1:8000/api/health>.

No API keys, database, or paid services are needed to run the core app. AI integrations are off by default (`ORQUESTRA_AI_ENABLED=false`); see [AI integration setup](docs/AI_INTEGRATIONS_PHASE5.md) and [the $0 fallback design](docs/FREE_AI_PHASE7.md).

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The frontend calls the backend at `VITE_API_BASE_URL` (default `http://localhost:8000`; see `frontend/.env.example`).

`[UPDATE]` Demo login: describe how judges sign in, or remove this line if login is dropped.

### Tests

```bash
python -m pytest tests        # backend
cd frontend && npm test       # frontend
```

## Data

All career content lives in `data/` as JSON validated by the backend on load. A malformed file returns a clear error instead of bad data.

| File | Contents | Owner |
| --- | --- | --- |
| `cards.json` | Swipe cards: `id`, `activity`, `interest_tags` | Member 4 |
| `careers.json` | Careers: summary, requirements, interest tags, sources, MDC resources | Member 3 |
| `external_resources.json` | Courses, certifications and guides grouped by `career_id` | Member 4 |

Tags are lowercase `snake_case` and must match between cards and careers. Sources include the U.S. Bureau of Labor Statistics *Occupational Outlook Handbook* and O*NET. We do not invent programs, job listings, or salary figures.

## Tech stack

React, Vite, Vitest · Python, FastAPI, Pydantic, pytest · Gemini API, OpenRouter, Swarms, Prune (adapters; `[UPDATE]` which are live) · Tiger Data / PostgreSQL (`[UPDATE]` planned or connected)

## Team

| Member | Role |
| --- | --- |
| Oliver Hernandez | Project lead · backend, AI integrations, final integration |
| `[UPDATE: name]` (Gzapple) | Frontend · swipe experience, Bubble Explorer |
| Daniel Espinosa | Career data · MDC pathways and official sources |
| `[UPDATE: name]` (henryadepeko-hub) | Swipe content, external learning resources, testing and docs |

## Contributing

Read [team workflow](docs/TEAM_WORKFLOW.md) and the [API contract draft](docs/API_CONTRACT_DRAFT.md). Each member works on their own `feature/*` branch and merges through pull requests. Never commit `.env` files or API keys.
