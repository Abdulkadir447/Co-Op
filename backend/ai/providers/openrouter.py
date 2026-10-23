"""LLM providers — the ONLY place a model API is called (Pass 1).

The application layer (ai/service.py) talks to a provider through one tiny
interface: ``complete(system, messages) -> ProviderResult``. Swapping models
(or providers) never touches context building, prompts, schemas, usage or
actions.

The provider is **OpenRouter** (https://openrouter.ai), which fronts OpenAI,
Anthropic, Google, Meta and others behind one OpenAI-compatible endpoint and
one key. That is why the swap from OpenAI was small: the request and response
shapes are the same, and only the base URL, the key and the model naming
differ. OpenRouter addresses models as ``vendor/model`` — the default
``openai/gpt-4o-mini`` is the same underlying model the app used before.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


class ProviderError(Exception):
    """Raised when the model call fails (network, auth, quota, HTTP error)."""


@dataclass
class ProviderResult:
    text: str
    input_tokens: int
    output_tokens: int
    model: str


class BaseProvider:
    name = "base"

    def __init__(self, model: str) -> None:
        self.model = model

    # pragma: no cover
    def complete(self, system: str, messages: list[dict[str, str]]) -> ProviderResult:
        raise NotImplementedError


class OpenRouterProvider(BaseProvider):
    """OpenRouter Chat Completions via httpx (no SDK dependency).

    Requests JSON-mode output so the structured answer contract is reliable —
    which means the chosen model must support structured outputs. Every model
    in the defaults does; an exotic one may not, and will fail loudly here
    rather than silently returning prose.

    The key comes from the environment (``OPENROUTER_API_KEY``) — never stored
    in config files or shipped to the frontend.
    """

    name = "openrouter"
    API_URL = "https://openrouter.ai/api/v1/chat/completions"

    def __init__(
        self,
        model: str,
        api_key: str,
        timeout_seconds: float = 45.0,
        referer: Optional[str] = None,
        title: str = "Co-op",
    ) -> None:
        super().__init__(model)
        if not api_key:
            raise ProviderError(
                "OpenRouter API key is not configured (OPENROUTER_API_KEY)."
            )
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.referer = referer
        self.title = title

    def complete(self, system: str, messages: list[dict[str, str]]) -> ProviderResult:
        import httpx

        payload: dict[str, Any] = {
            "model": self.model,
            "temperature": 0.2,
            "max_tokens": 900,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, *messages],
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            # Optional attribution headers OpenRouter asks for. They only feed
            # its public rankings; omitting them does not affect the response.
            "X-Title": self.title,
        }
        if self.referer:
            headers["HTTP-Referer"] = self.referer

        try:
            resp = httpx.post(
                self.API_URL, json=payload, headers=headers, timeout=self.timeout_seconds
            )
        except httpx.HTTPError as exc:
            raise ProviderError(f"Could not reach the model: {exc.__class__.__name__}") from exc

        if resp.status_code != 200:
            detail = ""
            try:
                detail = resp.json().get("error", {}).get("message", "")[:200]
            except Exception:  # noqa: BLE001
                detail = resp.text[:200]
            raise ProviderError(f"Model error (HTTP {resp.status_code}): {detail}")

        data = resp.json()
        try:
            text: str = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("Unexpected model response shape.") from exc

        return ProviderResult(
            text=text or "",
            input_tokens=int(usage.get("prompt_tokens", 0) or 0),
            output_tokens=int(usage.get("completion_tokens", 0) or 0),
            model=data.get("model", self.model),
        )


def build_provider(model: Optional[str], api_key: str) -> BaseProvider:
    """Factory. New providers plug in here; the app layer never changes."""
    if not api_key:
        raise ProviderError(
            "AI is not configured: set OPENROUTER_API_KEY on the backend."
        )

    import os

    return OpenRouterProvider(
        model=model or "openai/gpt-4o-mini",
        api_key=api_key,
        referer=os.getenv("APP_BASE_URL") or None,
    )
