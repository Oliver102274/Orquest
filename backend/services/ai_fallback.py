"""Backend-only fallback for a selected career; HTTP schemas remain unchanged."""

from typing import Literal

from pydantic import Field

from backend.integrations.common import AIServiceError, AISettings, ProviderResult
from backend.integrations.gemini import GeminiService
from backend.integrations.grounding import CareerContext
from backend.integrations.openrouter import OpenRouterService
from backend.models import MatchRequest, MatchesResponse, Model, Resource
from backend.services.matching import match_careers


class FallbackResult(Model):
    tier: Literal["gemini", "openrouter", "deterministic", "static"]
    ai: ProviderResult | None = None
    matches: MatchesResponse | None = None
    mdc_resources: list[Resource] = Field(default_factory=list)
    external_resources: list[Resource] = Field(default_factory=list)


# Only known operational failures may advance to another model. Unrecognized or
# safety-related failures stop, including malformed/empty unstructured refusals.
RECOVERABLE = frozenset({"disabled", "missing_key", "missing_model", "request_limit", "input_limit",
                         "timeout", "network_error", "authentication_failed", "billing_limit",
                         "rate_limited", "provider_error", "paid_model_blocked"})
FREE_GEMINI_MODELS = frozenset({"gemini-3.1-flash-lite"})
# Formatting failures may use local catalog guidance, never another AI attempt.
LOCAL_ONLY_FAILURES = frozenset({"truncated_response", "invalid_structured_response"})


class CareerFallbackService:
    def __init__(self, settings: AISettings | None = None, *, gemini=None, openrouter=None):
        self.settings = settings or AISettings.from_env()
        self.gemini = gemini or GeminiService(self.settings)
        self.openrouter = openrouter or OpenRouterService(self.settings)

    def recommend(self, context: CareerContext, request: MatchRequest, cards, careers) -> FallbackResult:
        # Validate caller input before any external request, without inventing data.
        known_cards = {card.id for card in cards}
        if any(response.card_id not in known_cards for response in request.responses):
            from backend.services.matching import UnknownCardError
            raise UnknownCardError("One or more card IDs are not in the current deck.")
        providers = []
        if (self.settings.enabled and self.settings.gemini_free_tier_confirmed
                and self.settings.gemini_model in FREE_GEMINI_MODELS):
            providers.append(("gemini", self.gemini))
        if self.settings.enabled:
            providers.append(("openrouter", self.openrouter))
        for provider, service in providers:
            try:
                return FallbackResult(tier=provider, ai=service.explain_career(context))
            except AIServiceError as exc:
                if exc.code in LOCAL_ONLY_FAILURES:
                    break
                if exc.code not in RECOVERABLE:
                    raise
        matches = match_careers(request, cards, careers)
        if matches.matches:
            return FallbackResult(tier="deterministic", matches=matches)
        def verified(resources):
            return [resource for resource in resources if resource.verification_status == "verified"
                    and resource.source_url is not None and resource.verified_at is not None]
        return FallbackResult(tier="static", matches=matches,
                              mdc_resources=verified(context.career.mdc_resources),
                              external_resources=verified(context.career.external_resources))
