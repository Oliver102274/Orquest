# Team workflow

## Ownership and creative freedom

| Area | Owner | Responsibility |
| --- | --- | --- |
| `backend/` | Member 1, project lead | FastAPI, AI coordination, provider integrations, database, deployment and final integration |
| `frontend/` | Member 2 | React, swipe experience, matches, details, skill tree, missions and career explorer |
| `data/` | Member 3 | Career facts, MDC programs, requirements, milestones and official sources |
| `data/` | Member 4 | Swipe content, interest tags, external resources and resource validation |
| `docs/` | All, coordinated by project lead | Shared interfaces, setup instructions and decisions |
| `tests/` | Feature contributor | Validation for the feature they own |

Each teammate chooses how to implement their own features. Shared contracts
describe communication boundaries rather than UI design or internal architecture.
Members 3 and 4 should agree on separate filenames or subfolders before adding
data to avoid editing the same files. No datasets or frontend are prebuilt.

## Git workflow

1. Use `main` as the shared base branch; update your local copy before work.
2. Each owner creates their own branch from current `main`, using the names below.
3. Keep changes within your area. Coordinate with the owner before changing
   another member's files or shared interfaces.
4. Make small commits and open a pull request explaining behavior, validation,
   and any interface changes. Never commit secrets, local environments, or
   dependency folders. Commit dependency lockfiles when the team adopts them.
5. Request review from the affected owner. Backend/frontend contract changes
   need both leads' agreement before being treated as final.
6. Resolve conflicts with the affected owner and rerun relevant checks. The
   project lead coordinates integration; agree together on merge strategy.

| Owner | Branch |
| --- | --- |
| Member 1 — backend and AI lead | `feature/orquestra-backend` |
| Member 2 — frontend | `feature/frontend-experience` |
| Member 3 — MDC and career data | `feature/career-resources` |
| Member 4 — swipe and external learning data | `feature/swipe-and-learning-data` |

Teammates clone `https://github.com/Oliver102274/Orquest.git`, then run:

```shell
git switch main
git pull --ff-only origin main
git switch -c feature/frontend-experience
```

Replace the example branch with your assigned branch. Each teammate creates and
pushes their own branch with `git push -u origin <branch-name>` when ready, then
opens a pull request targeting `main`. Do not force-push or commit directly to
`main` during feature work. Branch protection is a repository-owner decision;
these instructions do not configure GitHub enforcement.

For backend setup, follow the Conda instructions in the root README. Frontend
setup remains owned by Member 2. Approve draft contracts together before relying
on them; keep source data changes within your agreed ownership boundaries.

## Data and integration expectations

- Include official source URLs and verification dates for factual content.
  Keep unknown facts unknown; do not invent programs, salaries, or job listings.
- Support MDC and external opportunities. Record provenance and flag stale or
  unverified resources for review.
- Review `API_CONTRACT_DRAFT.md` with Member 2 before implementing feature routes.
- Agree on IDs, interest categories, data formats, student identity and privacy,
  progress storage, and XP rules across affected owners.
- Configure services and credentials only when the relevant integration phase
  is authorized. Local secrets belong in ignored files or environment variables.
