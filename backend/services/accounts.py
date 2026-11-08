"""Account-owned progress. Database connections are lazy and explicitly gated."""
from contextlib import contextmanager
from copy import deepcopy
import os
from threading import RLock
from time import monotonic
from uuid import uuid4, UUID
import psycopg
from psycopg.types.json import Jsonb
from fastapi import HTTPException


def connection():
    if os.getenv('DATABASE_CREDENTIALS_ROTATED', '').lower() != 'true' or os.getenv('DATABASE_ZERO_COST_CONFIRMED', '').lower() != 'true':
        raise HTTPException(503, 'Database access requires rotated credentials and confirmed zero-cost eligibility.')
    url = os.getenv('DATABASE_URL', '')
    try:
        config = psycopg.conninfo.conninfo_to_dict(url)
        if not url or not config.get('host') or not config.get('password'):
            raise ValueError()
        # Force certificate and hostname verification, irrespective of URL options.
        return psycopg.connect(url, sslmode='verify-full', sslrootcert=os.getenv('DATABASE_SSLROOTCERT', 'system'),
                               connect_timeout=5, options='-c statement_timeout=5000 -c lock_timeout=3000')
    except Exception:
        raise HTTPException(503, 'Account storage unavailable; no save was confirmed.') from None


def snapshot(roadmap, storage):
    if roadmap.metadata.status == 'blocked' or not roadmap.suggested_missions:
        raise HTTPException(409, 'No actionable roadmap is available.')
    return {'id': str(uuid4()), 'roadmap': roadmap.model_dump(mode='json'),
            'missions': [{**m.model_dump(), 'id': str(uuid4()), 'completed': False, 'xp_reward': 10} for m in roadmap.suggested_missions],
            'total_xp': 0, 'storage': storage,
            'notice': ('Saved to your account. Completion is self-reported, not a qualification.' if storage == 'persistent_postgres'
                       else 'Temporary account progress: expires after 24 hours or server restart. Not permanently saved.')}


class MemoryAccounts:
    storage = 'temporary_memory'

    def __init__(self):
        self.lock = RLock()
        self.clock = monotonic
        self.accounts = {}

    def _account(self, sub):
        now = self.clock()
        self.accounts = {s: a for s, a in self.accounts.items() if a['expires'] > now}
        if sub not in self.accounts:
            if len(self.accounts) >= 256:
                raise HTTPException(503, 'Temporary account capacity reached.')
            self.accounts[sub] = {'selected_target': None, 'progress': [], 'expires': now + 86400}
        return self.accounts[sub]

    def load(self, sub):
        with self.lock:
            account = self._account(sub)
            return deepcopy({k: account[k] for k in ('selected_target', 'progress')})

    def select(self, sub, target):
        with self.lock:
            self._account(sub)['selected_target'] = target
            return {'selected_target': target}

    def create(self, sub, roadmap):
        with self.lock:
            account = self._account(sub)
            target = roadmap.target_occupation.career_id
            existing = next((p for p in account['progress'] if p['roadmap']['target_occupation']['career_id'] == target), None)
            if existing:
                return deepcopy(existing)
            if len(account['progress']) >= 120:
                raise HTTPException(503, 'Account progress capacity reached.')
            progress = snapshot(roadmap, self.storage)
            account['progress'].append(progress)
            account['selected_target'] = target
            return deepcopy(progress)

    def get(self, sub, identifier, mission=None):
        with self.lock:
            progress = next((p for p in self._account(sub)['progress'] if p['id'] == identifier), None)
            if progress is None:
                raise HTTPException(404, 'Account progress not found.')
            if mission is not None:
                item = next((m for m in progress['missions'] if m['id'] == mission), None)
                if item is None:
                    raise HTTPException(404, 'Mission not found.')
                item['completed'] = True
                progress['total_xp'] = sum(10 for m in progress['missions'] if m['completed'])
            return deepcopy(progress)


class PostgresAccounts:
    storage = 'persistent_postgres'

    def __init__(self, connect=connection):
        self.connect = connect

    @contextmanager
    def transaction(self):
        try:
            with self.connect() as conn:
                yield conn
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, 'Account storage unavailable; no save was confirmed. Reload before trying again.') from None

    @staticmethod
    def user(conn, sub):
        conn.execute('INSERT INTO orquest_users(subject) VALUES (%s) ON CONFLICT DO NOTHING', (sub,))

    def load(self, sub):
        with self.transaction() as conn:
            self.user(conn, sub)
            selected = conn.execute('SELECT selected_target FROM orquest_users WHERE subject=%s', (sub,)).fetchone()[0]
            rows = conn.execute('SELECT snapshot FROM orquest_progress WHERE subject=%s ORDER BY created_at', (sub,)).fetchall()
            return {'selected_target': selected, 'progress': [row[0] for row in rows]}

    def select(self, sub, target):
        with self.transaction() as conn:
            self.user(conn, sub)
            conn.execute('UPDATE orquest_users SET selected_target=%s WHERE subject=%s', (target, sub))
            return {'selected_target': target}

    def create(self, sub, roadmap):
        progress = snapshot(roadmap, self.storage)
        target = roadmap.target_occupation.career_id
        with self.transaction() as conn:
            self.user(conn, sub)
            conn.execute('INSERT INTO orquest_progress(id,subject,target_id,snapshot) VALUES (%s,%s,%s,%s) ON CONFLICT(subject,target_id) DO NOTHING',
                         (progress['id'], sub, target, Jsonb(progress)))
            conn.execute('UPDATE orquest_users SET selected_target=%s WHERE subject=%s', (target, sub))
            return conn.execute('SELECT snapshot FROM orquest_progress WHERE subject=%s AND target_id=%s', (sub, target)).fetchone()[0]

    def get(self, sub, identifier, mission=None):
        try:
            UUID(identifier)
        except ValueError:
            raise HTTPException(404, 'Account progress not found.') from None
        with self.transaction() as conn:
            row = conn.execute('SELECT snapshot FROM orquest_progress WHERE id=%s AND subject=%s FOR UPDATE', (identifier, sub)).fetchone()
            if row is None:
                raise HTTPException(404, 'Account progress not found.')
            progress = row[0]
            if mission is not None:
                item = next((m for m in progress['missions'] if m['id'] == mission), None)
                if item is None:
                    raise HTTPException(404, 'Mission not found.')
                conn.execute('INSERT INTO orquest_completions(progress_id,mission_id) VALUES (%s,%s) ON CONFLICT DO NOTHING', (identifier, mission))
                item['completed'] = True
                progress['total_xp'] = sum(10 for m in progress['missions'] if m['completed'])
                conn.execute('UPDATE orquest_progress SET snapshot=%s WHERE id=%s AND subject=%s', (Jsonb(progress), identifier, sub))
            return progress
