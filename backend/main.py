"""Minimal Orquestra API entry point."""

from fastapi import FastAPI

app = FastAPI(title="Orquestra API", version="0.1.0")


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    """Report application liveness; no external services are checked."""
    return {"status": "ok"}
