"""Shared opt-in, process-local quotas, safe errors, and HTTP transport."""

import json
import os
from threading import Lock
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, SecretStr, ValidationError


class AIServiceError(Exception):
    """Safe for callers to handle; provider bodies and credentials are omitted."""

    def __init__(self, code: str, provider: str):
        self.code, self.provider = code, provider
        super().__init__(f"{provider}: {code}")


class AISettings(BaseModel):
    model_config = ConfigDict(frozen=True)
    enabled: bool = False
    public_demo: bool = False
    max_requests: int = Field(default=0, ge=0, le=100)
    max_input_chars: int = Field(default=12000, ge=100, le=100000)
    max_output_tokens: int = Field(default=1024, ge=64, le=4096)
    timeout_seconds: float = Field(default=30, ge=1, le=120)
    gemini_key: SecretStr = SecretStr("")
    swarms_key: SecretStr = SecretStr("")
    prune_key: SecretStr = SecretStr("")
    openrouter_key: SecretStr = SecretStr("")
    openrouter_model: str = "openrouter/free"
    gemini_free_tier_confirmed: bool = False
    gemini_model: str = ""
    swarms_model: str = ""
    prune_model: str = ""

    @classmethod
    def from_env(cls):
        names = {
            "enabled": "ORQUESTRA_AI_ENABLED", "max_requests": "AI_MAX_REQUESTS_PER_PROVIDER",
            "max_input_chars": "AI_MAX_INPUT_CHARS", "max_output_tokens": "AI_MAX_OUTPUT_TOKENS",
            "timeout_seconds": "AI_TIMEOUT_SECONDS", "gemini_key": "GEMINI_API_KEY",
            "swarms_key": "SWARMS_API_KEY", "prune_key": "PRUNE_API_KEY",
            "gemini_model": "GEMINI_MODEL", "swarms_model": "SWARMS_MODEL", "prune_model": "PRUNE_MODEL",
            "openrouter_key": "OPENROUTER_API_KEY", "openrouter_model": "OPENROUTER_MODEL",
            "gemini_free_tier_confirmed": "GEMINI_FREE_TIER_CONFIRMED",
        }
        try:
            settings = cls(**{field: os.environ[name] for field, name in names.items() if os.environ.get(name)})
            if os.environ.get('ORQUESTRA_PUBLIC_DEMO', '').lower() == 'true':
                allowed = (settings.enabled and settings.gemini_free_tier_confirmed
                           and os.environ.get('PUBLIC_AI_ENABLED', '').lower() == 'true'
                           and os.environ.get('GEMINI_UNBILLED_PROJECT_CONFIRMED', '').lower() == 'true'
                           and settings.gemini_model == 'gemini-3.1-flash-lite'
                           and 0 < settings.max_requests <= 5)
                settings = settings.model_copy(update={
                    'public_demo': True,
                    'enabled': allowed, 'max_requests': settings.max_requests if allowed else 0,
                    'max_input_chars': min(settings.max_input_chars, 6000),
                    'max_output_tokens': min(settings.max_output_tokens, 512),
                    'timeout_seconds': min(settings.timeout_seconds, 20),
                    'openrouter_key': SecretStr(''), 'swarms_key': SecretStr(''), 'prune_key': SecretStr(''),
                })
            return settings
        except ValidationError:
            raise AIServiceError("invalid_configuration", "configuration") from None


class RequestBudget:
    """Thread-safe attempt counter. Failures count; retries are never automatic."""

    def __init__(self):
        self._counts: dict[str, int] = {}
        self._lock = Lock()

    def reserve(self, provider: str, settings: AISettings, payload: dict):
        if not settings.enabled:
            raise AIServiceError("disabled", provider)
        if not getattr(settings, f"{provider}_key").get_secret_value().strip():
            raise AIServiceError("missing_key", provider)
        if not getattr(settings, f"{provider}_model").strip():
            raise AIServiceError("missing_model", provider)
        if len(json.dumps(payload, ensure_ascii=False)) > settings.max_input_chars:
            raise AIServiceError("input_limit", provider)
        with self._lock:
            if self._counts.get(provider, 0) >= settings.max_requests:
                raise AIServiceError("request_limit", provider)
            self._counts[provider] = self._counts.get(provider, 0) + 1


PROCESS_BUDGET = RequestBudget()


class ProviderResult(BaseModel):
    provider: str
    model: str
    output: Any
    usage: dict | None = None
    metadata: dict | None = None
    review_required: bool = True


def status_error(status: int, provider: str):
    code = {401: "authentication_failed", 403: "permission_denied", 402: "billing_limit",
            429: "rate_limited", 408: "timeout", 504: "timeout"}.get(status, "provider_error")
    return AIServiceError(code, provider)


def refusal_error(error) -> bool:
    """Conservative recognition of nested gateway moderation error metadata."""
    serialized = json.dumps(error).lower()
    return any(marker in serialized for marker in ("refusal", "content_filter", "moderation", "safety", "guardrail"))


def post_json(provider: str, url: str, key: str, payload: dict, settings: AISettings,
              transport: httpx.BaseTransport | None = None) -> dict:
    headers = {"x-api-key": key} if provider == "swarms" else {"Authorization": f"Bearer {key}"}
    try:
        # No redirects, retries, or environment proxies that might forward credentials.
        with httpx.Client(timeout=settings.timeout_seconds, follow_redirects=False,
                          trust_env=False, transport=transport) as client:
            response = client.post(url, headers=headers, json=payload)
        if not 200 <= response.status_code < 300:
            if provider == "openrouter":
                try:
                    blocked = refusal_error(response.json())
                except ValueError:
                    blocked = False
                if blocked or response.status_code in {400, 403}:
                    raise AIServiceError("safety_refusal", provider)
            raise status_error(response.status_code, provider)
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError("Expected object")
        return result
    except httpx.TimeoutException:
        raise AIServiceError("timeout", provider) from None
    except httpx.RequestError:
        raise AIServiceError("network_error", provider) from None
    except ValueError:
        raise AIServiceError("invalid_response", provider) from None
