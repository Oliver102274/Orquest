"""Zero-budget routing and failure tests; every external transport is mocked."""

import json
import socket
import unittest
from unittest.mock import Mock, patch

import httpx
from google.genai import types

from backend.integrations.common import AIServiceError, AISettings, ProviderResult, RequestBudget
from backend.integrations.openrouter import OpenRouterService
from backend.models import CareerRecord, MatchRequest, SwipeCard
from backend.services.ai_fallback import CareerFallbackService
import test_integrations as fixtures
from test_integrations import EXPLANATION, context, settings


class FallbackTests(unittest.TestCase):
    def setUp(self):
        guard = patch.object(socket.socket, "connect", side_effect=AssertionError("Live network forbidden"))
        guard.start()
        self.addCleanup(guard.stop)
        self.context = context()
        self.cards = [SwipeCard(id="card_test", activity="Fixture", interest_tags=["test_tag"])]
        self.careers = [CareerRecord(**self.context.career.model_dump(), interest_tags=["test_tag"])]
        self.request = MatchRequest(responses=[{"card_id": "card_test", "preference": "like"}])
        self.config = settings(gemini_model="gemini-3.1-flash-lite", gemini_free_tier_confirmed=True,
                               openrouter_key="fake-only", openrouter_model="fixture/model:free")

    def run_chain(self, service):
        return service.recommend(self.context, self.request, self.cards, self.careers)

    def test_free_request_parameters_and_usage(self):
        seen = []
        def route(request):
            seen.append(request)
            return httpx.Response(200, json={"model": "example/model:free", "choices": [{"message": {"content": json.dumps(EXPLANATION)}, "finish_reason": "stop"}], "usage": {"cost": 0}})
        result = OpenRouterService(self.config, budget=RequestBudget(), transport=httpx.MockTransport(route)).explain_career(self.context)
        self.assertEqual(result.provider, "openrouter")
        payload = json.loads(seen[0].content)
        self.assertEqual(str(seen[0].url), "https://openrouter.ai/api/v1/chat/completions")
        self.assertEqual(payload["provider"]["max_price"], {"prompt": 0, "completion": 0, "request": 0})
        self.assertFalse(payload["provider"]["allow_fallbacks"])
        self.assertNotIn("models", payload)
        self.assertNotIn("plugins", payload)

    def test_paid_models_rejected_before_transport(self):
        for model in ["openrouter/free", "openrouter/auto", "openai/gpt-4o-mini", "foo/bar:free:online", "foo/bar:free "]:
            transport = Mock()
            service = OpenRouterService(settings(openrouter_key="fake", openrouter_model=model), transport=transport)
            with self.assertRaises(AIServiceError) as caught:
                service.explain_career(self.context)
            self.assertEqual(caught.exception.code, "paid_model_blocked")
            transport.handle_request.assert_not_called()

    def test_gemini_success_does_not_call_other_provider(self):
        gemini, router = Mock(), Mock()
        gemini.explain_career.return_value = ProviderResult(provider="gemini", model="test", output=EXPLANATION)
        self.assertEqual(self.run_chain(CareerFallbackService(self.config, gemini=gemini, openrouter=router)).tier, "gemini")
        router.explain_career.assert_not_called()

    def test_operational_failures_follow_order(self):
        for code in ["timeout", "network_error", "rate_limited", "request_limit", "provider_error"]:
            gemini, router = Mock(), Mock()
            gemini.explain_career.side_effect = AIServiceError(code, "gemini")
            router.explain_career.return_value = ProviderResult(provider="openrouter", model="test:free", output=EXPLANATION)
            self.assertEqual(self.run_chain(CareerFallbackService(self.config, gemini=gemini, openrouter=router)).tier, "openrouter")
            gemini.explain_career.assert_called_once()
            router.explain_career.assert_called_once()
            router.explain_career.side_effect = AIServiceError(code, "openrouter")
            self.assertEqual(self.run_chain(CareerFallbackService(self.config, gemini=gemini, openrouter=router)).tier, "deterministic")

    def test_refusals_stop_entire_chain(self):
        for code in ["safety_refusal", "permission_denied", "invalid_response", "empty_response", "ungrounded_response", "unexpected_cost"]:
            gemini, router = Mock(), Mock()
            gemini.explain_career.side_effect = AIServiceError(code, "gemini")
            with self.assertRaises(AIServiceError), patch("backend.services.ai_fallback.match_careers") as local:
                self.run_chain(CareerFallbackService(self.config, gemini=gemini, openrouter=router))
            router.explain_career.assert_not_called()
            local.assert_not_called()

    def test_unconfirmed_or_paid_gemini_is_skipped(self):
        for config in [settings(gemini_free_tier_confirmed=False), settings(gemini_free_tier_confirmed=True, gemini_model="paid-model")]:
            gemini, router = Mock(), Mock()
            router.explain_career.side_effect = AIServiceError("missing_key", "openrouter")
            self.assertEqual(self.run_chain(CareerFallbackService(config, gemini=gemini, openrouter=router)).tier, "deterministic")
            gemini.explain_career.assert_not_called()

    def test_no_credentials_or_disabled_ai_works(self):
        for config in [AISettings(), AISettings(enabled=True, max_requests=1)]:
            result = self.run_chain(CareerFallbackService(config))
            self.assertEqual(result.tier, "deterministic")
            self.assertEqual(result.matches.matches[0].interest_score, 100)

    def test_static_only_returns_verified_resources(self):
        self.request = MatchRequest(responses=[{"card_id": "card_test", "preference": "skip"}])
        resource = self.context.career.mdc_resources[0].model_dump(mode="json")
        resource.update(verification_status="verified", verified_at="2026-11-07T00:00:00Z")
        from backend.models import Resource
        self.context.career.mdc_resources = [Resource.model_validate(resource)]
        result = self.run_chain(CareerFallbackService(AISettings()))
        self.assertEqual(result.tier, "static")
        self.assertEqual(len(result.mdc_resources), 1)
        self.assertEqual(result.external_resources, [])
        self.assertEqual(result.matches.matches, [])

    def test_openrouter_refusals_and_timeouts(self):
        bodies = [
            {"choices": [{"message": {"refusal": "No", "content": None}}]},
            {"choices": [{"message": {"content": "No"}, "finish_reason": "content_filter"}]},
            {"error": {"type": "refusal", "code": 403}},
            {"error": {"code": 400}},
            {"error": {"code": 500, "metadata": {"reason": "guardrail blocked"}}},
        ]
        for body in bodies:
            service = OpenRouterService(self.config, budget=RequestBudget(), transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body)))
            with self.assertRaises(AIServiceError) as caught:
                service.explain_career(self.context)
            self.assertEqual(caught.exception.code, "safety_refusal")
        for status in [400, 403, 429, 503]:
            service = OpenRouterService(self.config, budget=RequestBudget(), transport=httpx.MockTransport(lambda _: httpx.Response(status)))
            with self.assertRaises(AIServiceError) as caught:
                service.explain_career(self.context)
            self.assertEqual(caught.exception.code, "safety_refusal" if status in {400,403} else "rate_limited" if status == 429 else "provider_error")
        def fail(_):
            raise httpx.ReadTimeout("private provider body")
        service = OpenRouterService(self.config, budget=RequestBudget(), transport=httpx.MockTransport(fail))
        with self.assertRaises(AIServiceError) as caught:
            service.explain_career(self.context)
        self.assertEqual(str(caught.exception), "openrouter: timeout")

    def test_gemini_structured_safety_block(self):
        # Use the existing mocked-client helper, never a real provider.
        response = types.GenerateContentResponse(prompt_feedback=types.GenerateContentResponsePromptFeedback(block_reason="SAFETY"))
        helper = fixtures.IntegrationTests()
        service, factory = helper.gemini(response)
        with self.assertRaises(AIServiceError) as caught:
            service.explain_career(self.context)
        self.assertEqual(caught.exception.code, "safety_refusal")


if __name__ == "__main__":
    unittest.main()
