# Orquestra

GitHub repository: [Oliver102274/Orquest](https://github.com/Oliver102274/Orquest).
Original repository description:
> AI-powered career discovery platform using multi-agent AI, personalized career pathways, and RPG-style skill progression to help students explore, learn, and grow. 🦈

Orquestra is an AI-powered career discovery and development platform for
SharkByte Hackathon 2026. Students **Swipe → Match → Explore → Level Up**:
express interests, discover career paths, explore education and resources,
and progress through personalized missions and milestones.

Pathways will support both Miami Dade College (MDC) and external universities,
learning platforms, certifications, internships, and career opportunities.
Career facts and resources must be supported by verifiable sources; programs,
job listings, and salary figures must not be invented.

## Phase 1 scope

Only `GET /api/health` is implemented. It returns `{"status":"ok"}` and checks
application liveness, not database or provider connectivity. FastAPI also
provides `/docs`, `/redoc`, and `/openapi.json` for API documentation.

React + Vite, Gemini, Swarms, Prune, Tiger Data / PostgreSQL, and React Flow
are planned; none is integrated or required for this phase.

## Start the backend

Use Conda with Python 3.11 for the backend. For first-time setup, run from the
repository root in PowerShell:

```powershell
conda env create -f environment.yml
conda run --no-capture-output -n orquestra python -m uvicorn backend.main:app --reload
```

If `orquestra` already exists, skip creation. Install backend dependencies with
`conda run -n orquestra python -m pip install -r backend/requirements.txt`.
The environment file references that requirements file to keep dependencies in
one place. `conda run` avoids needing to activate the environment. Conda is for
the Python backend only; do not create a separate `.venv`.
Open <http://127.0.0.1:8000/api/health> or <http://127.0.0.1:8000/docs>.
Stop the server with Ctrl+C.

No secrets, environment file, database, or paid services are needed.
`.env.example` reserves proposed variable names for later integrations; the
application does not load them yet. Dependency ranges allow compatible initial
installs; agree on locking versions before reproducible deployment.

## Collaboration

- `backend/`: backend and AI lead (Member 1).
- `frontend/`: frontend lead (Member 2); placeholder only.
- `data/`: career/MDC research (Member 3) and external resources/swipe content
  (Member 4); placeholder only.
- `docs/`: shared agreements and proposed interfaces.
- `tests/`: future tests owned by each feature's contributor; placeholder only.

Read [team workflow](docs/TEAM_WORKFLOW.md) and the
[API contract draft](docs/API_CONTRACT_DRAFT.md) before starting feature work.
The API draft requires review with the frontend lead before adoption.
