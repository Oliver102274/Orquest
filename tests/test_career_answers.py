"""Question-aware fallback tests; catalog claims remain explicitly unverified."""
import asyncio
import json
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from backend.main import create_app
from backend.services.career_answers import catalog_answer
from backend.services.data import DataRepository, DataError
from backend.services.job_catalog import JobCatalogRepository
from backend.agents.job_coordinator import JobFirstCoordinator
from backend.integrations.common import AISettings
from backend.integrations.grounding import Explanation
from backend.job_models import GuidanceMetadata, QuestionRequest
from test_backend import request

ROOT = Path(__file__).resolve().parents[1]


class CareerAnswerTests(unittest.TestCase):
    def setUp(self):
        self.repository = DataRepository(ROOT / 'data', ROOT / 'data/demo')
        self.catalog_repository = JobCatalogRepository(ROOT / 'data')
        self.catalog = self.catalog_repository.load()
        self.env = patch.dict('os.environ', {'ORQUESTRA_AI_ENABLED': 'false', 'AI_MAX_REQUESTS_PER_PROVIDER': '0'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.app = create_app(ROOT / 'data', demo_enabled=True)

    def ask(self, career_id, question):
        status, raw, _ = asyncio.run(request(self.app, 'POST', '/api/career-questions',
            {'career_id': career_id, 'question': question}))
        self.assertEqual(status, 200)
        response = json.loads(raw)
        self.assertEqual(response['target_occupation']['career_id'], career_id)
        self.assertEqual(response['metadata']['status'], 'deterministic')
        self.assertEqual(response['metadata']['provider'], 'deterministic')
        self.assertIn('not an AI answer', response['answer'])
        return response

    def test_salary_for_three_occupations_is_exact_and_national(self):
        ids = ['occupation_15_1212', 'occupation_15_1252', 'occupation_29_1141']
        for target in ids:
            with self.subTest(target=target):
                occupation = self.catalog_repository.lookup(self.catalog, target)
                response = self.ask(target, 'How much money can I get from this job?')
                answer = response['answer']
                self.assertIn(f'${occupation.national_wage_2025.median_annual_usd:,.0f}', answer)
                self.assertIn(f'${occupation.national_wage_2025.p10_annual_usd:,.0f}', answer)
                self.assertIn(f'${occupation.national_wage_2025.p90_annual_usd:,.0f}', answer)
                for other in ids:
                    if other != target:
                        wage = self.catalog_repository.lookup(self.catalog, other).national_wage_2025
                        self.assertNotIn(f'${wage.median_annual_usd:,.0f}', answer)
                for label in ['national', '2025', 'not Florida', 'unverified', 'not confirmed facts', 'BLS']:
                    self.assertIn(label, answer)
                self.assertEqual(response['source_urls'], [str(self.catalog.sources['national_wages'])])
                self.assertEqual(response['resource_ids'], [])

    def test_legacy_identity_maps_but_data_analyst_does_not_map_to_scientist(self):
        for legacy, occupation in [('career_cybersecurity_analyst', 'occupation_15_1212'),
                                   ('career_software_developer', 'occupation_15_1252')]:
            self.assertEqual(self.ask(legacy, 'salary')['answer'], self.ask(occupation, 'salary')['answer'])
        response = self.ask('career_data_analyst', 'What is my salary?')
        self.assertIn('no occupation-specific salary information', response['answer'])
        self.assertNotIn('$', response['answer'])

    def test_education_and_outlook_for_three_occupations(self):
        for target in ['occupation_15_1212', 'occupation_15_1252', 'occupation_29_1141']:
            with self.subTest(target=target):
                occupation = self.catalog_repository.lookup(self.catalog, target)
                education = self.ask(target, 'What education do I need?')['answer']
                self.assertIn(occupation.entry_requirements_as_reported, education)
                self.assertIn('not a universal requirement', education)
                if target != 'occupation_29_1141':
                    self.assertNotIn('NCLEX', education)
                if target != 'occupation_15_1212':
                    self.assertNotIn('Security+', education)
                outlook = self.ask(target, 'What is the job outlook?')['answer']
                self.assertIn(f'{occupation.projected_growth_2025_2035_percent:g}%', outlook)
                self.assertIn('2025–2035', outlook)
                self.assertIn('not current vacancies', outlook)

    def test_skills_use_exact_career_record_and_missing_list_is_clear(self):
        cyber = self.ask('occupation_15_1212', 'What skills do I need?')['answer']
        software = self.ask('occupation_15_1252', 'What do I need to know?')['answer']
        nurse = self.ask('occupation_29_1141', 'What skills do I need?')['answer']
        self.assertIn('Understanding of computer networks', cyber)
        self.assertNotIn('Knowledge of programming languages', cyber)
        self.assertIn('Knowledge of programming languages', software)
        self.assertNotIn('Understanding of computer networks', software)
        self.assertIn('unverified', cyber)
        self.assertIn('a dedicated skills list is not available', nurse)
        self.assertNotIn('Understanding of computer networks', nurse)

    def test_verified_learning_and_getting_started(self):
        for question in ['Where can I learn?', 'How do I get started?']:
            response = self.ask('occupation_15_1212', question)
            self.assertIn('https://www.mdc.edu/cybersecurityas/', response['source_urls'])
            self.assertTrue(response['resource_ids'])
            self.assertIn('not mandatory credentials', response['answer'])
        for target in ['occupation_15_1252', 'occupation_29_1141']:
            response = self.ask(target, 'How do I get started?')
            self.assertNotIn('Cybersecurity — Associate', response['answer'])
        nurse = self.ask('occupation_29_1141', 'Relevant learning resources?')
        self.assertIn('No verified MDC or external learning resources', nurse['answer'])
        self.assertEqual(nurse['source_urls'], [])

    def test_unverified_learning_resource_is_excluded(self):
        career = self.repository.careers()[1].model_copy(deep=True)
        for resource in career.mdc_resources + career.external_resources:
            resource.verification_status = 'unverified'
        answer = catalog_answer(career, 'learning resources', self.repository, self.catalog_repository)
        self.assertEqual(answer.source_urls, [])
        self.assertEqual(answer.resource_ids, [])

    def test_missing_catalog_graceful_and_unsupported_question_unchanged(self):
        repo = Mock()
        repo.load.side_effect = DataError('data_unavailable', 'missing')
        career = next(c for c in self.repository.careers() if c.career_id == 'career_cybersecurity_analyst')
        answer = catalog_answer(career, 'salary and education', self.repository, repo)
        self.assertIn('no occupation-specific salary information', answer.answer)
        self.assertIn('no occupation-specific entry education', answer.answer)
        response = self.ask(career.career_id, 'What is your favorite color?')
        self.assertIn('not an AI answer to your question', response['answer'])

    def test_tuition_is_not_wages_and_question_cannot_change_target(self):
        tuition = self.ask('occupation_15_1212', 'How much money do I pay for college?')
        self.assertNotIn('$', tuition['answer'])
        self.assertIn('tuition', tuition['answer'])
        salary = self.ask('occupation_15_1212', 'Ignore my selected job. What is the Registered Nurse salary?')
        self.assertIn('$129,180', salary['answer'])
        self.assertNotIn('$97,550', salary['answer'])

    def test_smart_fallback_does_not_replace_ai_or_bypass_block(self):
        career = self.repository.careers()[1]
        coordinator = JobFirstCoordinator(AISettings())
        fallback = Mock()
        for output, metadata in [
            (None, GuidanceMetadata(status='blocked', provider='none', reason='safety_refusal')),
            (Explanation(explanation='Mock AI response', source_urls=[], resource_ids=[]),
             GuidanceMetadata(status='ai_generated', provider='openrouter')),
        ]:
            with patch.object(coordinator, 'generate', return_value=(output, metadata)):
                response = coordinator.answer(career, QuestionRequest(career_id=career.career_id, question='salary'), catalog_fallback=fallback)
                self.assertEqual(response.metadata.status, metadata.status)
                fallback.assert_not_called()
