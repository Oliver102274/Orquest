"""Gemini diagnostic safety checks; SDK calls are mocked, never live."""
import unittest
from unittest.mock import MagicMock, Mock, patch
import httpx
from google.genai import types

from backend.integrations.common import AISettings, AIServiceError, RequestBudget
from backend.integrations.gemini import GeminiService
from backend.integrations.live_check import execute, prepare
from backend.agents.job_coordinator import JobFirstCoordinator
from backend.job_models import QuestionRequest


class GeminiSingleRequestTests(unittest.TestCase):
    def settings(self):
        return AISettings(gemini_key='fixture', gemini_free_tier_confirmed=True,
                          openrouter_key='fixture-other', max_requests=100, max_output_tokens=4096)

    def test_unbilled_attestation_required_before_client(self):
        with patch('backend.integrations.live_check.GeminiService') as service:
            with self.assertRaisesRegex(AIServiceError, 'unbilled_project_not_confirmed'):
                execute('gemini', self.settings(), approved=True)
            service.assert_not_called()

    def test_one_sdk_call_fixed_limits_and_schema(self):
        factory = MagicMock()
        client = factory.return_value.__enter__.return_value
        client.models.generate_content.return_value = types.GenerateContentResponse(
            candidates=[types.Candidate(content=types.Content(parts=[types.Part(text='{"explanation":"Review the supplied MDC option; it is not mandatory.","source_urls":["https://www.mdc.edu/cybersecurityas/"],"resource_ids":["resource_mdc_cybersecurity_as_demo"]}')]))])
        def service(settings, budget):
            self.assertEqual(settings.max_requests, 1)
            self.assertEqual(settings.max_input_chars, 4000)
            self.assertFalse(settings.openrouter_key.get_secret_value())
            return GeminiService(settings, budget=budget, client_factory=factory)
        with patch('backend.integrations.live_check.GeminiService', side_effect=service), patch('backend.integrations.live_check.OpenRouterService') as router:
            result = execute('gemini', self.settings(), approved=True, unbilled_project_confirmed=True)
            self.assertEqual(result.metadata.provider, 'gemini')
            self.assertEqual(result.metadata.status, 'ai_generated')
            router.assert_not_called()
        client.models.generate_content.assert_called_once()
        client.models.count_tokens.assert_not_called()
        call = client.models.generate_content.call_args.kwargs
        self.assertEqual(call['model'], 'gemini-3.1-flash-lite')
        self.assertEqual(call['config'].max_output_tokens, 512)
        self.assertEqual(call['config'].candidate_count, 1)
        self.assertEqual(factory.call_args.kwargs['http_options'].retry_options.attempts, 1)
        self.assertFalse(factory.call_args.kwargs['vertexai'])

    def test_timeout_stops_diagnostic_without_fallback(self):
        factory = MagicMock()
        client = factory.return_value.__enter__.return_value
        client.models.generate_content.side_effect = httpx.ReadTimeout('fixture')
        with patch('backend.integrations.live_check.GeminiService', side_effect=lambda settings, budget: GeminiService(settings, budget=budget, client_factory=factory)), patch('backend.integrations.live_check.OpenRouterService') as router:
            with self.assertRaisesRegex(AIServiceError, 'timeout'):
                execute('gemini', self.settings(), approved=True, unbilled_project_confirmed=True)
            client.models.generate_content.assert_called_once()
            router.assert_not_called()

    def test_oversized_input_rejected_before_sdk(self):
        context, settings = prepare('gemini', self.settings())
        context.question = 'x' * 4001
        factory = MagicMock()
        with self.assertRaisesRegex(AIServiceError, 'input_limit'):
            GeminiService(settings, budget=RequestBudget(), client_factory=factory).answer_question(context)
        factory.assert_not_called()

    def test_app_chat_remains_deterministic_after_free_provider_quota(self):
        context, settings = prepare('gemini', self.settings())
        gemini, router = Mock(), Mock()
        gemini.answer_question.side_effect = AIServiceError('rate_limited', 'gemini')
        router.answer_question.side_effect = AIServiceError('missing_key', 'openrouter')
        response = JobFirstCoordinator(settings, gemini=gemini, openrouter=router).answer(
            context.career, QuestionRequest(career_id=context.career.career_id, question='Where can I learn?'))
        self.assertEqual(response.metadata.status, 'deterministic')
        gemini.answer_question.assert_called_once()
        router.answer_question.assert_called_once()
