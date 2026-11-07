"""Additive, draft job-guidance contracts; no XP or persistence state."""
from typing import Annotated, Literal
from pydantic import Field, StringConstraints
from backend.models import Model, Identifier, Tag, Resource

StudentText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class JobRequest(Model):
    career_id: Identifier
    interest_tags: list[Tag] = Field(default_factory=list, max_length=40)
    education_level: StudentText | None = None
    starting_point: StudentText | None = None
    preferences: list[StudentText] = Field(default_factory=list, max_length=10)
    goals: list[StudentText] = Field(default_factory=list, max_length=10)


class QuestionRequest(JobRequest):
    question: StudentText


class GuidanceMetadata(Model):
    status: Literal["ai_generated", "deterministic", "blocked"]
    provider: Literal["gemini", "openrouter", "deterministic", "none"]
    reason: str | None = None
    review_required: bool = True


class TargetOccupation(Model):
    career_id: Identifier
    title: str


class QuestionResponse(Model):
    target_occupation: TargetOccupation
    answer: str
    source_urls: list[str]
    resource_ids: list[str]
    metadata: GuidanceMetadata


class MissionSuggestion(Model):
    id: str
    title: str
    instruction: str
    resource_ids: list[str]


class RoadmapResponse(Model):
    target_occupation: TargetOccupation
    relevant_skills_and_qualifications: list[str]
    mdc_pathways: list[Resource]
    alternative_resources: list[Resource]
    career_milestones: list[MissionSuggestion]
    suggested_missions: list[MissionSuggestion]
    source_urls: list[str]
    evidence_gaps: list[str]
    metadata: GuidanceMetadata
