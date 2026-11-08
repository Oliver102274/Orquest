"""Additive account endpoints; guest bearer tokens never enter this store."""
import os
from typing import Literal
from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from backend.auth import Auth0Verifier
from backend.services.accounts import MemoryAccounts, PostgresAccounts
from backend.job_models import ProgressRequest, CompletionRequest, JobRequest, ProgressResponse


class Selection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    target_id: str = Field(min_length=1, max_length=200)


class AccountProgress(ProgressResponse):
    storage: Literal['temporary_memory', 'persistent_postgres']


class AccountState(BaseModel):
    selected_target: str | None
    progress: list[AccountProgress]


class AccountIdentity(BaseModel):
    sub: str
    storage: Literal['temporary_memory', 'persistent_postgres']


def register_accounts(app, career, roadmap):
    verifier = Auth0Verifier()
    backend = os.getenv('PERSISTENCE_BACKEND', 'memory')
    store = PostgresAccounts() if backend == 'postgres' else MemoryAccounts()
    app.state.account_verifier = verifier
    app.state.account_store = store

    def subject(sub=Depends(verifier)):
        if backend not in {'memory', 'postgres'}:
            raise HTTPException(503, 'Account storage configuration unavailable.')
        return sub

    @app.get('/api/me', response_model=AccountIdentity)
    def me(sub=Depends(subject)):
        store.load(sub)  # Verify storage readiness; never promise a save on failure.
        return {'sub': sub, 'storage': store.storage}

    @app.get('/api/account/progress', response_model=AccountState)
    def progress(sub=Depends(subject)):
        return store.load(sub)

    @app.put('/api/account/selection')
    def select(request: Selection, sub=Depends(subject)):
        career(request.target_id)
        return store.select(sub, request.target_id)

    @app.post('/api/account/progress', status_code=201, response_model=AccountProgress)
    def create(request: ProgressRequest, sub=Depends(subject)):
        career(request.target_id)
        # Restore existing progress without generating another AI roadmap.
        existing = next((p for p in store.load(sub)['progress'] if p['roadmap']['target_occupation']['career_id'] == request.target_id), None)
        if existing:
            return existing
        result = roadmap(JobRequest(career_id=request.target_id, **request.model_dump(exclude={'target_id'})))
        return store.create(sub, result)

    @app.get('/api/account/progress/{identifier}', response_model=AccountProgress)
    def get(identifier: str, sub=Depends(subject)):
        return store.get(sub, identifier)

    @app.put('/api/account/progress/{identifier}/missions/{mission_id}/completion', response_model=AccountProgress)
    def complete(identifier: str, mission_id: str, request: CompletionRequest, sub=Depends(subject)):
        return store.get(sub, identifier, mission_id)
