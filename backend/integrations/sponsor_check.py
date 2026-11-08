"""Local sponsor demonstration. Dry-run by default; never called by web routes."""
import argparse
import json
from pathlib import Path

from pydantic import SecretStr

from backend.integrations.common import AISettings, AIServiceError, RequestBudget
from backend.integrations.live_check import prepare as prepare_evidence
from backend.integrations.openrouter import OpenRouterService, is_free_model
from backend.integrations.prune import PruneService
from backend.integrations.swarms import SwarmsService
from backend.integrations.verify import ROOT, load_local_env
from backend.services.data import DataError

SERVICES = {"swarms": SwarmsService, "prune": PruneService, "openrouter": OpenRouterService}


def prepare(provider, settings):
    if provider not in SERVICES:
        raise AIServiceError("unsupported_verification_provider", "configuration")
    if settings.public_demo:
        raise AIServiceError("public_demo_blocked", provider)
    model = getattr(settings, provider + "_model")
    if not model.strip():
        raise AIServiceError("missing_model", provider)
    # Pin a catalog-listed free variant for this approval, not a dynamic router.
    if provider == "openrouter" and (not is_free_model(model) or not model.endswith(":free")):
        raise AIServiceError("explicit_free_variant_required", provider)
    context, _ = prepare_evidence("openrouter", settings)
    updates = {name + "_key": SecretStr("") for name in ("gemini", "openrouter", "swarms", "prune") if name != provider}
    updates.update(enabled=True, max_requests=1, max_input_chars=16000,
                   max_output_tokens=512, timeout_seconds=60,
                   swarms_enabled=provider == "swarms", prune_enabled=provider == "prune")
    return context, settings.model_copy(update=updates)


def execute(provider, settings, *, approved=False, costs_confirmed=False, transport=None):
    if not approved:
        raise AIServiceError("approval_required", provider)
    if not costs_confirmed:
        raise AIServiceError("zero_out_of_pocket_not_confirmed", provider)
    context, limited = prepare(provider, settings)
    service = SERVICES[provider](limited, budget=RequestBudget(), transport=transport)
    # Exactly one outbound HTTP attempt; no provider chain, retry, or polling.
    if provider == "swarms":
        return service.coordinate(context)
    return service.explain_career(context)


def safe_report(result):
    """Print counts/receipt presence only, never arbitrary provider text or prompts."""
    usage, metadata = result.usage or {}, result.metadata or {}
    report = {"provider": result.provider, "validated": True,
              "receipt_present": bool(metadata.get("receipt_signature")),
              "receipt_signature_verified": False}
    for source, prefix in ((usage, "usage_"), (metadata, "metadata_")):
        for name in ("cost", "total_cost", "prompt_tokens", "completion_tokens", "total_tokens"):
            value = source.get(name)
            if type(value) in (int, float):
                report[prefix + name] = value
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("provider", choices=SERVICES)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--confirm-zero-out-of-pocket", action="store_true",
                        help="After approval: attest gateway AND upstream costs, credits and no recharge/payment exposure were checked")
    args = parser.parse_args(argv)
    try:
        load_local_env(args.env_file)
        settings = AISettings.from_env()
        if args.live:
            result = execute(args.provider, settings, approved=True,
                             costs_confirmed=args.confirm_zero_out_of_pocket)
            print(json.dumps(safe_report(result)))
        else:
            prepare(args.provider, settings)
            print(json.dumps({"dry_run": True, "provider": args.provider,
                "credential_present": bool(getattr(settings, args.provider + "_key").get_secret_value()),
                "http_attempts": 1, "agents": 3 if args.provider == "swarms" else 1,
                "output_tokens_per_agent": 512, "max_payload_chars": 16000,
                "retries": 0, "fallback": False, "billing_verified_by_code": False}))
        return 0
    except (AIServiceError, DataError) as exc:
        print(json.dumps({"error": exc.code}))
    except (ValueError, StopIteration):
        print(json.dumps({"error": "invalid_verification_data_or_response"}))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
