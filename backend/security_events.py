"""
Security-event log + optional alerting (checklist 150, 160–165).

Everything security-relevant that happens in the app — a rejected webhook
signature, a wrong admin token, a rate limit trip, a refused privilege change —
is written to the ``coop.security`` logger at WARNING so it shows up wherever
the server logs go. If ``SECURITY_ALERT_WEBHOOK`` is set, the same event is
POSTed there (fire-and-forget, on a background thread) so an external pager
(Slack, Discord, a monitoring service) can react.

Design notes:

* The logger is the reliable channel; the webhook is best-effort and its
  failure can never break the request that emitted the event.
* Payloads pass through :func:`backend.redact.deep_redact` so an event that
  carries, say, a bad ``Authorization`` header cannot leak the header.
* ``_deliver`` takes an injectable ``transport`` so the suite drives the
  webhook through ``httpx.MockTransport`` without egress.
"""
from __future__ import annotations

import json
import threading
from typing import Any

from .config import secret
from .redact import deep_redact

WEBHOOK_ENV = "SECURITY_ALERT_WEBHOOK"

_log = None


def _logger():
    global _log
    if _log is None:
        import logging

        _log = logging.getLogger("coop.security")
    return _log


def _deliver(url: str, payload: dict[str, Any], transport: Any = None) -> bool:
    """POST one alert. Never raises; returns True on a 2xx."""
    import httpx

    try:
        with httpx.Client(transport=transport, timeout=3.0) as client:
            resp = client.post(url, json=payload)
        return 200 <= resp.status_code < 300
    except httpx.HTTPError:
        return False


def security_event(kind: str, transport: Any = None, **details: Any) -> None:
    """Record one security-relevant event.

    Always logs at WARNING; additionally POSTs to ``SECURITY_ALERT_WEBHOOK``
    (background thread) when that is configured.
    """
    payload = deep_redact({"event": kind, **details})
    _logger().warning("security event: %s", json.dumps(payload, default=str))

    webhook = secret(WEBHOOK_ENV)
    if not webhook:
        return
    threading.Thread(
        target=_deliver, args=(webhook, payload, transport), daemon=True
    ).start()
