"""Strict free-only requests and local-only formatting recovery; no network."""
import json
import unittest
from unittest.mock import Mock
import httpx
from backend.integrations.common import AIServiceError, RequestBudget
from backend.integrations.openrouter import OpenRouterService
from backend.integrations.grounding import Explanation, RoadmapSuggestions
from backend.agents.job_coordinator import JobFirstCoordinator
from backend.job_models import JobRequest, QuestionRequest
from backend.services.ai_fallback import CareerFallbackService
from backend.models import Resource, CareerRecord, SwipeCard, MatchRequest
from test_integrations import context, settings, EXPLANATION, ROADMAP


class StructuredOpenRouterTests(unittest.TestCase):
    def setUp(self):
        self.context = context()
        self.config = settings(openrouter_key="fake-key", gemini_free_tier_confirmed=False)

    def service(self, content, finish="stop", refusal=None, cost=0):
        self.calls = []
        def handler(request):
            self.calls.append(json.loads(request.content))
            return httpx.Response(200, json={"model": "example/model:free", "choices": [{"message": {"content": content, "refusal": refusal}, "finish_reason": finish}], "usage": {"cost": cost}})
        return OpenRouterService(self.config, budget=RequestBudget(), transport=httpx.MockTransport(handler))

    def test_valid_chat_and_roadmap_strict_schema_and_free_constraints(self):
        for method, schema, output in [("answer_question", Explanation, EXPLANATION), ("plan_job_roadmap", RoadmapSuggestions, ROADMAP)]:
            result = getattr(self.service(json.dumps(output)), method)(self.context)
            self.assertEqual(result.output, output)
            payload = self.calls[0]
            self.assertEqual(payload["response_format"], {"type": "json_schema", "json_schema": {"name": schema.__name__, "strict": True, "schema": schema.model_json_schema()}})
            self.assertTrue(payload["provider"]["require_parameters"])
            self.assertFalse(payload["provider"]["allow_fallbacks"])
            self.assertEqual(payload["provider"]["max_price"], {"prompt": 0, "completion": 0, "request": 0})
            self.assertNotIn("plugins", payload)
            self.assertNotIn("models", payload)
            self.assertEqual(len(self.calls), 1)

    def test_invalid_json_missing_fields_and_extra_fields(self):
        for content in ['{"explanation":', '{}', json.dumps(dict(EXPLANATION, invented="field"))]:
            with self.assertRaisesRegex(AIServiceError, "invalid_structured_response"):
                self.service(content).answer_question(self.context)
            self.assertEqual(len(self.calls), 1)

    def test_truncation_rejected_even_if_json_parses(self):
        for content in ['{"explanation":', json.dumps(EXPLANATION)]:
            with self.assertRaisesRegex(AIServiceError, "truncated_response"):
                self.service(content, finish="length").answer_question(self.context)
            self.assertEqual(len(self.calls), 1)

    def test_refusal_cost_and_grounding_take_precedence(self):
        with self.assertRaisesRegex(AIServiceError, "safety_refusal"):
            self.service('{', finish="length", refusal="Blocked").answer_question(self.context)
        with self.assertRaisesRegex(AIServiceError, "unexpected_cost"):
            self.service('{', finish="length", cost=1).answer_question(self.context)
        with self.assertRaisesRegex(AIServiceError, "ungrounded_response"):
            self.service(json.dumps(dict(EXPLANATION, source_urls=["https://invented.invalid/"]))).answer_question(self.context)
        with self.assertRaisesRegex(AIServiceError, "invalid_response"):
            self.service("I cannot comply").answer_question(self.context)

    def test_job_contracts_format_failure_uses_local_guidance_only(self):
        career = self.context.career.model_copy(deep=True)
        resource = career.mdc_resources[0].model_dump()
        resource.update(verification_status="verified", verified_at="2026-01-01T00:00:00Z")
        career.mdc_resources = [Resource.model_validate(resource)]
        for code in ["truncated_response", "invalid_structured_response"]:
            gemini, router = Mock(), Mock()
            gemini.answer_question.side_effect = AIServiceError(code, "gemini")
            gemini.plan_job_roadmap.side_effect = AIServiceError(code, "gemini")
            config = self.config.model_copy(update={"gemini_free_tier_confirmed": True, "gemini_model": "gemini-3.1-flash-lite"})
            service = JobFirstCoordinator(config, gemini=gemini, openrouter=router)
            answer = service.answer(career, QuestionRequest(career_id=career.career_id, question="Where can I learn?"))
            plan = service.roadmap(career, JobRequest(career_id=career.career_id))
            self.assertEqual(answer.metadata.status, "deterministic")
            self.assertEqual(plan.metadata.status, "deterministic")
            self.assertIn("not an AI answer", answer.answer)
            router.answer_question.assert_not_called()
            router.plan_job_roadmap.assert_not_called()

    def test_matching_format_failure_does_not_retry_another_model(self):
        gemini, router = Mock(), Mock()
        gemini.explain_career.side_effect = AIServiceError("truncated_response", "gemini")
        config = self.config.model_copy(update={"gemini_free_tier_confirmed": True, "gemini_model": "gemini-3.1-flash-lite"})
        result = CareerFallbackService(config, gemini=gemini, openrouter=router).recommend(
            self.context, MatchRequest(responses=[{"card_id": "card_fixture", "preference": "like"}]),
            [SwipeCard(id="card_fixture", activity="Fixture", interest_tags=["test_tag"])],
            [CareerRecord(**self.context.career.model_dump(), interest_tags=["test_tag"])])
        self.assertEqual(result.tier, "deterministic")
        router.explain_career.assert_not_called()
