"""Direct Gemini structured generation using the official google-genai SDK."""

import httpx
import re
from google import genai
from google.genai import errors, types
from pydantic import ValidationError

from backend.integrations.common import AIServiceError, AISettings, PROCESS_BUDGET, ProviderResult, status_error
from backend.integrations.grounding import CareerContext, Explanation, RoadmapSuggestions, POLICY, check_references, prompt


def safe_enum(value, allowed):
    if value is None:
        return None
    name = getattr(value, "value", value)
    return name if isinstance(name, str) and name in allowed else "UNKNOWN"


DIAGNOSTIC_FIELDS = frozenset({
    "contents", "parts", "text", "role", "model", "systemInstruction", "system_instruction",
    "generationConfig", "generation_config", "responseSchema", "response_schema",
    "responseJsonSchema", "response_json_schema", "responseMimeType", "response_mime_type",
    "candidateCount", "candidate_count", "maxOutputTokens", "max_output_tokens",
    "type", "properties", "required", "items", "title", "description", "additionalProperties",
    "additional_properties", "minLength", "min_length", "maxItems", "max_items",
    "propertyOrdering", "property_ordering", "explanation", "source_urls", "resource_ids",
    "steps", "instruction", "thinkingConfig", "thinking_config", "thinkingLevel", "thinking_level",
})


def safe_field_path(value):
    if not isinstance(value, str) or len(value) > 250:
        return "UNKNOWN_FIELD"
    segments = value.split(".")
    if not all(re.fullmatch(r"[A-Za-z_]+(?:\[[0-9]{1,3}\])?", segment)
               and segment.split("[")[0] in DIAGNOSTIC_FIELDS for segment in segments):
        return "UNKNOWN_FIELD"
    return value


def invalid_fields(details):
    """Read field locations only; descriptions/messages never leave this function."""
    if not isinstance(details, dict):
        return []
    error = details.get("error", details)
    if not isinstance(error, dict):
        return []
    fields = set()
    entries = error.get("details", [])
    for entry in entries[:20] if isinstance(entries, list) else []:
        if not isinstance(entry, dict) or entry.get("@type") != "type.googleapis.com/google.rpc.BadRequest":
            continue
        violations = entry.get("fieldViolations", [])
        for violation in violations[:20] if isinstance(violations, list) else []:
            if isinstance(violation, dict) and violation.get("field"):
                fields.add(safe_field_path(violation["field"]))
    # Some Google 400s name unknown schema fields only in the message.
    message = error.get("message", "")
    if isinstance(message, str):
        for name in re.findall(r'Unknown name "([A-Za-z_]+)"', message[:10000]):
            fields.add(name if name in DIAGNOSTIC_FIELDS else "UNKNOWN_FIELD")
    return sorted(fields)[:20]


class GeminiDiagnosticError(AIServiceError):
    """Only numeric status and allowlisted enums; never SDK messages or bodies."""
    def __init__(self, code, category, *, http_status=None, api_status=None,
                 prompt_block_reason=None, candidate_finish_reasons=(), fields=()):
        super().__init__(code, "gemini")
        self.diagnostics = {
            "category": category,
            "http_status": http_status if type(http_status) is int and 100 <= http_status <= 599 else None,
            "api_status": safe_enum(api_status, {"INVALID_ARGUMENT", "FAILED_PRECONDITION", "PERMISSION_DENIED",
                "UNAUTHENTICATED", "NOT_FOUND", "RESOURCE_EXHAUSTED", "INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED"}),
            "prompt_block_reason": safe_enum(prompt_block_reason, {r.value for r in types.BlockedReason}),
            "candidate_finish_reasons": [safe_enum(r, {v.value for v in types.FinishReason}) for r in candidate_finish_reasons[:4]],
            "invalid_fields": [safe_field_path(field) for field in fields[:20]],
        }


