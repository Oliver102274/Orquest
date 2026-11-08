"""Public demo route, safety gate, and resource limit tests; no network providers."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.production import create_public_app, PublicDemoLimits
from backend.integrations.common import AISettings, RequestBudget, AIServiceError
from test_backend import request


class PublicDemoTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict('os.environ', {'ORQUESTRA_AI_ENABLED': 'false'}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dist = Path(self.temp.name) / 'dist'
        self.dist.mkdir()
        (self.dist / 'index.html').write_text('<html>ORQUEST BUILD</html>')
        (self.dist / 'assets').mkdir()
        (self.dist / 'assets/app.js').write_text('/* fixture */')
        self.app = create_public_app(self.dist)

    def call(self, method, path, body=None):
        return asyncio.run(request(self.app, method, path, body))

    def test_refresh_assets_api_and_private_paths(self):
        for path in ['/', '/explore', '/roadmap', '/rpg']:
            status, raw, headers = self.call('GET', path)
            self.assertEqual(status, 200)
            self.assertIn(b'ORQUEST BUILD', raw)
            self.assertEqual(headers[b'x-content-type-options'], b'nosniff')
        self.assertEqual(self.call('GET', '/assets/app.js')[0], 200)
        self.assertEqual(self.call('GET', '/api/health')[0], 200)
        self.assertEqual(len(json.loads(self.call('GET', '/api/cards')[1])['cards']), 12)
        for path in ['/.env', '/backend/main.py', '/assets/missing.js', '/api/missing', '/../secret.txt']:
            self.assertEqual(self.call('GET', path)[0], 404)

    def test_rate_limit_then_window_reset(self):
        now = [0]
        limited = PublicDemoLimits(self.app, clock=lambda: now[0])
        # Use a lightweight dummy downstream to isolate limiter behavior.
        async def downstream(scope, receive, send):
            await send({'type': 'http.response.start', 'status': 200, 'headers': []})
            await send({'type': 'http.response.body', 'body': b'{}'})
        limited.app = downstream
        for _ in range(20):
            self.assertEqual(asyncio.run(request(limited, 'POST', '/api/roadmaps', {}))[0], 200)
        self.assertEqual(asyncio.run(request(limited, 'POST', '/api/roadmaps', {}))[0], 429)
        now[0] = 61
        self.assertEqual(asyncio.run(request(limited, 'POST', '/api/roadmaps', {}))[0], 200)

    def test_body_size_limit_and_no_provider_calls(self):
        with patch('backend.integrations.gemini.GeminiService._generate', side_effect=AssertionError('No live AI')):
            self.assertEqual(self.call('POST', '/api/career-questions', {'question': 'x' * 17000})[0], 413)
            status, raw, _ = self.call('POST', '/api/career-questions', {
                'career_id': 'career_cybersecurity_analyst', 'question': 'What is the salary?'})
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(raw)['metadata']['status'], 'deterministic')

    def test_concurrency_limit_and_release(self):
        async def scenario():
            release = asyncio.Event()
            async def downstream(scope, receive, send):
                await release.wait()
                await send({'type': 'http.response.start', 'status': 200, 'headers': []})
                await send({'type': 'http.response.body', 'body': b'{}'})
            limited = PublicDemoLimits(downstream)
            tasks = [asyncio.create_task(request(limited, 'POST', '/api/progress', {})) for _ in range(2)]
            await asyncio.sleep(0)
            self.assertEqual((await request(limited, 'POST', '/api/progress', {}))[0], 429)
            release.set()
            await asyncio.gather(*tasks)
            self.assertEqual(limited.active, 0)
        asyncio.run(scenario())

    def test_public_ai_requires_all_gates_and_bounded_budget(self):
        base = {'ORQUESTRA_PUBLIC_DEMO': 'true', 'ORQUESTRA_AI_ENABLED': 'true',
                'GEMINI_FREE_TIER_CONFIRMED': 'true', 'GEMINI_MODEL': 'gemini-3.1-flash-lite',
                'AI_MAX_REQUESTS_PER_PROVIDER': '2', 'GEMINI_API_KEY': 'fixture',
                'OPENROUTER_API_KEY': 'fixture', 'SWARMS_API_KEY': 'fixture', 'PRUNE_API_KEY': 'fixture'}
        with patch.dict('os.environ', base, clear=True):
            self.assertFalse(AISettings.from_env().enabled)
        base.update(PUBLIC_AI_ENABLED='true', GEMINI_UNBILLED_PROJECT_CONFIRMED='true')
        with patch.dict('os.environ', base, clear=True):
            settings = AISettings.from_env()
            self.assertTrue(settings.enabled)
            self.assertLessEqual(settings.max_output_tokens, 512)
            for provider in ['openrouter', 'swarms', 'prune']:
                self.assertFalse(getattr(settings, provider + '_key').get_secret_value())
            budget = RequestBudget()
            for _ in range(2): budget.reserve('gemini', settings, {})
            with self.assertRaisesRegex(AIServiceError, 'request_limit'): budget.reserve('gemini', settings, {})
        for change in [{'AI_MAX_REQUESTS_PER_PROVIDER': '6'}, {'GEMINI_MODEL': 'paid-model'}, {'GEMINI_FREE_TIER_CONFIRMED': 'false'}]:
            with patch.dict('os.environ', {**base, **change}, clear=True):
                self.assertFalse(AISettings.from_env().enabled)
