"""Real Prune gateway requests; retain returned usage and receipt metadata."""

import json

from backend.integrations.common import AIServiceError, AISettings, PROCESS_BUDGET, ProviderResult, post_json
from backend.integrations.grounding import CareerContext, Explanation, POLICY, check_references, prompt


class PruneService:
    def __init__(self, settings: AISettings | None = None, *, budget=PROCESS_BUDGET, transport=None):
        self.settings = settings or AISettings.from_env()
        self.budget, self.transport = budget, transport

    def explain_career(self, context: CareerContext) -> ProviderResult:
        payload = {
            "model": self.settings.prune_model, "max_tokens": self.settings.max_output_tokens,
            "messages": [{"role": "system", "content": POLICY + " Return only JSON matching: " + json.dumps(Explanation.model_json_schema())},
                         {"role": "user", "content": prompt(context, "Explain this career using the supplied interests and evidence.")}],
        }
        self.budget.reserve("prune", self.settings, payload)
        data = post_json("prune", "https://api.withprune.com/v1/chat/completions",
                         self.settings.prune_key.get_secret_value(), payload, self.settings, self.transport)
        try:
            content = data["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ValueError("Empty content")
            output = check_references(Explanation.model_validate_json(content), context, "prune")
            return ProviderResult(provider="prune", model=data.get("model", self.settings.prune_model),
                                  output=output.model_dump(mode="json"), usage=data.get("usage"), metadata=data.get("prune_metadata"))
        except (KeyError, IndexError, TypeError, ValueError):
            raise AIServiceError("invalid_response", "prune") from None
