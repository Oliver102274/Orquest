"""Explicit local startup with this worktree's ignored .env; no automatic AI calls."""
from backend.integrations.verify import ROOT, load_local_env


def local_app():
    load_local_env(ROOT / ".env")
    from backend.main import create_app
    return create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(local_app(), host="127.0.0.1", port=8000)
