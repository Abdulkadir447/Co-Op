"""Email delivery for the daily business summary (TRD Ch17 §17.6-adjacent).

The summary itself is built on demand by ``daily_summary.build_daily_summary``
(v1 ships no scheduler/worker). This module adds the outbound channel: a
plain SMTP send behind the ``notifications.smtp`` config block, with the
standard 12-factor env overrides (SMTP_HOST, SMTP_PORT, SMTP_USERNAME,
SMTP_PASSWORD, SMTP_FROM, SMTP_TLS). Secrets come from the environment,
never from ``config/*.json`` (IPD Ch1.11).

Deliberately small: stdlib smtplib, no provider SDK, text + minimal HTML
parts. When SMTP is not configured the caller returns 503 with an honest
message — the in-app summary remains the always-available channel.
"""

from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage

import httpx

from ..config import load_config
from .schemas import DailySummary


class EmailNotConfiguredError(RuntimeError):
    pass


def smtp_settings() -> dict:
    """Merged SMTP settings: config file + env overrides (env wins)."""
    cfg = load_config().get("notifications", {}).get("smtp", {})
    env_keys = {
        "host": "SMTP_HOST",
        "port": "SMTP_PORT",
        "username": "SMTP_USERNAME",
        "password": "SMTP_PASSWORD",
        "from": "SMTP_FROM",
        "tls": "SMTP_TLS",
    }
    out: dict = {}
    for key, env_var in env_keys.items():
        value = os.getenv(env_var)
        if value is None:
            value = cfg.get(key)
        if key == "port" and value not in (None, ""):
            value = int(value)
        if key == "tls" and isinstance(value, str):
            value = value.lower() in ("1", "true", "yes", "on")
        out[key] = value
    if not out.get("host"):
        raise EmailNotConfiguredError("SMTP is not configured")
    return out


def render_summary_text(summary: DailySummary, recipient_note: bool = True) -> str:
    """Plain-text rendering of the verified daily summary."""
    lines = [f"Co-op — daily summary for {summary.business.name}", f"Date: {summary.date}", ""]
    if summary.has_data:
        lines.append(f"Today: {summary.business.currency} {summary.today.revenue:.2f} "
                     f"across {summary.today.orders} order(s)")
        vs = summary.comparison.vs_yesterday
        if vs.change_percent is not None:
            arrow = "up" if vs.change_percent >= 0 else "down"
            lines.append(
                f"vs yesterday: {arrow} {abs(vs.change_percent):.1f}% "
                f"({summary.business.currency} {vs.revenue:.2f}, {vs.orders} orders)"
            )
        mtd = summary.comparison.month_to_date
        lines.append(
            f"Month to date: {summary.business.currency} {mtd.revenue:.2f}, {mtd.orders} orders"
        )
        if mtd.change_percent is not None:
            arrow = "up" if mtd.change_percent >= 0 else "down"
            lines.append(f"vs last month's window: {arrow} {abs(mtd.change_percent):.1f}%")
        inv = summary.inventory
        lines.append(f"Inventory: {inv.low_count} low, {inv.out_count} out of stock")
        for item in inv.out_items:
            lines.append(f"  OUT: {item.name} ({item.sku})")
        for item in inv.low_items[:5]:
            lines.append(f"  low: {item.name} ({item.sku}) — stock {item.stock} "
                         f"(reorder at {item.reorder_level})")
        if summary.customers.new_today:
            lines.append(f"New customers today: {len(summary.customers.new_names)}")
            for name in summary.customers.new_names[:5]:
                lines.append(f"  - {name}")
        for insight in summary.insights:
            lines.append(f"[{insight.severity}] {insight.title} — {insight.evidence}")
    else:
        lines.append(summary.empty_message or "Nothing to report yet.")
    if recipient_note:
        lines.append("")
        lines.append("Sent by Co-op. Open the app for the full dashboard.")
    return "\n".join(lines)


def app_base_url() -> str:
    """Base URL of the web app, used in email links."""
    return os.getenv("APP_BASE_URL") or "http://localhost:3000"


def resend_settings() -> dict:
    """Resend config (env wins over config file). Raises if no API key."""
    cfg = load_config().get("notifications", {}).get("resend", {})
    api_key = os.getenv("RESEND_API_KEY") or cfg.get("api_key")
    if not api_key:
        raise EmailNotConfiguredError("Resend is not configured")
    from_addr = (
        os.getenv("RESEND_FROM")
        or os.getenv("EMAIL_FROM")
        or cfg.get("from")
        or "CO OP <onboarding@resend.dev>"
    )
    return {"api_key": api_key, "from": from_addr}


