# Orquest — Devpost submission draft

> Paste each section into the matching Devpost field. Lines marked `[UPDATE]` must match what actually works in the final demo. Judges check, so only claim what they can see.

**Tagline (Devpost short description, max 200 characters):**
Swipe on everyday activities, match with real careers, and explore a verified path, starting at Miami Dade College and reaching beyond it.

---

## Inspiration

Most of us picked a major before we really knew what jobs existed. Career catalogs are long and generic, and "take a personality quiz" usually ends with a vague label. We wanted something that feels as low-effort as swiping through an app but ends with something real: a career you're curious about, the steps to get there at MDC, and trustworthy resources to start learning today.

## What it does

Orquest turns career discovery into four steps:

- **Swipe:** Students swipe right or left on short activity cards like "Taking care of someone who is sick or hurt" or "Spotting patterns hidden in numbers." No long questionnaire.
- **Match:** Orquest compares the interests behind their swipes with each career's interest profile and ranks the best matches, with a plain-language reason for each one ("You liked investigation and security…").
- **Explore:** Matches appear in our **Bubble Explorer**, an interactive map. Opening a career shows what the job is, what it takes to get there, official sources, MDC resources, and outside learning resources such as free courses and certifications.
- **Level Up:** `[UPDATE: describe missions/XP only if they ship; otherwise move to "What's next"]`

Everything a student sees is traceable. Career facts link to official sources like the U.S. Bureau of Labor Statistics, and a learning resource is only marked "verified" when it has a working link and the date we checked it.

## How we built it

- **Frontend:** React + Vite, with a swipe screen and an interactive Bubble Explorer, tested with Vitest.
- **Backend:** Python + FastAPI. Endpoints serve the swipe deck (`/api/cards`), rank careers from swipe responses (`/api/matches`), and return career details with MDC and external resources (`/api/careers/{id}`). Every data file is validated with Pydantic schemas when it loads.
- **Matching:** A transparent tag-alignment score. Liked tags count toward a career, disliked tags count against it, and the score is described honestly as interest alignment, not a scientific prediction.
- **Data:** A team-built JSON catalog of swipe cards, careers and learning resources, researched from official sources such as the BLS Occupational Outlook Handbook and O*NET.
- **AI layer:** `[UPDATE: state exactly what is live.]` We built grounded adapters for **Gemini**, **OpenRouter** (free models only), **Swarms** multi-agent workflows and **Prune**. Every AI response must reference only careers and resource IDs that already exist in our data. Responses with invented links are rejected, and the app falls back to deterministic matching if no AI is available. We held ourselves to a strict $0 budget.
- **Collaboration:** Four people, four feature branches, pull requests into `main`, and shared JSON contracts agreed on before coding so the pieces fit together.

## Challenges we ran into

- **Making four people's work fit together.** The frontend, backend, career data and swipe content were built in parallel. Early on, the swipe cards and the career data used different interest tags, so some students got no matches at all. We fixed it by agreeing on a shared tag vocabulary and testing the real matcher with a test student for every career.
- **Keeping AI honest.** It's easy for a model to invent a course or a salary. We designed the AI layer so it can only cite resources already in our verified data.
- **Scope.** We started with tech careers and realized MDC serves students headed into nursing, culinary arts, education, law, business and design. `[UPDATE: final number of careers in the demo]`
- **Time.** A 48-hour build meant cutting features to protect a demo that works end to end.

## Accomplishments that we're proud of

- A working end-to-end flow: swipe → ranked matches → Bubble Explorer → career details with resources.
- Every career fact and resource links to a source, and nothing is made up.
- `[UPDATE: number]` automated backend tests and frontend tests passing.
- An AI design that fails safely: no AI means honest deterministic results, not broken pages or invented content.

## What we learned

- Agreeing on data contracts (field names, tags, IDs) early saves hours of integration pain.
- "Verified" has to mean something specific: a link plus the date someone checked it.
- Simple, explainable scoring builds more trust than a mysterious percentage.

## What's next for Orquest

- Connect the AI career coach so students can ask questions about any career in the Bubble Explorer.
- Roadmap missions and XP, so students can track real progress toward their career (the "Level Up" step). `[UPDATE: remove if shipped]`
- More careers covering every MDC school, each with linked MDC programs.
- Save student progress with accounts and a database (Tiger Data / PostgreSQL).
- Local job and internship listings from verified sources.

## Built with

`react` · `vite` · `vitest` · `javascript` · `python` · `fastapi` · `pydantic` · `pytest` · `gemini-api` · `openrouter` · `swarms` · `prune` · `github`
`[UPDATE: only list sponsor tools actually used; add tiger-data / postgresql if connected]`

## Challenges to select on Devpost

`[UPDATE with the team]` MDC North Campus Challenge · Best Overall · plus each sponsor challenge whose tool is **actually working** in the demo (check each challenge's rules for proof requirements).

## Try it out

- GitHub: https://github.com/Oliver102274/Orquest
- Live demo: `[UPDATE: URL, or remove]`
- Demo video: `[UPDATE: link]`
