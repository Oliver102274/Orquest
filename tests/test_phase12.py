"""Offline approval gates and database-independent guidance."""
import asyncio
import contextlib
import io
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch
from backend.integrations.common import AISettings, AIServiceError
from backend.integrations.live_check import main, execute, prepare
from backend.main import create_app
from test_backend import request


class Phase12Tests(unittest.TestCase):
    def test_dry_run_never_calls_provider(self):
        with patch.dict(os.environ, {}, clear=True), patch("backend.integrations.live_check.load_local_env"), patch("backend.integrations.live_check.execute") as live, contextlib.redirect_stdout(io.StringIO()):
            for provider in ["gemini", "openrouter"]:
                self.assertEqual(main([provider]), 0)
            live.assert_not_called()

    def test_approval_and_free_project_gates(self):
        with patch("backend.integrations.live_check.GeminiService") as provider:
            with self.assertRaisesRegex(AIServiceError, "approval_required"):
                execute("gemini", AISettings())
            with self.assertRaisesRegex(AIServiceError, "free_tier_not_confirmed"):
                execute("gemini", AISettings(), approved=True)
            provider.assert_not_called()

    def test_fixed_limits_and_single_source(self):
        context, settings = prepare("openrouter", AISettings(max_requests=100, max_output_tokens=4096))
        self.assertEqual(settings.max_requests, 1)
        self.assertEqual(settings.max_output_tokens, 512)
        self.assertEqual(settings.openrouter_model, "openrouter/free")
        self.assertEqual(len(context.career.mdc_resources), 1)
        self.assertEqual(context.career.external_resources, [])

    def test_manual_openrouter_preserves_explicit_free_choice(self):
        _, settings = prepare("openrouter", AISettings(openrouter_model="fixture/model:free"))
        self.assertEqual(settings.openrouter_model, "fixture/model:free")

    def test_real_endpoints_with_database_unavailable(self):
        root = Path(__file__).resolve().parents[1]
        with patch.dict(os.environ, {"ORQUESTRA_AI_ENABLED": "false"}, clear=True), patch("psycopg.connect", side_effect=AssertionError("No database calls")) as db:
            app = create_app(root / "data", demo_enabled=True)
            for route, body in [("/api/career-questions", {"career_id": "career_cybersecurity_analyst", "question": "Where can I learn?"}),
                                ("/api/roadmaps", {"career_id": "career_cybersecurity_analyst"})]:
                status, raw, _ = asyncio.run(request(app, "POST", route, body))
                result = json.loads(raw)
                self.assertEqual(status, 200)
                self.assertEqual(result["metadata"]["status"], "deterministic")
                self.assertTrue(result["source_urls"])
            db.assert_not_called()
