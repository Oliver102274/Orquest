"""Final HTTP 429 regression through the actual adapter and HTTP route, offline."""
import asyncio
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import httpx
from backend.main import create_app
from backend.agents.job_coordinator import JobFirstCoordinator
from backend.integrations.common import AISettings, RequestBudget
from backend.integrations.openrouter import OpenRouterService
from test_backend import request


class FinalIntegrationTests(unittest.TestCase):
    def test_429_returns_labelled_deterministic_guidance_without_retry(self):
        calls = []
        def unavailable(req):
            calls.append(req)
            return httpx.Response(429, json={"error": {"message": "Fixture rate limit"}})
        settings = AISettings(enabled=True, max_requests=1, openrouter_key="fixture-only")
        router = OpenRouterService(settings, budget=RequestBudget(), transport=httpx.MockTransport(unavailable))
        gemini = Mock()
        coordinator = JobFirstCoordinator(settings, gemini=gemini, openrouter=router)
        root = Path(__file__).resolve().parents[1]
        app = create_app(root / "data", demo_enabled=True)
        with patch("backend.main.JobFirstCoordinator", return_value=coordinator), patch("psycopg.connect") as db:
            status, raw, _ = asyncio.run(request(app, "POST", "/api/career-questions", {
                "career_id": "career_cybersecurity_analyst", "question": "Where can I learn?"}))
        body = json.loads(raw)
        self.assertEqual(status, 200)
        self.assertEqual(body["metadata"]["status"], "deterministic")
        self.assertEqual(body["metadata"]["reason"], "rate_limited")
        self.assertIn("not an AI answer", body["answer"])
        self.assertIn("https://www.mdc.edu/cybersecurityas/", body["source_urls"])
        self.assertEqual(len(calls), 1)
        gemini.answer_question.assert_not_called()
        db.assert_not_called()
