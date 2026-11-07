"""OpenRouter free-only inference. No paid alternatives, plugins, or retries."""

import json
import re

from backend.integrations.common import AIServiceError, AISettings, PROCESS_BUDGET, ProviderResult, post_json, status_error, refusal_error
from backend.integrations.grounding import CareerContext, Explanation, POLICY, check_references, prompt


def is_free_model(model: str) -> bool:
    return model == "openrouter/free" or bool(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+:free", model))


class OpenRouterService:
    def __init__(self, settings: AISettings | None = None, *, budget=PROCESS_BUDGET, transport=None):
        self.settings = settings or AISettings.from_env()
        self.budget, self.transport = budget, transport

    def explain_career(self, context: CareerContext) -> ProviderResult:
        if not is_free_model(self.settings.openrouter_model):
            raise AIServiceError("paid_model_blocked", "openrouter")
        payload = {
            "model": self.settings.openrouter_model,
            "max_tokens": self.settings.max_output_tokens,
            "stream": False,
            "provider": {"max_price": {"prompt": 0, "completion": 0, "request": 0},
                         "allow_fallbacks": False, "require_parameters": True},
            "messages": [{"role": "system", "content": POLICY + " Return only JSON matching: " + json.dumps(Explanation.model_json_schema())},
                         {"role": "user", "content": prompt(context, "Explain the supplied career and interests.")}],
        }
        self.budget.reserve("openrouter", self.settings, payload)
        data = post_json("openrouter", "https://openrouter.ai/api/v1/chat/completions",
                         self.settings.openrouter_key.get_secret_value(), payload, self.settings, self.transport)
        try:
            if "error" in data:
                error = data["error"]
                if not isinstance(error, dict):
                    raise ValueError("Invalid error envelope")
                if refusal_error(error) or int(error.get("code", 500)) in {400, 403}:
                    raise AIServiceError("safety_refusal", "openrouter")
                raise status_error(int(error.get("code", 500)), "openrouter")
            choice = data["choices"][0]
            message = choice["message"]
            if message.get("refusal") or choice.get("finish_reason") in {"content_filter", "refusal"}:
                raise AIServiceError("safety_refusal", "openrouter")
            parsed = Explanation.model_validate_json(message["content"])
            check_references(parsed, context, "openrouter")
            usage = data.get("usage")
            if usage is not None and (not isinstance(usage, dict) or float(usage.get("cost") or 0) != 0):
                raise AIServiceError("unexpected_cost", "openrouter")
            return ProviderResult(provider="openrouter", model=data.get("model", self.settings.openrouter_model),
                                  output=parsed.model_dump(mode="json"), usage=usage)
        except (KeyError, IndexError, TypeError, ValueError):
            # Includes unstructured refusals: do not automatically rephrase/retry elsewhere.
            raise AIServiceError("invalid_response", "openrouter") from None
