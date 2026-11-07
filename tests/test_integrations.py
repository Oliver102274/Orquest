"""Provider tests use synthetic context, fake credentials, and no network."""

import json
import os
import socket
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock, patch

import httpx
from google import genai
from google.genai import types, errors

from backend.integrations.common import AIServiceError, AISettings, RequestBudget
from backend.integrations.gemini import GeminiService
from backend.integrations.grounding import CareerContext
from backend.integrations.prune import PruneService
from backend.integrations.swarms import SwarmsService


def context():
    resource = {"id": "resource_test", "title": "Synthetic resource", "organization": "Test organization",
                "type": "guide", "source_url": "https://example.org/fixture"}
    return CareerContext.model_validate({
        "career": {"career_id": "career_test", "title": "Synthetic career", "summary": "Fixture only",
                   "requirements": [], "sources": [], "mdc_resources": [resource],
                   "external_resources": [{**resource, "id": "resource_external"}]},
        "interest_tags": ["test_tag"],
    })


EXPLANATION = {"explanation": "Review the supplied learning material.", "source_urls": ["https://example.org/fixture"], "resource_ids": ["resource_test", "resource_external"]}
ROADMAP = {"steps": [{"title": "Explore", "instruction": "Review the supplied guide.", "resource_ids": ["resource_test"]}], "source_urls": ["https://example.org/fixture"]}


def settings(**overrides):
    return AISettings(**{
        "enabled": True, "max_requests": 5,
        "gemini_key": "test-gemini-only", "swarms_key": "test-swarms-only", "prune_key": "test-prune-only",
        "gemini_model": "test-gemini-model", "swarms_model": "test-swarms-model", "prune_model": "test-prune-model",
        **overrides,
    })


def prune_response():
    return {"model": "reported-model", "choices": [{"message": {"content": json.dumps(EXPLANATION)}}],
            "usage": {"prompt_tokens": 25, "completion_tokens": 15},
            "prune_metadata": {"cost": 0.001, "receipt_signature": "test-receipt", "optimizations": []}}


