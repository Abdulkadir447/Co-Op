"""OpenRouter provider — verified against a local mock of the Chat Completions
endpoint (the real openrouter.ai is not reachable from CI). Proves the request
shape (JSON mode, messages, namespaced model, attribution headers) and response
parsing (content + token usage) are correct, so the real call works when egress
is available.

OpenRouter is OpenAI-compatible, so this looks a lot like the OpenAI test it
replaced — that similarity is the point of the swap. What changed is the base
URL, the env var, the ``vendor/model`` naming, and two optional headers.
"""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from backend.ai.providers import build_provider
from backend.ai.providers.openrouter import OpenRouterProvider, ProviderError

MODEL = "openai/gpt-4o-mini"


class _MockOpenRouter(BaseHTTPRequestHandler):
    last_request = None  # type: ignore[attr-defined]

    def log_message(self, *a):  # silence
        pass

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        type(self).last_request = {  # type: ignore[attr-defined]
            "path": self.path,
            "auth": self.headers.get("Authorization"),
            "referer": self.headers.get("HTTP-Referer"),
            "title": self.headers.get("X-Title"),
            "body": body,
        }
        reply = {
            "model": body.get("model", "mock"),
            "choices": [
                {"message": {"role": "assistant",
                              "content": (
                                  '{"type": "answer", "kind": "fact", "title": "t", '
                                  '"message": "m", "basis": {"period": "last_30_days", '
                                  '"sources": ["orders"]}, "follow_ups": [], "links": [], '
                                  '"actions": []}'
                              )}},
            ],
            # OpenRouter returns OpenAI-shaped usage plus a `cost` we ignore.
            "usage": {"prompt_tokens": 123, "completion_tokens": 45, "cost": 0.00012},
        }
        data = json.dumps(reply).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def _start_mock() -> tuple[str, ThreadingHTTPServer]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _MockOpenRouter)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}/api/v1/chat/completions", server


def test_provider_sends_json_mode_request_and_parses_response():
    url, server = _start_mock()
    try:
        _MockOpenRouter.last_request = None
        provider = OpenRouterProvider(model=MODEL, api_key="sk-or-test")
        provider.API_URL = url  # point the real client at the local mock

        result = provider.complete(
            system="you are coop",
            messages=[{"role": "user", "content": "hi"}],
        )

        # Request shape: auth header, namespaced model, JSON mode, messages.
        req = _MockOpenRouter.last_request
        assert req["path"].endswith("/api/v1/chat/completions")
        assert req["auth"] == "Bearer sk-or-test"
        assert req["body"]["model"] == MODEL
        assert req["body"]["response_format"] == {"type": "json_object"}
        roles = [m["role"] for m in req["body"]["messages"]]
        assert roles == ["system", "user"]

        # Response parsing: content + token usage (the `cost` field is extra).
        assert result.model == MODEL
        assert result.input_tokens == 123
        assert result.output_tokens == 45
        parsed = json.loads(result.text)
        assert parsed["kind"] == "fact"
    finally:
        server.shutdown()


def test_attribution_headers_are_sent_when_configured():
    url, server = _start_mock()
    try:
        _MockOpenRouter.last_request = None
        provider = OpenRouterProvider(
            model=MODEL, api_key="k", referer="https://app.coop.example"
        )
        provider.API_URL = url
        provider.complete(system="s", messages=[])

        req = _MockOpenRouter.last_request
        assert req["referer"] == "https://app.coop.example"
        assert req["title"] == "Co-op"
    finally:
        server.shutdown()


def test_referer_is_omitted_when_not_configured():
    """An absent APP_BASE_URL must not send an empty header."""
    url, server = _start_mock()
    try:
        _MockOpenRouter.last_request = None
        provider = OpenRouterProvider(model=MODEL, api_key="k")
        provider.API_URL = url
        provider.complete(system="s", messages=[])
        assert _MockOpenRouter.last_request["referer"] is None
    finally:
        server.shutdown()


def test_provider_requires_a_key():
    try:
        OpenRouterProvider(model=MODEL, api_key="")
        assert False, "should have raised"
    except ProviderError:
        pass


def test_factory_defaults_to_the_namespaced_openai_model():
    p = build_provider(None, "sk-or-test")
    assert isinstance(p, OpenRouterProvider)
    assert p.model == MODEL


def test_factory_honours_an_explicit_model_and_app_base_url(monkeypatch):
    monkeypatch.setenv("APP_BASE_URL", "https://app.coop.example")
    p = build_provider("anthropic/claude-3.5-haiku", "sk-or-test")
    assert p.model == "anthropic/claude-3.5-haiku"
    assert p.referer == "https://app.coop.example"


def test_factory_refuses_without_a_key_and_names_the_variable():
    try:
        build_provider(MODEL, "")
        assert False, "should have raised"
    except ProviderError as exc:
        assert "OPENROUTER_API_KEY" in str(exc)
