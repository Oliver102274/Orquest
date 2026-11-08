"""Occupation IDs use existing career UI contracts, with no provider calls."""
import asyncio
import json
import unittest
from pathlib import Path
from unittest.mock import patch
from backend.main import create_app
from test_backend import request


class OccupationCompatibilityTests(unittest.TestCase):
    def test_selected_occupation_details_question_and_roadmap(self):
        with patch.dict('os.environ', {'ORQUESTRA_AI_ENABLED': 'false'}):
            app = create_app(Path(__file__).resolve().parents[1] / 'data', demo_enabled=True)
            def call(method, path, body=None):
                status, raw, _ = asyncio.run(request(app, method, path, body))
                return status, json.loads(raw)
            _, catalog = call('GET', '/api/occupations')
            for target in ['occupation_15_1212', catalog['occupations'][0]['id']]:
                status, detail = call('GET', '/api/careers/' + target)
                self.assertEqual(status, 200)
                self.assertEqual(detail['career_id'], target)
                self.assertIn('external_resources', detail)
                if target == 'occupation_15_1212':
                    self.assertTrue(detail['mdc_resources'])
                for endpoint, extra in [('career-questions', {'question': 'How can I investigate this job?'}), ('roadmaps', {})]:
                    status, response = call('POST', '/api/' + endpoint, {'career_id': target, **extra})
                    self.assertEqual(status, 200)
                    self.assertEqual(response['target_occupation']['career_id'], target)
                    self.assertEqual(response['metadata']['status'], 'deterministic')
            self.assertEqual(call('GET', '/api/careers/occupation_00_0000')[0], 404)
