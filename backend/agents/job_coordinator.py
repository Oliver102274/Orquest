"""Job-first orchestration over existing adapters. No research or paid routing."""
from pydantic import ValidationError
from backend.models import CareerDetail
from backend.job_models import (GuidanceMetadata, TargetOccupation, QuestionResponse,
                                RoadmapResponse, MissionSuggestion)
from backend.integrations.common import AISettings, AIServiceError
from backend.integrations.gemini import GeminiService
from backend.integrations.openrouter import OpenRouterService
from backend.integrations.grounding import JobContext, Explanation, RoadmapSuggestions, check_references
from backend.services.ai_fallback import FREE_GEMINI_MODELS, RECOVERABLE


def verified(item):
    return item.verification_status == "verified" and item.verified_at is not None


def evidence_context(career, request):
    """Do not send unverified catalog claims to providers as evidence."""
    sources = [s for s in career.sources if verified(s) and s.url]
    safe = CareerDetail(
        career_id=career.career_id, title=career.title,
        summary=career.summary if sources else "Verified occupation description not supplied.",
        requirements=career.requirements if sources else [], sources=sources,
        mdc_resources=[r for r in career.mdc_resources if verified(r) and r.source_url],
        external_resources=[r for r in career.external_resources if verified(r) and r.source_url],
    )
    return JobContext(career=safe, **request.model_dump(exclude={"career_id"}))


class JobFirstCoordinator:
    """Replaceable planning boundary for Teammate 3's future approved generator."""
    def __init__(self, settings=None, *, gemini=None, openrouter=None):
        self.settings = settings or AISettings.from_env()
        self.gemini = gemini or GeminiService(self.settings)
        self.openrouter = openrouter or OpenRouterService(self.settings)

    def generate(self, context, operation, schema):
        if not (context.career.sources or context.career.mdc_resources or context.career.external_resources):
            return None, GuidanceMetadata(status="deterministic", provider="deterministic", reason="insufficient_evidence")
        providers = []
        if self.settings.enabled:
            if self.settings.gemini_free_tier_confirmed and self.settings.gemini_model in FREE_GEMINI_MODELS:
                providers.append(("gemini", self.gemini))
            providers.append(("openrouter", self.openrouter))
        reason = "ai_disabled" if not self.settings.enabled else "ai_unavailable"
        for name, provider in providers:
            try:
                result = getattr(provider, operation)(context)
                output = schema.model_validate(result.output)
                check_references(output, context, name)
                return output, GuidanceMetadata(status="ai_generated", provider=name)
            except ValidationError:
                return None, GuidanceMetadata(status="blocked", provider="none", reason="invalid_response")
            except AIServiceError as exc:
                reason = exc.code
                if exc.code not in RECOVERABLE:
                    return None, GuidanceMetadata(status="blocked", provider="none", reason=exc.code)
        return None, GuidanceMetadata(status="deterministic", provider="deterministic", reason=reason)

    @staticmethod
    def target(context):
        return TargetOccupation(career_id=context.career.career_id, title=context.career.title)

    def answer(self, career, request):
        context = evidence_context(career, request)
        output, metadata = self.generate(context, "answer_question", Explanation)
        resources = context.career.mdc_resources + context.career.external_resources
        if output:
            return QuestionResponse(target_occupation=self.target(context), answer=output.explanation,
                                    source_urls=output.source_urls, resource_ids=output.resource_ids, metadata=metadata)
        blocked = metadata.status == "blocked"
        answer = "The AI response could not be provided safely." if blocked else (
            "AI is unavailable. This is a catalog-based fallback, not an AI answer to your question. "
            + ("Review the linked verified resources for this target occupation; they are options, not required degrees."
               if resources else "No verified educational resources are currently available for this target occupation.")
        )
        return QuestionResponse(target_occupation=self.target(context), answer=answer,
                                source_urls=[] if blocked else sorted({str(r.source_url) for r in resources}),
                                resource_ids=[] if blocked else [r.id for r in resources], metadata=metadata)

    def roadmap(self, career, request):
        context = evidence_context(career, request)
        output, metadata = self.generate(context, "plan_job_roadmap", RoadmapSuggestions)
        resources = context.career.mdc_resources + context.career.external_resources
        gaps = []
        if not context.career.requirements:
            gaps.append("Verified job skills and qualifications have not been supplied; requirements need research.")
        if not resources:
            gaps.append("No verified educational resources are available.")
        if not request.starting_point or not request.education_level:
            gaps.append("Student starting point or education level was not provided; no prior learning is assumed.")
        if metadata.status == "blocked":
            steps, urls = [], []
        elif output:
            steps, urls = output.steps, output.source_urls
        else:
            # Actions for researching a path, not fabricated occupation requirements.
            steps = [dict(title="Investigate target-job requirements", instruction="Review verified occupation evidence with an advisor and identify remaining requirements before selecting education.", resource_ids=[])]
            steps += [dict(title="Evaluate an educational option", instruction=f"Review {r.title} for relevance to your target job and starting point. Confirm entry requirements and costs with the provider; this is not a mandatory credential.", resource_ids=[r.id]) for r in resources[:6]]
            steps += [dict(title="Review remaining gaps", instruction="Compare your current skills with verified job requirements and agree on next steps with an advisor.", resource_ids=[])]
            urls = sorted({str(r.source_url) for r in resources} | {str(s.url) for s in context.career.sources})
        missions = [MissionSuggestion(id=f"draft_step_{i+1}", **(s.model_dump() if hasattr(s, "model_dump") else s)) for i, s in enumerate(steps)]
        return RoadmapResponse(target_occupation=self.target(context),
            relevant_skills_and_qualifications=context.career.requirements,
            mdc_pathways=context.career.mdc_resources, alternative_resources=context.career.external_resources,
            career_milestones=missions, suggested_missions=missions, source_urls=urls,
            evidence_gaps=gaps, metadata=metadata)
