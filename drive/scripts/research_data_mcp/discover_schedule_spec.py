"""Structured schedule specs for Discover refresh subscriptions.

Cadence (manual|daily|weekly|monthly) remains a coarse classification.
Execution must never run from natural-language alone — use schedule_spec.
Until a per-source runner exists, specs are stored but execution_mode stays
non_executing and next_run_at stays null.
"""

from __future__ import annotations

import re
from typing import Any

DEFAULT_TIMEZONE = "Asia/Taipei"

_MON = re.compile(r"\bmon(?:day)?\b", re.I)
_TUE = re.compile(r"\btue(?:sday)?\b", re.I)
_WED = re.compile(r"\bwed(?:nesday)?\b", re.I)
_THU = re.compile(r"\bthu(?:rsday)?\b", re.I)
_FRI = re.compile(r"\bfri(?:day)?\b", re.I)
_SAT = re.compile(r"\bsat(?:urday)?\b", re.I)
_SUN = re.compile(r"\bsun(?:day)?\b", re.I)
_TIME = re.compile(r"\b([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm)?\b", re.I)


def _dow_from_text(text: str) -> int | None:
    """Cron DOW: 0=Sunday … 6=Saturday (also accept 7=Sunday in cron)."""
    if _MON.search(text):
        return 1
    if _TUE.search(text):
        return 2
    if _WED.search(text):
        return 3
    if _THU.search(text):
        return 4
    if _FRI.search(text):
        return 5
    if _SAT.search(text):
        return 6
    if _SUN.search(text):
        return 0
    return None


def _hour_minute(text: str) -> tuple[int, int]:
    match = _TIME.search(text)
    if not match:
        return 10, 0  # faculty default when "Monday" without time
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    ampm = (match.group(3) or "").lower()
    if ampm == "pm" and hour < 12:
        hour += 12
    if ampm == "am" and hour == 12:
        hour = 0
    return hour, minute


def infer_cadence(text: str, fallback: str = "weekly") -> str:
    lowered = (text or "").lower()
    if re.search(r"\bevery\s+day\b|\bdaily\b", lowered):
        return "daily"
    if re.search(r"\bmonthly\b|\bevery\s+month\b", lowered):
        return "monthly"
    if re.search(r"\bmanual\b", lowered):
        return "manual"
    if _dow_from_text(lowered) is not None or re.search(r"\bweekly\b|\bevery\s+week\b", lowered):
        return "weekly"
    return fallback if fallback in {"manual", "daily", "weekly", "monthly"} else "weekly"


def build_schedule_spec(
    *,
    requested_schedule: str = "",
    cadence: str = "weekly",
    timezone: str = DEFAULT_TIMEZONE,
    explicit: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a structured, non-executing schedule_spec dict."""
    if isinstance(explicit, dict) and explicit.get("cron"):
        return {
            "schedule_type": str(explicit.get("schedule_type") or "cron"),
            "timezone": str(explicit.get("timezone") or timezone or DEFAULT_TIMEZONE)[:64],
            "cron": str(explicit.get("cron"))[:64],
            "requested_schedule": str(explicit.get("requested_schedule") or requested_schedule or "")[:240],
            "inferred": False,
            "executable": False,
            "note": "Stored for a future runner; auto-execution is not claimed.",
        }

    text = str(requested_schedule or "").strip()
    cad = str(cadence or infer_cadence(text) or "weekly").lower()
    hour, minute = _hour_minute(text) if text else (10, 0)
    dow = _dow_from_text(text)

    if cad == "daily":
        cron = f"{minute} {hour} * * *"
    elif cad == "monthly":
        cron = f"{minute} {hour} 1 * *"
    elif cad == "manual":
        cron = ""
    else:
        # weekly — default Monday if day unspecified
        cron = f"{minute} {hour} * * {1 if dow is None else dow}"

    return {
        "schedule_type": "cron" if cron else "manual",
        "timezone": str(timezone or DEFAULT_TIMEZONE)[:64],
        "cron": cron,
        "requested_schedule": text[:240],
        "inferred": True,
        "executable": False,
        "note": "Structured for a future runner; auto-execution is not claimed.",
    }
