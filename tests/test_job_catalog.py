"""Catalog and selected-occupation pathways; provider calls are mocked."""
import asyncio
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from backend.main import create_app
from backend.services.data import DataRepository, DataError
from backend.services.job_catalog import JobCatalogRepository, CAREER_OCCUPATIONS
from backend.agents.job_coordinator import JobFirstCoordinator
from backend.integrations.common import AISettings, ProviderResult
from backend.job_models import JobRequest
from test_backend import request

ROOT = Path(__file__).resolve().parents[1]
CYBER = "occupation_15_1212"


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.directory = ROOT / "data"
        self.repo = JobCatalogRepository(self.directory)
        self.catalog = self.repo.load()
        self.app = create_app(self.directory, demo_enabled=True)
        env = patch.dict(os.environ, {"ORQUESTRA_AI_ENABLED": "false"})
        env.start()
        self.addCleanup(env.stop)

    def call(self, method, path, body=None):
        status, raw, _ = asyncio.run(request(self.app, method, path, body))
        return status, json.loads(raw)

    def test_all_families_occupations_and_metadata(self):
        self.assertEqual(len(self.catalog.families), 20)
        self.assertEqual(len(self.catalog.occupations), 115)
        self.assertEqual(sum(len(f.occupation_ids) for f in self.catalog.families), 115)
        status, body = self.call("GET", "/api/job-families")
        self.assertEqual(status, 200)
        self.assertIn("not Florida", body["metadata"]["salary_scope"])
        self.assertEqual(self.call("GET", "/api/occupations")[1]["occupations"][0]["soc_code"], "15-1252")
        self.assertTrue(all(not o.verified_per_row for o in self.catalog.occupations))
        list_endpoint = next(route.endpoint for route in self.app.routes if route.path == "/api/occupations")
        family = self.catalog.families[0]
        self.assertEqual({o.id for o in list_endpoint(family.id).occupations}, set(family.occupation_ids))

    def test_lookup_mappings_and_old_ids(self):
        status, body = self.call("GET", "/api/occupations/" + CYBER)
        self.assertEqual(status, 200)
        self.assertEqual(body["linked_career_ids"], ["career_cybersecurity_analyst"])
        self.assertNotIn("career_data_analyst", CAREER_OCCUPATIONS)
        self.assertEqual(self.call("GET", "/api/careers/career_data_analyst")[0], 200)
        self.assertIn("career_data_analyst", self.call("GET", "/api/occupation-mappings")[1]["unmapped_career_ids"])

    def test_unknown_occupation_and_invalid_profile(self):
        self.assertEqual(self.call("GET", "/api/occupations/unknown")[0], 404)
        self.assertEqual(self.call("POST", "/api/occupations/unknown/roadmap", {})[0], 404)
        self.assertEqual(self.call("POST", f"/api/occupations/{CYBER}/roadmap", {"model": "paid"})[0], 422)

    def test_cyber_demo_and_external_resources_preserved(self):
        status, body = self.call("POST", f"/api/occupations/{CYBER}/roadmap", {})
        self.assertEqual(status, 200)
        self.assertEqual(body["target_occupation"]["career_id"], CYBER)
        self.assertEqual(len(body["mdc_pathways"]), 1)
        self.assertEqual(len(body["alternative_resources"]), 2)
        self.assertEqual(body["relevant_skills_and_qualifications"], [])
        self.assertEqual(self.call("GET", "/api/careers/career_cybersecurity_analyst")[1]["mdc_resources"][0]["id"], body["mdc_pathways"][0]["id"])

    def test_unmapped_occupation_no_invented_pathway_or_ai(self):
        service = JobFirstCoordinator(AISettings(enabled=True), gemini=Mock(), openrouter=Mock())
        with patch("backend.main.JobFirstCoordinator", return_value=service):
            status, body = self.call("POST", "/api/occupations/occupation_29_1141/roadmap", {})
        self.assertEqual(status, 200)
        self.assertEqual(body["mdc_pathways"], [])
        self.assertEqual(body["alternative_resources"], [])
        self.assertEqual(body["metadata"]["reason"], "insufficient_evidence")
        self.assertTrue(all("not a verified educational resource" in step["instruction"] for step in body["suggested_missions"]))
        service.openrouter.plan_job_roadmap.assert_not_called()

    def test_mock_ai_receives_only_selected_verified_context(self):
        gemini = Mock()
        rid = "resource_mdc_cybersecurity_as_demo"
        gemini.plan_job_roadmap.return_value = ProviderResult(provider="gemini", model="fixture", output={"steps": [{"title": "Review option", "instruction": "Compare this option with your goals.", "resource_ids": [rid]}], "source_urls": ["https://www.mdc.edu/cybersecurityas/"]})
        settings = AISettings(enabled=True, gemini_free_tier_confirmed=True, gemini_model="gemini-3.1-flash-lite")
        service = JobFirstCoordinator(settings, gemini=gemini, openrouter=Mock())
        with patch("backend.main.JobFirstCoordinator", return_value=service):
            status, body = self.call("POST", f"/api/occupations/{CYBER}/roadmap", {"starting_point": "Beginner", "goals": ["Investigate security"]})
        self.assertEqual(status, 200)
        self.assertEqual(body["metadata"]["status"], "ai_generated")
        context = gemini.plan_job_roadmap.call_args.args[0]
        self.assertEqual(context.career.career_id, CYBER)
        self.assertEqual(context.starting_point, "Beginner")
        self.assertNotIn("occupation_29_1141", context.model_dump_json())
        self.assertNotIn("129180", context.model_dump_json())
        self.assertEqual(context.career.requirements, [])

    def test_invalid_catalog_structure_rejected(self):
        raw = json.loads((self.directory / "orquest_job_catalog.json").read_text())
        cases = []
        duplicate = copy.deepcopy(raw); duplicate["occupations"].append(duplicate["occupations"][0]); cases.append(duplicate)
        unknown = copy.deepcopy(raw); unknown["occupations"][0]["source_refs"] = ["absent"]; cases.append(unknown)
        broken = copy.deepcopy(raw); broken["families"][0]["occupation_ids"] = []; cases.append(broken)
        wrongcode = copy.deepcopy(raw); wrongcode["occupations"][0]["soc_code"] = "00-0000"; cases.append(wrongcode)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            for case in cases:
                (path / "job_catalog.json").write_text(json.dumps(case))
                with self.assertRaises(DataError):
                    JobCatalogRepository(path).load()

    def test_missing_catalog_does_not_break_health(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(Path(directory), demo_enabled=False)
            for path, expected in [("/api/health", 200), ("/api/job-families", 503)]:
                status, _, _ = asyncio.run(request(app, "GET", path))
                self.assertEqual(status, expected)

    def test_future_pathways_unverified_resources_are_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            resource = {"id": "fixture_resource", "title": "Fixture", "organization": "Fixture", "type": "guide", "source_url": "https://example.org/test", "verification_status": "unverified"}
            (path / "occupation_pathways.json").write_text(json.dumps({"pathways": [{"career_id": "occupation_29_1141", "mdc_resources": [resource]}]}))
            repo = JobCatalogRepository(path)
            occupation = repo.lookup(self.catalog, "occupation_29_1141")
            target = repo.guidance_career(self.catalog, occupation, DataRepository(path))
            result = JobFirstCoordinator(AISettings()).roadmap(target, JobRequest(career_id=occupation.id))
            self.assertEqual(result.mdc_pathways, [])
            self.assertEqual(result.source_urls, [])

    def test_all_occupations_can_prepare_without_provider_calls(self):
        existing = DataRepository(self.directory, self.directory / "demo")
        service = JobFirstCoordinator(AISettings())
        for occupation in self.catalog.occupations:
            target = self.repo.guidance_career(self.catalog, occupation, existing)
            result = service.roadmap(target, JobRequest(career_id=occupation.id))
            self.assertEqual(result.target_occupation.career_id, occupation.id)
            self.assertEqual(result.metadata.status, "deterministic")
