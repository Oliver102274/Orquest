"""Orquestra's data-backed API. Imports never require datasets or providers."""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from backend.models import CardsResponse, CareerDetail, ErrorResponse, MatchRequest, MatchesResponse
from backend.services.data import DataError, DataRepository
from backend.services.matching import UnknownCardError, match_careers


def create_app(data_directory: Path | None = None, origins: list[str] | None = None) -> FastAPI:
    application = FastAPI(title="Orquestra API", version="0.2.0")
    directory = data_directory if data_directory is not None else Path(
        os.environ.get("ORQUESTRA_DATA_DIR") or str(Path(__file__).resolve().parents[1] / "data")
    )
    repository = DataRepository(directory)
    allowed_origins = origins if origins is not None else [
        os.environ.get("FRONTEND_ORIGIN") or "http://localhost:5173"
    ]
    application.add_middleware(
        CORSMiddleware, allow_origins=allowed_origins, allow_credentials=False,
        allow_methods=["GET", "POST"], allow_headers=["Content-Type"],
    )

    def error(status, code, message):
        return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})

    @application.exception_handler(DataError)
    async def data_error(_request, exc):
        return error(503, exc.code, exc.message)

    @application.exception_handler(RequestValidationError)
    async def validation_error(_request, _exc):
        return error(422, "validation_error", "Invalid request. Check the documented field types, required fields, and unique card IDs.")

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
        for record in repository.careers():
            if record.career_id == career_id:
                return CareerDetail.model_validate(record.model_dump(exclude={"interest_tags"}))
        raise HTTPException(404, "Career not found in the supplied catalog.")

    return application


app = create_app()
