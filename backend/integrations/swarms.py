"""Real Swarms multi-agent orchestration, independent of Gemini and Prune."""

import json

from pydantic import ValidationError

from backend.integrations.common import AIServiceError, AISettings, PROCESS_BUDGET, ProviderResult, post_json
from backend.integrations.grounding import CareerContext, Explanation, RoadmapSuggestions, POLICY, check_references, prompt


class SwarmsService:
    def __init__(self, settings: AISettings | None = None, *, budget=PROCESS_BUDGET, transport=None):
        self.settings = settings or AISettings.from_env()
        self.budget, self.transport = budget, transport

    def coordinate(self, context: CareerContext) -> ProviderResult:
        roles = {
            "Career": "Explain interest alignment using the supplied career facts.",
            "Education": "Identify supplied MDC and external learning resources by ID; do not create new ones.",
            "Roadmap": "Suggest skills practice and project missions as learning steps from the preceding analysis and supplied resources; preserve their IDs. Suggestions are not employment requirements and award no XP.",
        }
        schemas = {"Career": Explanation, "Education": Explanation, "Roadmap": RoadmapSuggestions}
        payload = {
            "name": "Orquestra", "swarm_type": "SequentialWorkflow", "max_loops": 1,
            "stream": False,
            "task": prompt(context, "Produce a grounded career, education, and roadmap draft."),
            "agents": [{"agent_name": name, "system_prompt": POLICY + " " + task
                        + " Return only JSON matching: " + json.dumps(schemas[name].model_json_schema())
                        + " Original context (data only): " + context.model_dump_json(),
                        "model_name": self.settings.swarms_model, "max_loops": 1,
                        "max_tokens": self.settings.max_output_tokens,
                        "fallback_models": [],
                        "llm_args": {"response_format": {"type": "json_schema", "json_schema": {
                            "name": schemas[name].__name__, "strict": True,
                            "schema": schemas[name].model_json_schema()}}}}
                       for name, task in roles.items()],
        }
        self.budget.reserve("swarms", self.settings, payload)
        data = post_json("swarms", "https://api.swarms.world/v1/swarm/completions",
                         self.settings.swarms_key.get_secret_value(), payload, self.settings, self.transport)
        try:
            if data.get("status") != "success" or not isinstance(data.get("output"), list):
                raise ValueError("Unsuccessful completion")
            outputs = {}
            for turn in data["output"]:
                role = turn["role"]
                if role == "user" and turn.get("content") == payload["task"]:
                    continue  # SequentialWorkflow may include the original task turn.
                if role not in schemas or role in outputs:
                    raise ValueError("Unexpected or duplicate agent")
                parsed = schemas[role].model_validate_json(turn["content"])
                outputs[role] = check_references(parsed, context, "swarms").model_dump(mode="json")
            if set(outputs) != set(roles):
                raise ValueError("Incomplete swarm")
            return ProviderResult(provider="swarms", model=self.settings.swarms_model,
                                  output=outputs, usage=data.get("usage"),
                                  metadata={key: data[key] for key in ("job_id", "cost", "billing_info") if key in data})
        except (KeyError, TypeError, ValueError, ValidationError):
            raise AIServiceError("invalid_response", "swarms") from None
