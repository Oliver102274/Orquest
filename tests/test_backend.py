"""Isolated synthetic data and ASGI tests using only the standard library."""

import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.main import create_app


async def request(app, method, path, body=None, headers=None):
    """Exercise the actual ASGI app, middleware, validation, and serialization."""
    messages = []
    raw = json.dumps(body).encode() if body is not None else b""
    scope = {
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"}, "http_version": "1.1",
        "method": method, "scheme": "http", "path": path,
        "raw_path": path.encode(), "query_string": b"", "root_path": "",
        "headers": [(b"content-type", b"application/json"), *(headers or [])],
        "server": ("test", 80), "client": ("test", 1234),
    }

    async def receive():
        return {"type": "http.request", "body": raw, "more_body": False}

    async def send(message):
        messages.append(message)

    await app(scope, receive, send)
    start = next(message for message in messages if message["type"] == "http.response.start")
    content = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return start["status"], content, dict(start["headers"])


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.cards = {"cards": [
            {"id": "card_a", "activity": "Synthetic activity A", "interest_tags": ["test_alpha", "test_alpha"]},
            {"id": "card_b", "activity": "Synthetic activity B", "interest_tags": ["test_beta"]},
            {"id": "card_c", "activity": "Synthetic activity C", "interest_tags": ["test_alpha"]},
        ]}
        resource = {"id": "resource_test", "title": "Synthetic resource", "organization": "Test only", "type": "guide", "source_url": "https://example.org/test", "verified_at": None, "verification_status": "unverified"}
        self.careers = {"careers": [
            {"career_id": "career_a", "title": "Synthetic career A", "summary": "Test only", "requirements": [], "sources": [], "mdc_resources": [], "external_resources": [resource], "interest_tags": ["test_alpha"]},
            {"career_id": "career_b", "title": "Synthetic career B", "summary": "Test only", "requirements": [], "sources": [], "mdc_resources": [], "external_resources": [], "interest_tags": ["test_alpha", "test_beta"]},
        ]}
        self.save()
        self.app = create_app(self.directory, origins=["http://localhost:5173"])

    def save(self):
        for name, content in [("cards", self.cards), ("careers", self.careers)]:
            (self.directory / f"{name}.json").write_text(json.dumps(content), encoding="utf-8")

    def call(self, method, path, body=None, headers=None):
        status, raw, response_headers = asyncio.run(request(self.app, method, path, body, headers))
        return status, json.loads(raw), response_headers

    def match(self, *responses):
        return self.call("POST", "/api/matches", {"responses": [{"card_id": card, "preference": preference} for card, preference in responses]})

    def test_health_without_data(self):
        for file in self.directory.glob("*.json"):
            file.unlink()
        self.assertEqual(self.call("GET", "/api/health")[:2], (200, {"status": "ok"}))

    def test_cards_and_compatibility_alias(self):
        for path in ["/api/cards", "/api/swipe-cards"]:
            status, body, _ = self.call("GET", path)
            self.assertEqual(status, 200)
            self.assertEqual(body, self.cards)

    def test_career_response_hides_matching_metadata(self):
        status, body, _ = self.call("GET", "/api/careers/career_a")
        self.assertEqual(status, 200)
        self.assertNotIn("interest_tags", body)
        self.assertEqual(body["mdc_resources"], [])
        self.assertEqual(body["external_resources"][0]["source_url"], "https://example.org/test")

    def test_unknown_career(self):
        status, body, _ = self.call("GET", "/api/careers/absent")
        self.assertEqual(status, 404)
        self.assertEqual(body["error"]["code"], "not_found")

    def test_matching_scores_and_order(self):
        status, body, _ = self.match(("card_a", "like"))
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ready")
        self.assertEqual([m["interest_score"] for m in body["matches"]], [100, 50])
        self.assertEqual(body["matches"][0]["matched_interest_tags"], ["test_alpha"])
        self.assertIn("not a scientific prediction", body["score_description"])

    def test_negative_signals_and_conflicts(self):
        _, body, _ = self.match(("card_a", "like"), ("card_b", "dislike"))
        self.assertEqual([m["career_id"] for m in body["matches"]], ["career_a"])
        self.assertEqual(self.match(("card_a", "like"), ("card_c", "dislike"))[1]["matches"], [])

    def test_skip_and_dislike_do_not_create_matches(self):
        for preference in ["skip", "dislike"]:
            self.assertEqual(self.match(("card_a", preference))[1]["matches"], [])

    def test_ties_are_stable_and_repeated_tags_do_not_inflate(self):
        self.careers["careers"][1]["interest_tags"] = ["test_alpha", "test_alpha"]
        self.careers["careers"].reverse()
        self.save()
        matches = self.match(("card_a", "like"), ("card_c", "like"))[1]["matches"]
        self.assertEqual([m["career_id"] for m in matches], ["career_a", "career_b"])
        self.assertEqual([m["interest_score"] for m in matches], [100, 100])

    def test_invalid_requests(self):
        for body in [{}, {"responses": []}, {"responses": [{"card_id": "card_a", "preference": "yes"}]}, {"responses": [{"card_id": 1, "preference": "like"}]}, {"responses": [], "secret": "never echo this"}]:
            status, result, _ = self.call("POST", "/api/matches", body)
            self.assertEqual(status, 422)
            self.assertEqual(result["error"]["code"], "validation_error")
            self.assertNotIn("never echo this", json.dumps(result))

    def test_duplicate_and_unknown_cards(self):
        self.assertEqual(self.match(("card_a", "like"), ("card_a", "skip"))[0], 422)
        self.assertEqual(self.match(("missing", "like"))[1]["error"]["code"], "unknown_card")

    def test_missing_data(self):
        (self.directory / "cards.json").unlink()
        self.assertEqual(self.call("GET", "/api/cards")[1]["error"]["code"], "data_unavailable")
        self.assertEqual(self.match(("card_a", "like"))[0], 503)
        (self.directory / "careers.json").unlink()
        self.assertEqual(self.call("GET", "/api/careers/career_a")[0], 503)

    def test_invalid_json_schema_encoding_and_duplicate_ids(self):
        for content in [b'{', b'{}', b'\xff', json.dumps({"cards": [self.cards["cards"][0]] * 2}).encode(), b'{"cards":[{"id":"x","activity":"x","interest_tags":["Bad Tag"]}]}']:
            (self.directory / "cards.json").write_bytes(content)
            status, body, _ = self.call("GET", "/api/cards")
            self.assertEqual(status, 503)
            self.assertEqual(body["error"]["code"], "invalid_data")

    def test_invalid_verified_resource(self):
        self.careers["careers"][0]["external_resources"][0]["verification_status"] = "verified"
        self.save()
        self.assertEqual(self.call("GET", "/api/careers/career_a")[0], 503)

    def test_unreadable_data(self):
        with patch.object(Path, "read_text", side_effect=PermissionError("private path")):
            status, body, _ = self.call("GET", "/api/cards")
        self.assertEqual(status, 503)
        self.assertEqual(body["error"]["code"], "data_unavailable")
        self.assertNotIn("private path", json.dumps(body))

    def test_duplicate_career_and_resource_ids(self):
        self.careers["careers"].append(self.careers["careers"][0])
        self.save()
        self.assertEqual(self.call("GET", "/api/careers/career_a")[0], 503)
        self.careers["careers"].pop()
        resources = self.careers["careers"][0]["external_resources"]
        resources.append(resources[0])
        self.save()
        self.assertEqual(self.call("GET", "/api/careers/career_a")[0], 503)

    def test_empty_catalog_is_valid(self):
        self.careers = {"careers": []}
        self.save()
        self.assertEqual(self.match(("card_a", "like"))[1]["matches"], [])

    def test_cors(self):
        allowed = self.call("GET", "/api/health", headers=[(b"origin", b"http://localhost:5173")])[2]
        self.assertEqual(allowed[b"access-control-allow-origin"], b"http://localhost:5173")
        denied = self.call("GET", "/api/health", headers=[(b"origin", b"https://untrusted.example")])[2]
        self.assertNotIn(b"access-control-allow-origin", denied)
        status, _, headers = asyncio.run(request(self.app, "OPTIONS", "/api/matches", headers=[(b"origin", b"http://localhost:5173"), (b"access-control-request-method", b"POST"), (b"access-control-request-headers", b"content-type")]))
        self.assertEqual(status, 200)
        self.assertIn(b"POST", headers[b"access-control-allow-methods"])

    def test_openapi_documents_responses(self):
        schema = self.app.openapi()
        self.assertIn("503", schema["paths"]["/api/cards"]["get"]["responses"])
        self.assertIn("interest_score", schema["components"]["schemas"]["CareerMatch"]["properties"])


if __name__ == "__main__":
    unittest.main()