def swarms_response():
    return {"job_id": "job_test", "status": "success", "output": [
        {"role": role, "content": json.dumps(ROADMAP if role == "Roadmap" else EXPLANATION)}
        for role in ("Career", "Education", "Roadmap")],
        "usage": {"total_tokens": 50, "billing_info": {"total_cost": 0.01}}}


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        # Any accidental network call fails even when tests run outside the sandbox.
        self.network = patch.object(socket.socket, "connect", side_effect=AssertionError("Network forbidden in tests"))
        self.network.start()
        self.addCleanup(self.network.stop)
        self.context = context()

    def assert_error(self, code, callback):
        with self.assertRaises(AIServiceError) as caught:
            callback()
        self.assertEqual(caught.exception.code, code)
        self.assertNotIn("test-prune-only", str(caught.exception))
        return caught.exception

    def gemini(self, response=None, config=None, budget=None):
        factory = MagicMock()
        factory.return_value.__enter__.return_value.models.generate_content.return_value = response or types.GenerateContentResponse(
            candidates=[types.Candidate(content=types.Content(parts=[types.Part(text=json.dumps(EXPLANATION))]))],
            usage_metadata=types.GenerateContentResponseUsageMetadata(prompt_token_count=20, candidates_token_count=10),
        )
        return GeminiService(config or settings(), budget=budget or RequestBudget(), client_factory=factory), factory

    def http_service(self, provider, handler=None, config=None, budget=None):
        captured = []

        def route(request):
            captured.append(request)
            if handler:
                return handler(request)
            return httpx.Response(200, json=prune_response() if provider == "prune" else swarms_response())

        cls = PruneService if provider == "prune" else SwarmsService
        service = cls(config or settings(), budget=budget or RequestBudget(), transport=httpx.MockTransport(route))
        return service, captured

    def invoke(self, provider, service):
        return service.coordinate(self.context) if provider == "swarms" else service.explain_career(self.context)

    def test_gemini_structured_explanation_and_usage(self):
        service, factory = self.gemini()
        result = service.explain_career(self.context)
        self.assertEqual(result.output, EXPLANATION)
        self.assertEqual(result.provider, "gemini")
        self.assertEqual(result.usage["prompt_token_count"], 20)
        self.assertTrue(result.review_required)
        options = factory.call_args.kwargs["http_options"]
        self.assertEqual(options.timeout, 30000)
        self.assertEqual(options.retry_options.attempts, 1)
        self.assertFalse(factory.call_args.kwargs["vertexai"])
        call = factory.return_value.__enter__.return_value.models.generate_content.call_args
        self.assertEqual(call.kwargs["config"].max_output_tokens, 1024)
        self.assertEqual(call.kwargs["config"].response_mime_type, "application/json")

    def test_gemini_roadmap(self):
        response = types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(parts=[types.Part(text=json.dumps(ROADMAP))]))])
        service, _ = self.gemini(response)
        self.assertEqual(service.suggest_roadmap(self.context).output, ROADMAP)

    def test_real_sdk_serialization_with_mock_http(self):
        captured = []

        def route(request):
            captured.append(request)
            return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(EXPLANATION)}], "role": "model"}, "finishReason": "STOP"}], "usageMetadata": {"promptTokenCount": 20}})

        def factory(**kwargs):
            kwargs["http_options"].httpx_client = httpx.Client(transport=httpx.MockTransport(route), trust_env=False)
            return genai.Client(**kwargs)

        service = GeminiService(settings(), budget=RequestBudget(), client_factory=factory)
        self.assertEqual(service.explain_career(self.context).output, EXPLANATION)
        self.assertEqual(len(captured), 1)
        self.assertEqual(captured[0].url.host, "generativelanguage.googleapis.com")
        self.assertEqual(captured[0].headers["x-goog-api-key"], "test-gemini-only")
        self.assertIn("responseSchema", json.loads(captured[0].content)["generationConfig"])

    def test_swarms_agents_endpoint_and_limits(self):
        service, captured = self.http_service("swarms")
        result = service.coordinate(self.context)
        self.assertEqual(result.provider, "swarms")
        self.assertEqual(set(result.output), {"Career", "Education", "Roadmap"})
        self.assertEqual(result.usage["billing_info"]["total_cost"], 0.01)
        self.assertEqual(result.metadata["job_id"], "job_test")
        self.assertEqual(str(captured[0].url), "https://api.swarms.world/v1/swarm/completions")
        self.assertEqual(captured[0].headers["x-api-key"], "test-swarms-only")
        payload = json.loads(captured[0].content)
        self.assertEqual(payload["swarm_type"], "SequentialWorkflow")
        self.assertEqual(payload["max_loops"], 1)
        self.assertEqual(len(payload["agents"]), 3)
        for agent in payload["agents"]:
            self.assertEqual(agent["max_loops"], 1)
            self.assertEqual(agent["max_tokens"], 1024)

    def test_prune_gateway_usage_and_receipt(self):
        service, captured = self.http_service("prune")
        result = service.explain_career(self.context)
        self.assertEqual(result.provider, "prune")
        self.assertEqual(result.model, "reported-model")
        self.assertEqual(result.metadata, prune_response()["prune_metadata"])
        self.assertEqual(result.usage, prune_response()["usage"])
        self.assertEqual(result.output, EXPLANATION)
        self.assertEqual(str(captured[0].url), "https://api.withprune.com/v1/chat/completions")
        self.assertEqual(captured[0].headers["authorization"], "Bearer test-prune-only")
        self.assertEqual(json.loads(captured[0].content)["max_tokens"], 1024)

    def test_missing_metadata_is_unknown_not_zero(self):
        response = prune_response()
        response.pop("usage")
        response.pop("prune_metadata")
        service, _ = self.http_service("prune", lambda _: httpx.Response(200, json=response))
        result = service.explain_career(self.context)
        self.assertIsNone(result.usage)
        self.assertIsNone(result.metadata)

    def test_disabled_missing_key_model_and_limits_all_providers(self):
        for provider in ("gemini", "swarms", "prune"):
            for overrides, code in [({"enabled": False}, "disabled"), ({f"{provider}_key": ""}, "missing_key"),
                                    ({f"{provider}_model": ""}, "missing_model"), ({"max_requests": 0}, "request_limit"),
                                    ({"max_input_chars": 100}, "input_limit")]:
                with self.subTest(provider=provider, code=code):
                    cfg = settings(**overrides)
                    service, captured = self.gemini(config=cfg) if provider == "gemini" else self.http_service(provider, config=cfg)
                    self.assert_error(code, lambda: self.invoke(provider, service))
                    if provider == "gemini":
                        captured.assert_not_called()
                    else:
                        self.assertEqual(captured, [])

    def test_http_errors_and_no_retry(self):
        for provider in ("swarms", "prune"):
            for status, code in [(401, "authentication_failed"), (402, "billing_limit"), (403, "permission_denied"), (429, "rate_limited"), (500, "provider_error"), (504, "timeout"), (302, "provider_error")]:
                with self.subTest(provider=provider, status=status):
                    service, captured = self.http_service(provider, lambda _: httpx.Response(status, text="test-prune-only provider secret body"))
                    self.assert_error(code, lambda: self.invoke(provider, service))
                    self.assertEqual(len(captured), 1)

    def test_http_timeout_and_network_errors(self):
        for provider in ("swarms", "prune"):
            for exception, code in [(httpx.ReadTimeout("secret"), "timeout"), (httpx.ConnectError("secret"), "network_error")]:
                def fail(_):
                    raise exception
                service, _ = self.http_service(provider, fail)
                self.assert_error(code, lambda: self.invoke(provider, service))

    def test_gemini_errors_and_no_retry(self):
        for exception, code in [(errors.ClientError(429, {"error": {"message": "secret"}}), "rate_limited"),
                                (httpx.ReadTimeout("secret"), "timeout"), (httpx.ConnectError("secret"), "network_error")]:
            service, factory = self.gemini()
            call = factory.return_value.__enter__.return_value.models.generate_content
            call.side_effect = exception
            self.assert_error(code, lambda: service.explain_career(self.context))
            self.assertEqual(call.call_count, 1)

    def test_gemini_invalid_empty_and_ungrounded(self):
        for text, code in [("not-json", "invalid_response"), ("", "empty_response"),
                           (json.dumps({**EXPLANATION, "resource_ids": ["invented"]}), "ungrounded_response"),
                           (json.dumps({**EXPLANATION, "explanation": "Visit https://invented.example/course"}), "ungrounded_response")]:
            response = types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(parts=[types.Part(text=text)]))])
            service, _ = self.gemini(response)
            self.assert_error(code, lambda: service.explain_career(self.context))

    def test_http_invalid_responses(self):
        for provider in ("swarms", "prune"):
            for body in [[], {}, {"output": "raw"}, {"choices": None}]:
                service, _ = self.http_service(provider, lambda _: httpx.Response(200, json=body))
                self.assert_error("invalid_response", lambda: self.invoke(provider, service))

    def test_prune_rejects_invented_resource(self):
        response = prune_response()
        response["choices"][0]["message"]["content"] = json.dumps({**EXPLANATION, "resource_ids": ["invented"]})
        service, _ = self.http_service("prune", lambda _: httpx.Response(200, json=response))
        self.assert_error("ungrounded_response", lambda: service.explain_career(self.context))

    def test_swarms_rejects_partial_and_ungrounded_outputs(self):
        response = swarms_response()
        response["output"].pop()
        service, _ = self.http_service("swarms", lambda _: httpx.Response(200, json=response))
        self.assert_error("invalid_response", lambda: service.coordinate(self.context))
        response = swarms_response()
        response["output"][0]["content"] = json.dumps({**EXPLANATION, "source_urls": ["https://invented.example"]})
        service, _ = self.http_service("swarms", lambda _: httpx.Response(200, json=response))
        self.assert_error("ungrounded_response", lambda: service.coordinate(self.context))

    def test_failed_requests_consume_shared_quota(self):
        budget = RequestBudget()
        cfg = settings(max_requests=1)
        first, _ = self.http_service("prune", lambda _: httpx.Response(500), cfg, budget)
        self.assert_error("provider_error", lambda: first.explain_career(self.context))
        second, captured = self.http_service("prune", config=cfg, budget=budget)
        self.assert_error("request_limit", lambda: second.explain_career(self.context))
        self.assertEqual(captured, [])
        swarms, _ = self.http_service("swarms", config=cfg, budget=budget)
        self.assertEqual(swarms.coordinate(self.context).provider, "swarms")

    def test_budget_is_thread_safe(self):
        budget, cfg = RequestBudget(), settings(max_requests=2)
        def reserve(_):
            try:
                budget.reserve("prune", cfg, {})
                return 1
            except AIServiceError:
                return 0
        with ThreadPoolExecutor(max_workers=4) as executor:
            self.assertEqual(sum(executor.map(reserve, range(20))), 2)

    def test_environment_defaults_and_secret_repr(self):
        with patch.dict(os.environ, {}, clear=True):
            cfg = AISettings.from_env()
            self.assertFalse(cfg.enabled)
            self.assertEqual(cfg.max_requests, 0)
        self.assertNotIn("test-prune-only", repr(settings()))
        with patch.dict(os.environ, {"AI_MAX_OUTPUT_TOKENS": "invalid"}):
            self.assert_error("invalid_configuration", AISettings.from_env)


if __name__ == "__main__":
    unittest.main()
