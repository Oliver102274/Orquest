"""Run unchanged frontend API functions against real loopback FastAPI + branch data.

No database or AI calls. The temporary server is always shut down.
"""

import argparse
import hashlib
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import uvicorn
from backend.main import create_app
from backend.services.data import DataRepository


NODE_CHECK = r"""
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.INTEGRATION_API_BASE;
const original = fs.readFileSync(process.env.INTEGRATION_API_FILE, 'utf8');
// Emulate Vite's build-time env substitution in memory; never edit source.
assert(original.includes('import.meta.env.VITE_API_BASE_URL'));
const source = original.replaceAll('import.meta.env.VITE_API_BASE_URL', JSON.stringify(base)).replaceAll('import.meta.env.DEV', 'false');
const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const cards = await api.getSwipeCards();
assert(cards.length > 0);
const matches = await api.getCareerMatches(cards.map(c => ({card_id:c.id, preference:'like'})));
assert(matches.length > 0);
for (const match of matches) {
  const career = await api.getCareer(match.career_id);
  assert.equal(career.career_id, match.career_id);
  assert(Array.isArray(career.mdc_resources));
  assert(Array.isArray(career.external_resources));
}
const preflight = await fetch(base + '/api/matches', {method:'OPTIONS', headers:{Origin:'http://localhost:5173', 'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
assert.equal(preflight.status,process.env.INTEGRATION_PUBLIC === 'true' ? 400 : 200);
assert.equal(preflight.headers.get('access-control-allow-origin'),process.env.INTEGRATION_PUBLIC === 'true' ? null : 'http://localhost:5173');
if (process.env.INTEGRATION_PUBLIC === 'true') {
  for (const route of ['/', '/explore', '/roadmap']) {
    const page = await fetch(base + route);
    assert.equal(page.status, 200);
    assert((await page.text()).includes('<div id="root">'));
  }
  assert.equal((await fetch(base + '/.env')).status, 404);
  assert.equal((await fetch(base + '/api/not-found')).status, 404);
}
await assert.rejects(api.getCareer('unknown-integration-career'), error => error.status === 404);
await assert.rejects(api.getCareerMatches([{card_id:'unknown-integration-card',preference:'like'}]), error => error.status === 422);
const health = await fetch(base + '/api/health');
assert.deepEqual(await health.json(),{status:'ok'});
console.log(JSON.stringify({cards:cards.length,matches:matches.length,career_details:'PASS',mdc_and_external_arrays:'PASS',cors:'PASS',errors:'PASS',health:'PASS'}));
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worktree", type=Path, default=ROOT / ".integration" / "frontend")
    parser.add_argument("--mdc-demo", action="store_true")
    parser.add_argument("--production", action="store_true", help="Test built single-origin app, never deploy")
    args = parser.parse_args()
    data = args.worktree / "data"
    paths = [data / "cards.json", data / "careers.json", args.worktree / "frontend" / "src" / "services" / "api.js"]
    before = [hashlib.sha256(path.read_bytes()).hexdigest() for path in paths]
    repository = DataRepository(data)
    print(f"Schema validation: {len(repository.cards())} cards, {len(repository.careers())} careers", flush=True)
    # Careers now include the approved MDC PR; the older teammate branch is no
    # longer its source of truth. Schema validation and before/after hashes apply.
    for filename, branch in [("cards.json", "feature/swipe-and-learning-data")]:
        owner_bytes = subprocess.check_output(["git", "show", f"origin/{branch}:data/{filename}"], cwd=ROOT)
        import json
        assert json.loads(owner_bytes) == json.loads((data / filename).read_bytes()), f"Owner/frontend data differ: {filename}"
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    # Disable providers before app construction, not just in the child process.
    os.environ['ORQUESTRA_AI_ENABLED'] = 'false'
    os.environ['PUBLIC_AI_ENABLED'] = 'false'
    os.environ['AI_MAX_REQUESTS_PER_PROVIDER'] = '0'
    if args.production:
        from backend.production import create_public_app
        os.environ['ORQUESTRA_MDC_DEMO_ENABLED'] = str(args.mdc_demo).lower()
        application = create_public_app(args.worktree / 'frontend/dist')
    else:
        application = create_app(data, origins=["http://localhost:5173"], demo_enabled=args.mdc_demo)
    server = uvicorn.Server(uvicorn.Config(application, log_level="warning"))
    worker = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    try:
        worker.start()
        deadline = time.monotonic() + 15
        while not server.started:
            if not worker.is_alive() or time.monotonic() >= deadline:
                raise RuntimeError("Local test server failed to start")
            time.sleep(0.05)
        env = {**os.environ, "ORQUESTRA_AI_ENABLED": "false", "AI_MAX_REQUESTS_PER_PROVIDER": "0",
               "INTEGRATION_PUBLIC": str(args.production).lower(),
               "INTEGRATION_API_BASE": f"http://127.0.0.1:{port}", "INTEGRATION_API_FILE": str(paths[2])}
        subprocess.run(["node", "--input-type=module", "-e", NODE_CHECK], env=env, check=True, timeout=30)
        if args.mdc_demo:
            frontend = args.worktree / "frontend"
            test_path = frontend / "mdc_demo_integration.test.jsx"
            # Exclusive creation prevents overwriting any collaborator file.
            with test_path.open("x", encoding="utf-8") as temporary:
                temporary.write((ROOT / "tests" / "frontend_mdc_demo.test.jsx").read_text(encoding="utf-8"))
            try:
                subprocess.run(["node", "node_modules/vitest/vitest.mjs", "run"], cwd=frontend, env=env, check=True, timeout=120)
            finally:
                test_path.unlink()
    finally:
        server.should_exit = True
        worker.join(timeout=10)
        sock.close()
        assert not worker.is_alive(), "Test server did not stop"
        assert before == [hashlib.sha256(path.read_bytes()).hexdigest() for path in paths]
        print("Test server stopped; teammate files unchanged.", flush=True)


if __name__ == "__main__":
    main()
