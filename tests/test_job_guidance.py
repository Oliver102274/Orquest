"""Job-first endpoint/provider tests. All network use is forbidden."""
import asyncio
import json
import socket
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
import httpx
from google.genai import types

from backend.main import create_app
from backend.models import CareerDetail
from backend.job_models import JobRequest, QuestionRequest
from backend.agents.job_coordinator import JobFirstCoordinator, evidence_context
from backend.integrations.common import AISettings, AIServiceError, ProviderResult, RequestBudget
from backend.integrations.gemini import GeminiService
from backend.integrations.openrouter import OpenRouterService
from test_backend import request as asgi_request

RESOURCE = dict(id="resource_test", title="Fixture education option", organization="Test", type="course",
                source_url="https://example.org/resource", verified_at="2026-01-01T00:00:00Z", verification_status="verified")
EXPLANATION = dict(explanation="Compare the supplied option with your goal.", source_urls=[RESOURCE["source_url"]], resource_ids=[RESOURCE["id"]])
PLAN = dict(steps=[dict(title="Evaluate", instruction="Review the supplied option.", resource_ids=[RESOURCE["id"]])], source_urls=[RESOURCE["source_url"]])


class JobGuidanceTests(unittest.TestCase):
    def setUp(self):
        original_connect = socket.socket.connect
        def local_only(sock, address):
            # Windows asyncio uses a loopback socket pair internally.
            if isinstance(address, tuple) and address[0] in {"127.0.0.1", "::1"}:
                return original_connect(sock, address)
            raise AssertionError("External network forbidden")
        self.network = patch.object(socket.socket, "connect", local_only)
        self.network.start()
        self.addCleanup(self.network.stop)
        self.career = CareerDetail(career_id="career_test", title="Target occupation", summary="Unverified description",
            requirements=["Unverified requirement"], sources=[], mdc_resources=[RESOURCE], external_resources=[])
        self.question = QuestionRequest(career_id="career_test", question="Where should I start?", education_level="High school",
            starting_point="New learner", goals=["Investigate this job"], interest_tags=["security"])
        self.settings = AISettings(enabled=True, max_requests=5, gemini_key="fixture", openrouter_key="fixture", openrouter_model="fixture/model:free",
            gemini_model="gemini-3.1-flash-lite", gemini_free_tier_confirmed=True)

    def result(self, output):
        return ProviderResult(provider="fixture", model="fixture", output=output)

    def test_question_gemini_context_and_no_second_provider(self):
        gemini, router = Mock(), Mock()
        gemini.answer_question.return_value = self.result(EXPLANATION)
        answer = JobFirstCoordinator(self.settings, gemini=gemini, openrouter=router).answer(self.career, self.question)
        self.assertEqual(answer.metadata.provider, "gemini")
        context = gemini.answer_question.call_args.args[0]
        self.assertEqual(context.question, self.question.question)
        self.assertEqual(context.education_level, "High school")
        self.assertEqual(context.career.requirements, [])
        self.assertNotIn("Unverified description", context.career.summary)
        router.answer_question.assert_not_called()

    def test_timeout_fallback_to_openrouter_for_question_and_roadmap(self):
        for operation, output in [("answer_question", EXPLANATION), ("plan_job_roadmap", PLAN)]:
            gemini, router = Mock(), Mock()
            getattr(gemini, operation).side_effect = AIServiceError("timeout", "gemini")
            getattr(router, operation).return_value = self.result(output)
            service = JobFirstCoordinator(self.settings, gemini=gemini, openrouter=router)
            result = service.answer(self.career, self.question) if operation == "answer_question" else service.roadmap(self.career, JobRequest(career_id="career_test"))
            self.assertEqual(result.metadata.provider, "openrouter")

    def test_refusal_does_not_retry_or_generate_missions(self):
        gemini, router = Mock(), Mock()
        gemini.plan_job_roadmap.side_effect = AIServiceError("safety_refusal", "gemini")
        result = JobFirstCoordinator(self.settings, gemini=gemini, openrouter=router).roadmap(self.career, JobRequest(career_id="career_test"))
        self.assertEqual(result.metadata.status, "blocked")
        self.assertEqual(result.suggested_missions, [])
        router.plan_job_roadmap.assert_not_called()

    def test_invented_reference_blocked(self):
        gemini, router = Mock(), Mock()
        gemini.answer_question.return_value = self.result(dict(EXPLANATION, source_urls=["https://invented.invalid"]))
        result = JobFirstCoordinator(self.settings, gemini=gemini, openrouter=router).answer(self.career, self.question)
        self.assertEqual(result.metadata.status, "blocked")
        self.assertEqual(result.source_urls, [])
        router.answer_question.assert_not_called()

    def test_no_credentials_deterministic_and_missing_resources(self):
        service = JobFirstCoordinator(AISettings(enabled=True, max_requests=1))
        answer = service.answer(self.career, self.question)
        self.assertEqual(answer.metadata.status, "deterministic")
        self.assertIn("not an AI answer", answer.answer)
        self.career.mdc_resources = []
        result = service.roadmap(self.career, JobRequest(career_id="career_test"))
        self.assertEqual(result.mdc_pathways, [])
        self.assertEqual(result.relevant_skills_and_qualifications, [])
        self.assertTrue(any("No verified" in gap for gap in result.evidence_gaps))
        self.assertNotIn("xp", result.model_dump_json())

    def test_verified_requirements_alternatives_and_draft_missions(self):
        self.career.sources = []
        data = self.career.model_dump()
        data["sources"] = [dict(title="Fixture", url="https://example.org/job", verified_at="2026-01-01T00:00:00Z", verification_status="verified")]
        data["external_resources"] = [dict(RESOURCE, id="resource_alternative")]
        career = CareerDetail.model_validate(data)
        result = JobFirstCoordinator(AISettings()).roadmap(career, JobRequest(career_id="career_test"))
        self.assertEqual(result.relevant_skills_and_qualifications, career.requirements)
        self.assertEqual(len(result.alternative_resources), 1)
        self.assertEqual(result.career_milestones, result.suggested_missions)
        self.assertEqual(len({m.id for m in result.suggested_missions}), len(result.suggested_missions))

    def test_endpoints_validation_and_old_contracts(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict("os.environ", {"ORQUESTRA_AI_ENABLED": "false"}):
            path = Path(directory)
            (path / "careers.json").write_text(json.dumps({"careers": [dict(self.career.model_dump(mode="json"), interest_tags=["security"])]}))
            (path / "cards.json").write_text('{"cards": []}')
            app = create_app(path, demo_enabled=False)
            def call(route, body):
                status, raw, _ = asyncio.run(asgi_request(app, "POST", route, body))
                return status, json.loads(raw)
            status, body = call("/api/career-questions", self.question.model_dump())
            self.assertEqual(status, 200)
            self.assertEqual(body["target_occupation"]["career_id"], "career_test")
            mocked = Mock()
            mocked.answer_question.return_value = self.result(EXPLANATION)
            service = JobFirstCoordinator(self.settings, gemini=mocked, openrouter=Mock())
            with patch("backend.main.JobFirstCoordinator", return_value=service):
                status, body = call("/api/career-questions", self.question.model_dump())
                self.assertEqual(status, 200)
                self.assertEqual(body["metadata"]["status"], "ai_generated")
                self.assertEqual(body["source_urls"], EXPLANATION["source_urls"])
            self.assertEqual(call("/api/roadmaps", {"career_id": "career_test"})[0], 200)
            self.assertEqual(call("/api/career-questions", {"career_id": "unknown", "question": "Hello"})[0], 404)
            for body in [{"career_id": "career_test", "question": " "}, {"career_id": "career_test", "question": "a" * 1001}, {"career_id": "career_test", "question": "Hi", "model": "paid"}]:
                self.assertEqual(call("/api/career-questions", body)[0], 422)

    def test_unverified_only_never_calls_providers(self):
        self.career.mdc_resources = []
        gemini, router = Mock(), Mock()
        result = JobFirstCoordinator(self.settings, gemini=gemini, openrouter=router).answer(self.career, self.question)
        self.assertEqual(result.metadata.reason, "insufficient_evidence")
        gemini.answer_question.assert_not_called()
        router.answer_question.assert_not_called()

    def test_malformed_provider_output_stops_fallback(self):
        gemini, router = Mock(), Mock()
        gemini.answer_question.return_value = self.result({"unexpected": "not an answer"})
        result = JobFirstCoordinator(self.settings, gemini=gemini, openrouter=router).answer(self.career, self.question)
        self.assertEqual(result.metadata.status, "blocked")
        router.answer_question.assert_not_called()

    def test_real_openrouter_transport_both_operations_free_only(self):
        for method, output in [("answer_question", EXPLANATION), ("plan_job_roadmap", PLAN)]:
            captured = []
            def transport(request):
                captured.append(json.loads(request.content))
                return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(output)}}], "usage": {"cost": 0}})
            service = OpenRouterService(self.settings, budget=RequestBudget(), transport=httpx.MockTransport(transport))
            getattr(service, method)(evidence_context(self.career, self.question))
            self.assertEqual(captured[0]["provider"]["max_price"], {"prompt": 0, "completion": 0, "request": 0})
            self.assertIn(self.question.question, captured[0]["messages"][1]["content"])

    def test_real_gemini_sdk_both_operations_mocked(self):
        for method, output in [("answer_question", EXPLANATION), ("plan_job_roadmap", PLAN)]:
            factory = MagicMock()
            factory.return_value.__enter__.return_value.models.generate_content.return_value = types.GenerateContentResponse(
                candidates=[types.Candidate(content=types.Content(parts=[types.Part(text=json.dumps(output))]))])
            service = GeminiService(self.settings, budget=RequestBudget(), client_factory=factory)
            result = getattr(service, method)(evidence_context(self.career, self.question))
            self.assertEqual(result.output, output)

    def test_paid_gemini_skipped_and_paid_openrouter_blocked(self):
        settings = self.settings.model_copy(update={"gemini_model": "paid-model", "openrouter_model": "vendor/paid"})
        gemini = Mock()
        result = JobFirstCoordinator(settings, gemini=gemini).answer(self.career, self.question)
        self.assertEqual(result.metadata.status, "deterministic")
        gemini.answer_question.assert_not_called()
