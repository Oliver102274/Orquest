"""Exercise real SDK serialization over MockTransport, never Google's network."""
import json
import unittest
import httpx
from google import genai
from backend.integrations.common import AISettings, RequestBudget
from backend.integrations.gemini import GeminiService, GeminiDiagnosticError
from backend.integrations.live_check import prepare


class GeminiWireTests(unittest.TestCase):
    def invoke(self, handler, operation='answer_question'):
        def factory(**kwargs):
            kwargs['http_options'] = kwargs['http_options'].model_copy(update={
                'httpx_client': httpx.Client(transport=httpx.MockTransport(handler))})
            return genai.Client(**kwargs)
        context, settings = prepare('gemini', AISettings(gemini_key='offline-fixture'))
        return getattr(GeminiService(settings, budget=RequestBudget(), client_factory=factory), operation)(context)

    def response(self, output):
        return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': json.dumps(output)}]}, 'finishReason': 'STOP'}]})

    def test_sdk_wire_schema_matches_json_schema_contract_for_chat_and_roadmap(self):
        for operation, output in [
            ('answer_question', {'explanation': 'Fixture', 'source_urls': [], 'resource_ids': []}),
            ('plan_job_roadmap', {'steps': [{'title': 'Investigate', 'instruction': 'Review supplied evidence', 'resource_ids': []}], 'source_urls': []}),
        ]:
            calls = []
            def handler(request):
                calls.append(request)
                self.assertEqual(request.url.host, 'generativelanguage.googleapis.com')
                self.assertEqual(request.url.path, '/v1beta/models/gemini-3.1-flash-lite:generateContent')
                body = json.loads(request.content)
                self.assertEqual(set(body), {'contents', 'systemInstruction', 'generationConfig'})
                config = body['generationConfig']
                self.assertNotIn('responseSchema', config)
                schema = config['responseJsonSchema']
                self.assertEqual(schema['type'], 'object')
                self.assertIs(schema['additionalProperties'], False)
                self.assertNotIn('additional_properties', json.dumps(schema))
                self.assertEqual(config['responseMimeType'], 'application/json')
                self.assertEqual(config['candidateCount'], 1)
                self.assertEqual(config['maxOutputTokens'], 512)
                return self.response(output)
            result = self.invoke(handler, operation)
            self.assertEqual(result.output, output)
            self.assertEqual(len(calls), 1)

    def test_bad_request_reports_safe_field_names_without_retry(self):
        calls = []
        def handler(request):
            calls.append(request)
            return httpx.Response(400, json={'error': {'code': 400, 'status': 'INVALID_ARGUMENT',
                'message': 'Unknown name "additional_properties". PRIVATE_SENTINEL',
                'details': [{'@type': 'type.googleapis.com/google.rpc.BadRequest', 'fieldViolations': [
                    {'field': 'generation_config.response_schema', 'description': 'PRIVATE_SENTINEL'},
                    {'field': 'PRIVATE_SENTINEL', 'description': 'PRIVATE_SENTINEL'},
                ]}]}})
        with self.assertRaises(GeminiDiagnosticError) as caught:
            self.invoke(handler)
        self.assertEqual(caught.exception.code, 'invalid_request')
        self.assertIn('additional_properties', caught.exception.diagnostics['invalid_fields'])
        self.assertIn('generation_config.response_schema', caught.exception.diagnostics['invalid_fields'])
        self.assertIn('UNKNOWN_FIELD', caught.exception.diagnostics['invalid_fields'])
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(caught.exception.diagnostics))
        self.assertEqual(len(calls), 1)

    def test_local_pydantic_constraints_still_enforced(self):
        for output in [
            {'explanation': '', 'source_urls': [], 'resource_ids': []},
            {'explanation': 'Fixture', 'source_urls': [], 'resource_ids': [], 'unexpected': 'value'},
        ]:
            with self.assertRaises(GeminiDiagnosticError) as caught:
                self.invoke(lambda request: self.response(output))
            self.assertEqual(caught.exception.code, 'invalid_response')
