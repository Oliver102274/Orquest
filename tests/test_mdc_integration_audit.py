"""Real merged MDC data through API and Gemini SDK; provider traffic is mocked."""
import asyncio
import json
import socket
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from google import genai
from backend.main import create_app
from backend.integrations.common import RequestBudget
from backend.integrations.gemini import GeminiService
from backend.agents.job_coordinator import evidence_context, JobFirstCoordinator
from backend.integrations.common import AISettings
from backend.job_models import QuestionRequest
from backend.services.data import DataRepository
from backend.services.job_catalog import JobCatalogRepository, CAREER_OCCUPATIONS
from test_backend import request

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {'career_software_developer': 2, 'career_data_analyst': 2,
            'career_cybersecurity_analyst': 1}


class MDCAuditTests(unittest.TestCase):
    def setUp(self):
        original = socket.socket.connect
        def local_only(sock, address):
            if isinstance(address, tuple) and address[0] in {'127.0.0.1', '::1'}:
                return original(sock, address)
            raise AssertionError('External network forbidden')
        guard = patch.object(socket.socket, 'connect', local_only)
        guard.start()
        self.addCleanup(guard.stop)
        env = patch.dict('os.environ', {'ORQUESTRA_AI_ENABLED': 'false'}, clear=True)
        env.start()
        self.addCleanup(env.stop)
        self.repo = DataRepository(ROOT / 'data', ROOT / 'data/demo')
        self.jobs = JobCatalogRepository(ROOT / 'data')
        self.catalog = self.jobs.load()
        self.app = create_app(ROOT / 'data', demo_enabled=True)

    def call(self, method, route, body=None):
        status, raw, _ = asyncio.run(request(self.app, method, route, body))
        return status, json.loads(raw)

    def test_all_data_unique_ids_and_exact_coverage(self):
        for path in (ROOT / 'data').rglob('*.json'):
            json.loads(path.read_text(encoding='utf-8-sig'))
        careers = self.repo.careers()
        self.assertEqual({c.career_id: len(c.mdc_resources) for c in careers}, EXPECTED)
        resources = [r for c in careers for r in c.mdc_resources + c.external_resources]
        self.assertEqual(len(resources), len({r.id for r in resources}))
        for c in careers:
            for r in c.mdc_resources:
                self.assertEqual(r.verification_status, 'verified')
                self.assertIsNotNone(r.verified_at)
                self.assertEqual(r.source_url.host, 'www.mdc.edu')
        covered = {o.id: len(self.jobs.guidance_career(self.catalog, o, self.repo).mdc_resources)
                   for o in self.catalog.occupations}
        self.assertEqual(len(covered), 115)
        self.assertEqual({k:v for k,v in covered.items() if v},
                         {'occupation_15_1252': 2, 'occupation_15_1212': 1})
        self.assertNotIn('career_data_analyst', CAREER_OCCUPATIONS)

    def test_details_and_both_roadmap_routes_preserve_resources(self):
        for c in self.repo.careers():
            targets = [c.career_id] + ([CAREER_OCCUPATIONS[c.career_id]] if c.career_id in CAREER_OCCUPATIONS else [])
            for target in targets:
                with self.subTest(target=target):
                    status, detail = self.call('GET', '/api/careers/' + target)
                    self.assertEqual(status, 200)
                    expected = {r.id for r in c.mdc_resources}
                    self.assertEqual({r['id'] for r in detail['mdc_resources']}, expected)
                    self.assertEqual(len(detail['external_resources']), len(c.external_resources))
                    routes = [('/api/roadmaps', {'career_id': target})]
                    if target.startswith('occupation_'):
                        status, occupation = self.call('GET', '/api/occupations/' + target)
                        self.assertEqual(status, 200)
                        self.assertEqual(occupation['linked_career_ids'], [c.career_id])
                        routes.append(('/api/occupations/' + target + '/roadmap', {}))
                    for route, body in routes:
                        status, plan = self.call('POST', route, body)
                        self.assertEqual(status, 200)
                        self.assertEqual({r['id'] for r in plan['mdc_pathways']}, expected)
                        self.assertEqual(plan['metadata']['status'], 'deterministic')
                        status, chat = self.call('POST', '/api/career-questions',
                            {'career_id': target, 'question': 'Which MDC learning resources are available?'})
                        self.assertEqual(status, 200)
                        self.assertTrue(expected <= set(chat['resource_ids']))

    def test_real_gemini_sdk_wire_context_and_grounded_response(self):
        for c in self.repo.careers():
            for target in [c.career_id] + ([CAREER_OCCUPATIONS[c.career_id]] if c.career_id in CAREER_OCCUPATIONS else []):
                for operation in ('question', 'roadmap'):
                    seen = []
                    def handler(req):
                        payload = json.loads(req.content)
                        wire = payload['contents'][0]['parts'][0]['text']
                        context = json.loads(wire.split('CONTEXT_JSON:\n', 1)[1])
                        seen.append(context)
                        self.assertEqual(context['career']['career_id'], target)
                        refs = context['career']['mdc_resources']
                        self.assertEqual({r['id'] for r in refs}, {r.id for r in c.mdc_resources})
                        urls = [r['source_url'] for r in refs]
                        ids = [r['id'] for r in refs]
                        output = ({'explanation': 'Mock: investigate the supplied MDC options.', 'source_urls': urls, 'resource_ids': ids}
                                  if operation == 'question' else {'steps': [{'title': 'Investigate', 'instruction': 'Review these options with an advisor.', 'resource_ids': ids}], 'source_urls': urls})
                        return httpx.Response(200, json={'candidates': [{'finishReason': 'STOP',
                            'content': {'parts': [{'text': json.dumps(output)}]}}]})
                    def factory(**kwargs):
                        kwargs['http_options'].httpx_client = httpx.Client(transport=httpx.MockTransport(handler), trust_env=False)
                        return genai.Client(**kwargs)
                    budget = RequestBudget()
                    with patch.dict('os.environ', {'ORQUESTRA_PUBLIC_DEMO':'true', 'ORQUESTRA_AI_ENABLED':'true',
                        'PUBLIC_AI_ENABLED':'true', 'GEMINI_UNBILLED_PROJECT_CONFIRMED':'true',
                        'GEMINI_FREE_TIER_CONFIRMED':'true', 'GEMINI_MODEL':'gemini-3.1-flash-lite',
                        'GEMINI_API_KEY':'offline-fixture', 'AI_MAX_REQUESTS_PER_PROVIDER':'1'}, clear=True), patch(
                        'backend.agents.job_coordinator.GeminiService', side_effect=lambda cfg: GeminiService(cfg, budget=budget, client_factory=factory)):
                        body = {'career_id':target}
                        if operation == 'question': body['question'] = 'Which MDC options are relevant?'
                        status, result = self.call('POST', '/api/career-questions' if operation == 'question' else '/api/roadmaps', body)
                    self.assertEqual(status, 200)
                    self.assertEqual(result['metadata']['status'], 'ai_generated')
                    self.assertEqual(result['metadata']['provider'], 'gemini')
                    self.assertEqual(set(result['source_urls']), {str(r.source_url) for r in c.mdc_resources})
                    self.assertEqual(len(seen), 1)

    def test_unknown_and_unmapped_occupations_do_not_inherit_pathways(self):
        unknown = 'occupation_00_0000'
        for method, route, body in [('GET', '/api/careers/'+unknown, None), ('GET', '/api/occupations/'+unknown, None),
            ('POST', '/api/occupations/'+unknown+'/roadmap', {}), ('POST', '/api/roadmaps', {'career_id':unknown}),
            ('POST', '/api/career-questions', {'career_id':unknown,'question':'MDC?'})]:
            self.assertEqual(self.call(method, route, body)[0], 404)
        occupation = next(o for o in self.catalog.occupations if o.id not in CAREER_OCCUPATIONS.values())
        status, plan = self.call('POST', '/api/occupations/'+occupation.id+'/roadmap', {})
        self.assertEqual(status, 200)
        self.assertEqual(plan['mdc_pathways'], [])
        self.assertTrue(plan['evidence_gaps'])

    def test_missing_link_or_stale_resource_is_not_ai_evidence(self):
        career = self.repo.careers()[0].model_copy(deep=True)
        for r in career.mdc_resources:
            r.verification_status = 'stale'
            r.source_url = None
        ctx = evidence_context(career, QuestionRequest(career_id=career.career_id, question='MDC?'))
        self.assertEqual(ctx.career.mdc_resources, [])
        answer = JobFirstCoordinator(AISettings()).answer(career, QuestionRequest(career_id=career.career_id, question='MDC?'))
        self.assertFalse(set(answer.resource_ids) & {r.id for r in career.mdc_resources})

    def test_demo_disabled_keeps_new_programs_but_excludes_cyber_overlay(self):
        counts = {c.career_id:len(c.mdc_resources) for c in DataRepository(ROOT/'data').careers()}
        self.assertEqual(counts, {**EXPECTED, 'career_cybersecurity_analyst':0})

    def test_unavailable_resource_server_does_not_break_api(self):
        # Resource URLs are evidence links, not runtime dependencies. Availability
        # checks belong to research/audit; requests must never fetch or retry them.
        with patch('httpx.Client.get', side_effect=httpx.ConnectTimeout('offline source')) as fetch:
            status, plan = self.call('POST', '/api/roadmaps', {'career_id':'career_software_developer'})
            self.assertEqual(status, 200)
            self.assertEqual(len(plan['mdc_pathways']), 2)
            self.assertEqual(plan['metadata']['status'], 'deterministic')
            fetch.assert_not_called()
