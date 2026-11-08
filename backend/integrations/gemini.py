"""Direct Gemini structured generation using the official google-genai SDK."""

import httpx
from google import genai
from google.genai import errors, types
from pydantic import ValidationError

from backend.integrations.common import AIServiceError, AISettings, PROCESS_BUDGET, ProviderResult, status_error
from backend.integrations.grounding import CareerContext, Explanation, RoadmapSuggestions, POLICY, check_references, prompt


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
            response_schema=schema, max_output_tokens=self.settings.max_output_tokens,
            candidate_count=1,
        )
        self.budget.reserve("gemini", self.settings, {
            "contents": contents, "system_instruction": POLICY,
            "response_schema": schema.model_json_schema(),
        })
        try:
            with self.client_factory(
                api_key=self.settings.gemini_key.get_secret_value(), vertexai=False,
                http_options=types.HttpOptions(
                    timeout=int(self.settings.timeout_seconds * 1000),
                    retry_options=types.HttpRetryOptions(attempts=1),
                    client_args={"trust_env": False},
                ),
            ) as client:
                response = client.models.generate_content(model=self.settings.gemini_model, contents=contents, config=config)
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                raise AIServiceError("safety_refusal", "gemini")
            for candidate in response.candidates or []:
                reason = str(candidate.finish_reason or "").split(".")[-1]
                if reason in {"SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "RECITATION", "IMAGE_SAFETY"}:
                    raise AIServiceError("safety_refusal", "gemini")
            if not response.text:
                raise AIServiceError("empty_response", "gemini")
            output = schema.model_validate_json(response.text)
            check_references(output, context, "gemini")
            usage = response.usage_metadata.model_dump(mode="json", exclude_none=True) if response.usage_metadata else None
            return ProviderResult(provider="gemini", model=self.settings.gemini_model,
                                  output=output.model_dump(mode="json"), usage=usage)
        except errors.APIError as exc:
            if exc.code == 400:
                raise AIServiceError("safety_refusal", "gemini") from None
            raise status_error(exc.code, "gemini") from None
        except (httpx.TimeoutException, TimeoutError):
            raise AIServiceError("timeout", "gemini") from None
        except httpx.RequestError:
            raise AIServiceError("network_error", "gemini") from None
        except (ValidationError, ValueError):
            raise AIServiceError("invalid_response", "gemini") from None
