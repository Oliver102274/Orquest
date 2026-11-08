"""Production HTTP routes through the real Gemini SDK with offline MockTransport."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import httpx
from google import genai
from backend.production import create_public_app
from backend.integrations.common import RequestBudget
from backend.integrations.gemini import GeminiService
from test_backend import request


class PublicGeminiTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict('os.environ', {
            'ORQUESTRA_PUBLIC_DEMO': 'true', 'ORQUESTRA_AI_ENABLED': 'true',
            'PUBLIC_AI_ENABLED': 'true', 'GEMINI_UNBILLED_PROJECT_CONFIRMED': 'true',
            'GEMINI_FREE_TIER_CONFIRMED': 'true', 'GEMINI_MODEL': 'gemini-3.1-flash-lite',
            'GEMINI_API_KEY': 'offline-fixture', 'AI_MAX_REQUESTS_PER_PROVIDER': '1',
            'ORQUESTRA_MDC_DEMO_ENABLED': 'true',
        }, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        dist = Path(self.temp.name)
        (dist / 'index.html').write_text('fixture')
        self.app = create_public_app(dist)
        self.requests = []
        self.status = 200
        self.blocked = False
        budget = RequestBudget()
        def handler(request):
            self.requests.append(json.loads(request.content))
            if self.status != 200:
                return httpx.Response(self.status, json={'error': {'code': self.status,
                    'status': 'FAILED_PRECONDITION' if self.status == 400 else 'RESOURCE_EXHAUSTED', 'message': 'PRIVATE_FIXTURE'}})
            if self.blocked:
                return httpx.Response(200, json={'promptFeedback': {'blockReason': 'SAFETY'}})
            return httpx.Response(200, json={'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': json.dumps({
                'explanation': 'Mock Gemini answer: review the supplied MDC option.',
                'source_urls': ['https://www.mdc.edu/cybersecurityas/'],
                'resource_ids': ['resource_mdc_cybersecurity_as_demo'],
            })}]}}]})
        def factory(**kwargs):
            kwargs['http_options'] = kwargs['http_options'].model_copy(update={
                'httpx_client': httpx.Client(transport=httpx.MockTransport(handler))})
            return genai.Client(**kwargs)
        provider_patch = patch('backend.agents.job_coordinator.GeminiService',
            side_effect=lambda settings: GeminiService(settings, budget=budget, client_factory=factory))
        provider_patch.start()
        self.addCleanup(provider_patch.stop)
        self.router = Mock()
        router_patch = patch('backend.agents.job_coordinator.OpenRouterService', return_value=self.router)
        router_patch.start()
        self.addCleanup(router_patch.stop)

    def call(self, path='/api/career-questions', body=None):
        body = body or {'career_id': 'career_cybersecurity_analyst', 'question': 'What is the salary?'}
        status, raw, _ = asyncio.run(request(self.app, 'POST', path, body))
        self.assertEqual(status, 200 if path != '/api/progress' else 201)
        return json.loads(raw)

    def test_chat_success_then_global_quota_uses_catalog_for_all_routes(self):
        answer = self.call()
        self.assertEqual(answer['metadata']['provider'], 'gemini')
        self.assertEqual(answer['metadata']['status'], 'ai_generated')
        self.assertEqual(answer['source_urls'], ['https://www.mdc.edu/cybersecurityas/'])
        fallback = self.call()
        self.assertEqual(fallback['metadata']['reason'], 'request_limit')
        self.assertEqual(fallback['metadata']['status'], 'deterministic')
        self.assertIn('$129,180', fallback['answer'])
        roadmap = self.call('/api/roadmaps', {'career_id': 'career_cybersecurity_analyst'})
        self.assertEqual(roadmap['metadata']['reason'], 'request_limit')
        progress = self.call('/api/progress', {'target_id': 'career_cybersecurity_analyst'})
        self.assertTrue(progress['progress']['missions'])
        self.assertEqual(len(self.requests), 1)
        self.router.answer_question.assert_not_called()
        self.router.plan_job_roadmap.assert_not_called()

    def test_quota_error_falls_back_without_retry(self):
        self.status = 429
        answer = self.call()
        self.assertEqual(answer['metadata']['reason'], 'rate_limited')
        self.assertIn('$129,180', answer['answer'])
        self.assertEqual(len(self.requests), 1)
        self.router.answer_question.assert_not_called()

    def test_precondition_failure_falls_back_without_paid_provider(self):
        self.status = 400
        answer = self.call()
        self.assertEqual(answer['metadata']['reason'], 'failed_precondition')
        self.assertEqual(answer['metadata']['status'], 'deterministic')
        self.assertNotIn('PRIVATE_FIXTURE', json.dumps(answer))
        self.router.answer_question.assert_not_called()

    def test_safety_block_does_not_get_bypassed(self):
        self.blocked = True
        answer = self.call()
        self.assertEqual(answer['metadata']['status'], 'blocked')
        self.assertNotIn('$129,180', answer['answer'])
        self.router.answer_question.assert_not_called()

    def test_missing_public_opt_in_sends_no_requests(self):
        with patch.dict('os.environ', {'PUBLIC_AI_ENABLED': 'false'}):
            answer = self.call()
        self.assertEqual(answer['metadata']['status'], 'deterministic')
        self.assertEqual(self.requests, [])
