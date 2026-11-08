

"""Educational resource validation and in-memory caching."""

from datetime import datetime, timedelta, timezone
import re
from threading import Lock

from backend.models import Resource


class ResourceDiscoveryService:
    def __init__(self, ttl_hours: int = 24):
        self.ttl = timedelta(hours=ttl_hours)
        self.cache = {}
        self.lock = Lock()

    def validate_candidates(self, candidates: list[dict]) -> list[Resource]:
        resources = []
        seen_ids = set()

        for candidate in candidates:
            try:
                resource = Resource.model_validate(candidate)
            except (ValueError, TypeError):
                continue

            if resource.id in seen_ids or resource.source_url is None:
                continue

            # A discovered resource is not automatically verified.
            resource = resource.model_copy(
                update={
                    "verification_status": "unverified",
                    "verified_at": None,
                }
            )

            seen_ids.add(resource.id)
            resources.append(resource)

        return resources

    def get_cached(self, occupation_id: str) -> list[Resource] | None:
        with self.lock:
            entry = self.cache.get(occupation_id)

            if entry is None:
                return None

            expires_at, resources = entry

            if datetime.now(timezone.utc) >= expires_at:
                del self.cache[occupation_id]
                return None

            return list(resources)

    def save_cached(
        self,
        occupation_id: str,
        resources: list[Resource],
    ) -> None:
        expires_at = datetime.now(timezone.utc) + self.ttl

        with self.lock:
            self.cache[occupation_id] = (
                expires_at,
                list(resources),
            )

    def find_mdc_programs(self, occupation_id: str) -> list[dict]:
        """Find MDC programs matching an occupation's SOC code."""
        import json
        import re
        from pathlib import Path

        match = re.fullmatch(
            r"occupation_(\d{2})_(\d{4})",
            occupation_id,
        )

        if not match:
            return []

        soc_code = f"{match.group(1)}-{match.group(2)}"

        catalog_path = (
            Path(__file__).resolve().parents[2]
            / "data"
            / "mdc_program_catalog.json"
        )

        if not catalog_path.is_file():
            return []

        with catalog_path.open(encoding="utf-8") as file:
            programs = json.load(file)

        return [
            program
            for program in programs
            if soc_code in program.get("soc_codes", [])
        ]

    def discover_mdc_resources(self, occupation_id: str) -> list[Resource]:
        """Find MDC educational resources and cache the results."""

        cached = self.get_cached(occupation_id)

        if cached is not None:
            return cached

        programs = self.find_mdc_programs(occupation_id)
        candidates = []

        for program in programs:
            candidates.append({
                "id": f"mdc_{program['plan_code']}",
                "title": f'{program["name"]} ({program["award_type"]})' if program.get("award_type") else program["name"],
                "organization": "Miami Dade College",
                "type": "educational_program",
                "source_url": program["source_url"],
                "verification_status": "unverified",
            })

        resources = self.validate_candidates(candidates)
        self.save_cached(occupation_id, resources)

        return resources


    def discover_related_programs(
        self,
        occupation: dict,
        limit: int = 5,
    ) -> list[dict]:
        """Find possible MDC programs using conservative keyword matching."""
        import json
        from pathlib import Path

        catalog_path = (
            Path(__file__).resolve().parents[2]
            / "data"
            / "mdc_program_catalog.json"
        )

        if not catalog_path.is_file():
            return []

        programs = json.loads(
            catalog_path.read_text(encoding="utf-8")
        )

        soc = occupation.get("soc_code", "")
        title = occupation.get("title", "")
        bls_title = occupation.get("bls_title", "")

        stopwords = {
            "and", "the", "for", "with", "specialist",
            "worker", "workers", "technician", "technicians",
            "professional", "professionals", "other",
            "computer", "computers", "technology",
            "technologies", "general", "assistant",
            "associate", "advanced", "studies",
        }

        def keywords(text):
            words = re.findall(r"[a-z]{4,}", text.lower())
            return {
                word for word in words
                if word not in stopwords
            }

        target_words = keywords(title + " " + bls_title)

        matches = []

        for program in programs:
            codes = program.get("soc_codes", [])

            if soc in codes:
                continue

            program_words = keywords(program["name"])
            overlap = target_words & program_words

            if not overlap:
                continue

            score = len(overlap)

            matches.append({
                "id": f"mdc_{program['plan_code']}",
                "title": f'{program["name"]} ({program["award_type"]})' if program.get("award_type") else program["name"],
                "organization": "Miami Dade College",
                "type": "educational_program",
                "source_url": program["source_url"],
                "verification_status": "unverified",
                "match_type": "keyword_candidate",
                "relevance_score": score,
                "matched_keywords": sorted(overlap),
            })

        matches.sort(
            key=lambda item: (
                -item["relevance_score"],
                item["title"],
            )
        )

        return matches[:limit]


    def external_search_options(self, occupation: dict) -> list[dict]:
        """Provide official discovery destinations, not verified programs."""
        from urllib.parse import quote

        title = occupation.get("bls_title") or occupation.get("title", "")
        soc = occupation.get("soc_code", "")

        options = [{
            "title": "CareerOneStop Training Finder",
            "organization": "CareerOneStop",
            "type": "external_search",
            "url": "https://www.careeronestop.org/FindTraining/find-training.aspx",
            "search_term": title,
            "verification_status": "unverified",
            "description": "Search for training programs related to this occupation.",
        }]

        if soc.startswith("47-") or soc.startswith("49-"):
            options.append({
                "title": "Apprenticeship.gov",
                "organization": "U.S. Department of Labor",
                "type": "external_search",
                "url": "https://www.apprenticeship.gov/",
                "search_term": title,
                "verification_status": "unverified",
                "description": "Explore registered apprenticeship opportunities.",
            })

        return options
