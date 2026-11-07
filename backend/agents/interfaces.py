"""Typed boundaries for future agents; no fabricated responses or SDK imports."""

from enum import Enum
from typing import Protocol

from pydantic import Field

from backend.models import Identifier, Model, Source, Tag


class AgentRole(str, Enum):
    CAREER = "career"
    MDC_EDUCATION = "mdc_education"
    EXTERNAL_RESOURCES = "external_resources"
    JOBS = "jobs"
    ROADMAP = "roadmap"


class AgentRequest(Model):
    career_id: Identifier | None = None
    interest_tags: list[Tag] = Field(default_factory=list)
    source_context: list[Source] = Field(default_factory=list)


class AgentResult(Model):
    """Provenance envelope; specialist payload schemas remain a future decision."""

    role: AgentRole
    sources: list[Source]
    # Each concrete specialist must add its own validated domain payload.


class SpecialistAgent(Protocol):
    role: AgentRole

    async def run(self, request: AgentRequest) -> AgentResult: ...


class OrquestraCoordinator(Protocol):
    """Future routing boundary; no runtime implementation or provider selection."""

    async def dispatch(self, role: AgentRole, request: AgentRequest) -> AgentResult: ...
