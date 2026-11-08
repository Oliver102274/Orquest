"""JWT signatures are real; identity provider and PostgreSQL transport are mocked."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
import os
from pathlib import Path
from threading import RLock
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from backend.auth import Auth0Verifier
from backend.main import create_app
from backend.services.accounts import MemoryAccounts, PostgresAccounts, connection
from backend.services.data import DataRepository
from backend.agents.job_coordinator import JobFirstCoordinator
from backend.integrations.common import AISettings
from backend.job_models import JobRequest
from test_backend import request

ROOT = Path(__file__).resolve().parents[1]


class FakeDatabase:
    """Transactional connection double with rollback and a shared row-lock stand-in.

    Exercises SQL parameters and actual store methods, not a replacement store.
    Real PostgreSQL locking/migration still needs an approved staging check.
    """
    def __init__(self):
        self.users, self.progress, self.completions = {}, {}, set()
        self.lock = RLock()
        self.fail = False
        self.fail_update = False

    def connect(self):
        database = self
        class Connection:
            def __enter__(self):
                if database.fail:
                    raise RuntimeError('synthetic connection failure')
                database.lock.acquire()
                self.before = deepcopy((database.users, database.progress, database.completions))
                return self

            def __exit__(self, kind, value, trace):
                if kind:
                    database.users, database.progress, database.completions = self.before
                database.lock.release()

            def execute(self, sql, params):
                rows = []
                if sql.startswith('INSERT INTO orquest_users'):
                    database.users.setdefault(params[0], None)
                elif sql.startswith('SELECT selected_target'):
                    rows = [(database.users[params[0]],)]
                elif sql.startswith('UPDATE orquest_users'):
                    database.users[params[1]] = params[0]
                elif sql.startswith('INSERT INTO orquest_progress'):
                    identifier, sub, target, data = params
                    if not any(p['sub'] == sub and p['target'] == target for p in database.progress.values()):
                        database.progress[identifier] = {'sub': sub, 'target': target, 'snapshot': deepcopy(data.obj)}
                elif sql.startswith('SELECT snapshot'):
                    if 'WHERE id=%s AND subject=%s FOR UPDATE' in sql:
                        identifier, sub = params
                        p = database.progress.get(identifier)
                        rows = [(deepcopy(p['snapshot']),)] if p and p['sub'] == sub else []
                    elif 'target_id=%s' in sql:
                        rows = [(deepcopy(p['snapshot']),) for p in database.progress.values() if (p['sub'], p['target']) == params]
                    elif 'ORDER BY created_at' in sql:
                        rows = [(deepcopy(p['snapshot']),) for p in database.progress.values() if p['sub'] == params[0]]
                    else:
                        raise AssertionError('Unexpected SELECT or missing ownership filter')
                elif sql.startswith('INSERT INTO orquest_completions'):
                    database.completions.add(params)
                elif sql.startswith('UPDATE orquest_progress'):
                    if database.fail_update:
                        raise RuntimeError('synthetic write failure')
                    data, identifier, sub = params
                    assert database.progress[identifier]['sub'] == sub
                    database.progress[identifier]['snapshot'] = deepcopy(data.obj)
                else:
                    raise AssertionError('Unexpected SQL')
                return SimpleNamespace(fetchone=lambda: rows[0] if rows else None, fetchall=lambda: rows)
        return Connection()


class AccountTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        career = DataRepository(ROOT / 'data', ROOT / 'data/demo').careers()[1]
        cls.roadmap = JobFirstCoordinator(AISettings()).roadmap(career, JobRequest(career_id=career.career_id))

    def setUp(self):
        env = patch.dict(os.environ, {'AUTH0_ENABLED': 'true', 'AUTH0_DOMAIN': 'test.auth0.com',
            'AUTH0_AUDIENCE': 'https://orquest-api', 'PERSISTENCE_BACKEND': 'memory', 'ORQUESTRA_AI_ENABLED': 'false'})
        env.start(); self.addCleanup(env.stop)
        self.verifier = Auth0Verifier()
        self.verifier.jwks = Mock()
        self.verifier.jwks.get_signing_key_from_jwt.return_value = SimpleNamespace(key=self.key.public_key())

    def token(self, sub='auth0|student-a', **updates):
        claims = {'iss': 'https://test.auth0.com/', 'aud': 'https://orquest-api', 'exp': int(time.time()) + 60,
                  'iat': int(time.time()) - 1, 'sub': sub}
        claims.update(updates)
        return jwt.encode(claims, self.key, algorithm='RS256', headers={'kid': 'test-key'})

    def test_valid_token(self):
        self.assertEqual(self.verifier('Bearer ' + self.token()), 'auth0|student-a')

    def test_expired_audience_issuer_and_missing_claims(self):
        for updates in [{'exp': 1}, {'aud': 'id-token-client'}, {'iss': 'https://wrong.auth0.com/'}, {'sub': ''}]:
            with self.subTest(updates=updates), self.assertRaises(HTTPException) as error:
                self.verifier('Bearer ' + self.token(**updates))
            self.assertEqual(error.exception.status_code, 401)
        claims = jwt.decode(self.token(), options={'verify_signature': False})
        del claims['exp']
        with self.assertRaises(HTTPException):
            self.verifier('Bearer ' + jwt.encode(claims, self.key, algorithm='RS256', headers={'kid': 'test-key'}))

    def test_forged_signature_guest_token_and_absent_token(self):
        claims = jwt.decode(self.token(), options={'verify_signature': False})
        forged = jwt.encode(claims, self.other, algorithm='RS256', headers={'kid': 'test-key'})
        for auth in ['Bearer '+forged, 'Bearer guest-session-token', None]:
            with self.assertRaises(HTTPException) as error: self.verifier(auth)
            self.assertEqual(error.exception.status_code, 401)

    def test_jwks_unavailable_sanitized(self):
        self.verifier.jwks.get_signing_key_from_jwt.side_effect = jwt.PyJWKClientConnectionError('private diagnostic')
        with self.assertRaises(HTTPException) as error: self.verifier('Bearer '+self.token())
        self.assertEqual(error.exception.status_code, 503)
        self.assertNotIn('private', error.exception.detail)

    def test_disabled_and_bad_config_never_fetches_jwks(self):
        for settings in [{'AUTH0_ENABLED':'false'}, {'AUTH0_DOMAIN':'https://wrong/path'}]:
            with patch.dict(os.environ, settings), self.assertRaises(HTTPException) as error:
                Auth0Verifier()('Bearer '+self.token())
            self.assertEqual(error.exception.status_code, 503)

    def check_store(self, store, reload_store):
        p = store.create('A', self.roadmap)
        other = store.create('B', self.roadmap)
        self.assertNotEqual(p['id'], other['id'])
        self.assertEqual(store.create('A', self.roadmap)['id'], p['id'])
        for mission in [None, p['missions'][0]['id']]:
            with self.assertRaises(HTTPException) as error: store.get('B', p['id'], mission)
            self.assertEqual(error.exception.status_code, 404)
        with self.assertRaises(HTTPException): store.get('A', p['id'], other['missions'][0]['id'])
        with ThreadPoolExecutor(max_workers=8) as pool:
            values = list(pool.map(lambda _: store.get('A', p['id'], p['missions'][0]['id']), range(16)))
        self.assertTrue(all(v['total_xp'] == 10 for v in values))
        self.assertEqual(reload_store().load('A')['progress'][0]['total_xp'], 10)
        self.assertEqual(store.load('B')['progress'][0]['total_xp'], 0)
        store.select('A', 'occupation_15_1212')
        self.assertEqual(reload_store().load('A')['selected_target'], 'occupation_15_1212')

    def test_memory_two_users_reload_duplicates_concurrency(self):
        store = MemoryAccounts()
        self.check_store(store, lambda: store)
        store.clock = lambda: float('inf')
        self.assertEqual(store.load('A')['progress'], [])

    def test_postgres_two_users_reload_duplicates_concurrency(self):
        db = FakeDatabase()
        self.check_store(PostgresAccounts(db.connect), lambda: PostgresAccounts(db.connect))
        self.assertEqual(len(db.completions), 1)
        migration = (ROOT/'backend/migrations/001_account_progress.sql').read_text()
        self.assertIn('PRIMARY KEY(progress_id, mission_id)', migration)
        self.assertIn('UNIQUE(subject, target_id)', migration)

    def test_completion_write_failure_rolls_back_receipt_and_xp(self):
        db = FakeDatabase()
        store = PostgresAccounts(db.connect)
        p = store.create('A', self.roadmap)
        db.fail_update = True
        with self.assertRaises(HTTPException) as error:
            store.get('A', p['id'], p['missions'][0]['id'])
        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(len(db.completions), 0)
        self.assertEqual(store.load('A')['progress'][0]['total_xp'], 0)

    def test_postgres_api_restore_after_application_restart(self):
        db = FakeDatabase()
        def application():
            with patch.dict(os.environ, {'PERSISTENCE_BACKEND': 'postgres'}):
                app = create_app(ROOT/'data', demo_enabled=True)
            app.state.account_store.connect = db.connect
            app.state.account_verifier.jwks = self.verifier.jwks
            return app
        def call(app, method, path, body=None, sub='auth0|student-a'):
            headers = [(b'authorization', ('Bearer '+self.token(sub)).encode())]
            status, raw, _ = asyncio.run(request(app, method, path, body, headers))
            return status, json.loads(raw)
        app = application()
        status, progress = call(app, 'POST', '/api/account/progress', {'target_id': 'occupation_15_1212'})
        self.assertEqual(status, 201)
        self.assertEqual(progress['storage'], 'persistent_postgres')
        path = '/api/account/progress/'+progress['id']
        completion = path+'/missions/'+progress['missions'][0]['id']+'/completion'
        self.assertEqual(call(app, 'PUT', completion, {'completed': True})[1]['total_xp'], 10)
        restarted = application()
        self.assertEqual(call(restarted, 'GET', path)[1]['total_xp'], 10)
        self.assertEqual(call(restarted, 'GET', path, sub='auth0|student-b')[0], 404)
        self.assertEqual(call(restarted, 'GET', '/api/account/progress')[1]['selected_target'], 'occupation_15_1212')

    def test_database_outage_no_false_success(self):
        db = FakeDatabase(); db.fail = True
        store = PostgresAccounts(db.connect)
        for operation in [lambda: store.load('A'), lambda: store.create('A', self.roadmap), lambda: store.select('A','target')]:
            with self.assertRaises(HTTPException) as error: operation()
            self.assertEqual(error.exception.status_code, 503)
            self.assertNotIn('synthetic', error.exception.detail)

    def test_database_gate_and_encrypted_connection(self):
        with patch.dict(os.environ, {'DATABASE_CREDENTIALS_ROTATED':'false','DATABASE_ZERO_COST_CONFIRMED':'false'}), patch('psycopg.connect') as connect:
            with self.assertRaises(HTTPException): connection()
            connect.assert_not_called()
        # Synthetic values never identify or connect to a real service.
        with patch.dict(os.environ, {'DATABASE_CREDENTIALS_ROTATED':'true','DATABASE_ZERO_COST_CONFIRMED':'true',
            'DATABASE_URL':'postgresql://fixture:fixture@localhost/test?sslmode=disable'}), patch('psycopg.connect') as connect:
            connection()
            self.assertEqual(connect.call_args.kwargs['sslmode'], 'verify-full')
            self.assertEqual(connect.call_args.kwargs['connect_timeout'], 5)

    def test_account_routes_and_guest_separation(self):
        app = create_app(ROOT/'data', demo_enabled=True)
        app.state.account_verifier.jwks = self.verifier.jwks
        def call(method, path, body=None, token=None):
            headers = [(b'authorization', ('Bearer '+token).encode())] if token else []
            status, raw, _ = asyncio.run(request(app, method, path, body, headers))
            return status, json.loads(raw)
        a, b = self.token(), self.token('auth0|student-b')
        self.assertEqual(call('GET','/api/me')[0],401)
        self.assertEqual(call('GET','/api/me',token=a)[1]['storage'],'temporary_memory')
        status, p = call('POST','/api/account/progress',{'target_id':'occupation_15_1212'}, a)
        self.assertEqual(status,201)
        path = '/api/account/progress/'+p['id']
        self.assertEqual(call('GET',path,token=b)[0],404)
        complete = path+'/missions/'+p['missions'][0]['id']+'/completion'
        self.assertEqual(call('PUT',complete,{'completed':True,'xp':999},a)[0],422)
        self.assertEqual(call('PUT',complete,{'completed':True},a)[1]['total_xp'],10)
        self.assertEqual(call('GET','/api/account/progress',token=a)[1]['progress'][0]['total_xp'],10)
        _, guest = call('POST','/api/progress',{'target_id':'occupation_15_1212'})
        self.assertEqual(call('GET',path,token=guest['access_token'])[0],401)
        self.assertEqual(call('GET','/api/progress/'+guest['progress']['id'],token=a)[0],401)

    def test_flags_leave_guest_available_and_outage_is_http_503(self):
        with patch.dict(os.environ, {'AUTH0_ENABLED':'false'}):
            app = create_app(ROOT/'data')
        self.assertEqual(asyncio.run(request(app,'GET','/api/me'))[0],503)
        self.assertEqual(asyncio.run(request(app,'GET','/api/cards'))[0],200)
        with patch.dict(os.environ, {'PERSISTENCE_BACKEND':'postgres'}):
            app = create_app(ROOT/'data')
        app.state.account_verifier.jwks = self.verifier.jwks
        app.state.account_store.connect = Mock(side_effect=RuntimeError('private outage'))
        headers=[(b'authorization',('Bearer '+self.token()).encode())]
        status, body, _ = asyncio.run(request(app,'GET','/api/me',headers=headers))
        self.assertEqual(status,503)
        self.assertNotIn(b'private outage',body)

    def test_migration_requires_explicit_opt_in(self):
        from backend.account_migrate import main
        with patch('sys.argv',['migration']), patch('backend.account_migrate.connection') as connect, patch('builtins.print'):
            self.assertEqual(main(),2)
            connect.assert_not_called()
