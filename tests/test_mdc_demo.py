"""Isolated overlay tests; no collaborator datasets required."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.main import create_app
from backend.services.data import DataRepository, DataError
from test_backend import request

DEMO = Path(__file__).resolve().parents[1] / "data" / "demo"
CAREER = "career_cybersecurity_analyst"


class MDCDemoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        base = dict(title="Fixture", summary="Test only", requirements=[], sources=[],
                    interest_tags=["security"], mdc_resources=[], external_resources=[])
        self.catalog = {"careers": [dict(base, career_id=CAREER), dict(base, career_id="career_other")]}
        self.write()
        (self.path / "cards.json").write_text(json.dumps({"cards": [{"id": "card_test", "activity": "Fixture", "interest_tags": ["security"]}]}))

    def write(self):
        (self.path / "careers.json").write_text(json.dumps(self.catalog))

    def call(self, app, method, path, body=None):
        status, raw, _ = asyncio.run(request(app, method, path, body))
        return status, json.loads(raw)

    def test_default_disabled_and_explicit_environment_opt_in(self):
        with patch.dict("os.environ", {"ORQUESTRA_MDC_DEMO_ENABLED": "false"}):
            app = create_app(self.path)
        self.assertEqual(self.call(app, "GET", f"/api/careers/{CAREER}")[1]["mdc_resources"], [])
        with patch.dict("os.environ", {"ORQUESTRA_MDC_DEMO_ENABLED": "true"}):
            app = create_app(self.path)
        self.assertEqual(len(self.call(app, "GET", f"/api/careers/{CAREER}")[1]["mdc_resources"]), 1)

    def test_swipe_match_details_and_other_careers(self):
        before = (self.path / "careers.json").read_bytes()
        app = create_app(self.path, demo_enabled=True)
        status, cards = self.call(app, "GET", "/api/cards")
        self.assertEqual(status, 200)
        status, matches = self.call(app, "POST", "/api/matches", {"responses": [{"card_id": cards["cards"][0]["id"], "preference": "like"}]})
        self.assertEqual(status, 200)
        self.assertIn(CAREER, [m["career_id"] for m in matches["matches"]])
        for _ in range(2):
            status, detail = self.call(app, "GET", f"/api/careers/{CAREER}")
            self.assertEqual(status, 200)
            self.assertEqual(len(detail["mdc_resources"]), 1)
            self.assertEqual(detail["external_resources"], [])
            resource = detail["mdc_resources"][0]
            self.assertEqual(resource["source_url"], "https://www.mdc.edu/cybersecurityas/")
            self.assertEqual(resource["verification_status"], "verified")
        self.assertEqual(self.call(app, "GET", "/api/careers/career_other")[1]["mdc_resources"], [])
        self.assertEqual(before, (self.path / "careers.json").read_bytes())

    def test_existing_resources_preserved_and_collisions_rejected(self):
        resource = json.loads((DEMO / "mdc_pathways.json").read_text())["pathways"][0]["mdc_resources"][0]
        external = dict(resource, id="resource_external_fixture")
        self.catalog["careers"][0]["external_resources"] = [external]
        self.write()
        repo = DataRepository(self.path, DEMO)
        self.assertEqual(repo.careers()[0].external_resources[0].id, external["id"])
        self.catalog["careers"][0]["mdc_resources"] = [resource]
        self.write()
        with self.assertRaises(DataError):
            repo.careers()

    def test_missing_career_reports_clear_error(self):
        self.catalog["careers"] = []
        self.write()
        status, body = self.call(create_app(self.path, demo_enabled=True), "GET", f"/api/careers/{CAREER}")
        self.assertEqual(status, 503)
        self.assertEqual(body["error"]["code"], "invalid_data")

    def test_missing_invalid_and_duplicate_overlay(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = DataRepository(self.path, Path(directory))
            with self.assertRaises(DataError):
                repo.careers()
            overlay = Path(directory) / "mdc_pathways.json"
            for content in ["{", '{"pathways":[{"career_id":"x","mdc_resources":[]},{"career_id":"x","mdc_resources":[]}]}']:
                overlay.write_text(content)
                with self.assertRaises(DataError):
                    repo.careers()
