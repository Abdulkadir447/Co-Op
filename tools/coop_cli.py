#!/usr/bin/env python3
"""Cross-platform Co-op CLI (Windows, macOS, Linux).

Commands:
  doctor                   Check Windows/local toolchain (Python, Node, JDK 17, Gradle, Android SDK)
  health                   Ping FastAPI /healthcheck
  license issue|verify     Offline HMAC licence minting & verification (uses LICENSE_SIGNING_KEY)
  license remote-issue     Mint a licence via POST /admin/generate-license (uses COOP_ADMIN_TOKEN)
  license remote-list      List licences via GET /admin/licenses (uses COOP_ADMIN_TOKEN)
  license remote-revoke    Revoke a licence via POST /admin/licenses/revoke (uses COOP_ADMIN_TOKEN)
  webhook paystack         Send an HMAC-SHA512 signed Paystack event to POST /webhooks/paystack
  webhook security-test    Send a test event to SECURITY_ALERT_WEBHOOK
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def _http_json(
    url: str,
    method: str = "GET",
    payload: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, str]:
    req = urllib.request.Request(url, data=payload, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


def cmd_doctor(_args: argparse.Namespace) -> int:
    print(f"Platform : {sys.platform} ({os.name})")
    print(f"Python   : {sys.version.split()[0]} ({sys.executable})")
    checks = [
        ("node", ["node", "--version"]),
        ("pnpm", ["pnpm", "--version"]),
        ("java", ["java", "-version"]),
        ("gradle", ["gradle", "--version"]),
        ("adb", ["adb", "version"]),
    ]
    for name, cmd in checks:
        exe = shutil.which(cmd[0])
        if not exe:
            print(f"{name:<8} : MISSING")
            continue
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            out = (proc.stdout or proc.stderr).splitlines()[0].strip()
            print(f"{name:<8} : {out} ({exe})")
        except Exception as exc:  # noqa: BLE001
            print(f"{name:<8} : FOUND ({exe}) [{exc}]")
    android_home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    print(f"ANDROID_HOME : {android_home or 'not set (Android Studio sets this automatically)'}")
    return 0


def cmd_health(args: argparse.Namespace) -> int:
    url = f"{args.api_url.rstrip('/')}/healthcheck"
    code, body = _http_json(url)
    print(f"GET {url} -> HTTP {code}\n{body}")
    return 0 if 200 <= code < 300 else 1


def cmd_license_issue(args: argparse.Namespace) -> int:
    try:
        from backend import licensing
    except ModuleNotFoundError as exc:
        print(
            f"error: missing backend dependency ({exc.name}). "
            "Run `pip install -r backend/requirements.txt` or use `license remote-issue`.",
            file=sys.stderr,
        )
        return 2

    if not os.environ.get("LICENSE_SIGNING_KEY", "").strip():
        print("error: LICENSE_SIGNING_KEY is not set in environment", file=sys.stderr)
        return 2
    issued = licensing.issue(args.business_id, args.plan, seats=args.seats, days=args.days)
    print(json.dumps(issued.to_dict(), indent=2))
    return 0


def cmd_license_verify(args: argparse.Namespace) -> int:
    try:
        from backend import licensing
    except ModuleNotFoundError as exc:
        print(
            f"error: missing backend dependency ({exc.name}). "
            "Run `pip install -r backend/requirements.txt`.",
            file=sys.stderr,
        )
        return 2

    if not os.environ.get("LICENSE_SIGNING_KEY", "").strip():
        print("error: LICENSE_SIGNING_KEY is not set in environment", file=sys.stderr)
        return 2
    claims = licensing.verify(args.key)
    print(json.dumps(claims.to_dict(), indent=2))
    return 0


def cmd_license_remote_issue(args: argparse.Namespace) -> int:
    token = os.environ.get("COOP_ADMIN_TOKEN", "").strip()
    if not token:
        print("error: COOP_ADMIN_TOKEN is not set in environment", file=sys.stderr)
        return 2
    url = f"{args.api_url.rstrip('/')}/admin/generate-license"
    body = json.dumps(
        {"business_id": args.business_id, "plan": args.plan, "days": args.days, "seats": args.seats}
    ).encode("utf-8")
    code, text = _http_json(
        url,
        method="POST",
        payload=body,
        headers={"Content-Type": "application/json", "X-Admin-Token": token},
    )
    print(f"POST {url} -> HTTP {code}\n{text}")
    return 0 if 200 <= code < 300 else 1


def cmd_license_remote_list(args: argparse.Namespace) -> int:
    token = os.environ.get("COOP_ADMIN_TOKEN", "").strip()
    if not token:
        print("error: COOP_ADMIN_TOKEN is not set in environment", file=sys.stderr)
        return 2
    qs = f"?business_id={args.business_id}" if args.business_id else ""
    url = f"{args.api_url.rstrip('/')}/admin/licenses{qs}"
    code, text = _http_json(url, headers={"X-Admin-Token": token})
    print(f"GET {url} -> HTTP {code}\n{text}")
    return 0 if 200 <= code < 300 else 1


def cmd_license_remote_revoke(args: argparse.Namespace) -> int:
    token = os.environ.get("COOP_ADMIN_TOKEN", "").strip()
    if not token:
        print("error: COOP_ADMIN_TOKEN is not set in environment", file=sys.stderr)
        return 2
    url = f"{args.api_url.rstrip('/')}/admin/licenses/revoke"
    payload = {"reason": args.reason}
    if args.target.upper().startswith("COOP-"):
        payload["license_key"] = args.target
    else:
        payload["fingerprint"] = args.target
    code, text = _http_json(
        url,
        method="POST",
        payload=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Admin-Token": token},
    )
    print(f"POST {url} -> HTTP {code}\n{text}")
    return 0 if 200 <= code < 300 else 1


def cmd_webhook_paystack(args: argparse.Namespace) -> int:
    secret = os.environ.get("PAYSTACK_SECRET_KEY", "").strip()
    if not secret:
        print("error: PAYSTACK_SECRET_KEY is not set in environment", file=sys.stderr)
        return 2
    if secret.startswith("sk_live") and not args.allow_live:
        print("refused: pass sk_test_ key (or --allow-live if intentional)", file=sys.stderr)
        return 2
    event_body = {
        "event": args.event,
        "data": {
            "reference": args.reference,
            "status": "success" if args.event == "charge.success" else "failed",
        },
    }
    raw = json.dumps(event_body).encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), raw, hashlib.sha512).hexdigest()
    url = f"{args.api_url.rstrip('/')}/webhooks/paystack"
    code, text = _http_json(
        url,
        method="POST",
        payload=raw,
        headers={"Content-Type": "application/json", "x-paystack-signature": sig},
    )
    print(f"POST {url} -> HTTP {code}\n{text}")
    return 0 if 200 <= code < 300 else 1


def cmd_webhook_security_test(args: argparse.Namespace) -> int:
    webhook_url = args.webhook_url or os.environ.get("SECURITY_ALERT_WEBHOOK", "").strip()
    if not webhook_url:
        print("error: SECURITY_ALERT_WEBHOOK or --webhook-url required", file=sys.stderr)
        return 2
    raw = json.dumps({"event": "cli_security_test", "source": "coop_cli"}).encode("utf-8")
    code, text = _http_json(
        webhook_url,
        method="POST",
        payload=raw,
        headers={"Content-Type": "application/json"},
    )
    print(f"POST {webhook_url} -> HTTP {code}\n{text}")
    return 0 if 200 <= code < 300 else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Co-op unified cross-platform CLI")
    p.add_argument(
        "--api-url",
        default=os.environ.get("COOP_API_URL", "http://127.0.0.1:8000"),
        help="Backend base URL (default: http://127.0.0.1:8000)",
    )
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", help="Check Windows/local toolchain").set_defaults(func=cmd_doctor)
    sub.add_parser("health", help="Check backend /healthcheck").set_defaults(func=cmd_health)

    lic = sub.add_parser("license", help="Licence mint/verify/revoke")
    lic_sub = lic.add_subparsers(dest="lic_cmd", required=True)

    li = lic_sub.add_parser("issue", help="Offline HMAC mint using LICENSE_SIGNING_KEY")
    li.add_argument("--business-id", type=int, required=True)
    li.add_argument("--plan", choices=["starter", "professional", "enterprise"], required=True)
    li.add_argument("--days", type=int, default=365)
    li.add_argument("--seats", type=int, default=1)
    li.set_defaults(func=cmd_license_issue)

    lv = lic_sub.add_parser("verify", help="Offline HMAC verify")
    lv.add_argument("key")
    lv.set_defaults(func=cmd_license_verify)

    lri = lic_sub.add_parser("remote-issue", help="Mint via POST /admin/generate-license")
    lri.add_argument("--business-id", type=int, required=True)
    lri.add_argument("--plan", choices=["starter", "professional", "enterprise"], required=True)
    lri.add_argument("--days", type=int, default=365)
    lri.add_argument("--seats", type=int, default=1)
    lri.set_defaults(func=cmd_license_remote_issue)

    lrl = lic_sub.add_parser("remote-list", help="List via GET /admin/licenses")
    lrl.add_argument("--business-id", type=int, default=None)
    lrl.set_defaults(func=cmd_license_remote_list)

    lrr = lic_sub.add_parser("remote-revoke", help="Revoke via POST /admin/licenses/revoke")
    lrr.add_argument("target", help="Fingerprint or COOP-... key")
    lrr.add_argument("--reason", default=None)
    lrr.set_defaults(func=cmd_license_remote_revoke)

    wh = sub.add_parser("webhook", help="Webhook test & delivery helpers")
    wh_sub = wh.add_subparsers(dest="wh_cmd", required=True)

    wp = wh_sub.add_parser("paystack", help="Send signed Paystack webhook to /webhooks/paystack")
    wp.add_argument("--reference", required=True)
    wp.add_argument("--event", default="charge.success")
    wp.add_argument("--allow-live", action="store_true")
    wp.set_defaults(func=cmd_webhook_paystack)

    ws = wh_sub.add_parser("security-test", help="Send test payload to SECURITY_ALERT_WEBHOOK")
    ws.add_argument("--webhook-url", default=None)
    ws.set_defaults(func=cmd_webhook_security_test)

    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
