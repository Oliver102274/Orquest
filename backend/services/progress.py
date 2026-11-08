"""Bounded single-process demo progress. No persistence or credential logging."""
from hashlib import sha256
from secrets import token_urlsafe, compare_digest
from threading import Lock
from time import monotonic
from uuid import uuid4
from starlette.exceptions import HTTPException


class ProgressStore:
    def __init__(self, capacity=256, ttl_seconds=86400, clock=monotonic):
        self.entries = {}
        self.lock = Lock()
        self.capacity, self.ttl, self.clock = capacity, ttl_seconds, clock

    def create(self, roadmap):
        if roadmap.metadata.status == "blocked" or not roadmap.suggested_missions:
            raise HTTPException(409, "No actionable roadmap is available.")
        with self.lock:
            self.entries = {k: v for k, v in self.entries.items() if v["expires"] > self.clock()}
            if len(self.entries) >= self.capacity:
                raise HTTPException(503, "Temporary demo progress capacity reached.")
            identifier, token = str(uuid4()), token_urlsafe(32)
            progress = {"id": identifier, "roadmap": roadmap.model_dump(mode="json"),
                        "missions": [{**m.model_dump(), "id": str(uuid4()), "completed": False, "xp_reward": 10} for m in roadmap.suggested_missions],
                        "total_xp": 0, "storage": "temporary_memory",
                        "notice": "Self-reported practice progress. Expires after 24 hours or server restart; not a qualification or saved account."}
            self.entries[identifier] = {"token_hash": sha256(token.encode()).hexdigest(), "expires": self.clock() + self.ttl, "progress": progress}
            return {"access_token": token, "progress": self._copy(progress)}

    @staticmethod
    def _copy(value):
        from copy import deepcopy
        return deepcopy(value)

    def _authorized(self, identifier, authorization):
        entry = self.entries.get(identifier)
        if not entry or entry["expires"] <= self.clock():
            self.entries.pop(identifier, None)
            raise HTTPException(404, "Demo progress expired or not found.")
        token = (authorization or "").removeprefix("Bearer ")
        if not authorization or not authorization.startswith("Bearer ") or not compare_digest(entry["token_hash"], sha256(token.encode()).hexdigest()):
            raise HTTPException(401, "A valid progress access token is required.")
        return entry["progress"]

    def get(self, identifier, authorization):
        with self.lock:
            return self._copy(self._authorized(identifier, authorization))

    def complete(self, identifier, mission_id, authorization):
        with self.lock:
            progress = self._authorized(identifier, authorization)
            mission = next((m for m in progress["missions"] if m["id"] == mission_id), None)
            if mission is None:
                raise HTTPException(404, "Mission not found in this progress session.")
            mission["completed"] = True
            progress["total_xp"] = sum(m["xp_reward"] for m in progress["missions"] if m["completed"])
            return self._copy(progress)
