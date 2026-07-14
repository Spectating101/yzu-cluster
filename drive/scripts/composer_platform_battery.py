#!/usr/bin/env python3
"""Operate-the-platform battery: direct equipment + Composer + durable readback."""
from __future__ import annotations

import json
import os
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any

API = os.environ.get("RESEARCH_DRIVE_API", "http://127.0.0.1:8765")
SID = f"battery-{int(time.time())}"


@dataclass
class Case:
    name: str
    kind: str
    ok: bool = False
    elapsed: float = 0.0
    detail: str = ""
    error: str = ""
    evidence: dict[str, Any] = field(default_factory=dict)


results: list[Case] = []
LAST_SUB: str | None = None
LAST_INTENT: str | None = None


def http_json(method: str, path: str, body: dict | None = None, timeout: float = 60) -> Any:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        API + path,
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else {}


def chat(message: str, rail: dict | None = None, timeout: float = 180) -> dict[str, Any]:
    body = {"message": message, "session_id": SID, "rail_context": rail or {"tab": "browse", "mode": "ask"}}
    req = urllib.request.Request(
        API + "/library/chat/stream",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    complete = None
    acts: list[str] = []
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        for raw in resp:
            line = raw.decode().strip()
            if not line:
                continue
            ev = json.loads(line)
            if ev.get("type") in ("progress", "activity"):
                acts.append(f"{ev.get('phase')}:{(ev.get('text') or '')[:60]}")
            elif ev.get("type") == "complete":
                complete = ev.get("result") or {}
            elif ev.get("type") == "error":
                raise RuntimeError(ev.get("message") or ev.get("error") or "err")
    if not complete:
        raise RuntimeError("no complete")
    complete["_elapsed"] = round(time.time() - t0, 2)
    complete["_acts"] = acts
    return complete


def run(case: Case, fn) -> None:
    t0 = time.time()
    try:
        fn(case)
        case.elapsed = round(time.time() - t0, 2)
    except Exception as exc:  # noqa: BLE001
        case.ok = False
        case.elapsed = round(time.time() - t0, 2)
        case.error = str(exc)[:280]
    results.append(case)
    print(
        f"[{'PASS' if case.ok else 'FAIL'}] {case.kind:8} {case.name:42} {case.elapsed:6.1f}s  "
        f"{(case.detail or case.error)[:110]}"
    )


TWSE_RAIL = {
    "selected": {
        "title": "TWSE Open API",
        "source_id": "twse_official",
        "connector_id": "twse",
        "candidate_key": "source:twse_official",
    },
    "actions": ["schedule_refresh", "ask_about"],
}


def c_tools(c: Case) -> None:
    d = http_json("GET", "/library/extensions/tools")
    need = [
        "research_discover_create_refresh_subscription",
        "research_discover_pause_refresh_subscription",
        "research_discover_create_intent",
        "procurement_probe_public_source",
    ]
    miss = [n for n in need if n not in (d.get("tools") or [])]
    c.ok = not miss and int(d.get("count") or 0) >= 76
    c.detail = f"count={d.get('count')} miss={miss or 'none'}"


def c_schedule_spec_api(c: Case) -> None:
    global LAST_SUB
    out = http_json(
        "POST",
        "/library/discover/subscriptions",
        {
            "cadence": "weekly",
            "source_id": "twse_official",
            "connector_id": "twse",
            "requested_schedule": "every Monday at 10:00",
            "timezone": "Asia/Taipei",
            "enabled": True,
        },
    )
    spec = out.get("schedule_spec") or {}
    c.ok = (
        out.get("execution_mode") == "non_executing"
        and spec.get("cron") == "0 10 * * 1"
        and out.get("next_run_at") in (None, "")
    )
    c.detail = f"id={out.get('id')} cron={spec.get('cron')} exec={out.get('execution_mode')}"
    LAST_SUB = out.get("id")


def c_probe(c: Case) -> None:
    out = chat("Probe https://openapi.twse.com.tw", {"actions": ["probe"]})
    c.ok = out.get("action") == "probe_url"
    c.detail = f"action={out.get('action')} {out.get('_elapsed')}s"


def c_search(c: Case) -> None:
    out = chat("search vault for TWSE")
    c.ok = out.get("action") == "search"
    c.detail = f"action={out.get('action')} total={(out.get('artifacts') or {}).get('total')}"


def c_schedule(c: Case) -> None:
    global LAST_SUB
    n0 = http_json("GET", "/library/discover/subscriptions").get("total") or 0
    out = chat("Schedule refresh every Monday at 10:00 for this source.", TWSE_RAIL)
    arts = out.get("artifacts") or {}
    sub = arts.get("subscription") or {}
    spec = sub.get("schedule_spec") or {}
    n1 = http_json("GET", "/library/discover/subscriptions").get("total") or 0
    if not spec and arts.get("subscription_id"):
        one = http_json("GET", f"/library/discover/subscriptions/{arts.get('subscription_id')}")
        spec = one.get("schedule_spec") or {}
    c.ok = (
        out.get("action") == "schedule_refresh"
        and arts.get("platform_registered")
        and n1 > n0
        and (spec.get("cron") == "0 10 * * 1" or "Monday" in str(arts.get("requested_schedule") or ""))
    )
    c.detail = f"action={out.get('action')} cron={spec.get('cron')} n={n0}->{n1} sub={arts.get('subscription_id')}"
    LAST_SUB = arts.get("subscription_id") or LAST_SUB


def c_intent(c: Case) -> None:
    global LAST_INTENT
    ids0 = {i.get("id") for i in http_json("GET", "/library/discover/history?kind=intent&limit=50").get("items") or []}
    out = chat(
        "Create a Discover research intent for: TWSE daily prices for board-election event studies. Do not collect.",
        TWSE_RAIL,
    )
    arts = out.get("artifacts") or {}
    ids1 = {i.get("id") for i in http_json("GET", "/library/discover/history?kind=intent&limit=50").get("items") or []}
    new = ids1 - ids0
    c.ok = out.get("action") == "create_intent" and bool(new or arts.get("intent_id"))
    c.detail = f"action={out.get('action')} new={sorted(new)[:2]} id={arts.get('intent_id')}"
    LAST_INTENT = sorted(new)[0] if new else arts.get("intent_id")


def c_pause(c: Case) -> None:
    if not LAST_SUB:
        c.ok = False
        c.detail = "no subscription"
        return
    out = chat(f"Pause subscription {LAST_SUB}")
    arts = out.get("artifacts") or {}
    sub = arts.get("subscription") or http_json("GET", f"/library/discover/subscriptions/{LAST_SUB}")
    c.ok = out.get("action") == "pause_subscription" and sub.get("status") == "paused"
    c.detail = f"action={out.get('action')} status={sub.get('status')}"


def c_resume(c: Case) -> None:
    out = chat(f"Resume subscription {LAST_SUB}")
    arts = out.get("artifacts") or {}
    sub = arts.get("subscription") or {}
    c.ok = out.get("action") == "resume_subscription" and sub.get("status") == "active"
    c.detail = f"action={out.get('action')} status={sub.get('status')}"


def c_collect_history(c: Case) -> None:
    out = http_json(
        "POST",
        "/library/discover/collect",
        {
            "connector_id": "twse",
            "source_id": "twse_official",
            "limit": 5,
            "auto_approve": False,
            "candidate_key": "source:twse_official",
            "name": "TWSE Open API battery collect",
            "discover_intent_id": LAST_INTENT or "",
        },
        timeout=90,
    )
    job = (out.get("job") if isinstance(out, dict) else None) or {}
    jid = job.get("id")
    time.sleep(0.4)
    after = http_json("GET", "/library/discover/history?kind=collection_run&limit=80")
    hit = [i for i in (after.get("items") or []) if i.get("id") == jid or i.get("job_id") == jid]
    if jid and not hit:
        all_h = http_json("GET", "/library/discover/history?limit=100")
        hit = [i for i in (all_h.get("items") or []) if i.get("id") == jid or i.get("job_id") == jid]
    c.ok = bool(jid) and bool(hit)
    c.detail = (
        f"job={jid} status={job.get('status')} type={(job.get('plan') or {}).get('job_type')} "
        f"in_history={bool(hit)} resolution={(job.get('plan') or {}).get('collect_resolution')}"
    )
    c.evidence = {"job_id": jid, "status": job.get("status")}


def c_honesty(c: Case) -> None:
    subs = http_json("GET", "/library/discover/subscriptions").get("subscriptions") or []
    lying = [s.get("id") for s in subs if s.get("auto_refresh") or s.get("next_run_at")]
    bad_exec = [s.get("id") for s in subs if s.get("execution_mode") not in (None, "non_executing")]
    c.ok = bool(subs) and not lying and not bad_exec
    c.detail = f"n={len(subs)} lying_next={lying[:2]} bad_exec={bad_exec[:2]}"


def c_composer_schedule(c: Case) -> None:
    ids0 = {i.get("id") for i in http_json("GET", "/library/discover/history?kind=subscription&limit=50").get("items") or []}
    out = chat(
        "Use research_discover_create_refresh_subscription for source_id twse_official connector_id twse "
        "cadence weekly requested_schedule 'every Monday 10:00'. Confirm in history. No auto-run claim.",
        {"tab": "browse"},
        timeout=180,
    )
    ids1 = {i.get("id") for i in http_json("GET", "/library/discover/history?kind=subscription&limit=50").get("items") or []}
    new = ids1 - ids0
    c.ok = out.get("action") in {"composer", "schedule_refresh"} and bool(new)
    c.detail = f"action={out.get('action')} new={sorted(new)[:1]} brain={(out.get('artifacts') or {}).get('brain')}"


def main() -> int:
    print("SESSION", SID, "API", API)
    run(Case("mcp tools 76+", "http"), c_tools)
    run(Case("API schedule_spec cron", "http"), c_schedule_spec_api)
    run(Case("direct probe", "direct"), c_probe)
    run(Case("direct search", "direct"), c_search)
    run(Case("direct schedule+spec", "direct"), c_schedule)
    run(Case("direct create intent", "direct"), c_intent)
    run(Case("direct pause sub", "direct"), c_pause)
    run(Case("direct resume sub", "direct"), c_resume)
    run(Case("collect → History run", "http"), c_collect_history)
    run(Case("honesty non-executing", "http"), c_honesty)
    run(Case("composer schedule register", "composer"), c_composer_schedule)

    passed = sum(1 for r in results if r.ok)
    print("=" * 80)
    print(f"SCORE {passed}/{len(results)} ({100 * passed / len(results):.0f}%)")
    for r in results:
        if not r.ok:
            print("FAIL", r.name, r.detail or r.error)

    out = os.path.join(
        os.path.dirname(__file__),
        "..",
        "docs",
        "status",
        "generated",
        "composer_platform_battery.json",
    )
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(
        {
            "session_id": SID,
            "score": f"{passed}/{len(results)}",
            "passed": passed,
            "total": len(results),
            "cases": [
                {
                    "name": r.name,
                    "kind": r.kind,
                    "ok": r.ok,
                    "elapsed": r.elapsed,
                    "detail": r.detail,
                    "error": r.error,
                    "evidence": r.evidence,
                }
                for r in results
            ],
        },
        open(out, "w"),
        indent=2,
    )
    print("wrote", out)
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
