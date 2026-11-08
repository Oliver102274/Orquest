"""Offline diagnostic categorization and redaction; no safety bypass or retries."""
import contextlib
import io
import json
import unittest
from unittest.mock import MagicMock, Mock, patch

from google.genai import errors, types
from backend.integrations.common import AISettings, RequestBudget
from backend.integrations.gemini import GeminiService, GeminiDiagnosticError
from backend.integrations.live_check import prepare, main
from backend.agents.job_coordinator import JobFirstCoordinator
from backend.job_models import QuestionRequest


class GeminiDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.context, self.settings = prepare('gemini', AISettings(gemini_key='fixture', gemini_free_tier_confirmed=True))
        self.factory = MagicMock()
        self.call = self.factory.return_value.__enter__.return_value.models.generate_content
        self.service = GeminiService(self.settings, budget=RequestBudget(), client_factory=self.factory)

    def failure(self, code):
        with self.assertRaises(GeminiDiagnosticError) as caught:
            self.service.answer_question(self.context)
        self.assertEqual(caught.exception.code, code)
        self.call.assert_called_once()
        self.assertNotIn('PRIVATE_SENTINEL', str(caught.exception))
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(caught.exception.diagnostics))
        return caught.exception.diagnostics

    def test_http_400_invalid_argument_is_not_safety_refusal(self):
        self.call.side_effect = errors.ClientError(400, {'error': {'status': 'INVALID_ARGUMENT', 'message': 'PRIVATE_SENTINEL'}})
        diagnostics = self.failure('invalid_request')
        self.assertEqual(diagnostics['http_status'], 400)
        self.assertEqual(diagnostics['api_status'], 'INVALID_ARGUMENT')
        self.assertEqual(diagnostics['category'], 'api_error')

    def test_free_tier_precondition_distinguished(self):
        self.call.side_effect = errors.ClientError(400, {'error': {'status': 'FAILED_PRECONDITION', 'message': 'PRIVATE_SENTINEL'}})
        self.assertEqual(self.failure('failed_precondition')['api_status'], 'FAILED_PRECONDITION')

    def test_actual_prompt_block_remains_blocked(self):
        self.call.return_value = types.GenerateContentResponse(prompt_feedback=types.GenerateContentResponsePromptFeedback(
            block_reason='SAFETY', block_reason_message='PRIVATE_SENTINEL'))
        diagnostics = self.failure('safety_refusal')
        self.assertEqual(diagnostics['prompt_block_reason'], 'SAFETY')
        self.assertEqual(diagnostics['category'], 'prompt_block')
        self.assertIsNone(diagnostics['http_status'])  # SDK response does not expose status.

    def test_actual_candidate_block_remains_blocked(self):
        self.call.return_value = types.GenerateContentResponse(candidates=[types.Candidate(finish_reason='SAFETY', finish_message='PRIVATE_SENTINEL')])
        diagnostics = self.failure('safety_refusal')
        self.assertEqual(diagnostics['candidate_finish_reasons'], ['SAFETY'])
        self.assertEqual(diagnostics['category'], 'candidate_block')

    def test_truncated_json_is_validation_error_with_finish_reason(self):
        self.call.return_value = types.GenerateContentResponse(candidates=[types.Candidate(finish_reason='MAX_TOKENS',
            content=types.Content(parts=[types.Part(text='{"explanation":"PRIVATE_SENTINEL')]))])
        diagnostics = self.failure('invalid_response')
        self.assertEqual(diagnostics['candidate_finish_reasons'], ['MAX_TOKENS'])
        self.assertEqual(diagnostics['category'], 'response_validation')

    def test_reference_validation_distinguished(self):
        self.call.return_value = types.GenerateContentResponse(candidates=[types.Candidate(finish_reason='STOP',
            content=types.Content(parts=[types.Part(text='{"explanation":"PRIVATE_SENTINEL","source_urls":[],"resource_ids":["invented"]}')]))])
        self.assertEqual(self.failure('ungrounded_response')['category'], 'reference_validation')

    def test_cli_prints_only_safe_metadata(self):
        error = GeminiDiagnosticError('invalid_request', 'api_error', http_status=400,
                                      api_status='PRIVATE_SENTINEL', prompt_block_reason='PRIVATE_SENTINEL',
                                      candidate_finish_reasons=['PRIVATE_SENTINEL'])
        captured = io.StringIO()
        with patch('backend.integrations.live_check.load_local_env'), patch('backend.integrations.live_check.AISettings.from_env', return_value=self.settings), patch('backend.integrations.live_check.execute', side_effect=error), contextlib.redirect_stdout(captured):
            self.assertEqual(main(['gemini', '--live', '--confirm-unbilled-project']), 1)
        self.assertNotIn('PRIVATE_SENTINEL', captured.getvalue())
        self.assertEqual(json.loads(captured.getvalue())['diagnostics']['api_status'], 'UNKNOWN')

    def test_bad_request_stops_coordinator_without_provider_fallback(self):
        self.call.side_effect = errors.ClientError(400, {'error': {'status': 'INVALID_ARGUMENT', 'message': 'PRIVATE_SENTINEL'}})
        router = Mock()
        local = Mock()
        result = JobFirstCoordinator(self.settings, gemini=self.service, openrouter=router).answer(
            self.context.career, QuestionRequest(career_id=self.context.career.career_id, question='Where can I learn?'), catalog_fallback=local)
        self.assertEqual(result.metadata.status, 'blocked')
        self.assertEqual(result.metadata.reason, 'invalid_request')
        router.answer_question.assert_not_called()
        local.assert_not_called()
