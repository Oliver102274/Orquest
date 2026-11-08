import asyncio
import json
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from starlette.exceptions import HTTPException
from backend.main import create_app
from backend.services.progress import ProgressStore
from backend.services.data import DataRepository
from backend.agents.job_coordinator import JobFirstCoordinator
from backend.integrations.common import AISettings
from backend.job_models import JobRequest
from test_backend import request


class ProgressTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[1]
        career = DataRepository(self.root / "data", self.root / "data/demo").careers()[1]
        self.roadmap = JobFirstCoordinator(AISettings()).roadmap(career, JobRequest(career_id=career.career_id))

    def test_concurrent_completion_awards_once_and_enforces_access(self):
        store = ProgressStore()
        created = store.create(self.roadmap)
        progress = created["progress"]
        auth = "Bearer " + created["access_token"]
        with self.assertRaises(HTTPException):
            store.get(progress["id"], "Bearer wrong")
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: store.complete(progress["id"], progress["missions"][0]["id"], auth), range(8)))
        self.assertTrue(all(p["total_xp"] == 10 for p in results))
        self.assertNotIn("access_token", store.get(progress["id"], auth))

    def test_expiry_capacity_and_foreign_mission(self):
        now = [0]
        store = ProgressStore(capacity=1, ttl_seconds=5, clock=lambda: now[0])
        created = store.create(self.roadmap)
        with self.assertRaises(HTTPException): store.create(self.roadmap)
        with self.assertRaises(HTTPException): store.complete(created["progress"]["id"], "foreign", "Bearer " + created["access_token"])
        now[0] = 6
        with self.assertRaises(HTTPException): store.get(created["progress"]["id"], "Bearer " + created["access_token"])
        self.assertTrue(store.create(self.roadmap))

    def test_api_target_completion_validation_and_retrieval(self):
        with patch.dict("os.environ", {"ORQUESTRA_AI_ENABLED": "false"}):
            app = create_app(self.root / "data", demo_enabled=True)
            def call(method, path, body=None, token=None):
                status, raw, _ = asyncio.run(request(app, method, path, body, [(b"authorization", ("Bearer " + token).encode())] if token else []))
                return status, json.loads(raw)
            _, cards = call("GET", "/api/cards")
            status, matches = call("POST", "/api/matches", {"responses": [{"card_id": c["id"], "preference": "like"} for c in cards["cards"]]})
            self.assertEqual(status, 200)
            self.assertIn("career_cybersecurity_analyst", [m["career_id"] for m in matches["matches"]])
            _, mappings = call("GET", "/api/occupation-mappings")
            target = mappings["career_to_occupation"]["career_cybersecurity_analyst"]
            self.assertEqual(call("GET", f"/api/occupations/{target}")[0], 200)
            status, created = call("POST", "/api/progress", {"target_id": target})
            self.assertEqual(status, 201)
            p, token = created["progress"], created["access_token"]
            self.assertEqual(p["roadmap"]["target_occupation"]["career_id"], "occupation_15_1212")
            path = f'/api/progress/{p["id"]}/missions/{p["missions"][0]["id"]}/completion'
            self.assertEqual(call("PUT", path, {"completed": True, "xp": 100}, token)[0], 422)
            self.assertEqual(call("PUT", path, {"completed": True}, token)[1]["total_xp"], 10)
            self.assertEqual(call("GET", f'/api/progress/{p["id"]}', token=token)[1]["total_xp"], 10)

    def test_browser_completion_preflight(self):
        app = create_app(self.root / "data", demo_enabled=True)
        status, _, headers = asyncio.run(request(app, "OPTIONS", "/api/progress/fixture/missions/fixture/completion", headers=[
            (b"origin", b"http://localhost:5173"), (b"access-control-request-method", b"PUT"),
            (b"access-control-request-headers", b"authorization,content-type")]))
        self.assertEqual(status, 200)
        self.assertIn(b"PUT", headers[b"access-control-allow-methods"])
