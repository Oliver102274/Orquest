"""Single-origin public demo: built assets only, bounded requests, no .env loading."""
import os
from collections import deque
from pathlib import Path
from time import monotonic

from fastapi import HTTPException
from fastapi.responses import FileResponse, JSONResponse
from backend.main import create_app


class PublicDemoLimits:
    """Single-worker global limits: no IP trust, identifier storage, or paid services."""
    def __init__(self, app, *, clock=monotonic):
        self.app, self.clock = app, clock
        self.attempts = deque()
        self.active = 0

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)

        async def safe_send(message):
            if message['type'] == 'http.response.start':
                message.setdefault('headers', []).extend([
                    (b'x-content-type-options', b'nosniff'),
                    (b'x-frame-options', b'DENY'),
                    (b'referrer-policy', b'no-referrer'),
                    (b'cache-control', b'no-store'),
                ])
            await send(message)

        async def reject(status, code):
            response = JSONResponse({'error': {'code': code, 'message': 'Demo request limit reached. Try again later.'}},
                                    status_code=status, headers={'Retry-After': '60'} if status == 429 else {})
            await response(scope, receive, safe_send)

        path = scope['path']
        limited = scope['method'] == 'POST' and (path in {'/api/career-questions', '/api/roadmaps', '/api/progress'}
                                               or (path.startswith('/api/occupations/') and path.endswith('/roadmap')))
        if limited:
            now = self.clock()
            while self.attempts and self.attempts[0] <= now - 60:
                self.attempts.popleft()
            if len(self.attempts) >= 20 or self.active >= 2:
                return await reject(429, 'demo_rate_limit')
            self.attempts.append(now)
            self.active += 1
        try:
            if scope['method'] in {'POST', 'PUT', 'PATCH'}:
                body = bytearray()
                while True:
                    message = await receive()
                    if message['type'] == 'http.disconnect':
                        return
                    chunk = message.get('body', b'')
                    if len(body) + len(chunk) > 16384:
                        return await reject(413, 'request_too_large')
                    body.extend(chunk)
                    if not message.get('more_body', False):
                        break
                async def buffered_receive():
                    return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
                await self.app(scope, buffered_receive, safe_send)
            else:
                await self.app(scope, receive, safe_send)
        finally:
            if limited:
                self.active -= 1


def create_public_app(dist_directory: Path | None = None):
    os.environ['ORQUESTRA_PUBLIC_DEMO'] = 'true'
    dist = (dist_directory or Path(__file__).resolve().parents[1] / 'frontend/dist').resolve()
    if not (dist / 'index.html').is_file():
        raise RuntimeError('Build the frontend before starting the public demo.')
    application = create_app(origins=[])  # Same origin; no cross-origin access needed.
    application.add_middleware(PublicDemoLimits)

    @application.get('/{path:path}', include_in_schema=False)
    def frontend(path: str):
        target = (dist / path).resolve()
        if path == 'api' or path.startswith('api/') or not target.is_relative_to(dist) or any(part.startswith('.') for part in Path(path).parts):
            raise HTTPException(404, 'Not found.')
        if target.is_file():
            return FileResponse(target)
        if Path(path).suffix or path.startswith('assets/'):
            raise HTTPException(404, 'Not found.')
        return FileResponse(dist / 'index.html')

    return application
