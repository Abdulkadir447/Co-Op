"""
UI wiring audit — "does every button go somewhere, and does anything go to the
same place twice?"

    .venv/bin/python scripts/audit_ui_links.py            # report
    .venv/bin/python scripts/audit_ui_links.py --strict   # exit 1 on findings

Scans frontend/src for every interactive element and answers three questions:

  1. DEAD      — a button with no onClick, no href, no navigation and no
                 submit type: it renders and does nothing.
  2. DUPLICATE — two different buttons that navigate to the same destination
                 (excluding deliberate repeats: a card and its own "open"
                 button, pagination, table row actions).
  3. UNROUTED  — a navigate()/Link target that has no matching <Route>, i.e.
                 a button that leads to the 404 page.

This is a static scan of the source, not a browser click-through: it catches
the wiring mistakes that are actually common (a copy-pasted onClick, a route
renamed in one place, a placeholder button shipped with the panel) and it runs
in CI-time, but it cannot tell you whether a handler *works*.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys
from collections import defaultdict

SRC = pathlib.Path("frontend/src")
APP = SRC / "App.tsx"

# Buttons we ship: the design-system button, plain antd buttons, and icon buttons.
TAG_RE = re.compile(r"<(CoopButton|CoopIconButton|Button|Link)\b")
NAVIGATE_RE = re.compile(r"navigate\(\s*[`'\"]([^`'\"]+)[`'\"]")
ROUTE_RE = re.compile(r"<Route\s+path=\"([^\"]+)\"")
ONCLICK_RE = re.compile(r"onClick=\{(.*?)\}", re.DOTALL)


def opening_tag(text: str, start: int) -> tuple[str, int]:
    """Read a JSX opening tag properly.

    A regex cannot do this: `onClick={() => go()}` contains a `>` inside the
    arrow function, and stopping there reports the handler as missing (that
    false positive is what an earlier version of this script produced for
    every button with an inline handler).
    """
    i = text.index("<", start)
    depth = 0
    quote = ""
    j = i + 1
    while j < len(text):
        ch = text[j]
        if quote:
            if ch == quote:
                quote = ""
        elif ch in "'\"`":
            quote = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch == ">" and depth == 0:
            return text[i : j + 1], j + 1
        j += 1
    return text[i:], len(text)


# Wrappers that supply the action themselves: a button inside a Popconfirm is
# wired through onConfirm, so it is not dead just because it has no onClick.
ACTION_WRAPPERS = ("Popconfirm", "Dropdown", "Menu.Item", "Tooltip", "Popover", "Upload")


def wrapped_by(text: str, pos: int) -> str | None:
    """Nearest unclosed action wrapper around this position, if any."""
    for name in ACTION_WRAPPERS:
        opened = text.rfind("<" + name, 0, pos)
        if opened == -1:
            continue
        closed = max(text.rfind("</" + name, 0, pos), text.rfind("/>", opened, pos))
        if opened > closed:
            return name
    return None


def label_after(text: str, pos: int) -> str:
    """The visible text of a button, best effort."""
    tail = text[pos : pos + 220]
    m = re.search(r"^\s*([^<>{}\n]{1,40})", tail)
    return m.group(1).strip() if m else ""


def routes() -> set[str]:
    return set(ROUTE_RE.findall(APP.read_text()))


def known(path: str, route_set: set[str]) -> bool:
    """Is this path handled by some route? (static segments only)"""
    if not path.startswith("/"):
        return True  # relative or external — out of scope
    head = "/" + path.strip("/").split("/")[0]
    return any(r == path or r == head or r.startswith(head + "/") or r == "*" for r in route_set)


def scan() -> dict:
    route_set = routes()
    dead: list[str] = []
    nav_targets: dict[str, list[str]] = defaultdict(list)
    unrouted: list[str] = []

    for path in sorted(SRC.rglob("*.tsx")):
        rel = path.relative_to(SRC)
        if rel.as_posix() == "components/ui/CoopButton.tsx":
            continue  # the primitive itself: it forwards onClick from props
        text = path.read_text()

        for m in TAG_RE.finditer(text):
            tag = m.group(1)
            open_tag, after = opening_tag(text, m.start())
            line = text[: m.start()].count("\n") + 1
            has_click = "onClick" in open_tag
            has_href = "href=" in open_tag
            is_submit = 'htmlType="submit"' in open_tag
            # A disabled control is inert on purpose (e.g. "Current Plan").
            is_disabled = bool(re.search(r"\bdisabled\b", open_tag))
            label = label_after(text, after) or ("icon" if "icon=" in open_tag else "?")

            if tag == "Link":
                to = re.search(r"to=\{?[`'\"]([^`'\")}]+)[`'\"]", open_tag)
                if to:
                    nav_targets[to.group(1)].append(f"{rel}:{line} <Link>")
                continue

            if not (has_click or has_href or is_submit or is_disabled) and not wrapped_by(
                text, m.start()
            ):
                dead.append(f"{rel}:{line}  <{tag}> \"{label}\"")
            if has_click:
                handler = ONCLICK_RE.search(open_tag)
                blob = handler.group(1) if handler else open_tag
                for target in NAVIGATE_RE.findall(blob):
                    nav_targets[target].append(f"{rel}:{line} <{tag}> \"{label}\"")

    # A navigate()/Link to a path with no route is a 404 button.
    for target, sources in sorted(nav_targets.items()):
        if "{" in target or target.startswith("$"):
            continue  # dynamic — cannot resolve statically
        if not known(target, route_set):
            unrouted.append(f"{target}  <- {', '.join(sources)}")

    return {
        "routes": sorted(route_set),
        "dead": dead,
        "unrouted": unrouted,
        "duplicates": {t: s for t, s in nav_targets.items() if len(s) > 1},
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--strict", action="store_true", help="exit 1 if anything is found")
    args = ap.parse_args()

    r = scan()
    print(f"routes declared in App.tsx: {len(r['routes'])}")
    print(f"  {', '.join(r['routes'])}\n")

    print(f"DEAD buttons (no onClick / href / submit): {len(r['dead'])}")
    for d in r["dead"]:
        print(f"  {d}")

    print(f"\nUNROUTED targets (button leads to 404): {len(r['unrouted'])}")
    for u in r["unrouted"]:
        print(f"  {u}")

    print(f"\nDUPLICATE destinations (more than one control -> same place): {len(r['duplicates'])}")
    for target, sources in sorted(r["duplicates"].items()):
        print(f"  {target}  ({len(sources)})")
        for s in sources:
            print(f"      {s}")

    findings = len(r["dead"]) + len(r["unrouted"])
    print(f"\n{findings} wiring problem(s); {len(r['duplicates'])} shared destination(s) to review.")
    return 1 if args.strict and findings else 0


if __name__ == "__main__":
    sys.exit(main())
