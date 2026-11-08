"""Final MDC integration checks against contributor data; no network calls."""
import asyncio
import json
from pathlib import Path
from urllib.parse import urlparse
from backend.main import create_app
from backend.services.resource_discovery import ResourceDiscoveryService
from backend.services.job_catalog import JobCatalogRepository
from test_backend import request

ROOT = Path(__file__).resolve().parents[1]


def test_program_catalog_unique_official_sources():
    programs = json.loads((ROOT / 'data/mdc_program_catalog.json').read_text())
    assert len(programs) == 247
    assert len({p['plan_code'] for p in programs}) == len(programs)
    assert all(urlparse(p['source_url']).scheme == 'https' and urlparse(p['source_url']).hostname == 'www.mdc.edu' for p in programs)


def test_resources_for_every_occupation_keep_candidate_status():
    app = create_app(ROOT / 'data', demo_enabled=True)
    catalog = JobCatalogRepository(ROOT / 'data').load()
    for occupation in catalog.occupations:
        status, raw, _ = asyncio.run(request(app, 'GET', f'/api/occupations/{occupation.id}/resources'))
        body = json.loads(raw)
        assert status == 200
        assert body['occupation_id'] == occupation.id
        resources = body['resources'] + body['related_resources']
        assert body['total_resources'] == len(resources)
        assert len({r['id'] for r in resources}) == len(resources)
        assert all(r['verification_status'] == 'unverified' for r in resources)
        assert all(urlparse(r['source_url']).hostname == 'www.mdc.edu' for r in resources)
        assert all(r['match_type'] == 'keyword_candidate' for r in body['related_resources'])
        assert all(r['verification_status'] == 'unverified' for r in body['external_search_options'])


def test_discovery_never_promotes_candidates_to_verified_evidence():
    service = ResourceDiscoveryService()
    candidates = service.discover_mdc_resources('occupation_15_1212')
    assert candidates
    assert all(r.verification_status == 'unverified' and r.verified_at is None for r in candidates)
    assert service.discover_mdc_resources('career_data_analyst') == []
    assert service.validate_candidates([{'id': 'incomplete'}]) == []


def test_unknown_occupation_resource_lookup_is_404():
    app = create_app(ROOT / 'data')
    status, _, _ = asyncio.run(request(app, 'GET', '/api/occupations/unknown/resources'))
    assert status == 404
