"""Durable Discover source refresh subscriptions.

Linked to a Discover intent / source / connector. Cadence and pause/resume/stop
are persisted honestly. The YZU scheduler only runs fixed config schedules — it
cannot execute arbitrary per-source subscriptions — so records stay
explicitly non-executing (no auto-refresh claims).
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ALLOWED_CADENCES = frozenset({"manual", "daily", "weekly", "monthly"})
ACTIVE = "active"
PAUSED = "paused"
STOPPED = "stopped"
ALLOWED_STATUS = frozenset({ACTIVE, PAUSED, STOPPED})

# Honest: cluster scheduler has no per-source subscription runner.
EXECUTION_MODE = "non_executing"
EXECUTION_NOTE = (
    "Recorded for Discover History only. YZU scheduler runs fixed config schedules "
    "and cannot execute per-source refresh subscriptions; auto-refresh is not claimed."
)


def discover_refresh_store_path(repo_root: str | Path) -> Path:
    return Path(repo_root).resolve() / "data_lake/procurement_memory/discover_refresh_subscriptions.sqlite3"


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _clone(value: Any) -> Any:
    return json.loads(json.dumps(value or {}))


class DiscoverRefreshStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._db() as db:
            db.execute(
                """CREATE TABLE IF NOT EXISTS discover_refresh_subscriptions (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    intent_id TEXT,
                    source_id TEXT,
                    connector_id TEXT,
                    candidate_key TEXT,
                    cadence TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    destination TEXT,
                    status TEXT NOT NULL,
                    state_json TEXT NOT NULL
                )"""
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS idx_discover_refresh_updated ON discover_refresh_subscriptions(updated_at DESC)"
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS idx_discover_refresh_intent ON discover_refresh_subscriptions(intent_id)"
            )

    def _db(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=30)

    def create(
        self,
        *,
        cadence: str = "manual",
        destination: str = "",
        intent_id: str = "",
        source_id: str = "",
        connector_id: str = "",
        candidate_key: str = "",
        enabled: bool = True,
        requested_schedule: str = "",
        schedule_note: str = "",
    ) -> dict[str, Any]:
        cad = str(cadence or "manual").strip().lower()
        if cad not in ALLOWED_CADENCES:
            raise ValueError(f"cadence must be one of {sorted(ALLOWED_CADENCES)}")
        source_id = str(source_id or "").strip()
        connector_id = str(connector_id or "").strip()
        intent_id = str(intent_id or "").strip()
        candidate_key = str(candidate_key or "").strip()
        if not (source_id or connector_id or candidate_key or intent_id):
            raise ValueError("subscription requires intent_id, source_id, connector_id, or candidate_key")

        sid = uuid.uuid4().hex[:16]
        stamp = _now()
        state = {
            "execution_mode": EXECUTION_MODE,
            "execution_note": EXECUTION_NOTE,
            "last_run_at": None,
            "next_run_at": None,
            "last_job_id": None,
            "auto_refresh": False,
            "requested_schedule": str(requested_schedule or "").strip()[:240],
            "schedule_note": str(schedule_note or "").strip()[:400],
        }
        status = ACTIVE if enabled else PAUSED
        with self._db() as db:
            db.execute(
                "INSERT INTO discover_refresh_subscriptions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    sid,
                    stamp,
                    stamp,
                    intent_id[:64],
                    source_id[:160],
                    connector_id[:160],
                    candidate_key[:320],
                    cad,
                    1 if status == ACTIVE else 0,
                    str(destination or "").strip()[:400],
                    status,
                    json.dumps(state),
                ),
            )
        return self.get(sid)

    def get(self, subscription_id: str) -> dict[str, Any]:
        with self._db() as db:
            db.row_factory = sqlite3.Row
            row = db.execute(
                "SELECT * FROM discover_refresh_subscriptions WHERE id = ?", (subscription_id,)
            ).fetchone()
        if not row:
            raise KeyError(subscription_id)
        return self._row(dict(row))

    def list(self, *, limit: int = 50, intent_id: str = "", status: str = "") -> list[dict[str, Any]]:
        limit = max(1, min(int(limit or 50), 200))
        sql = "SELECT * FROM discover_refresh_subscriptions WHERE 1=1"
        args: list[Any] = []
        if intent_id:
            sql += " AND intent_id = ?"
            args.append(intent_id)
        if status:
            sql += " AND status = ?"
            args.append(status)
        sql += " ORDER BY updated_at DESC LIMIT ?"
        args.append(limit)
        with self._db() as db:
            db.row_factory = sqlite3.Row
            rows = db.execute(sql, args).fetchall()
        return [self._row(dict(r)) for r in rows]

    def _row(self, item: dict[str, Any]) -> dict[str, Any]:
        state = json.loads(item.pop("state_json") or "{}")
        status = str(item.get("status") or ACTIVE)
        enabled = bool(item.get("enabled")) and status == ACTIVE
        out = {
            "id": item["id"],
            "created_at": item["created_at"],
            "updated_at": item["updated_at"],
            "intent_id": item.get("intent_id") or "",
            "source_id": item.get("source_id") or "",
            "connector_id": item.get("connector_id") or "",
            "candidate_key": item.get("candidate_key") or "",
            "cadence": item.get("cadence") or "manual",
            "enabled": enabled,
            "destination": item.get("destination") or "",
            "status": status,
            "execution_mode": state.get("execution_mode") or EXECUTION_MODE,
            "execution_note": state.get("execution_note") or EXECUTION_NOTE,
            "auto_refresh": False,
            "requested_schedule": state.get("requested_schedule") or "",
            "schedule_note": state.get("schedule_note") or "",
            # Only surface run stamps when honestly known (never invent next_run).
            "last_run_at": state.get("last_run_at") or None,
            "next_run_at": state.get("next_run_at") or None,
            "last_job_id": state.get("last_job_id") or None,
        }
        return out

    def _save(self, subscription_id: str, **fields: Any) -> dict[str, Any]:
        current = self.get(subscription_id)
        state = {
            "execution_mode": current.get("execution_mode") or EXECUTION_MODE,
            "execution_note": current.get("execution_note") or EXECUTION_NOTE,
            "last_run_at": current.get("last_run_at"),
            "next_run_at": current.get("next_run_at"),
            "last_job_id": current.get("last_job_id"),
            "auto_refresh": False,
            "requested_schedule": current.get("requested_schedule") or "",
            "schedule_note": current.get("schedule_note") or "",
        }
        status = str(fields.get("status", current["status"]))
        if status not in ALLOWED_STATUS:
            raise ValueError(f"status must be one of {sorted(ALLOWED_STATUS)}")
        enabled = 1 if status == ACTIVE and fields.get("enabled", current["enabled"]) else 0
        if status == STOPPED:
            enabled = 0
        if status == PAUSED:
            enabled = 0
        cadence = str(fields.get("cadence", current["cadence"])).strip().lower()
        if cadence not in ALLOWED_CADENCES:
            raise ValueError(f"cadence must be one of {sorted(ALLOWED_CADENCES)}")
        with self._db() as db:
            db.execute(
                """UPDATE discover_refresh_subscriptions
                   SET updated_at=?, intent_id=?, source_id=?, connector_id=?, candidate_key=?,
                       cadence=?, enabled=?, destination=?, status=?, state_json=?
                   WHERE id=?""",
                (
                    _now(),
                    str(fields.get("intent_id", current["intent_id"]) or "")[:64],
                    str(fields.get("source_id", current["source_id"]) or "")[:160],
                    str(fields.get("connector_id", current["connector_id"]) or "")[:160],
                    str(fields.get("candidate_key", current["candidate_key"]) or "")[:320],
                    cadence,
                    enabled,
                    str(fields.get("destination", current["destination"]) or "")[:400],
                    status,
                    json.dumps(_clone(state)),
                    subscription_id,
                ),
            )
        return self.get(subscription_id)

    def pause(self, subscription_id: str) -> dict[str, Any]:
        current = self.get(subscription_id)
        if current["status"] == STOPPED:
            raise ValueError("cannot pause a stopped subscription")
        if current["status"] == PAUSED:
            return current
        return self._save(subscription_id, status=PAUSED, enabled=False)

    def resume(self, subscription_id: str) -> dict[str, Any]:
        current = self.get(subscription_id)
        if current["status"] == STOPPED:
            raise ValueError("cannot resume a stopped subscription; create a new one")
        if current["status"] == ACTIVE and current["enabled"]:
            return current
        return self._save(subscription_id, status=ACTIVE, enabled=True)

    def stop(self, subscription_id: str) -> dict[str, Any]:
        current = self.get(subscription_id)
        if current["status"] == STOPPED:
            return current
        return self._save(subscription_id, status=STOPPED, enabled=False)
