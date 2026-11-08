"""One-provider diagnostic; dry-run unless explicitly approved via --live."""
import argparse
import json
from pathlib import Path
from pydantic import SecretStr
from backend.integrations.common import AISettings, AIServiceError, RequestBudget
from backend.integrations.verify import load_local_env, ROOT
from backend.integrations.gemini import GeminiService
from backend.integrations.openrouter import OpenRouterService
from backend.integrations.grounding import Explanation, check_references
from backend.agents.job_coordinator import evidence_context
from backend.job_models import QuestionRequest, QuestionResponse, TargetOccupation, GuidanceMetadata
from backend.services.data import DataRepository, DataError

QUESTION = "Name the supplied MDC educational option for this target job. Explain briefly that it is an option, not a guaranteed job or mandatory degree. Cite its source."


def prepare(provider, settings):
    if provider not in {"gemini", "openrouter"}:
        raise AIServiceError("unsupported_verification_provider", "configuration")
    career = next(c for c in DataRepository(ROOT / "data", ROOT / "data/demo").careers()
                  if c.career_id == "career_cybersecurity_analyst")
    request = QuestionRequest(career_id=career.career_id, question=QUESTION)
    context = evidence_context(career, request)
    # Fix this one approval scope to the single already-reviewed MDC demo source.
    context.career.mdc_resources = [r for r in context.career.mdc_resources if r.id == "resource_mdc_cybersecurity_as_demo"]
    context.career.external_resources = []
    context.career.sources = []
    context.career.requirements = []
    context.career.summary = "Occupation requirements are not verified for this diagnostic."
    if len(context.career.mdc_resources) != 1:
        raise AIServiceError("missing_demo_evidence", "configuration")
    limited = settings.model_copy(update={
        "enabled": True, "max_requests": 1, "max_input_chars": 4000 if provider == "gemini" else 6000,
        "max_output_tokens": 512, "timeout_seconds": 30,
        "gemini_model": "gemini-3.1-flash-lite", "openrouter_model": settings.openrouter_model,
        "swarms_key": SecretStr(""), "prune_key": SecretStr(""),
        ("openrouter_key" if provider == "gemini" else "gemini_key"): SecretStr(""),
    })
    return context, limited


def execute(provider, settings, *, approved=False, unbilled_project_confirmed=False):
    if not approved:
        raise AIServiceError("approval_required", provider)
    if provider == "gemini" and not settings.gemini_free_tier_confirmed:
        raise AIServiceError("free_tier_not_confirmed", provider)
    if provider == "gemini" and not unbilled_project_confirmed:
        raise AIServiceError("unbilled_project_not_confirmed", provider)
    context, limited = prepare(provider, settings)
    service = (GeminiService if provider == "gemini" else OpenRouterService)(limited, budget=RequestBudget())
    result = service.answer_question(context)  # Exactly one adapter call; no fallback.
    output = Explanation.model_validate(result.output)
    check_references(output, context, provider)
    return QuestionResponse(target_occupation=TargetOccupation(career_id=context.career.career_id, title=context.career.title),
        answer=output.explanation, source_urls=output.source_urls, resource_ids=output.resource_ids,
        metadata=GuidanceMetadata(status="ai_generated", provider=provider))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("provider", choices=["gemini", "openrouter"])
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--live", action="store_true", help="Only after explicit approval of this exact test and free eligibility")
    parser.add_argument("--confirm-unbilled-project", action="store_true",
                        help="Attest that this Gemini key's project is Free Tier with no linked billing account; not an automated billing check")
    args = parser.parse_args(argv)
    try:
        load_local_env(args.env_file)  # Existing allowlist excludes DATABASE_URL.
        settings = AISettings.from_env()
        if args.live:
            print(execute(args.provider, settings, approved=True,
                          unbilled_project_confirmed=args.confirm_unbilled_project).model_dump_json())
        else:
            context, limited = prepare(args.provider, settings)
            print(json.dumps({"dry_run": True, "provider": args.provider,
                "credential_present": bool(getattr(settings, args.provider + "_key").get_secret_value().strip()),
                "gemini_free_tier_confirmed": settings.gemini_free_tier_confirmed,
                "model": getattr(limited, args.provider + "_model"), "max_requests": 1,
                "max_input_chars": limited.max_input_chars, "max_output_tokens": 512, "timeout_seconds": 30,
                "billing_verified_by_code": False,
                "retries": 0, "fallback": False, "question": QUESTION,
                "source_urls": [str(r.source_url) for r in context.career.mdc_resources]}))
        return 0
    except (AIServiceError, DataError) as exc:
        report = {"error": exc.code}
        if getattr(exc, "diagnostics", None) is not None:
            report["diagnostics"] = exc.diagnostics
        print(json.dumps(report))
        return 1
    except (ValueError, StopIteration):
        print(json.dumps({"error": "invalid_verification_data_or_response"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
