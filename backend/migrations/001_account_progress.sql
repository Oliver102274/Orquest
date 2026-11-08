-- Manual, additive migration. Never executed during application startup.
BEGIN;
CREATE TABLE IF NOT EXISTS orquest_users (
    subject TEXT PRIMARY KEY,
    selected_target TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orquest_progress (
    id UUID PRIMARY KEY,
    subject TEXT NOT NULL REFERENCES orquest_users(subject),
    target_id TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(subject, target_id)
);
CREATE TABLE IF NOT EXISTS orquest_completions (
    progress_id UUID NOT NULL REFERENCES orquest_progress(id),
    mission_id UUID NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(progress_id, mission_id)
);
COMMIT;
