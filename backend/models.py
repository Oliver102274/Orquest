"""Draft transport and file schemas; no career content is bundled."""

from typing import Annotated, Literal

from pydantic import (
    AwareDatetime, BaseModel, ConfigDict, Field, HttpUrl, StringConstraints,
    model_validator,
)

Identifier = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Tag = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Source(Model):
    title: Text
    url: HttpUrl | None = None
    verified_at: AwareDatetime | None = None
    verification_status: Literal["unverified", "verified", "stale"] = "unverified"

    @model_validator(mode="after")
    def verified_has_evidence(self):
        if self.verification_status == "verified" and not (self.url and self.verified_at):
            raise ValueError("Verified sources require a URL and verification time")
        return self


class Resource(Model):
    id: Identifier
    title: Text
    organization: Text
    type: Text
    source_url: HttpUrl | None = None
    verified_at: AwareDatetime | None = None
    verification_status: Literal["unverified", "verified", "stale"] = "unverified"

    @model_validator(mode="after")
    def verified_has_evidence(self):
        if self.verification_status == "verified" and not (self.source_url and self.verified_at):
            raise ValueError("Verified resources require a URL and verification time")
        return self


class SwipeCard(Model):
    id: Identifier
    activity: Text
    interest_tags: list[Tag]


class MDCPathwayLink(Model):
    career_id: Identifier
    mdc_resources: list[Resource]


class MDCPathwayCatalog(Model):
    pathways: list[MDCPathwayLink]


class CardsResponse(Model):
    cards: list[SwipeCard]


class CareerDetail(Model):
    career_id: Identifier
    title: Text
    summary: Text
    requirements: list[Text]
    sources: list[Source]
    mdc_resources: list[Resource]
    external_resources: list[Resource]


class CareerRecord(CareerDetail):
    """File-only matching metadata, omitted from career detail responses."""

    interest_tags: list[Tag]


class CareerCatalog(Model):
    careers: list[CareerRecord]


class SwipeResponse(Model):
    card_id: Identifier
    preference: Literal["like", "dislike", "skip"]


class MatchRequest(Model):
    responses: list[SwipeResponse] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def unique_cards(self):
        ids = [response.card_id for response in self.responses]
        if len(ids) != len(set(ids)):
            raise ValueError("Each card may appear only once")
        return self


class CareerMatch(Model):
    career_id: Identifier
    title: Text
    rationale: Text
    matched_interest_tags: list[Tag]
    interest_score: float = Field(ge=0, le=100)


class MatchesResponse(Model):
    status: Literal["ready"] = "ready"
    matches: list[CareerMatch]
    score_description: str = "Interest alignment only; not a scientific prediction or probability."


class ErrorDetail(Model):
    code: str
    message: str


class ErrorResponse(Model):
    error: ErrorDetail
