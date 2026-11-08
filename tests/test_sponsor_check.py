"""Sponsor requests are mocked, including the manual demonstration entry point."""
import json
import socket
import unittest
from unittest.mock import patch

import httpx
from backend.integrations.common import AIServiceError, AISettings, RequestBudget
from backend.integrations.sponsor_check import execute, prepare, safe_report
from backend.integrations.prune import PruneService
from backend.integrations.swarms import SwarmsService
from test_integrations import settings, context, prune_response, swarms_response


class SponsorTests(unittest.TestCase):
    def setUp(self):
        guard = patch.object(socket.socket, "connect", side_effect=AssertionError("No network"))
        guard.start()
        self.addCleanup(guard.stop)

    def test_separate_sponsor_defaults_block_network(self):
        cfg = AISettings(enabled=True, max_requests=1, swarms_key="test", prune_key="test",
                         swarms_model="test", prune_model="test")
        for cls, method in ((SwarmsService, "coordinate"), (PruneService, "explain_career")):
            with self.assertRaisesRegex(AIServiceError, "disabled"):
                getattr(cls(cfg, budget=RequestBudget()), method)(context())

    def test_public_demo_blocks_even_explicit_sponsor_flags(self):
        for provider in ("prune", "swarms"):
            with self.assertRaisesRegex(AIServiceError, "public_demo_blocked"):
                prepare(provider, settings(public_demo=True))
            with self.assertRaisesRegex(AIServiceError, "disabled"):
                RequestBudget().reserve(provider, settings(public_demo=True), {})

    def test_approval_and_cost_confirmation_required(self):
        for provider in ("prune", "swarms", "openrouter"):
            with self.assertRaisesRegex(AIServiceError, "approval_required"):
                execute(provider, settings())
            with self.assertRaisesRegex(AIServiceError, "zero_out_of_pocket_not_confirmed"):
                execute(provider, settings(), approved=True)

    def test_only_verified_demo_evidence_and_one_provider(self):
        for provider in ("prune", "swarms", "openrouter"):
            evidence, cfg = prepare(provider, settings(openrouter_model="fixture/model:free"))
            self.assertEqual(evidence.career.requirements, [])
            self.assertEqual(evidence.career.sources, [])
            self.assertEqual(evidence.career.external_resources, [])
            self.assertEqual(len(evidence.career.mdc_resources), 1)
            self.assertEqual(evidence.career.mdc_resources[0].verification_status, "verified")
            self.assertEqual(cfg.max_requests, 1)
            self.assertEqual(cfg.max_output_tokens, 512)
            for other in {"gemini", "prune", "swarms", "openrouter"} - {provider}:
                self.assertFalse(getattr(cfg, other + "_key").get_secret_value())

    def test_controlled_openrouter_requires_explicit_free_variant(self):
        for model in ("paid/model", "openrouter/free", "model:free"):
            with self.assertRaisesRegex(AIServiceError, "explicit_free_variant_required"):
                prepare("openrouter", settings(openrouter_model=model))

    def test_swarms_three_schemas_and_single_request(self):
        calls = []
        def route(req):
            payload = json.loads(req.content)
            calls.append(payload)
            result = swarms_response()
            # Use the actual approved context's resource IDs in generated outputs.
            for turn in result["output"]:
                output = json.loads(turn["content"])
                output["source_urls"] = []
                if turn["role"] == "Roadmap":
                    output["steps"][0]["resource_ids"] = []
                else:
                    output["resource_ids"] = []
                turn["content"] = json.dumps(output)
            result["output"].insert(0, {"role": "user", "content": payload["task"]})
            return httpx.Response(200, json=result)
        result = execute("swarms", settings(), approved=True, costs_confirmed=True,
                         transport=httpx.MockTransport(route))
        self.assertEqual(set(result.output), {"Career", "Education", "Roadmap"})
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(calls[0]["agents"]), 3)
        for agent in calls[0]["agents"]:
            self.assertTrue(agent["llm_args"]["response_format"]["json_schema"]["strict"])
            self.assertEqual(agent["fallback_models"], [])
            self.assertEqual(agent["max_tokens"], 512)

    def test_prune_shield_blocks_and_never_leaks_header_text(self):
        for header, expected in (("spend_cap", "shield_spend_cap"), ("shield_unavailable", "shield_shield_unavailable"),
                                 ("sensitive arbitrary text", "shield_blocked")):
            calls = []
            def route(req):
                calls.append(req)
                return httpx.Response(429, headers={"X-Prune-Shield-Code": header}, text="private content")
            service = PruneService(settings(), budget=RequestBudget(), transport=httpx.MockTransport(route))
            with self.assertRaisesRegex(AIServiceError, expected):
                service.explain_career(context())
            self.assertEqual(len(calls), 1)

    def test_prune_refusal_and_truncation(self):
        for reason, error in (("length", "truncated_response"), ("content_filter", "safety_refusal")):
            body = prune_response()
            body["choices"][0]["finish_reason"] = reason
            svc = PruneService(settings(), budget=RequestBudget(),
                               transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body)))
            with self.assertRaisesRegex(AIServiceError, error):
                svc.explain_career(context())

    def test_prune_malformed_message_is_safe_error(self):
        svc = PruneService(settings(), budget=RequestBudget(), transport=httpx.MockTransport(
            lambda _: httpx.Response(200, json={"choices": [{"message": None}]})))
        with self.assertRaisesRegex(AIServiceError, "invalid_response"):
            svc.explain_career(context())

    def test_receipt_report_does_not_print_arbitrary_provider_content(self):
        body = prune_response()
        body["prune_metadata"]["secret"] = "must-not-print"
        svc = PruneService(settings(), budget=RequestBudget(),
                           transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body)))
        report = safe_report(svc.explain_career(context()))
        self.assertTrue(report["receipt_present"])
        self.assertFalse(report["receipt_signature_verified"])
        self.assertEqual(report["metadata_cost"], .001)
        self.assertNotIn("must-not-print", json.dumps(report))

    def test_controlled_openrouter_429_has_one_attempt(self):
        calls = []
        def route(req):
            calls.append(req)
            return httpx.Response(429)
        with self.assertRaisesRegex(AIServiceError, "rate_limited"):
            execute("openrouter", settings(openrouter_model="fixture/model:free", openrouter_key="test"),
                    approved=True, costs_confirmed=True, transport=httpx.MockTransport(route))
        self.assertEqual(len(calls), 1)