def _email_provider() -> str:
    """'resend' | 'smtp' | 'none' — Resend wins when an API key is present."""
    cfg = load_config().get("notifications", {}).get("resend", {})
    if os.getenv("RESEND_API_KEY") or cfg.get("api_key"):
        return "resend"
    try:
        smtp_settings()
        return "smtp"
    except EmailNotConfiguredError:
        return "none"


def _send_smtp(to_email: str, subject: str, text: str, from_addr: str, settings: dict) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(text)
    host: str = settings["host"]
    port: int = settings.get("port") or 587
    use_tls: bool = bool(settings.get("tls", True))
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        if use_tls:
            smtp.starttls()
        username = settings.get("username")
        password = settings.get("password")
        if username and password:
            smtp.login(username, password)
        smtp.send_message(msg)


def send_email(
    to_email: str,
    subject: str,
    text: str,
    html: str | None = None,
    from_addr: str | None = None,
) -> None:
    """Send one email via the configured provider (Resend preferred, else SMTP).

    Raises EmailNotConfiguredError when neither provider is configured.
    """
    provider = _email_provider()
    if provider == "resend":
        rs = resend_settings()
        payload: dict = {
            "from": from_addr or rs["from"],
            "to": [to_email],
            "subject": subject,
            "text": text,
        }
        if html:
            payload["html"] = html
        resp = httpx.post(
            "https://api.resend.com/emails",
            json=payload,
            headers={"Authorization": f"Bearer {rs['api_key']}"},
            timeout=15,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Resend error {resp.status_code}: {resp.text[:200]}")
        return
    if provider == "smtp":
        settings = smtp_settings()
        _send_smtp(
            to_email, subject, text,
            from_addr or settings.get("from") or "CO OP <no-reply@coop.app>",
            settings,
        )
        return
    raise EmailNotConfiguredError("Email delivery is not configured")


def send_daily_summary_email(
    summary: DailySummary,
    to_email: str,
    settings: dict | None = None,
) -> None:
    """Send the rendered daily summary to one recipient."""
    subject = f"CO OP daily summary — {summary.business.name} ({summary.date})"
    text = render_summary_text(summary)
    if settings is not None:
        # Explicit SMTP settings (direct callers / tests).
        from_addr = settings.get("from") or "CO OP <no-reply@coop.app>"
        _send_smtp(to_email, subject, text, from_addr, settings)
    else:
        send_email(to_email, subject, text)


def send_invite_email(
    invitee_email: str,
    business_name: str,
    role: str,
    app_url: str | None = None,
) -> None:
    """Email a team invitation. The invitee accepts by signing in to the app."""
    url = app_url or app_base_url()
    text = (
        f"You've been invited to join {business_name} on CO OP as {role}.\n\n"
        f"Open CO OP and sign in with this email address to accept:\n{url}\n\n"
        "If you weren't expecting this, you can ignore it."
    )
    send_email(invitee_email, f"You're invited to {business_name} on CO OP", text)


def feedback_inbox() -> str | None:
    """Where product feedback is emailed. Env wins over config; None if unset.

    The owner wires this to a real inbox later (``FEEDBACK_INBOX`` env or
    ``notifications.feedback.to``). Until then feedback is still stored, just
    not emailed.
    """
    cfg = load_config().get("notifications", {}).get("feedback", {})
    return os.getenv("FEEDBACK_INBOX") or cfg.get("to") or None


def send_feedback_email(
    business_name: str,
    *,
    rating: int | None = None,
    overall: str | None = None,
    likes: str | None = None,
    issues: str | None = None,
    improvements: str | None = None,
    submitted_by: str | None = None,
) -> None:
    """Email one feedback response to the product inbox (best-effort).

    Silently no-ops when no inbox is configured yet, so wiring this in before
    the destination exists is safe.
    """
    inbox = feedback_inbox()
    if not inbox:
        return

    body: list[str] = [f"New in-app feedback from {business_name}.", ""]
    if rating:
        body += [f"Rating: {rating}/5", ""]
    for heading, value in (
        ("Overall thoughts", overall),
        ("What they like", likes),
        ("Issues / problems", issues),
        ("What they'd love added", improvements),
    ):
        if value and value.strip():
            body += [f"{heading}:", value.strip(), ""]
    body += ["—", f"Business: {business_name}", f"Submitted by: {submitted_by or 'owner'}"]

    send_email(inbox, f"[CO OP feedback] {business_name}", "\n".join(body).rstrip())