class GeminiService:
    def __init__(self, settings: AISettings | None = None, *, budget=PROCESS_BUDGET,
                 client_factory=genai.Client):
        self.settings = settings or AISettings.from_env()
        self.budget, self.client_factory = budget, client_factory

    def explain_career(self, context: CareerContext) -> ProviderResult:
        return self._generate(context, "Explain how the stated interests relate to this career.", Explanation)

    def suggest_roadmap(self, context: CareerContext) -> ProviderResult:
        return self._generate(context, "Suggest up to eight personalized learning steps using supplied resources.", RoadmapSuggestions)

    def answer_question(self, context: CareerContext) -> ProviderResult:
        return self._generate(context, "Answer the student's question about the selected target occupation using only verified supplied evidence. State missing evidence explicitly. A degree is not automatically required.", Explanation)

    def plan_job_roadmap(self, context: CareerContext) -> ProviderResult:
        return self._generate(context, "Work backward from the target occupation's verified requirements to suggest up to eight ordered learning steps from the student's starting point. Use supplied resources as alternatives, not mandatory degrees. Do not invent requirements; identify evidence gaps. No XP or completion claims.", RoadmapSuggestions)

    def _generate(self, context, task, schema):
        contents = prompt(context, task)
        config = types.GenerateContentConfig(
            system_instruction=POLICY, response_mime_type="application/json",
            response_json_schema=schema.model_json_schema(), max_output_tokens=self.settings.max_output_tokens,
            candidate_count=1,
        )
        self.budget.reserve("gemini", self.settings, {
            "contents": contents, "system_instruction": POLICY,
            "response_json_schema": schema.model_json_schema(),
        })
        feedback = {}
        try:
            with self.client_factory(
                api_key=self.settings.gemini_key.get_secret_value(), vertexai=False,
                http_options=types.HttpOptions(
                    api_version="v1beta",
                    timeout=int(self.settings.timeout_seconds * 1000),
                    retry_options=types.HttpRetryOptions(attempts=1),
                    client_args={"trust_env": False},
                ),
            ) as client:
                response = client.models.generate_content(model=self.settings.gemini_model, contents=contents, config=config)
            feedback = {
                "prompt_block_reason": response.prompt_feedback.block_reason if response.prompt_feedback else None,
                "candidate_finish_reasons": [c.finish_reason for c in response.candidates or []],
            }
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                raise GeminiDiagnosticError("safety_refusal", "prompt_block", **feedback)
            for candidate in response.candidates or []:
                reason = str(candidate.finish_reason or "").split(".")[-1]
                if reason in {"SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "RECITATION", "IMAGE_SAFETY"}:
                    raise GeminiDiagnosticError("safety_refusal", "candidate_block", **feedback)
            if not response.text:
                raise GeminiDiagnosticError("empty_response", "empty_output", **feedback)
            output = schema.model_validate_json(response.text)
            check_references(output, context, "gemini")
            usage = response.usage_metadata.model_dump(mode="json", exclude_none=True) if response.usage_metadata else None
            return ProviderResult(provider="gemini", model=self.settings.gemini_model,
                                  output=output.model_dump(mode="json"), usage=usage)
        except errors.APIError as exc:
            if exc.code == 400:
                code = "failed_precondition" if exc.status == "FAILED_PRECONDITION" else "invalid_request"
            else:
                code = status_error(exc.code, "gemini").code
            raise GeminiDiagnosticError(code, "api_error", http_status=exc.code, api_status=exc.status,
                                        fields=invalid_fields(exc.details)) from None
        except AIServiceError as exc:
            if isinstance(exc, GeminiDiagnosticError):
                raise
            raise GeminiDiagnosticError(exc.code, "reference_validation", **feedback) from None
        except (httpx.TimeoutException, TimeoutError):
            raise GeminiDiagnosticError("timeout", "transport_timeout") from None
        except httpx.RequestError:
            raise GeminiDiagnosticError("network_error", "transport_error") from None
        except (ValidationError, ValueError):
            raise GeminiDiagnosticError("invalid_response", "response_validation", **feedback) from None
