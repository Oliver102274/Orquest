"""Manual one-provider verification. Dry-run by default; never imported by routes."""

import argparse
import json
import os
from pathlib import Path

from backend.integrations.common import AIServiceError, AISettings

ROOT = Path(__file__).resolve().parents[2]
MODELS = {"gemini": "gemini-3.1-flash-lite", "swarms": "gemini/gemini-3.1-flash-lite", "prune": "gpt-4o-mini", "openrouter": "openrouter/free"}
VARIABLES = {
    "GEMINI_API_KEY", "SWARMS_API_KEY", "PRUNE_API_KEY", "GEMINI_MODEL", "SWARMS_MODEL", "PRUNE_MODEL",
    "ORQUESTRA_AI_ENABLED", "AI_MAX_REQUESTS_PER_PROVIDER", "AI_MAX_INPUT_CHARS", "AI_MAX_OUTPUT_TOKENS", "AI_TIMEOUT_SECONDS",
    "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "GEMINI_FREE_TIER_CONFIRMED",
}


ACCOUNT_VARIABLES = {
    "AUTH0_ENABLED", "AUTH0_DOMAIN", "AUTH0_AUDIENCE", "PERSISTENCE_BACKEND",
    "DATABASE_URL", "DATABASE_CREDENTIALS_ROTATED", "DATABASE_ZERO_COST_CONFIRMED", "DATABASE_SSLROOTCERT",
}


def load_local_env(path: Path, *, include_accounts: bool = False):
    """Literal single-line KEY=value subset; no expansion, execution, or logging."""
    if not path.exists():
        return
    try:
        values = {}
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, separator, value = line.partition("=")
            if not separator:
                raise ValueError()
            key, value = key.strip(), value.strip()
            if key not in (VARIABLES | ACCOUNT_VARIABLES if include_accounts else VARIABLES):
                continue
            if key in values:
                raise ValueError()
            if value.startswith(("'", '"')):
                if len(value) < 2 or value[-1] != value[0]:
                    raise ValueError()
                value = value[1:-1]
            values[key] = value
        for key, value in values.items():
            os.environ.setdefault(key, value)
    except (OSError, UnicodeError, ValueError):
        raise AIServiceError("invalid_local_env", "configuration") from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("provider", choices=MODELS)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--live", action="store_true", help="Billable: use only after explicit approval")
    args = parser.parse_args(argv)
    try:
        load_local_env(args.env_file)
        settings = AISettings.from_env()
        key_present = bool(getattr(settings, f"{args.provider}_key").get_secret_value().strip())
        model_matches = getattr(settings, f"{args.provider}_model") == MODELS[args.provider]
        print(json.dumps({"provider": args.provider, "credential_present": key_present,
                          "model_matches_reviewed_choice": model_matches, "live_requested": args.live,
                          "enabled": settings.enabled, "positive_budget": settings.max_requests > 0}))
        if not args.live:
            print("Dry run only: no provider request was made; credential validity is unverified.")
            return 0
        # Phase 7 supersedes the earlier paid smoke-test plan. Keep old commands
        # offline; a new explicitly approved zero-cost live procedure is required.
        raise AIServiceError("live_verification_locked_zero_budget", args.provider)
    except AIServiceError as exc:
        print(json.dumps({"provider": exc.provider, "error": exc.code}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
