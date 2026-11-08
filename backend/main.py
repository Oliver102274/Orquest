"""Orquestra's data-backed API. Imports never require datasets or providers."""

import os
from pathlib import Path

from fastapi import FastAPI, Header
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from backend.models import CardsResponse, CareerDetail, ErrorResponse, MatchRequest, MatchesResponse
from backend.services.data import DataError, DataRepository
from backend.services.matching import UnknownCardError, match_careers
from backend.job_models import JobRequest, QuestionRequest, QuestionResponse, RoadmapResponse
from backend.agents.job_coordinator import JobFirstCoordinator
from backend.integrations.common import AIServiceError
from backend.job_models import StudentProfile
from backend.catalog_models import FamiliesResponse, OccupationsResponse, OccupationResponse
from backend.services.job_catalog import JobCatalogRepository, CAREER_OCCUPATIONS
from backend.services.progress import ProgressStore
from backend.job_models import ProgressRequest, CompletionRequest, ProgressResponse, CreatedProgressResponse


def create_app(data_directory: Path | None = None, origins: list[str] | None = None,
               *, demo_enabled: bool | None = None) -> FastAPI:
    application = FastAPI(title="Orquestra API", version="0.2.0")
    directory = data_directory if data_directory is not None else Path(
        os.environ.get("ORQUESTRA_DATA_DIR") or str(Path(__file__).resolve().parents[1] / "data")
    )
    if demo_enabled is None:
        demo_enabled = os.environ.get("ORQUESTRA_MDC_DEMO_ENABLED", "false").lower() == "true"
    demo_directory = Path(__file__).resolve().parents[1] / "data" / "demo" if demo_enabled else None
    repository = DataRepository(directory, demo_directory=demo_directory)
    job_catalog = JobCatalogRepository(directory)
    progress_store = ProgressStore()
    allowed_origins = origins if origins is not None else [
        os.environ.get("FRONTEND_ORIGIN") or "http://localhost:5173"
    ]
    application.add_middleware(
        CORSMiddleware, allow_origins=allowed_origins, allow_credentials=False,
        allow_methods=["GET", "POST", "PUT"], allow_headers=["Content-Type", "Authorization"],
    )

    def error(status, code, message):
        return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})

    @application.exception_handler(DataError)
    async def data_error(_request, exc):
        return error(503, exc.code, exc.message)

    @application.exception_handler(RequestValidationError)
    async def validation_error(_request, _exc):
        return error(422, "validation_error", "Invalid request. Check the documented field types, required fields, and unique card IDs.")

    @application.exception_handler(AIServiceError)
    async def ai_configuration_error(_request, _exc):
        return error(503, "ai_unavailable", "AI configuration is unavailable. Existing career matching remains available.")

    @application.exception_handler(HTTPException)
    async def http_error(_request, exc):
        return error(exc.status_code, "not_found" if exc.status_code == 404 else "http_error", str(exc.detail))

    @application.get("/api/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    errors = {503: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}

    @application.get("/api/cards", response_model=CardsResponse, responses=errors)
    @application.get("/api/swipe-cards", response_model=CardsResponse, responses=errors,
                     deprecated=True)
    def cards():
        return CardsResponse(cards=repository.cards())

    @application.post("/api/matches", response_model=MatchesResponse, responses=errors)
    def matches(request: MatchRequest):
        try:
            return match_careers(request, repository.cards(), repository.careers())
        except UnknownCardError as exc:
            return error(422, "unknown_card", str(exc))

    @application.get("/api/careers/{career_id}", response_model=CareerDetail,
                     responses={**errors, 404: {"model": ErrorResponse}})
    def career(career_id: str):
        if career_id.startswith("occupation_"):
            catalog, occupation = selected_occupation(career_id)
            return job_catalog.guidance_career(catalog, occupation, repository)
        for record in repository.careers():
            if record.career_id == career_id:
                return CareerDetail.model_validate(record.model_dump(exclude={"interest_tags"}))
        raise HTTPException(404, "Career not found in the supplied catalog.")

    @application.post("/api/career-questions", response_model=QuestionResponse,
                      responses={**errors, 404: {"model": ErrorResponse}})
    def career_question(request: QuestionRequest):
        target = career(request.career_id)  # Validate the target before any provider access.
        return JobFirstCoordinator().answer(target, request)

    @application.post("/api/roadmaps", response_model=RoadmapResponse,
                      responses={**errors, 404: {"model": ErrorResponse}})
    def job_roadmap(request: JobRequest):
        target = career(request.career_id)
        return JobFirstCoordinator().roadmap(target, request)

    @application.get("/api/job-families", response_model=FamiliesResponse, responses=errors)
    def job_families():
        catalog = job_catalog.load()
        return FamiliesResponse(families=catalog.families, metadata=job_catalog.metadata(catalog))

    @application.get("/api/occupations", response_model=OccupationsResponse, responses={**errors, 404: {"model": ErrorResponse}})
    def occupations(family_id: str | None = None):
        catalog = job_catalog.load()
        if family_id is not None and family_id not in {f.id for f in catalog.families}:
            raise HTTPException(404, "Job family not found.")
        return OccupationsResponse(occupations=[o for o in catalog.occupations if family_id is None or o.family_id == family_id], metadata=job_catalog.metadata(catalog))

    @application.get("/api/occupation-mappings")
    def occupation_mappings():
        return {"career_to_occupation": CAREER_OCCUPATIONS, "unmapped_career_ids": [c.career_id for c in repository.careers() if c.career_id not in CAREER_OCCUPATIONS]}

    def selected_occupation(occupation_id):
        catalog = job_catalog.load()
        occupation = job_catalog.lookup(catalog, occupation_id)
        if occupation is None:
            raise HTTPException(404, "Occupation not found.")
        return catalog, occupation

    @application.get("/api/occupations/{occupation_id}", response_model=OccupationResponse, responses={**errors, 404: {"model": ErrorResponse}})
    def occupation_detail(occupation_id: str):
        catalog, occupation = selected_occupation(occupation_id)
        return OccupationResponse(occupation=occupation, linked_career_ids=[key for key, value in CAREER_OCCUPATIONS.items() if value == occupation_id], metadata=job_catalog.metadata(catalog))

    @application.post("/api/occupations/{occupation_id}/roadmap", response_model=RoadmapResponse, responses={**errors, 404: {"model": ErrorResponse}})
    def occupation_roadmap(occupation_id: str, request: StudentProfile):
        catalog, occupation = selected_occupation(occupation_id)
        target = job_catalog.guidance_career(catalog, occupation, repository)
        return JobFirstCoordinator().roadmap(target, JobRequest(career_id=occupation.id, **request.model_dump()))

    @application.post("/api/progress", status_code=201, response_model=CreatedProgressResponse)
    def start_progress(request: ProgressRequest):
        profile = StudentProfile(**request.model_dump(exclude={"target_id"}))
        if request.target_id.startswith("occupation_"):
            roadmap = occupation_roadmap(request.target_id, profile)
        else:
            roadmap = job_roadmap(JobRequest(career_id=request.target_id, **profile.model_dump()))
        return progress_store.create(roadmap)

    @application.get("/api/progress/{progress_id}", response_model=ProgressResponse)
    def get_progress(progress_id: str, authorization: str | None = Header(default=None)):
        return progress_store.get(progress_id, authorization)

    @application.put("/api/progress/{progress_id}/missions/{mission_id}/completion", response_model=ProgressResponse)
    def complete_mission(progress_id: str, mission_id: str, request: CompletionRequest,
                         authorization: str | None = Header(default=None)):
        return progress_store.complete(progress_id, mission_id, authorization)

    return application


app = create_app()
