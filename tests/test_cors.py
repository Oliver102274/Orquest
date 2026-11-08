"""Explicit development CORS origins, including Vite's alternate port."""
import asyncio
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.main import create_app
from test_backend import request


class CorsOriginsTests(unittest.TestCase):
    def test_cards_and_preflight_allow_trusted_origins_only(self):
        with patch.dict('os.environ', {'FRONTEND_ORIGIN': 'https://frontend.example'}):
            app = create_app(Path(__file__).resolve().parents[1] / 'data')
        for origin in ['http://localhost:5173', 'http://127.0.0.1:5173',
                       'http://localhost:5174', 'http://127.0.0.1:5174',
                       'https://frontend.example']:
            with self.subTest(origin=origin):
                status, _, headers = asyncio.run(request(app, 'GET', '/api/cards',
                    headers=[(b'origin', origin.encode())]))
                self.assertEqual(status, 200)
                self.assertEqual(headers[b'access-control-allow-origin'], origin.encode())
                self.assertIn(b'Origin', headers[b'vary'])
                status, _, headers = asyncio.run(request(app, 'OPTIONS', '/api/cards', headers=[
                    (b'origin', origin.encode()), (b'access-control-request-method', b'GET')]))
                self.assertEqual(status, 200)
                self.assertEqual(headers[b'access-control-allow-origin'], origin.encode())
        _, _, headers = asyncio.run(request(app, 'GET', '/api/cards',
            headers=[(b'origin', b'https://untrusted.example')]))
        self.assertNotIn(b'access-control-allow-origin', headers)

    def test_explicit_override_stays_restricted(self):
        app = create_app(origins=['https://frontend.example'])
        _, _, headers = asyncio.run(request(app, 'GET', '/api/health',
            headers=[(b'origin', b'http://localhost:5174')]))
        self.assertNotIn(b'access-control-allow-origin', headers)
