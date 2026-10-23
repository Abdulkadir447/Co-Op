"""API/frontend contract tests (Task 11 / Phase B).

Scans every `api.<method>(...)` call in the frontend and asserts a matching
(method, path) route exists in the backend's OpenAPI schema. This is the guard
that makes a repeat of the C1 regression (frontend PUT vs backend POST on
`/products/{id}/adjust`) impossible.
"""
from __future__ import annotations

import pathlib
import re

from backend.main import app

_METHODS = ("get", "post", "put", "patch", "delete")


def _frontend_calls():
    src = pathlib.Path("frontend/src")
    for path in sorted(src.rglob("*.ts*")):
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r"api\.(get|post|put|patch|delete)", text):
            method = m.group(1).upper()
            i = m.end()
            # Skip an optional generic type argument: api.get<SomeType>(...)
            if i < len(text) and text[i] == "<":
                depth = 0
                while i < len(text):
                    if text[i] == "<":
                        depth += 1
                    elif text[i] == ">":
                        depth -= 1
                        if depth == 0:
                            i += 1
                            break
                    i += 1
            # Skip whitespace and the opening '('.
            while i < len(text) and text[i] in " \t(":
                i += 1
            if i >= len(text) or text[i] not in "'`\"":
                continue
            quote = text[i]
            i += 1
            buf = []
            while i < len(text) and text[i] != quote:
                buf.append(text[i])
                i += 1
            yield method, "".join(buf), str(path)


def _normalize(path: str) -> str:
    """Collapse path parameters so `${id}` and `{id}` both compare as `{param}`."""
    path = re.sub(r"\$\{[^}]*\}", "{param}", path)
    path = re.sub(r"\{[^}]*\}", "{param}", path)
    return path.rstrip("/") or "/"


def _backend_routes() -> dict[str, set[str]]:
    routes: dict[str, set[str]] = {}
    for path, ops in app.openapi()["paths"].items():
        for method in ops:
            if method in _METHODS:
                routes.setdefault(_normalize(path), set()).add(method.upper())
    return routes


def test_every_frontend_call_has_a_backend_route():
    backend = _backend_routes()
    failures = []
    for method, path, file in _frontend_calls():
        if method not in backend.get(_normalize(path), set()):
            failures.append(f"  {method} {path}  (from {file})")
    assert not failures, (
        "Frontend API calls with no matching backend route:\n" + "\n".join(failures)
    )


def test_adjust_stock_contract_is_post():
    """Regression guard for C1: the inventory adjust call must be POST."""
    backend = _backend_routes()
    assert "POST" in backend.get("/products/{param}/adjust", set())
    frontend_calls = list(_frontend_calls())
    adjust_calls = [
        (method, path)
        for method, path, _ in frontend_calls
        if _normalize(path) == "/products/{param}/adjust"
    ]
    assert adjust_calls, "Frontend no longer calls the adjust-stock endpoint"
    for method, path in adjust_calls:
        assert method == "POST", f"Adjust stock must be POST, found {method} {path}"


def test_order_transitions_single_source_of_truth():
    """Regression guard for M4: the frontend must not keep its own copy of the
    allowed order transitions — they come from the backend (OrderOut.allowed_transitions)."""
    src = pathlib.Path("frontend/src/pages/Orders/useOrders.ts")
    text = src.read_text(encoding="utf-8")
    assert "ALLOWED_TRANSITIONS" not in text, (
        "The frontend must not maintain its own transition map; the backend "
        "publishes `allowed_transitions` on each order."
    )
