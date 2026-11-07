"""Optional contributor resource ingestion without data-file mutation."""
import json
import tempfile
import unittest
from pathlib import Path

from backend.services.data import DataRepository, DataError


class ExternalResourceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.career = dict(career_id="career_test", title="Fixture", summary="Test only", requirements=[], sources=[], interest_tags=[], mdc_resources=[], external_resources=[])
        self.resource = dict(id="resource_test", title="Fixture", organization="Test", type="course", source_url="https://example.org/test", verification_status="unverified", verified_at=None)
        self.save("careers.json", {"careers": [self.career]})
        self.repo = DataRepository(self.path)

    def save(self, name, body):
        (self.path / name).write_text(json.dumps(body))

    def test_optional_and_append_without_mutation(self):
        self.assertEqual(self.repo.careers()[0].external_resources, [])
        original = (self.path / "careers.json").read_bytes()
        self.save("external_resources.json", {"careers": [{"career_id": "career_test", "external_resources": [self.resource]}]})
        for _ in range(2):
            self.assertEqual(len(self.repo.careers()[0].external_resources), 1)
        self.assertEqual(original, (self.path / "careers.json").read_bytes())

    def test_unknown_career_duplicate_links_and_bad_schema(self):
        link = {"career_id": "career_test", "external_resources": [self.resource]}
        for body in [{"careers": [dict(link, career_id="unknown")]}, {"careers": [link, link]}, {"careers": [{"career_id": "career_test"}]}]:
            self.save("external_resources.json", body)
            with self.assertRaises(DataError):
                self.repo.careers()

    def test_collisions_between_inline_and_external_file_rejected(self):
        self.career["mdc_resources"] = [self.resource]
        self.save("careers.json", {"careers": [self.career]})
        self.save("external_resources.json", {"careers": [{"career_id": "career_test", "external_resources": [self.resource]}]})
        with self.assertRaises(DataError):
            self.repo.careers()

    def test_real_catalog_with_mdc_demo(self):
        root = Path(__file__).resolve().parents[1]
        repo = DataRepository(root / "data", root / "data" / "demo")
        careers = repo.careers()
        self.assertEqual(len(repo.cards()), 12)
        self.assertEqual(sum(len(c.external_resources) for c in careers), 7)
        cyber = next(c for c in careers if c.career_id == "career_cybersecurity_analyst")
        self.assertEqual(len(cyber.mdc_resources), 1)
        self.assertEqual(len(cyber.external_resources), 2)
